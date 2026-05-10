# LitAgents v7.9

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

- **[Fix59] Comienzo de capítulo en EPUB: page-break, número del capítulo en línea separada, mayor aire al primer párrafo y drop-cap inteligente para diálogos (v7.9)**: Bug visible en el EPUB exportado: (1) los capítulos NO empezaban en página nueva — el siguiente capítulo arrancaba directamente debajo del párrafo final del anterior, separado solo por el `margin-top` del `<h1>`, lo que rompe el estándar editorial; (2) el heading "Capítulo N: Subtítulo" se renderizaba todo en una sola línea h1, visualmente cargado y muy diferente a un libro impreso, donde el número va arriba pequeño y el título grande debajo; (3) la separación título → primer párrafo era muy escasa (~1em); (4) cuando el primer párrafo del capítulo abría con un guion de diálogo (`—Hola, dijo Ana...`), la regex del drop-cap dejaba el guion como prefijo flotando antes del capitular, produciendo un visual roto donde "—" quedaba pequeño antes de la "H" gigante. Implementación en `server/services/epub-exporter.ts`: (a) Nueva regla CSS común `.chapter-body h1 { page-break-before: always; break-before: page; }` que fuerza salto de página antes de cada capítulo en lectores EPUB modernos (Kindle, Apple Books, Calibre, Kobo), y `break-after: avoid-page` añadido a h1/h2/h3 para evitar que un título quede huérfano al final de página. (b) El heading se construye ahora con dos `<span>` semánticos: `<span class="chapter-num">Capítulo N</span><span class="chapter-name">Subtítulo</span>`. La nueva clase `.chapter-num` aplica `display:block; font-size:0.65em; letter-spacing:0.18em; text-transform:uppercase; color:#555; margin-bottom:0.6em` (rótulo discreto tipo "CAPÍTULO 7" arriba), y `.chapter-name` se queda con el tamaño grande (1.3-1.7em según tema). Para prólogo/epílogo/nota del autor se usa solo `chapter-name` con el texto descriptivo entero. El `heading` plano (sin spans) se sigue usando en el ToC, OPF y NCX para no contaminar metadatos. (c) Márgenes de h1 ajustados en los 4 temas: `margin-top` aumentado (3-4em) para crear aire generoso al inicio de página, y `margin-bottom` aumentado (2-2.8em) para dar espacio al primer párrafo (antes 0.8-1.2em). Classic: `4em 0 2.5em`; modern: `4em 0 2.8em`; romance: `4em 0 2.5em`; minimal: `3em 0 2em`. (d) `paragraphsToHtml` ahora detecta si el primer párrafo abre con guion de diálogo (`/^[—–-]/` tras `trimStart`) y, si es así, omite el drop-cap y aplica solo la clase `first-para` (que ya suprime el sangrado): así el guion se conserva en su tipografía normal y no queda flotando antes del capitular. La regex de prefijos del drop-cap se simplifica eliminando los guiones del lookahead (`/^([\s"«¡¿]*)(\S)(.*)$/s`) porque ya nunca llega aquí un párrafo que empiece por guion. Sin migración SQL. Acción para el VPS tras pull: ninguna; basta con re-exportar EPUB de cualquier proyecto para ver los cambios.
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