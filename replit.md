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

- **[Fix91] Refresco automático de las 3 puntuaciones (Final + Holístico + Beta) tras aplicar revisiones de los lectores, para que el usuario vea de inmediato si los cambios mejoran o empeoran**: Petición del usuario: "que se actualicen automáticamente las 3 puntuaciones después de aplicar las revisiones, para ver si los cambios mejoran o empeoran". Diagnóstico: hasta v9.0.0, tras aplicar notas editoriales (vía `POST /api/projects/:id/apply-editorial-notes`, único endpoint del frontend), `applyEditorialNotes` solo invocaba `recalculateFinalScoreAfterEdits` (Revisor Final). Las puntuaciones de Lector Holístico y Lector Beta se quedaban congeladas con el valor previo a las correcciones — el usuario no sabía si las modificaciones habían mejorado o empeorado el manuscrito hasta lanzar manualmente "Revisión Holística" + "Lectura Beta" por separado. Los auto-loops Fix47 y Fix81 sí refrescaban H+B al inicio de cada iteración, pero solo cuando se usaban (modo automatizado). Implementación: **(1) Bloque de refresco al final de `recalculateFinalScoreAfterEdits`** (`server/orchestrator.ts:8422-8506`): tras escribir `finalScore` y `finalScoreAt`, si `!opts?.skipReaderReviewRefresh`, se ejecutan `runHolisticReview` y `runBetaReview` en paralelo vía `Promise.allSettled` sobre el `freshProject` recargado de DB (el manuscrito ya está editado). Ambos métodos ya persisten internamente `holisticScore`+`holisticScoreAt`+`lastHolisticNotes`+`lastHolisticNotesAt` (Fix75/Fix82) y `betaScore`+`betaScoreAt`+`lastBetaNotes`+`lastBetaNotesAt`, así que basta con invocarlos. Si uno falla (`status === "rejected"`), el otro sigue y el log lo indica. El status del agente "editor" se notifica como "thinking" antes y vuelve a delegarse en los runners. **(2) Log de delta legible** (`server/orchestrator.ts:8453-8493`): tras el refresco se escribe un único activity log con el formato `Puntuaciones de lectores tras las correcciones: Holístico: 7/10 → 8/10 (mejora) (+1.0); Beta: 9/10 → 8/10 (empeora) (-1.0).` Las puntuaciones previas se capturan en `_applyEditorialNotes` antes de cualquier modificación (`project.holisticScore` y `project.betaScore`) y se pasan vía opts. Si no había nota previa el formato es `8/10 (sin nota previa)`; si el parser no encontró la nueva, `sin nota nueva`. El nivel del log es `warning` si la peor delta < −0.5 ("la nota ha bajado — revisa los cambios antes de aceptar"), `success` si la mejor delta > 0 ("las correcciones han mejorado al menos una lectura"), `info` si todo plano. **(3) Tres callsites de `recalculateFinalScoreAfterEdits` actualizados** (`server/orchestrator.ts:8703-8707` solo-eliminaciones, `8785-8789` solo-macro, `9248-9252` flujo cap-a-cap completo): los tres ahora capturan `previousHolisticScore` y `previousBetaScore` junto al `previousFinalScore` ya existente y los pasan a opts, además de propagar el `skipReaderReviewRefresh` recibido por `applyEditorialNotes`. **(4) Loops automáticos opt-out** (`server/orchestrator.ts:7978` Fix81 y `11677` Fix47): los dos call sites de loop interno pasan `{ skipReaderReviewRefresh: true }` a `applyEditorialNotes`, porque ya re-ejecutan H+B al inicio de la siguiente iteración. El call site manual del route handler (`server/routes.ts:1620`) NO pasa el flag, así que el usuario que pulsa "Aplicar notas" desde la UI sí recibe el refresco automático. **(5) Auto-revert respetado**: si `recalculateFinalScoreAfterEdits` dispara el auto-revert Fix69-C (regresión de finalScore ≥ −2.0), la función retorna antes de llegar al bloque H+B nuevo, así que no se desperdician dos llamadas costosas re-leyendo el manuscrito que ya volvió a su estado anterior. **(6) Sin emojis**: las flechas de delta usan texto literal `(mejora)` / `(empeora)` / `(igual)` en lugar de iconos, alineado con la preferencia del usuario. **Resultado**: tras pulsar "Aplicar revisiones" la UI verá actualizarse las tres puntuaciones en cuanto el reviewer correspondiente termine — Final primero (rápido, ~30s, una sola pasada con todos los caps), Holístico y Beta a continuación en paralelo (~2-4 min según longitud del manuscrito). El activity log incluye la línea con los tres deltas para que el usuario pueda valorar de un vistazo si vale la pena conservar las correcciones o revertir.

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