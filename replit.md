# LitAgents v8

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

## Recent fixes

> Historial completo en `CHANGELOG.md`. Aquí solo los fixes aún recientes.

- **[Fix72] Ghostwriter crasheaba con `(c.heridas_activas || c.activeInjuries).join is not a function` cuando el WB guardaba campos de personaje como string en vez de array (v8)**: Error reportado por el usuario en runtime. Causa: en `server/agents/ghostwriter.ts:597-605` el bloque que serializa el estado de cada personaje al prompt usaba el patrón `if (p.campo?.length > 0 || p.altCampo?.length > 0) { … (p.campo || p.altCampo).join(", ") … }` para tres campos: `objetos_actuales/currentItems`, `heridas_activas/activeInjuries` y `conocimiento_acumulado/accumulatedKnowledge`. El problema es que `?.length > 0` es `true` también para strings no vacíos, no solo para arrays. Si el LLM en algún paso de hidratación del World Bible rellenó mal el JSON (por ejemplo `"heridas_activas": "corte en el brazo"` en lugar de `["corte en el brazo"]`) o si una migración legacy dejó el campo como string, la condición entraba, el `||` devolvía el string, y `.join(", ")` reventaba con `TypeError: ... .join is not a function`. El crash detenía toda la generación del capítulo. Implementación: tres bloques normalizan ahora a array antes de hacer `.join`: si el valor es array, se usa tal cual; si es string no vacío, se envuelve en `[string]` (para que el dato no se pierda); cualquier otra cosa se reduce a `[]` (que el `if` posterior descarta). Los campos canónicos del WB (`heridas_activas`, `objetos_actuales`, `conocimiento_acumulado`) y sus aliases inglés (`activeInjuries`, `currentItems`, `accumulatedKnowledge`) se chequean en ese orden y se acepta el primero que sea un array no vacío. Sin migración SQL — los datos malformados existentes en WB siguen ahí pero ahora se renderizan correctamente como ítem único en vez de tirar el job.

- **[Fix71] Generador de "Novela para Pseudónimo" respeta género declarado y permite elegir entre varias guías de estilo (v8)**: Dos quejas del usuario en el mismo mensaje. (A) "El creador de guías de escritura para un seudónimo no respeta el género de la guía de estilo del escritor, siempre pone fantasía aunque sea un escritor de romántica o histórica". Causa: el form de "Novela para Pseudónimo" (`client/src/pages/guides.tsx` `PseudonymStyleForm`) NO tenía selector de género/tono — solo enviaba `pseudonymGenre: pseudonym.defaultGenre`. Si el seudónimo no tenía `defaultGenre` rellenado (campo opcional en la tabla `pseudonyms`), llegaba `undefined` y (1) el agente caía a inventar fantasía por inercia del LLM, (2) el proyecto se creaba en `routes.ts:10803` con `genre = body.genre || params.pseudonymGenre || "fantasy"` (literal fallback "fantasy"). Aunque el seudónimo SÍ tuviera `defaultGenre`, el prompt del agente solo decía "Género principal habitual: X" en una línea perdida sin marcarlo como obligatorio, y las guías de estilo activas (que muchas veces ejemplificaban con novelas de fantasía aunque el autor escriba otro género) dominaban la decisión. (B) "Si un seudónimo tiene varias guías de escritura no me permite elegir entre ellas". Causa: `routes.ts:10513-10516` concatenaba TODAS las guías activas (`filter(g => g.isActive)`) sin opción de subset; el UI solo mostraba "{N} guía(s) de estilo activa(s). La IA las leerá completas..." sin selector. Implementación: **(Frontend)** `PseudonymStyleForm` ahora tiene (1) dos `Select` opcionales para género/tono que prefilan con los defaults del seudónimo pero el usuario puede overridear — si el seudónimo no tiene `defaultGenre` el botón generar bloquea y avisa porque "sin género la IA tiende a inventar fantasía"; (2) un bloque de checkboxes (uno por guía activa) que reemplaza el contador estático — al cambiar de seudónimo se marcan todas por defecto (preserva comportamiento previo), el usuario puede desmarcar las que no quiera y se muestra warning si quedan 0. El payload añade `selectedStyleGuideIds: number[]` y usa `effectiveGenre = override || pseudonym.defaultGenre`. **(Backend)** `routes.ts:10518-10558` distingue AUSENTE vs ENVIADA VACÍA: si `selectedStyleGuideIds` no es array, usa todas las activas (compat con clientes previos); si es array (aunque sea `[]`) respeta literalmente la selección, incluso vacía. IDs no pertenecientes/inactivos se descartan con `console.warn` para dejar traza en vez de mutar la intención del usuario en silencio. Guarda los IDs realmente usados en `params._chosenStyleGuideIds` para que la vinculación `styleGuideId` del proyecto (L10647-10665) use la primera guía elegida por el usuario en vez de "primera activa cualquiera". Validación de ownership por filtrado contra `getStyleGuidesByPseudonym(pseudonymId)`. **Enforcement server-side de género**: tras hidratar `params.pseudonymGenre` con el override o el default del seudónimo, si sigue vacío el job FALLA con mensaje explícito en vez de caer al fallback literal `"fantasy"` (que era exactamente el bug). Cubre clientes API directos que no pasen por el formulario. **(Agente)** `style-guide-generator.ts:257-272` el caso `pseudonym_style` añade un bloque destacado "🔒 GÉNERO OBLIGATORIO DE ESTA NOVELA: {GÉNERO}" con prohibiciones explícitas: NO escribir fantasía/SF/mundo inventado si el género es otro, NO añadir elementos sobrenaturales/mágicos si el género no los admite, reglas específicas para historical/romance/literary, y "NUNCA fantasía por defecto" como tiebreaker. El bloque de guías de estilo activas se reetiqueta como "reglas de VOZ/ESTILO, NO el género de la nueva novela" para que el modelo no copie el género de un ejemplo de guía aunque ese ejemplo sea fantasía. Sin migración SQL. Solo afecta a generaciones nuevas; las novelas ya creadas con el género equivocado requieren regenerar el plan con el género correcto seleccionado.

- **[Fix70] Anti-monotonía del acto 2: reglas más estrictas en el Arquitecto + ventana de moldes escénicos recientes en el Ghostwriter (v8)**: Queja reportada por el usuario: "en el segundo acto de prácticamente todas las novelas se repite el mismo patrón varias veces, lo hace lento y predecible — el patrón puede variar según el tipo de novela pero el mismo se repite". Diagnóstico: los guardarraíles existentes eran débiles. El Arquitecto fase 2 pedía "≥5 tipos distintos" en el acto 2, pero con 18-22 caps de acto medio el modelo caía en rotaciones tipo ABCDEABCDE que el lector percibe igual de monótonas. Además solo miraba `tipo_capitulo` (forma), no `funcion_estructural` (etiqueta semántica: "emboscada", "encuentro con mentor", "investigación de pista") — donde realmente lo nota el lector ("tres emboscadas seguidas aunque formalmente distintas"). El Ghostwriter solo comparaba con el cap inmediatamente anterior, sin ver moldes escénicos en ventana de 3-5 caps. Nada penalizaba repetir el mismo `tipo_cierre` salvo cliffhangers. Implementación: **(A) Arquitecto fase 2** (`server/agents/architect.ts:319-332`, auto-chequeo L399-409): regla 3 ahora exige `min(7, N)` tipos distintos en el acto 2 donde N = nº de caps del acto medio (en novelas largas con 18-22 caps de acto 2 fuerza 7+; en actos cortos exige todos distintos — sin hacer la regla imposible). Nueva regla 3b prohíbe patrones rotatorios AB-AB-AB solo cuando N≥8. Nueva regla 3c limita repetición de `funcion_estructural` a `ceil(N/4)` con tope de 3 (4 emboscadas en un acto largo = INVÁLIDO, pero permite 1-2 en actos muy cortos). Regla 4 reforzada — NINGÚN `tipo_cierre` puede superar el 50% del acto medio (antes era 60% solo para cliffhangers). Auto-chequeo añadido con pasos 3b/3c/4 explícitos y dependientes del tamaño del acto. **(B) Ghostwriter** (`server/agents/ghostwriter.ts:86-94` nuevo campo `recentSceneMolds`, L970-1000 nuevo bloque de prompt): el Orquestador construye una vista compacta de los últimos 5 caps ya escritos con `tipo_capitulo`, `funcion_estructural`, `tipo_cierre`, primera línea (140 chars) y última línea (140 chars) — SIN prosa entera (esa ya viaja en `previousChaptersFullText`). El Ghostwriter recibe un bloque "MOLDE ESCÉNICO RECIENTE — NO REPETIR" con reglas: si el cap actual quedaría con el mismo trío (tipo + función + cierre) que cualquiera de los listados, debe variar la ejecución (punto de entrada, modo dominante, escala temporal, registro); prohibido abrir/cerrar con primera/última línea estructuralmente parecida a las recientes; si la función estructural coincide, dale ángulo distinto. **(Orchestrator)** nuevo helper `buildRecentSceneMolds(chapters, escaleta, currentNum, window=5)` en `server/orchestrator.ts:836-886` que cruza `chapters` (texto) con `worldBibleData.escaleta_capitulos` (metadatos del plan). Cableado a los dos call sites del Ghostwriter: `generateNovel` (~L2250-2272) y `resumeNovel` (~L3081-3137). Trade-off: las reglas más duras del Arquitecto pueden hacerle fallar la validación en algunos casos y necesitar 1-2 reintentos extra (el flujo ya soporta retry). Sin migración SQL. Solo afecta a generaciones nuevas; los moldes recientes empiezan a inyectarse a partir del cap 2 (cuando ya hay material previo).

- **[Fix69] Notas editoriales: filtro upstream de no-ops + cancelación tras anclas fallidas + auto-revert global tras regresión ≥2 puntos (v7.9)**: Tres bugs observados en los logs de "El Aliento de los Antiguos" durante la fase post-generación. (A) En cap 4 (10:42:33) y cap 7 (09:17:33) el cirujano detectaba que la instrucción pertenecía a OTRO capítulo ("la corrección es para el Capítulo 2, no el Capítulo 4 proporcionado") tras gastar una llamada LLM, y en cap 15 (10:36:54) procesaba una instrucción cuyo texto literal decía "mantener la escena tal cual, sin modificaciones. Los cambios se aplican en los capítulos 1 y 14" — antes de caer a Narrador → Editor → Estilista. (B) En cap 14 (10:35:09) el cirujano generó operaciones pero ninguna ancló texto literal del capítulo (instrucción mal enrutada/obsoleta/alucinada) y el flujo caía a reescritura completa del Narrador, que inventaba prosa para "cumplir" la instrucción y el Editor la revertía por la red de seguridad — pero se gastaba ~2 min y se arriesgaba a degradar el cap si el Editor dejaba pasar el cambio. (C) En 10:41:34 la puntuación global cayó 9/10 → 7/10 (-2.0) tras aplicar las notas editoriales y el sistema solo emitió AVISO — siguió ejecutando "Resolución de 4 issues documentados" sobre un manuscrito ya degradado, aplicando cirugías sobre caps que no correspondían. Implementación: (A) `server/orchestrator.ts:11706-11731` — nuevo filtro upstream `isExplicitNoOpInstruction(instruction, currentChapterNumber)` en `rewriteChapterForQA` antes de invocar al cirujano. Detecta tres patrones: (1) verbos de no-op explícitos ("mantener … tal cual / sin modificaciones / intacto", "no modificar/tocar/alterar este capítulo"), (2) marcadores de "fuera del alcance de este capítulo / no aplica al capítulo actual / no hay cambios que aplicar aquí", (3) referencias del tipo "los cambios se aplican en los capítulos X, Y" donde NINGÚN número coincide con `currentChapterNumber`. Si matchea, log warning, marca el cap como completed y retorna sin tocar. Helper completo en `server/orchestrator.ts:12937-12962`. (B) `server/orchestrator.ts:11819-11842` — la rama "Operaciones generadas pero ninguna encontró el texto literal" (antes "Cayendo a reescritura completa") ahora CANCELA: log warning explicando "instrucción mal enrutada, obsoleta o alucinada", marca el cap como completed y retorna. Se elimina el fallback al Narrador para este caso porque si el texto literal no existe, el cap correcto es OTRO. (C) `server/orchestrator.ts:7266-7271` — `recalculateFinalScoreAfterEdits` acepta nuevo parámetro opcional `modifiedChapterIds?: number[]`. Tras computar el nuevo score, si `(newScore - previousScore) ≤ -2.0` Y hay `modifiedChapterIds`, restaura cada cap desde su `preEditContent` (líneas 7314-7355) y NO actualiza `finalScore` / `finalReviewResult` (mantiene los previos). Log crítico explicando el auto-revert. En el bucle principal de `applyEditorialNotes` (~L7751-7755 declaración del Set, L8026 add tras modificación puntual, L8076-8077 add tras reenrutado automático) se acumulan los IDs reales y se pasan a la llamada (L8108). Trade-off del C: si la regresión global es real pero el usuario quería esos cambios igualmente, puede re-emitir las notas; preferimos perder cambios cuestionables a quedarnos con un manuscrito 2 puntos peor. Sin migración SQL. Solo afecta a aplicaciones nuevas de notas editoriales.

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