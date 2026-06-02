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

- **[Fix133] El lector Beta deja de mezclar la versión actual con su lectura anterior (no reabrir pegas ya resueltas)**: el usuario notó que el lector que relee la novela parecía referirse a cosas ya corregidas, mezclando la versión vigente con una pasada. Diagnóstico: el TEXTO siempre se relee fresco de la BD (`loadFullNovelContext`), y el lector HOLÍSTICO no recibe sus notas previas (lee limpio). El que arrastraba memoria era el lector BETA: el bloque `previousNotesBlock` (Fix38) le inyecta su reacción anterior completa (hasta 24k chars) y, aunque pedía reconciliarla, el modelo podía tomar problemas de la versión PASADA como si siguieran en el texto actual. **Arreglo (`server/agents/beta-reader.ts`)**: reescrito el bloque para declarar que el manuscrito actual es la ÚNICA fuente de verdad y que las notas previas son una versión PASADA ya posiblemente corregida; antes de repetir cualquier pega antigua el Beta debe RE-LOCALIZARLA en el texto actual y citar el (cap N) donde sigue presente HOY; si no la encuentra, la da por RESUELTA y NO emite instrucción (prohibido instruir sobre algo que no pueda señalar hoy con cita de capítulo). Se conserva la intención de Fix38 (insistir en lo aún vigente, prohibido `instrucciones: []`) pero redirigida a pegas CONFIRMADAS en el texto actual, evoluciones reales o mejoras incrementales. El Holístico no se toca (ya lee limpio). **Post-review architect**: válvula de recall — una pega GLOBAL real (ritmo/tono de conjunto) que el Beta perciba hoy pero no pueda anclar a un capítulo no se descarta en silencio: se recoge como observación en prosa (no como instrucción accionable), para que el autor la vea sin que el cirujano la aplique a ciegas. Coste 0 LLM extra (solo prompt). Sin migración. tsc PASS. Architect PASS.

- **[Fix132] Feedback que prioriza escalada REAL sobre rotación de formas en el acto 2**: cuando el Auditor Estructural deja KO la dimensión `escalada_acto2` (o `deus_ex_machina`), el Arquitecto tendía a "resolverla" rotando `forma_dominante`/`funcion_estructural`/`tipo_cierre` (ejes que el auditor mide aparte y que ya podían estar bien) sin añadir coste dramático nuevo. En el retry del bucle SA (`feedbackWithHistorySA`, `server/orchestrator.ts`) se antepone ahora un bloque de PRIORIDAD que exige subir `apuesta_dramatica` de forma monotónica (prohibido 3+ caps igual/decreciente), pagar cada subida con coste TANGIBLE E IRREVERSIBLE (muerte/herida de aliado, exposición pública, decisión irreversible, pérdida de recurso, ruptura definitiva), al menos un cap del acto 2 en `alta`/`critica`, y —si aplica— que todo salvador/informante del último 25% esté sembrado en ≥2 caps previos. Reutiliza el audit on-demand del Auditor de World Bible (Fix115/116) para enriquecer la base si la carencia es estructural. Coste 0 LLM. Sin migración. tsc PASS.

- **[Fix131] Reversiones selectivas por capítulo (no perder correcciones válidas al revertir por regresión)**: al revertir al mejor snapshot por caída de score, los auto-loops restauraban TODOS los capítulos, deshaciendo arreglos que una reseña posterior ya no señalaba. `restoreSnapshot` admite `restoreOnly?: Set<number>` y restaura SOLO los capítulos aún marcados por la reseña vigente (`extractFlaggedChapters` sobre las notas actuales), conservando el resto; fallback a restore completo si el set viene vacío; se maneja el drift estructural. Aplicado en los TRES puntos de regresión: Revisor Final (Fix39), holístico (Fix81) y Beta (Fix112). NO se aplica a restores de salida (aprobación/máx-iter) — decisión deliberada. Sin migración. tsc PASS.

- **[Fix130] Cobertura por instrucción (ninguna nota puntual se pierde en silencio)**: con varias instrucciones puntuales por capítulo, el cirujano podía aplicar unas y dejar otras sin que el sistema lo detectara. `PatcherInput.instructionCount?` le informa de cuántas debe cubrir y cada `justification` debe empezar por el índice 1-based (`"N:"`) para mapear operación→instrucción. `applyEditorialNotes` cruza el `coverage` del cirujano (`aplicada`/`ya_cumplida`/`siembra_ausente`/`requiere_estructural`) con las operaciones aplicadas: las no resueltas se reescriben con el Narrador; `siembra_ausente` NO se fuerza (anti deus ex machina) y va al Revisor Final. **Post-review architect**: "aplicada" solo cuenta como cubierta con evidencia POR INSTRUCCIÓN (operación con `justification` `"N:"`), NO con el flag global `appliedOk` (antes una sola operación marcaba cubiertas todas, dejando puntuales sin escalar). Sin migración. tsc PASS.

- **[Fix129] Contexto de vecinos (SOLO-LECTURA) al cirujano (anti deus ex machina)**: el cirujano no veía la cola del capítulo anterior ni el inicio del siguiente, así que podía introducir giros/soluciones sin siembra. `PatcherInput.referenceChapters?` inyecta esos fragmentos en el prompt marcados como REFERENCIA NO EDITABLE (coherencia sí, reescritura de vecinos no); el flujo puntual añade además una pista de siembra. Sin migración. tsc PASS.

- **[Fix128] Revalidación de instrucciones fantasma antes del cirujano**: el motor de re-edit llamaba al cirujano aunque las citas literales de la instrucción ya no existieran en el texto VIGENTE (modificado por una iteración previa), fallando el `find_exact` o reescribiendo a ciegas. Nuevo helper `server/utils/instruction-grounding.ts` (`extractLiteralQuotes`, `groundInstructionInChapter`); cableado en `applyEditorialNotes` y `reedit-orchestrator`: las instrucciones cuyas citas ya no están se descartan limpio con log claro ANTES del cirujano, sin gastar reescritura. Coste 0 LLM (regex). Sin migración. tsc PASS. Architect PASS para toda la tanda Fix128-132 (tras corregir el bug de cobertura de Fix130).

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