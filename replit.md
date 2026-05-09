# LitAgents v7.8

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

- **[Fix46] Fail-fast si la BD del VPS queda desincronizada del schema (v7.8)**: Tras Fix45 surgió un caso real: el push del paso 3 de `update.sh` falló silenciosamente (sudo no propagaba `DATABASE_URL`) y el build del paso 5 con `SKIP_DB_PUSH=1` se saltó la red de seguridad. El servicio quedó "active running" pero todas las rutas que tocaban BD devolvían 500 (`column "pending_admin_actions" does not exist` de Fix40). Tres protecciones añadidas: (a) Nuevo `server/startup-schema-check.ts` con `assertSchemaUpToDate()`: consulta `information_schema.tables`/`columns` por un set declarado de tablas/columnas críticas (Fix34/38/40/43) y, si falta alguna, escribe en stderr el listado exacto de qué falta + las instrucciones para correr el push manual con el env cargado, y hace `process.exit(1)`. systemd reintenta y falla en bucle, pero el log queda con el motivo claro en vez de devolver 500 enmascarado. (b) `server/index.ts` invoca el check como primera operación del bootstrap (antes de `setupAuth`/`registerRoutes`/`listen`). (c) `script/build.ts` ahora aborta con `process.exit(1)` si `SKIP_DB_PUSH≠1` y `DATABASE_URL` está ausente, y también si el `drizzle-kit push` devuelve error (antes lo tragaba como warning). Acción para el VPS: añadir `set -a; source /etc/litagents/env; set +a` antes del paso 3 de `update.sh` para que `drizzle-kit push` siempre tenga credenciales reales.

- **[Fix45] Build con `SKIP_DB_PUSH` para evitar cuelgue en deploy (v7.8)**: `script/build.ts` L41 ejecutaba `npx drizzle-kit push --force` con `stdio:"inherit"` y timeout 120s. En el deploy del VPS con `sudo /var/www/litagents/update.sh`, el script ya hacía `drizzle-kit push` antes (paso 3) y luego `npm run build` (paso 5) lo repetía. Cuando `sudo` no propagaba la `DATABASE_URL` (típico sin `sudo -E` o sin `env_keep`), `pg-pool` recibía `password=undefined` → `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. El primer push fallaba rápido y el script lo ignoraba, pero el segundo push (dentro de build.ts) podía colgar el build entero (spinner indefinido) en vez de tirar excepción capturable. Fix: el push ahora se salta si `SKIP_DB_PUSH=1` está en el entorno; en dev/local sigue corriendo por defecto. Se recomienda en `update.sh` del VPS: `SKIP_DB_PUSH=1 npm run build` para no duplicar el push (ya lo hizo el paso 3) y, además, exportar `DATABASE_URL` o usar `sudo -E` para que el primer push tenga credenciales válidas.

- **[Fix44] Normalización del encoding de capítulos especiales en el reedit (v7.8)**: El reeditor distinguía mal prólogo y epílogo porque el pipeline de reedit usaba una convención numérica diferente al pipeline principal: principal usaba `0=prólogo, -1=epílogo, -2=nota` mientras que reedit usaba `0=prólogo, 998=epílogo, 999=nota`. Resultado: en cada agente compartido (Beta, Holístico, Final Reviewer, Voice/Continuity/Semantic auditors, Plot Closure, Structural Translator) había ramas defensivas tipo `num === -1 || num === 998`, una conversión 998→-1 al exportar markdown traducido en `routes.ts` L9618, y un parche `chapter_number === -1 || chapter_number === 998` en el docx exporter. La doble convención causaba: (a) ordenamiento inconsistente cuando un capítulo cambiaba de pipeline, (b) `hasEpilogue` en el reedit no detectaba epílogos importados como -1, (c) prompts de agentes recibían etiquetas erróneas porque la rama `998` ganaba antes que la `-1` en algunos paths. Fix: (i) `getChapterSortOrder` y `specialChapterNumbers` en `reedit-orchestrator.ts` usan ahora `[0, -1, -2]`. `hasEpilogue` y `hasAuthorNote` chequean `-1` y `-2` directamente. (ii) Punto único de escritura en `routes.ts` L8087-8089 (parser de manuscrito importado) ahora persiste epílogo como `-1` y nota como `-2` en lugar de `998/999`. (iii) Eliminada conversión obsoleta `998 ? -1 : 999 ? -2 : ch.chapterNumber` en `routes.ts` L9618 (ya innecesaria). (iv) Limpieza con sed de las ramas defensivas `|| 998` y `|| 999` en 12 archivos (8 agentes + orchestrator + chatService + docx-exporter + routes). (v) Migración de datos: 1 fila en `reedit_chapters` con `chapter_number=998` actualizada a `-1` (no había filas con 999). El `imported_chapters` ya estaba en la convención correcta (3 filas con -1, 0 con 998). El cambio es retro-compatible porque los puntos de salida (UI labels, exporters) ya manejaban `-1/-2`. Convención canónica documentada inline en `reedit-orchestrator.ts`.

- **[Fix43] Generación de guías en background con polling (v7.8)**: Antes `POST /api/guides/generate` corría síncrono y la llamada a DeepSeek tardaba 1-3+ minutos, lo que excedía el timeout de 100s de Cloudflare → error 524 ("server timed out responding"). Ahora: (a) Nueva tabla `guideGenerationJobs` (id, status, guideType, params, resultGuideId, resultPayload, errorMessage, startedAt, completedAt). Status: `pending | running | completed | failed`. (b) El POST se transformó en handler thin: valida `guideType`, crea row en `guideGenerationJobs` con status=pending, dispara `runGuideGenerationJob(jobId, body)` fire-and-forget y responde **HTTP 202** con `{jobId}` en <100ms. (c) `runGuideGenerationJob` contiene toda la lógica anterior (autocarga de pseudónimo/serie, llamada a `generateStyleGuide`, creación de `generatedGuide` + `extendedGuide` + n proyectos para series con todos los volúmenes); las 7 validaciones que antes eran `res.status(400)` se convirtieron en `throw new Error(...)` que el catch convierte en `status=failed` + `errorMessage`. Las 2 ramas de éxito (proyectos creados / solo guía) persisten `status=completed` + `resultPayload` con la misma forma que la antigua respuesta JSON. (d) Nuevo endpoint `GET /api/guides/jobs/:id` para polling. (e) Frontend `client/src/pages/guides.tsx`: el `mutationFn` ahora hace POST → recibe jobId → muestra toast "Generación iniciada (1-3 min)" → polling cada 4s al GET hasta `completed/failed` (timeout duro 10 min). El `onSuccess` recibe `resultPayload` con la misma forma anterior, así que el toast final y la invalidación de queries quedan idénticos. La biblioteca ya no salta error 524 al crear guías de novelas largas.

- **[Fix42] Recuperación parcial de instrucciones descartadas por el refiner (v7.8)**: En `groundEditorialInstructions` (orchestrator.ts ~L5888), cuando la review viene del propio sistema (Holístico/Beta) y el refiner descarta MÁS de la mitad de las instrucciones (`isSystemReview && refined.length>0 && dropped.length>refined.length`), ahora recuperamos las descartadas que apuntan a capítulos válidos en lugar de perderlas en silencio. Para cada `dropped` cruzamos su `descripcion` (prefijo 40 chars) y `capitulos_afectados` contra el borrador original; si encontramos match y no está ya en `refined`, recuperamos la instrucción completa prefijando la descripción con `"[Sin anclaje literal — verificar]"` y las instrucciones de corrección con `"[REFINER NO ANCLÓ EN TEXTO LITERAL — motivo: <motivo>]"` para señalizar al usuario que requieren revisión manual extra antes de aplicar. Caso real: Holístico emite 12 observaciones, refiner conserva 2 → antes el 83% se perdía silenciosamente; ahora se previsualizan las 12 con marca clara de cuáles vienen "sin verificar literal". Activity log resume la recuperación. Coexiste con Fix13 (fallback total cuando refiner descarta TODAS).

- **[Fix41] FinalReviewer ya no devuelve FAILED engañoso (v7.8)**: Antes `runFinalReview` retornaba `boolean` y muchas salidas (max ciclos alcanzado, plateau aceptado en ~8/10, oscilación 8↔9, lista de reescrituras agotada con score≥8) devolvían `true`/`false` sin matizar. El callsite registraba "FAILED" para todo lo que no fuera `true`, incluso cuando el manuscrito había alcanzado calidad razonable y el sistema había decidido pararse por buenas razones. Ahora la firma es `Promise<FinalReviewOutcome>` con tres valores discriminados: `"approved"` | `"approved_with_reservations"` | `"rejected"`. Helpers `classifyExit(currentScore, hasCriticalIssues, reason, hint?)` y `hasCriticalIssues(result)` centralizan la decisión: score≥9 sin críticos→approved; score 7-8.9 sin críticos→approved_with_reservations; resto→rejected. Reemplazados ~10 puntos de retorno. 3 callers (~L2751, ~L3437, ~L4738) traducen el outcome a `boolean` solo para flujo descendente que aún espera bool, y registran activity logs distinguiendo los tres casos para que el usuario vea "aprobado con reservas" en vez de "FAILED" cuando corresponde.

- **[Fix40] Auto-revert de manuscrito en regresión + UI de acciones administrativas pendientes (v7.8)**: (a) **[Fix39]** Snapshot del manuscrito en el mejor ciclo del Final Reviewer (`bestManuscriptSnapshot: {score, chapters: Map<chapterNumber, content>}`) cuando `currentScore >= 7` y bate récord histórico. Si en un ciclo posterior el score cae ≥ 1.0 vs un best ≥ 8, restauramos el contenido íntegro de los capítulos en BD y saltamos las reescrituras de este ciclo (las que habrían introducido más deterioro). Reemplazamos el score del ciclo actual por el del snapshot para que Fix37 (diminishing returns) y plateau usen la línea base correcta. Riesgo de clobber con edits manuales mitigado por Fix36 (status="generating" bloquea todas las mutaciones concurrentes vía PATCH/apply-editorial mientras el loop corre). Activity log con n capítulos restaurados y delta de scores. (b) **[Fix40]** Nuevo campo `projects.pendingAdminActions: jsonb default([])`. Cuando el `StructuralInstructionTranslator` emite acciones destructivas (`delete_chapter`, `merge_chapters`, `split_chapter`, etc.) que NO se aplican automáticamente, ahora además de loguearlas en activity log las persistimos con merge atómico (re-fetch del proyecto, `nextId = max(existing.id)+1`, concat). Dos endpoints nuevos: `GET /api/projects/:id/pending-admin-actions` y `DELETE /api/projects/:id/pending-admin-actions/:actionId?` (sin `actionId`→borra todas). Card UI en `client/src/pages/manuscript.tsx` (visible solo si `actions.length>0`) con badge tipo, label de capítulo, motivo, botón individual `Trash2` y botón "Descartar todas" (`data-testid: card-pending-admin-actions`, `button-dismiss-admin-action-{id}`, `button-dismiss-all-admin-actions`). El usuario solo puede *descartar* — la ejecución manual de delete/merge sigue requiriendo herramientas existentes; este Card es solo el listado pendiente que antes vivía enterrado en activity logs.

- **[Fix37+38] Diminishing returns en Final Reviewer + memoria del Beta entre lecturas (v7.8)**: (a) **[Fix37]** En `runFinalReview` se añaden dos salidas tempranas additivas a la detección de plateau original (4 ciclos, spread ≤ 0.5): **(a.1)** *DIMINISHING RETURNS* — tras ≥ 4 ciclos (3 deltas reales), si los 3 |Δ| son todos ≤ 0.3 y el máximo histórico sigue por debajo de `minAcceptableScore` (9), cierra el loop con rechazo y mejor-score-conocido en activity log. Antes el sistema quemaba 5-6 ciclos oscilando entre 7.0 y 7.6 sin acercarse al umbral. **(a.2)** *REGRESIÓN MONÓTONA* — si llevamos ≥ 4 ciclos y los últimos 3 son estrictamente decrecientes con caída total ≥ 1.0 y el score ACTUAL está por debajo de 9, corta antes de degradar más el manuscrito (gate por score actual, no histórico — captura el patrón 9 → 8 → 7 que un bestOverall<9 enmascararía). (b) **[Fix38]** Nuevos campos `projects.lastBetaNotes` (text, ≤24k) y `projects.lastBetaNotesAt` (timestamp). Nuevo input opcional `previousBetaNotes` en `BetaReaderInput`. Cuando llega (≥200 chars), el prompt del Beta antepone un bloque "## NOTAS DE TU LECTURA ANTERIOR (no las repitas)" con instrucciones explícitas: si una observación previa sigue vigente, mencionarla brevemente sin re-emitirla en el JSON; si ya está resuelta, decirlo en una frase; centrar el grueso en lo nuevo. `runBetaReview` y `runMidNovelBetaReview` cargan `lastBetaNotes` antes de invocar al agente y persisten el resultado tras éxito (best-effort). En el activity log aparece "[Fix38: con memoria de lectura previa]" cuando aplica. Usado por `runAutoHolisticReviewLoop` y por re-ejecuciones manuales del Beta sobre proyectos ya analizados.

- **[Fix36] Apply-editorial protegido del monitor de congelación (v7.8)**: Antes, durante `applyEditorialNotes` la ruta marcaba el proyecto como `status="generating"`; si SurgicalPatcher + reescritura completa de un capítulo grande tardaba > 22 min sin emitir activity logs, el monitor (`HEARTBEAT_TIMEOUT_MS`) lo declaraba congelado y el auto-recovery lo re-encolaba como "paused", lo que disparaba la regeneración desde cero del capítulo en curso y descartaba el resto de instrucciones pendientes (caso real: `La Ruta de los Huesos Quebrados`, 10/15 instrucciones perdidas). Ahora: (a) `routes.ts` POST `/api/projects/:id/apply-editorial-notes` usa `status="applying_editorial"` en vez de `"generating"`. (b) `queue-manager.ts` añade `applying_editorial` a `monitoredStatuses` con `HEARTBEAT_TIMEOUT_EDITORIAL_MS=60min` (vs 22 min). (c) Si el monitor global eventualmente dispara para ese status, ejecuta camino especial: log de aviso + `status="completed"` + `cancelProject(id)` (aborta vía `AbortController` registrado por `projectId` en `base-agent.ts`, funciona aunque el apply corra fuera del `queueManager`), **sin re-encolar ni regenerar** capítulos. (d) `checkHeartbeat` in-process consulta el status del proyecto y omite el `autoRecover()` si está en `applying_editorial` (lo deja al monitor global). (e) Todos los guards de rutas mutantes (`PATCH /projects/:id`, archive, generate, resume, rewrite, purge-chapters, etc.) ahora bloquean también `applying_editorial`, no solo `generating`, para evitar operaciones concurrentes durante la cirugía editorial. El usuario recibe en activity logs qué instrucciones quedaron sin aplicar y puede reintentar manualmente desde la UI sin daño al manuscrito.

- **[Fix35] Crítica humana sobre el manuscrito reeditado (v7.8)**: Nuevo endpoint `POST /api/reedit-projects/:id/parse-editorial-notes` que acepta `{ notes: string }` (≤200k chars), construye el `chapterIndex` desde `getReeditChaptersByProject` y llama a `parseHolisticBetaForReedit` (mismo util que [Fix34]). Responde 202 + procesa en background; al terminar persiste en `reeditProjects.pendingEditorialParse` con `source: "human_critique_reedit"` o `"mixed_reedit"` si ya había instrucciones del Holístico+Beta sin aplicar (en cuyo caso re-numera los IDs de las nuevas a partir de `max(existing.id)+1` y concatena, preservando las viejas). UI: nueva `Card` "Crítica humana sobre el manuscrito reeditado" en la pestaña Auditorías de `client/src/pages/reedit.tsx`, visible solo en proyectos `completed`, con `Textarea` + botón "Analizar mis notas" (`data-testid: textarea-human-critique`, `button-parse-human-critique`, `card-human-critique-reedit`). Las instrucciones aparecen en la misma `Card` que las del Holístico+Beta y reutilizan su flujo de aplicación (`apply-holistic-beta-instructions`). Sin cambios de schema. Caso de uso: el usuario lee el reedit acabado, anota observaciones propias en español natural, y el sistema las convierte en instrucciones para el SurgicalPatcher como si vinieran del Holístico.

- **[Fix29+30] Holístico gate pre-Final-Reviewer + Beta mid-novela como editorialCritique (v7.7)**: (a) **[Fix29]** Antes del primer ciclo de `runFinalReview` se invoca `runHolisticReview` UNA sola vez sobre el manuscrito completo y, si devuelve notas (>200 chars), se trunca a 12k y se almacena en `holisticGateNotes`. En el ciclo 1 del FR esas notas se anteponen a `issuesPreviosCorregidos` con prefijo `[FIX29 — INFORME HOLÍSTICO PRE-FINAL-REVIEWER]`. En ciclos 2+ ya no se reinyectan. Best-effort. NOTA: re-invocar al Arquitecto post-generación NO es viable (los capítulos ya existen). (b) **[Fix30]** Nuevo campo opcional `editorialCritique?: string` en `GhostwriterInput`. En el loop principal de generación, si `completedSoFar >= floor(totalChapters * 2/3)` y quedan ≥2 capítulos por escribir y la novela tiene ≥6 capítulos, se dispara `runMidNovelBetaReview` UNA sola vez (variante scoped que filtra a solo capítulos `completed` con contenido) y se guarda `notesText` en `midNovelBetaCritique`. Las llamadas posteriores al Ghostwriter reciben `editorialCritique`. Flag `midNovelBetaAttempted` garantiza one-shot incluso si falla.

- **[Fix34] Holístico+Beta del reedit con human-in-the-loop (v7.6)**: Replica del "mismo proceso" del pipeline principal en el reedit. Nuevo campo `reeditProjects.pendingEditorialParse: jsonb`. Util `server/utils/reedit-editorial-parser.ts` con `parseHolisticBetaForReedit({notesText, chapterIndex, projectTitle})`. Stage 8 extendido: tras Holístico+Beta concatena ambos `notesText`, llama al parser y persiste `pendingEditorialParse`. Nuevo método `ReeditOrchestrator.applyHolisticBetaInstructions(projectId, selectedIds[])` que enruta `puntual`/`estructural` al `SurgicalPatcherAgent`, `global_rename` a find/replace word-boundary, y administrativas a skip. Tres endpoints (`GET/POST/DELETE`) y `Card` en la pestaña Auditorías con checkboxes y botones "Aplicar seleccionadas"/"Descartar".

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