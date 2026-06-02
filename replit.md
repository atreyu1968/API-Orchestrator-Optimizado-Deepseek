# LitAgents v9

LitAgents orchestrates autonomous AI literary agents to manage the entire novel-writing workflow, from authoring to translation and management.

## Run & Operate

To run the application locally, ensure you have Node.js installed.

```bash
# Install dependencies
npm install

# Run database migrations
npx drizzle-kit push:pg

# Start the development server
npm run dev
```

**Environment Variables:**

- `DATABASE_URL`: Connection string for your PostgreSQL database.
- `DEEPSEEK_API_KEY`: API key for DeepSeek V4-Flash models.
- `FISH_AUDIO_API_KEY`: API key for Fish Audio TTS service.

## Stack

- **Frameworks**: React, Express
- **Runtime**: Node.js
- **Language**: TypeScript
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Build Tool**: Vite (client), esbuild (server)
- **UI**: shadcn/ui (Radix UI, Tailwind CSS)
- **Routing**: Wouter
- **State Management**: TanStack Query
- **AI Models**: DeepSeek V4-Flash (all agents)

## Where things live

- **Database Schema**: `shared/schema.ts`
- **API Endpoints**: `server/routes.ts`
- **AI Agents**: `server/agents/`
- **Orchestration Logic**: `server/orchestrator.ts`
- **Frontend Pages**: `client/src/pages/`
- **Design System/Styling**: `client/tailwind.config.ts`, `client/src/index.css`
- **World Bible Management**: `server/utils/world-bible-format.ts`
- **Series Milestones/Threads Extractor**: `server/utils/series-milestones-extractor.ts`
- **AI Usage Recording Helper**: `server/utils/ai-usage.ts`

## Recent fixes

> Historial completo en `CHANGELOG.md`. Aquí solo los fixes aún recientes.

- **[Fix137] El Auditor de World Bible reintenta ante una respuesta vacía/timeout transitoria en vez de saltar TODO el control de calidad**: tras Fix136 el auditor seguía sin auditar en un run real, ahora con `respuesta vacía del LLM` (no el parse bug, ya resuelto). **Causa**: las respuestas vacías son frecuentes con *thinking* activado, y el bucle WBA (`server/orchestrator.ts`) hace `break` al primer resultado nulo del auditor — así que UNA sola respuesta vacía transitoria saltaba por completo el gate de calidad de la World Bible (cae al flujo clásico sin auditar nunca), pese a tener presupuesto para 3 iteraciones. **Arreglo (`server/agents/world-bible-auditor.ts`)**: `audit()` envuelve `generateContent` en un bucle que reintenta UNA vez (`MAX_TRANSIENT_RETRIES=1`, máx. 2 llamadas) SOLO ante fallo TRANSITORIO (`error`/`timeout`/`content` vacío), NUNCA ante parse/esquema (eso repetiría un fallo determinista); si tras el reintento sigue fallando, devuelve `result:null` como antes (lo maneja el salvavidas Fix136). Beneficia también al audit on-demand del bucle SA (Fix119). **Architect PASS**: retry con cap duro (sin bucle infinito), parse/esquema no se reintenta, contrato de retorno intacto para ambos callers; caveat no bloqueante: `raw.tokenUsage` lleva solo el del último intento (BaseAgent registra cada llamada aparte, no es doble cobro nuevo). Coste acotado. Sin migración. tsc PASS.

- **[Fix136] El Auditor de World Bible dejaba de auditar SIEMPRE por un doble `JSON.parse`; el salvavidas ya no congela una Fase 1 con 0 arcos**: el usuario vio `parse error tras repair: "[object Object]" is not valid JSON` y, en relación, que "supera la Fase 1 uno con 0 arcos". **Causa raíz**: `repairJson()` (`server/utils/json-repair.ts`) NO devuelve string — su retorno es `any` y todas sus ramas terminan en `JSON.parse(...)`, o sea ya entrega el objeto parseado. Pero 5 callers hacían `JSON.parse(repairJson(content))`: el segundo `JSON.parse` recibía un objeto, lo coaccionaba a `"[object Object]"` y reventaba SIEMPRE (no por truncamiento, pese al mensaje). Esos agentes caían a `null`/fallback en cada llamada; el WBA, sin resultado, reutilizaba la Fase 1 sin auditar. **Arreglo 1**: eliminado el `JSON.parse` redundante en `world-bible-auditor.ts`, `originality-critic.ts`, `plot-integrity-auditor.ts`, `outline-beta-reader.ts` y `series-world-bible-consolidator.ts` (usan el resultado de `repairJson` directo; validación de esquema posterior intacta). Ahora estos auditores/lectores SÍ devuelven resultado. **Arreglo 2 (`server/orchestrator.ts`)**: el salvavidas Fix110-rev2 reutilizaba la Fase 1 con solo `personajes>0`, sin mirar arcos; ahora `phase1LookValid` exige el mínimo de subtramas del propio auditor (`N>30→4`, `N<20→2`, resto→3) o cae al flujo clásico (regenera Fase 1). Con el Arreglo 1 el auditor ya corre y caza el caso "0 arcos" vía `densidad_arcos`; el Arreglo 2 es la red ante fallos técnicos del auditor (timeout/truncamiento real). **Architect PASS**: causa raíz correcta, esquema preservado, sin callers que dependieran del fallo previo; riesgo no bloqueante: más coste en loops porque ahora devuelven resultados reales (deseado). Coste 0 LLM extra. Sin migración. tsc PASS.

- **[Fix135] Ataque en tres frentes al BAJÓN DE CALIDAD DE LA SEGUNDA MITAD (acto 2 plano, clímax sin sembrar)**: la segunda mitad decaía aunque la primera fuera bien. Tres fugas concurrentes (todo en `server/orchestrator.ts`, coste LLM acotado, sin migración): **(A)** el Auditor Estructural salía al cruzar el agregado ≥7 aunque `escalada_acto2`/`arco_secreto`/`deus_ex_machina` siguieran KO → se computa `criticalSecondHalfKO` (KO si count≥2 o alta, def. Fix102) y se añade a `needsRetry`: no acepta una escaleta con dimensión crítica KO salvo `lastIter` o `earlyStopByRegression` (que siguen acotando coste); `bestSA` restaura el mejor. **(B)** el bucle Holístico+Beta no podía arreglar problemas ESTRUCTURALES (el cirujano cap-a-cap los ignora por Fix87/Fix111) y abandonaba ante un sag. Nuevo `runStructuralSecondHalfRescue(project, holisticNotes, betaNotes)`: detecta el sag por keywords sobre Holístico+Beta, elige caps objetivo (flagged ∩ ventana 50%–90% de caps positivos, sin el último; fallback a la ventana; cap a 6) y reescribe cada uno con `rewriteChapterForQA(...,"editorial", instrucción)` con filosofía Fix132 (escalada monótona, coste tangible e irreversible, anti deus ex machina, conservar hechos canónicos). Enganchado one-shot (`structuralRescueDone`) en las dos ramas de abandono (`instructions.length===0` y `stalled≥2`), antes de `tryAcceptableConvergenceExit` y solo si `holisticScore < TARGET_HOLISTIC_SCORE`; `continue` para re-leer. NO se engancha en la rama de regresión (el `bestSnapshot` del bucle ya protege: si empeora el combinado, restaura). **(C)** el Beta de mid-novela corría una sola vez a ~2/3 (tarde). Nuevo `runMidNovelBetaPass(...)` (extrae la lógica de Fix30, best-effort, usa el helper scoped que filtra a caps COMPLETED) disparado en DOS pasadas vía `else if` a ~45% y ~70% (guardas `betaEligible`: total≥6, remainingAfter≥2; flags one-shot `midNovelBetaAttempted`/`midNovelBetaSecondAttempted` reseteados en `_generateNovel`); cada pasada refresca `midNovelBetaCritique` que se inyecta como `editorialCritique` en los Ghostwriters restantes, de modo que la segunda mitad ya se escribe guiada. **Architect PASS**: bien acotado contra bucles/coste (one-shot + snapshot + cap de caps); riesgos no bloqueantes: marcas 45%/70% con `Math.floor` (cumple igual "antes de cap ~2/3"), gate SA hereda la dependencia de `instrucciones_revision` no vacías, y la heurística de keywords puede dar falsos positivos (mitigado por one-shot + snapshot). Sin migración. tsc PASS.

- **[Fix134] La puntuación y el informe del Beta/Holístico ahora concuerdan con el texto tras restaurar el mejor snapshot**: el usuario notó que "no siempre se actualiza la puntuación y el informe del beta y el holístico en pantalla tras una sesión de correcciones". Diagnóstico: el frontend está bien (deriva `currentProject` de la query `["/api/projects"]` con `refetchInterval` 3000, refresca solo). El bug era de BACKEND: cada lectura (`runBetaReview`/`runHolisticReview`) persiste `betaScore`/`holisticScore` + `lastBetaNotes`/`lastHolisticNotes` del ÚLTIMO read, pero los auto-loops (`runAutoBetaLoop`, `runAutoHolisticReviewLoop`), al detectar regresión/oscilación/convergencia, RESTAURAN el mejor snapshot de capítulos (`restoreSnapshot`) sin re-persistir score/informe — dejando el dashboard mostrando los valores del read regresado, que NO concuerdan con el texto restaurado. **Arreglo (`server/orchestrator.ts`)**: `bestSnapshot` guarda ahora también el informe capturado en ese momento (`holisticNotes`/`betaNotes` en el loop dual; `notes` en el loop Beta); dos helpers (`syncHolisticBetaPersistenceToSnapshot`, `syncBetaPersistenceToSnapshot`) re-persisten score + informe + timestamps tras CADA `restoreSnapshot` del best (2 puntos en el loop dual, 5 en el Beta). Las notas solo se sobrescriben si el snapshot las tiene no vacías (no borrar un informe bueno con `""`). En restauraciones SELECTIVAS (Fix131) el texto es híbrido, pero re-persistir el score del best es coherente con lo que el log anuncia. **Limitación conocida (architect)**: las correcciones manuales que cambian el texto SIN relectura (aplicar notas editoriales, ortotipográfica, ediciones/imports) siguen dejando el score como "última lectura", no "última edición". Coste 0 LLM (solo BD). Sin migración. tsc PASS. Architect PASS.

- **[Fix133] El lector Beta deja de mezclar la versión actual con su lectura anterior (no reabrir pegas ya resueltas)**: el usuario notó que el lector que relee la novela parecía referirse a cosas ya corregidas, mezclando la versión vigente con una pasada. Diagnóstico: el TEXTO siempre se relee fresco de la BD (`loadFullNovelContext`), y el lector HOLÍSTICO no recibe sus notas previas (lee limpio). El que arrastraba memoria era el lector BETA: el bloque `previousNotesBlock` (Fix38) le inyecta su reacción anterior completa (hasta 24k chars) y, aunque pedía reconciliarla, el modelo podía tomar problemas de la versión PASADA como si siguieran en el texto actual. **Arreglo (`server/agents/beta-reader.ts`)**: reescrito el bloque para declarar que el manuscrito actual es la ÚNICA fuente de verdad y que las notas previas son una versión PASADA ya posiblemente corregida; antes de repetir cualquier pega antigua el Beta debe RE-LOCALIZARLA en el texto actual y citar el (cap N) donde sigue presente HOY; si no la encuentra, la da por RESUELTA y NO emite instrucción (prohibido instruir sobre algo que no pueda señalar hoy con cita de capítulo). Se conserva la intención de Fix38 (insistir en lo aún vigente, prohibido `instrucciones: []`) pero redirigida a pegas CONFIRMADAS en el texto actual, evoluciones reales o mejoras incrementales. El Holístico no se toca (ya lee limpio). **Post-review architect**: válvula de recall — una pega GLOBAL real (ritmo/tono de conjunto) que el Beta perciba hoy pero no pueda anclar a un capítulo no se descarta en silencio: se recoge como observación en prosa (no como instrucción accionable), para que el autor la vea sin que el cirujano la aplique a ciegas. Coste 0 LLM extra (solo prompt). Sin migración. tsc PASS. Architect PASS.

- **[Fix132] Feedback que prioriza escalada REAL sobre rotación de formas en el acto 2**: cuando el Auditor Estructural deja KO la dimensión `escalada_acto2` (o `deus_ex_machina`), el Arquitecto tendía a "resolverla" rotando `forma_dominante`/`funcion_estructural`/`tipo_cierre` (ejes que el auditor mide aparte y que ya podían estar bien) sin añadir coste dramático nuevo. En el retry del bucle SA (`feedbackWithHistorySA`, `server/orchestrator.ts`) se antepone ahora un bloque de PRIORIDAD que exige subir `apuesta_dramatica` de forma monotónica (prohibido 3+ caps igual/decreciente), pagar cada subida con coste TANGIBLE E IRREVERSIBLE (muerte/herida de aliado, exposición pública, decisión irreversible, pérdida de recurso, ruptura definitiva), al menos un cap del acto 2 en `alta`/`critica`, y —si aplica— que todo salvador/informante del último 25% esté sembrado en ≥2 caps previos. Reutiliza el audit on-demand del Auditor de World Bible (Fix115/116) para enriquecer la base si la carencia es estructural. Coste 0 LLM. Sin migración. tsc PASS.

- **[Fix131] Reversiones selectivas por capítulo (no perder correcciones válidas al revertir por regresión)**: al revertir al mejor snapshot por caída de score, los auto-loops restauraban TODOS los capítulos, deshaciendo arreglos que una reseña posterior ya no señalaba. `restoreSnapshot` admite `restoreOnly?: Set<number>` y restaura SOLO los capítulos aún marcados por la reseña vigente (`extractFlaggedChapters` sobre las notas actuales), conservando el resto; fallback a restore completo si el set viene vacío; se maneja el drift estructural. Aplicado en los TRES puntos de regresión: Revisor Final (Fix39), holístico (Fix81) y Beta (Fix112). NO se aplica a restores de salida (aprobación/máx-iter) — decisión deliberada. Sin migración. tsc PASS.

- **[Fix130] Cobertura por instrucción (ninguna nota puntual se pierde en silencio)**: con varias instrucciones puntuales por capítulo, el cirujano podía aplicar unas y dejar otras sin que el sistema lo detectara. `PatcherInput.instructionCount?` le informa de cuántas debe cubrir y cada `justification` debe empezar por el índice 1-based (`"N:"`) para mapear operación→instrucción. `applyEditorialNotes` cruza el `coverage` del cirujano (`aplicada`/`ya_cumplida`/`siembra_ausente`/`requiere_estructural`) con las operaciones aplicadas: las no resueltas se reescriben con el Narrador; `siembra_ausente` NO se fuerza (anti deus ex machina) y va al Revisor Final. **Post-review architect**: "aplicada" solo cuenta como cubierta con evidencia POR INSTRUCCIÓN (operación con `justification` `"N:"`), NO con el flag global `appliedOk` (antes una sola operación marcaba cubiertas todas, dejando puntuales sin escalar). Sin migración. tsc PASS.

## Architecture decisions

- **Autonomous Agent Orchestration**: Uses a modular agent system (`BaseAgent` inheritance) for specialized tasks, managed by a central orchestrator, allowing for complex, multi-step literary workflows.
- **DeepSeek V4-Flash Context Window**: Leverages the 1M token context window of DeepSeek V4-Flash by injecting full previous chapter texts, entire previous volumes (for series), and pseudonym catalogs into agent prompts for enhanced coherence and reduced repetition.
- **Two-Step Editorial Workflow**: Editorial notes are first parsed and previewed (structured JSON output) before application, giving users control over AI-suggested changes and enabling a human-in-the-loop approval process.
- **Robustness and Auto-Recovery**: Includes mechanisms like best-effort buffers for agent outputs, automatic retry logic for failed generations (Architect, word count), persistence of partial progress (KDP pipeline, mid-generation checkpoints), and defensive filters for AI-generated instructions to prevent errors and ensure continuity.
- **Server-Sent Events (SSE) for Background Tasks**: Long-running AI operations (e.g., holistic review, editorial parsing) respond immediately with HTTP 202 and stream updates via SSE, preventing timeouts and keeping the UI responsive. Heartbeats are implemented to maintain connections.

## Product

- **Novel Generation**: Orchestrates AI agents for authoring new literary works.
- **Re-editing Pipeline**: Provides publication-quality re-editing with 12 specialized agents for deep analysis and correction.
- **Literary Adaptation & Translation**: Supports translation into 7 languages with a focus on publication-ready prose.
- **Series Management**: Features inter-book continuity, prequel/spin-off creation, and unified World Bible management across series volumes.
- **KDP Metadata Generation**: Automates the creation of Amazon KDP publishing metadata (descriptions, keywords, categories) for multiple markets.
- **Audiobook Generation**: Converts completed manuscripts into audiobooks using TTS, supporting pause/resume and parallel chapter generation.
- **Guide Workshop**: AI-powered generation of writing and style guides, including pseudonym-specific and series-coherence guides.
- **Back Matter System**: Configurable back matter pages (review requests, "also by" lists, author bios) for exports.
- **Manuscript Import**: Supports various file formats (`.docx`, `.txt`, `.md`) with intelligent chapter detection for re-editing or translation.

## User preferences

Preferred communication style: Simple, everyday language.

## Gotchas

- **KDP Pipeline Execution**: KDP pipeline runs in the background and persists progress incrementally. Partial failures are tolerated (market marked with `error`, pipeline continues).
- **Architect Timeout**: The Architect agent's phase 2 can take up to 18 minutes for large novels (post-[Fix18] extended schema); the orchestrator's frozen monitor (`HEARTBEAT_TIMEOUT_MS`) is set to 22 minutes, leaving a 4-min safety margin. Phase 1 keeps the default 12-min timeout.
- **Structural Notes Handling**: Editorial notes requesting structural changes (delete/merge chapters) are explicitly *not* auto-applied but logged as administrative actions requiring manual confirmation, preventing accidental data loss or corruption.
- **SSE Connection Stability**: Long-running background processes (holistic review, editorial parsing) rely on SSE. Cloudflare can close idle connections. A heartbeat mechanism and DB persistence for results are implemented as safeguards.
- **Re-running Series Arc Verification**: For standalone projects, `runStandaloneArcCheck` is invoked after `finalizeCompletedProject` to audit arc closure.
- **Narrator Header Leakage**: The Ghostwriter agent has defensive sanitization to prevent meta-referential chapter headers from appearing in the generated prose.
- **DeepSeek `temperature`/`top_p`**: When `thinking` is enabled for DeepSeek models, `temperature` and `top_p` parameters are silently ignored.

## Pointers

- **OpenAI-compatible SDK**: Used for all DeepSeek API calls. [DeepSeek API Docs](https://www.deepseek.com/docs)
- **Drizzle ORM**: [Drizzle Documentation](https://orm.drizzle.team/docs/overview)
- **TanStack Query**: [TanStack Query Documentation](https://tanstack.com/query/latest)
- **Tailwind CSS**: [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- **Fish Audio API**: [Fish Audio API Documentation](https://fishaudio.com/docs)