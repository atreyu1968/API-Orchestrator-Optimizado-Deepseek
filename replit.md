# LitAgents

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

- **[Fix33] Logs descargables del reedit (v7.5)**: Nuevo sistema de logs persistentes por proyecto de reedit, en disco y descargables desde la UI. (a) `server/utils/reedit-logger.ts` expone `logReeditEvent(projectId, level, stage, message, {chapter, context})`, `readProjectLog`, `projectLogStats` y `clearProjectLog`. Cada llamada hace append asíncrono fire-and-forget (mutex por `projectId` con `Map<number,Promise>` para serializar writes y evitar intercalado) a `data/reedit-logs/{projectId}.log` (ruta no versionada, añadida a `.gitignore`). Formato por línea: `[ISO_TS] [LEVEL] [stage] [cap=N?] mensaje {json context?}`. Nunca lanza ni bloquea: errores de I/O quedan en `console.error` con prefijo `[ReeditLogger]`. (b) `emitProgress` del `ReeditOrchestrator` ahora emite también `logReeditEvent(...,"info",stage,message,{chapter,context:{totalChapters}})` por cada evento de progreso, y registra `warn` adicional si falla la escritura del `currentActivity` en DB. (c) Tres endpoints nuevos en `server/routes.ts`: `GET /api/reedit-projects/:id/logs/download` (devuelve `text/plain` con cabecera de metadata —título, projectId, bytes, mtime, status— y `Content-Disposition: attachment; filename="{titulo_safe}-{id}-logs.txt"`; sanea el título a ASCII safe), `GET .../logs/stats` (`{exists,bytes,updatedAt}`) y `DELETE .../logs` (borra el fichero, idempotente ante ENOENT). (d) UI: pestaña Auditorías de `client/src/pages/reedit.tsx` añade botón "Descargar logs" (abre el endpoint en pestaña nueva, fuerza descarga vía `Content-Disposition`) y "Borrar" (con `confirm()`). Los `data-testid` siguen la convención: `button-download-reedit-logs`, `button-clear-reedit-logs`. Casos de uso: poder pasar al agente los logs reales de un reedit fallido o subóptimo para diagnóstico (caso "La Promesa del Olvido" sin trazabilidad de cap 17 outlier 11:34 min — ahora quedaría en log).
- **[Fix32] Auditor de Cierre de Tramas en post-reedit (v7.3+)**: Nuevo agente `PlotThreadClosureAuditorAgent` (`server/agents/plot-thread-closure-auditor.ts`, DeepSeek V4-Flash, 18 min timeout, JSON estricto) integrado como cuarta tarea paralela del Stage 8 del reedit ([Fix24]). Lee el manuscrito completo y produce inventario exhaustivo de TODAS las tramas y subtramas con estado individual de cierre (`cerrada`, `cierre_parcial`, `abierta_intencional` con justificacion, `abierta_colgante` con `fix_sugerido`), evidencia textual breve de apertura y cierre por trama, agregados (`puntuacion_cierre 0-10`, contadores por estado, `tramas_colgantes_criticas`). Persiste como `reeditAuditReports.auditType = "plot_threads_closure"`. Detecta automaticamente VOLUMEN INTERMEDIO de saga (filtrando `getAllReeditProjects` por `seriesId` con `seriesOrder` mayor) para ser tolerante con ganchos abiertos; en novelas autonomas o ultimos volumenes es estricto. Sanea la respuesta del LLM: tipo y estado fuera del enum se normalizan, `tramas_colgantes_criticas` se reconstruye desde el inventario si el modelo lo omite, `puntuacion_cierre` se recalcula heuristicamente como fallback. Resuelve el caso de uso "es importante que en la reedicion se detecten todas las tramas y subtramas y queden cerradas".
- **[Fix24..28+31] Aprovechar 1M ctx en reedit + dos lectores en paralelo (v7.3)**: Bloque de mejoras independientes detectadas tras logs reales de novelas largas. (a) **[Fix24] Stage 8 post-reedit** (`reedit-orchestrator.ts:runStage8PostReeditReviews`): nuevo método best-effort lanzado tras marcar el reedit como `completed` que ejecuta `HolisticReviewerAgent` + `BetaReaderAgent` (+ `ManuscriptAnalyzerAgent` si hay `seriesId`) sobre el manuscrito reeditado y persiste tres `reeditAuditReports` con auditType `holistic_review` / `beta_review` / `series_snapshot` (sin migración de schema, usa `findings` JSONB). Un fallo aquí NO revierte el reedit. (b) **[Fix25] Beta paralelo en `runAutoHolisticReviewLoop`** (`orchestrator.ts:6415`): Holístico + Beta vía `Promise.allSettled`, ambos `notesText` se concatenan con cabeceras separadoras y se pasan en una sola llamada al parser. Si uno falla, log warn y continúa con el otro. (c) **[Fix26] `previousChaptersFullText` + `previousVolumesFullText` en chapter-expander**: nuevos campos opcionales en `ChapterExpansionInput` y `NewChapterInput`; los prompts incluyen los bloques completos de capítulos previos del propio manuscrito y de volúmenes anteriores de la saga; los call sites del reedit los llenan con los helpers existentes. (d) **[Fix27] Capítulos previos íntegros en QA del reedit**: wrappers `auditContinuity` y `auditVoiceRhythm` aceptan parámetro nuevo `previousChaptersFullText`; antes de cada tramo se construye el texto previo y se forwardea al agente canónico para reducir falsos positivos. (e) **[Fix28] ManuscriptAnalyzer con presupuesto adaptativo de 800K chars**: si la suma de capítulos cabe, se envía ÍNTEGRO; si excede, recorte head+tail por capítulo proporcional al ratio y mínimo 2000 chars por capítulo (vs. el head 1k + tail 1k fijo previo que destruía toda la info del medio del capítulo). (f) **[Fix31] Regen del snapshot de saga al final del reedit**: integrado dentro del Stage 8 ([Fix24]); si hay `seriesId`, ManuscriptAnalyzer (ya con [Fix28]) procesa la versión reeditada y persiste el snapshot como audit report `series_snapshot` para que volúmenes posteriores vean el canon resultante del reedit.
- **[Fix21+22+23] Robustez post-revisión final tras logs de "La Promesa del Olvido"**: Tres mejoras independientes detectadas en el caso real (novela completada OK pero con observaciones). (a) **[Fix21] Cap absoluto ±15% en fallback de cirugía → narrador** (`orchestrator.ts:11369-11379`): cuando el cirujano clasifica una instrucción como "estructural" y delega al Narrador, la red de seguridad de longitud previa permitía contracciones/expansiones grandes si el rango del proyecto era laxo (caso real: cap 25 pasó de 2009 → 1460 palabras = -27%). El nuevo `hardLower/hardUpper` añade `Math.max(rangoProyecto, originalCap)` y `Math.min(rangoProyecto, originalCap)` con `originalCap = original × {0.85, 1.15}`, garantizando que el fallback nunca se desvíe más del ±15% del original. Si la corrección requiere reescritura más radical, debe ir por otra ruta (no por este fallback). (b) **[Fix22] Buffer de instrucciones rechazadas por el cirujano para el Revisor Final**: nueva propiedad `staleInstructionsForFinalReviewer` en el Orchestrator que se vacía al inicio de cada `runFinalReview` y se rellena cuando el cirujano cancela una reescritura editorial por `isInstructionStaleOrAlreadySatisfied` (instrucción cita contenido inexistente o ya satisfecho). En el siguiente ciclo del Revisor Final esas notas se inyectan en `issuesPreviosCorregidos` con prefijo `[FALSO POSITIVO YA VERIFICADO POR EL CIRUJANO — NO VUELVAS A EMITIRLO]` para evitar que el Revisor repita ciclo tras ciclo el mismo issue fantasma (caso real: cap 7 "formaldehído" repetido en ciclos 1, 3 y 5; cap 26 "cromato" en ciclos 4 y 5 — quemaron ciclos sin avanzar). (c) **[Fix23] Logging de pulidos anómalos en CopyEditor** (`copyeditor.ts:369-381`): instrumentación de tiempo en `execute`. Si un pulido individual excede 5 min, se emite `console.warn` con duración y nombre de capítulo para diagnóstico futuro de degradaciones del LLM (caso real: cap 17 tardó 11:34 min, outlier 5x sin trazabilidad previa).
- **[Fix20] Timeout Arquitecto Fase 2 insuficiente tras [Fix18]**: Los 6 campos extra por capítulo añadidos en [Fix18] (`siembra`, `cosecha`, `tension_objetivo`, `dias_diegeticos`, `eventos_pivotales`, `justificacion_antagonica`) inflan el JSON de Fase 2 y, en novelas grandes (40+ caps), 12 min ya no eran suficientes — el sistema entraba en bucle de timeouts hasta marcar el proyecto como FALLIDO tras 3 reintentos. Cambios: (a) timeout puntual de Fase 2 subido a **18 min** (override-restore en `architect.ts`, sin tocar Fase 1); (b) `HEARTBEAT_TIMEOUT_MS` del queue-manager de 15 → **22 min** (4 min de margen sobre el peor caso de 1 intento); (c) `BaseAgent.generateContent` ahora emite un `activity log` cuando reintenta tras timeout, manteniendo vivo el frozen monitor durante los reintentos internos (3×18 min = 54 min posibles); (d) Architect ahora pasa `projectId` a `generateContent` (antes no lo pasaba, lo que dejaba huérfanos los AI usage events y los logs de retry); (e) `QueueManager.checkHeartbeat` consulta DB (`getLastActivityLogTime`) antes de declarar congelado, refrescando el heartbeat in-memory si la DB tiene actividad reciente — así el log de retry del BaseAgent también frena el monitor in-memory, no sólo el global; (f) comentarios stale en `orchestrator.ts` (12 min, 15 min) actualizados.
- **[Fix19] Cabecera de capítulo duplicada en exportación**: Nueva utilidad `server/utils/strip-chapter-header.ts` (`stripMetaChapterHeader`) elimina líneas iniciales que sean cabeceras meta del capítulo (con/sin `#`, con/sin separador, incluyendo "Capítulo N" desnudo, "—Capítulo N: Título", "**Capítulo N**", "Prólogo:", etc.). Aplicada como defensa en profundidad en: `cleanChapterContent` y `cleanReeditContent` de `routes.ts`, los 3 puntos de `lines.push(parsed.body)` (export ES + 2 traducciones), los 2 puntos del pipeline de reedit (`splitLongParagraphs(content.trim())`), `addContentParagraphs` del docx-exporter, y refactor del `stripChapterHeaderFromOpening` del Ghostwriter para delegar en la utilidad común. La regex previa requería separador (`:` `.` `-` `—`) y por eso no atrapaba `Capítulo 22` solo.
- **[Fix18] Plot Integrity Auditor**: Nuevo agente (`server/agents/plot-integrity-auditor.ts`) que audita la escaleta del Arquitecto en 3 dimensiones —foreshadowing/seeds-payoffs, coherencia operacional del antagonista, ritmo y densidad del acto 3— combinando métricas deterministas (densidad de pivotes por acto, curva de tensión, días diegéticos, ratio de cliffhangers) con análisis cualitativo del LLM. Inserto entre el Crítico de Originalidad y el Lector Beta con loop de retry (máx 2 iter, threshold 7/10) que reinvoca al Arquitecto vía `plotIntegrityFeedback`. PHASE2 del Arquitecto extendido con campos opcionales por capítulo: `siembra`, `cosecha`, `tension_objetivo`, `dias_diegeticos`, `eventos_pivotales`, `justificacion_antagonica`. Best-effort buffer conserva la mejor escaleta vista.

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