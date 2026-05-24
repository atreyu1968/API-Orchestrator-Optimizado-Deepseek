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

- **[Fix123] Edición de guías en el Taller (cierra el gap de Fix122)**: tras dejar la voz canónica como solo-lectura (Fix122), corregir POV/tiempo verbal mal detectado exigía editar la guía origen, pero el Taller solo permitía ver/descargar/borrar/aplicar. **Backend** (server/routes.ts L11034): `PATCH /api/guides/:id` acepta `title` (≤200) y/o `content`, valida no-vacíos, llama a `storage.updateGeneratedGuide`. Resto de campos (`guideType`, `sourceAuthor`, tokens, `createdAt`) inmutables (metadatos de generación). 400 si nada actualizable, 404 si no existe. **Frontend** (client/src/pages/guides.tsx): nuevo `GuideEditDialog` con `useState` de title+content rehidratado vía `useEffect([guide])` cada vez que cambia la guía — evita arrastrar ediciones sin guardar al cambiar de guía. Textarea monospace ~55vh. Botón Guardar deshabilitado si `!dirty || !valid || isPending`. Tras éxito invalida `['/api/guides']` y cierra. Nota debajo del textarea recuerda el bloque que Fix114 espera (`## VOZ NARRATIVA CANÓNICA` + `POV:` + `Tiempo verbal:` + `Tipo de narrador:`). Botón con icono `Pencil` en cada tarjeta. **Caveat propagación**: si la guía ya está aplicada a un pseudónimo, los cambios NO se propagan automáticamente — la copia vive en `pseudonyms.styleGuide`, el usuario debe re-pulsar "Aplicar a pseudónimo" para sustituirla (deliberado: evita machacar guías ajustadas a mano desde la sección de pseudónimos). Sin migración. Architect PASS.

- **[Fix122] Voz narrativa canónica de solo lectura en el config panel**: tras Fix114 (autorelleno desde la guía), el usuario podía seguir editando los 3 `<Select>` de POV/tiempo verbal/tipo de narrador en `config-panel.tsx` permitiendo introducir un valor contradictorio con la guía. **Implementación** (client/src/components/config-panel.tsx L924-1021): bloque "Voz narrativa canónica" reemplazado por panel render-only con `POV_LABELS`/`TENSE_LABELS`/`NARRATOR_LABELS`. Si la guía seleccionada incluye POV+tense, caja muted/30 con los 3 valores detectados y nota "Detectado desde la guía seleccionada". Si la guía no los especifica o no hay guía seleccionada, banner ámbar explica qué falta y dirige al usuario a editar la guía añadiendo el bloque `## VOZ NARRATIVA CANÓNICA`. El `useEffect` de Fix114 sigue rellenando el field al cambiar `styleGuideId`/`extendedGuideId`; al guardar el proyecto se persiste igual. `skipInitialAutofillRef` intacto. Backend pre-flight guard de Fix108 sigue abortando si `narrativeVoice` viene null y el extractor regex tampoco detecta. Sin migración.

- **[Fix121] Diálogo "Regenerar capítulo" con instrucciones opcionales del usuario**: el botón de regenerar capítulo en `dashboard.tsx` no permitía añadir contexto del usuario al rehacer el capítulo. **Frontend** (client/src/pages/dashboard.tsx): nuevo `Dialog` con `Textarea` opcional + botón con `disabled+isPending`. **Backend** (server/routes.ts L2175): endpoint `/api/projects/:id/regenerate-chapter/:chapterNumber` acepta `userInstructions` del body y los prepend al `refinementInstructions` con header "INSTRUCCIONES DEL USUARIO (PRIORITARIAS)". Architect PASS.

- **[Fix120] Smart Beta loop con memoria de notas aplicadas + detección de oscilación (cierra el ping-pong del auto-loop)**: Tras observar que `runAutoBetaLoop` podía oscilar — el cirujano aplicaba "alargar cap 5 con más diálogo" en iter N y el Beta en iter N+1 (leyendo desde cero, sin historial) pedía "acortar cap 5 con menos diálogo", el cirujano lo aplicaba, y Fix112 acababa revirtiendo al best sin que el loop convergiera. La rama `previousBetaNotes` (Fix38) pasa al Beta sus notas anteriores como crítica acumulada, pero NO le cuenta qué notas YA aplicó el cirujano: la prevención sigue siendo "no te repitas a ti mismo", no "no deshagas lo aplicado". **Implementación**: nuevo campo opcional `appliedNotesHistory?: string` en `BetaReaderInput` (server/agents/beta-reader.ts) + bloque de prompt insertado tras `previousNotesBlock` que enumera por iteración cada nota aplicada (`cap N [prioridad] (categoria): descripcion`) y dicta REGLA CRÍTICA: no repetir, no deshacer, si quedó mal aplicado describir el matiz concreto pero NO como reversión literal, energía a pegas NUEVAS o evoluciones. **runBetaReview** (server/orchestrator.ts L7482) firma extendida con `options?: { appliedNotesHistory?: string }` reenviado a `betaReader.runReview`. Llamadas one-shot manuales no lo pasan y el Beta funciona como antes. **runAutoBetaLoop** (server/orchestrator.ts L12987): var local `appliedNotesHistory: Array<{iter, instrucciones: AppliedNote[]}>`, helper `formatAppliedNotesHistory` (formato legible por iter, truncado a 25 notas/iter), helper `extractAppliedNotes` (saca cap+accion+prioridad+categoria de cada instrucción parseada). Tras `applyEditorialNotes` exitoso, push al historial. Antes de `runBetaReview` de la iter N+1, format y pase como `{ appliedNotesHistory: appliedHistoryStr }`. **Detección de oscilación**: helper `detectOscillation(history, currentInstructions)` que cuenta cuántas instrucciones nuevas contradicen alguna nota previa del mismo capítulo usando pares de raíces opuestas (`OPPOSITE_ROOTS`: alarg↔acort, expand↔recort, ampli↔condens, añad↔quit/elimin, intensific↔atenu, refuerza↔suaviz, fortalec↔debilit, etc.). Si `ratio ≥ OSCILLATION_THRESHOLD=0.5` (≥50% contradicen), bloque insertado tras `parseEditorialNotesOnly` aborta el loop: restoreSnapshot al best, activity log warning con `oscillationRatio + matches/total + samples` (hasta 3 ejemplos "cap N: antes ‘…’ | ahora ‘…’"), y según best.score ≥ TARGET_BETA_SCORE corre ortotipográfica final o queda en `completed`. Si `matches > 0` pero por debajo del umbral, solo log informativo y el loop continúa. **Coste**: 0 LLM extra (todo determinista en JS). **Backwards-compat**: si `appliedNotesHistory` no llega al Beta, mismo prompt pre-Fix120. Si la primera iter ya tiene oscilación 0 (historial vacío), el guard se salta. **Post-review (anti-falso-positivo)**: `OSCILLATION_MIN_MATCHES=2` (mínimo absoluto además del ratio para evitar abortos por 1 contradicción ambigua en sets pequeños) + chequeo de `OBJECT_TOKENS` compartido (diálogo, escena, descripción, ritmo, pasaje, personaje, etc.): un par de raíces opuestas en el mismo cap solo cuenta como contradicción si prev y cur mencionan el MISMO objeto temático (p.ej. "añadir diálogo" + "eliminar línea descriptiva" en mismo cap son objetos distintos → NO oscilación). Conservador: si no se identifica objeto, no cuenta. No emojis. Español simple.

- **[Fix119] Audit on-demand del WBA contextualizado con bottleneck SA + problemas residuales (cierra el gap de Fix115/Fix116)**: Tras observar que el audit on-demand del WBA disparado por Fix115 (concentrated) o Fix116 (chronic_zero) recibía solo `phase1Json` sin saber QUÉ dimensión SA estaba fallando ni POR QUÉ. Resultado: el WBA podía devolver "apto" sin feedback porque la base le parecía coherente pese a que el SA seguía atascado en 4-5/10, o devolver feedback genérico que el Arquitecto no sabía mapear al bottleneck concreto. **Implementación**: nueva interface `WorldBibleOnDemandFocus { area, areaLabel, triggerKind: "concentrated"|"chronic_zero", problemasResiduales[], bestSAScore }` en `WorldBibleAuditInput` (server/agents/world-bible-auditor.ts). Método `buildOnDemandFocusBlock` con `SA_TO_WBA_AREAS` (mapeo: arco_secreto→reservas_secretos+stakes_personaje; falso_aliado→antagonismo+densidad_arcos; escalada_acto2→escalada_actos+antagonismo; ledger_info/dosificacion→reservas_secretos; forma_escena→escalada_actos; deus_ex_machina→escalada_actos+antagonismo; trauma_protagonista→stakes_personaje). El bloque enumera hasta 10 problemas residuales con severidad+caps+sugerencia y prepend al userPrompt. Cierre del prompt con recordatorio explícito de doble veredicto válido: (1) apto con `feedback_para_arquitecto = "WB SUFICIENTE — el problema reside en la implementación de la escaleta. La escaleta debe utilizar los siguientes elementos ya disponibles: ..."`; (2) necesita_revision con feedback de qué añadir. NO inventar carencias para parecer útil. **Orchestrator** (server/orchestrator.ts L2932-3000): extrae `problemasOfArea` filtrando `bestSA.problemas` por `area === triggerArea` (campo `problemas: any[]` añadido a `bestSA`/`bestSAOverall` y persistido tras cada audit SA exitoso); pasa `onDemandFocus` al `audit()`. **Header ramificado** según veredicto: si `wbaApto`, header "[FixN+Fix119] WB SUFICIENTE para X" + instrucción "NO enriquezcas WB en este rediseño — RELEE las pistas y aplícalas LITERALMENTE en los caps correspondientes"; si `necesita_revision`, header clásico Fix115/Fix116 + instrucción "ENRIQUECE primero la WB y SOLO ENTONCES rediseña la escaleta". Activity log enriquecido con `veredicto`, `feedbackChars`, `diagnosis: "wb_sufficient_escaleta_problem"|"wb_needs_enrichment"`. **Coste**: 0 LLM extra (el audit ya se hacía, solo cambia el prompt y el header del feedback inyectado al Arquitecto). **Backwards-compat**: `onDemandFocus` opcional — audits pre-flight Fix110 funcionan igual. No emojis. Español simple.

- **[Fix118] Auto-guidance mecánica antes del gate human-in-the-loop (cierra el último gap de Fix115)**: Tras log Vol.2(Copia)(Copia)(Copia) donde Fix115 activó el gate a 5.8/10 y la guidance manual del usuario (5655 chars de prosa narrativa) EMPEORÓ el siguiente intento a 2.4/10. Análisis: los 9 problemas residuales eran TODOS de relleno de escaleta (5 arco_secreto siembra_insuficiente con tokens concretos disponibles + 2 escalada_acto2 monótona + 1 ledger amenaza repetida + 1 dosificacion sin_resistencia), NO carencia de WB. La guidance narrativa del usuario hizo al Arquitecto improvisar y romper lo OK. El usuario aceptó "auto inyectes tú mismo, ya que no tiene sentido que yo tenga que cortar y pegar si ya lo tienes". **Implementación**: nuevo util `server/utils/auto-mechanical-guidance.ts` con función pura `generateMechanicalGuidanceFromProblems(problemas, bestScore, threshold): string` que agrupa por `area`, ordena por severidad máxima (alta→media→baja), antepone una REGLA MECÁNICA universal por área (`AREA_RULE` map para arco_secreto/escalada_acto2/ledger_info/dosificacion_revelacion/forma_escena/deus_ex_machina/falso_aliado/trauma_protagonista) y enumera cada problema reusando el `sugerencia` ya generado por el auditor. Prefacio con principios no negociables (mantener rango de caps, preservar dimensiones OK, aplicar tokens textuales literalmente). Cierre con autoverificación. Coste 0 LLM tokens. **Orchestrator** (server/orchestrator.ts L2459-3155): envoltura del bucle SA + restore-best en `outerSALoop: for (outerSAAttempt = 0; outerSAAttempt < 2; outerSAAttempt++)`. Variables outer: `bestSAOverall` (mejor entre pasadas), `lastSeenScoreSAOverall`, `autoMechanicalGuidanceApplied: boolean`, `effectiveArchitectInstructionsForSA: string` (reemplaza `project.architectInstructions` SOLO en la llamada `architect.execute` del bucle SA L3006), `lastWbaExternalCount`/`lastWbaExternalAreas` para preservar el contexto del audit on-demand de la última pasada en el gate. Constantes `MAX_SA_ITERATIONS=8`, `SA_THRESHOLD=7`, `MIN_PUBLISHABLE_SA_SCORE=7`, `lastMaxSAIterations` movidas FUERA del outer for porque el gate Fix115 las usa después de cerrarlo. Tras el restore-best Fix101 de cada outer iter: si `bestSAOverall.score < 7 && !autoMechanicalGuidanceApplied && bestSAOverall != null`, llamamos `runArchitectStructuralAudits` sobre `bestSAOverall.data` para obtener los problemas residuales frescos, generamos la auto-guidance, la appendeamos a `effectiveArchitectInstructionsForSA` con doble salto de línea, marcamos flag, restauramos `worldBibleData = bestSAOverall.data` para que la 2ª pasada parta del mejor visto, log `info` con `fix:"Fix118"` + count problemas + length guidance, `continue outerSALoop`. Si bestSAOverall ya ≥7, o ya hubo auto-guidance, o no hay problemas, `break outerSALoop`. **Gate Fix115 actualizado** (L3172-3219): usa `bestSAOverall` en vez de `bestSA`; el `finalAudit` se corre sobre `bestSAOverall.data`. Si `autoMechanicalGuidanceApplied`, regeneramos la auto-guidance contra los problemas RESIDUALES de la última pasada (no los originales, porque la 2ª pasada pudo haber eliminado/cambiado algunos) y la persistimos en `pendingPayload.autoMechanicalGuidance` + `autoMechanicalGuidanceApplied: true`. Mensaje del activity log y status idle mencionan ambos cambios (audit on-demand y auto-guidance) si aplican. **Panel UI** (client/src/components/structural-guidance-panel.tsx): interface `PendingStructuralGuidance` añade `autoMechanicalGuidance?: string` + `autoMechanicalGuidanceApplied?: boolean`. `useState(pending.autoMechanicalGuidance || "")` pre-rellena el textarea. Si `autoMechanicalGuidanceApplied`, banner azul "Propuesta automática pre-rellenada" explica que puede editarla o enviarla tal cual. **Coste worst-case**: +8 iters SA adicionales (~10-15 min) que antes el usuario tenía que esperar bloqueado en el gate manual escribiendo guidance a mano. **Backwards-compat**: si `pending.autoMechanicalGuidance` no existe (proyectos pre-Fix118 o flujos donde no se generó), el textarea aparece vacío como antes. Sin migración de schema (cabe en jsonb existente). **Scope**: solo bucle SA en `_generateNovel`. No emojis. Español simple.

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