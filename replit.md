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