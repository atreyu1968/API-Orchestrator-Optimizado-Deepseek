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