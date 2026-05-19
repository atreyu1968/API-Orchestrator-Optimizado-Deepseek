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
- **Series Milestones/Threads Extractor**: `server/utils/series-milestones-extractor.ts`
- **AI Usage Recording Helper**: `server/utils/ai-usage.ts`

## Recent fixes

> Historial completo en `CHANGELOG.md`. Aquí solo los fixes aún recientes.

- **[Fix80] Auto-extracción de hitos/hilos al convertir libro→serie + inyección a Architect y Ghostwriter en volúmenes 2+ (v8)**: Queja del usuario: "creo que el problema de las series y de que no siga fielmente la guía de la misma es que al crear la serie no se extraen los hitos e hilos de forma automática y por tanto al crearse los proyectos de los siguientes libros no aparecen las referencias". Diagnóstico: (a) `convert-to-series` y `reedit-projects/convert-to-series` generaban la `seriesGuide` pero NUNCA llamaban a `/api/series/:id/guide/extract`, así que `series_arc_milestones` y `series_plot_threads` quedaban vacíos hasta que el usuario los lanzaba a mano; (b) aun extrayéndolos, los hitos/hilos solo viajaban a `series-context-builder` que alimenta Holístico y Beta, NUNCA al Architect ni al Ghostwriter, por lo que los volúmenes 2+ se planificaban y escribían sin restricciones de planificación. Implementación: **(1) Helpers nuevos** — `server/utils/ai-usage.ts` extrae `recordRawAiUsage` (antes inline en `routes.ts:22`, ahora reutilizable sin ciclos de import); `server/utils/series-milestones-extractor.ts` con `extractMilestonesAndThreadsFromGuide({seriesId, seriesGuide, skipIfExists, projectId})` que llama al modelo, parsea JSON con regex de `{...}` y persiste milestones+threads en lote (idempotente por flag `skipIfExists`: si ya hay datos, return temprano con `skipped: true`) y `buildSeriesMilestonesAndThreadsBlock({seriesId, volumeNumber, totalVolumes, isPrequel})` que devuelve un bloque Markdown con tres secciones: hitos OBLIGATORIOS del volumen actual, hitos FUTUROS prohibidos de adelantar, hilos abiertos a continuar/cerrar; retorna `""` si la serie no tiene nada extraído. **(2) Endpoint refactor** (`/api/series/:id/guide/extract`): reescrito para usar el helper en lugar de la lógica inline duplicada (~130 líneas eliminadas). **(3) Auto-extracción tras convert-to-series** (`server/routes.ts:3284-3309` para proyecto, `3715-3741` para reedit): tras generar la `seriesGuide`, lanza `extractMilestonesAndThreadsFromGuide` en **fire-and-forget** (`void (async()=>{...})()`) — la extracción toma ~30s y no debe bloquear la respuesta del endpoint; si el usuario inicia el vol 2 antes de que termine, los volúmenes posteriores la usarán igualmente porque el orchestrator relee en cada generación. **(4) Inyección a agentes** (`server/agents/architect.ts:67-76` input field + `579-596` prompt block; `server/agents/ghostwriter.ts:104-112` + `827-844`): nuevo input opcional `seriesMilestonesAndThreads?: string` renderizado en el system prompt tras el bloque de `seriesUnifiedWorldBible`. **(5) Orchestrator** (`server/orchestrator.ts`): en los **3 scopes** donde se genera capítulos de serie — main (~L1258-1287), resume (~L3026-3045) y qa_rewrite quirúrgica (~L12584-12600) — se hace `dynamic import` de `buildSeriesMilestonesAndThreadsBlock`, se lee `series.totalPlannedBooks` y se computa `isPrequel` (`projectSubtype === "prequel"` o `seriesOrder === 0`), generando `seriesMilestonesBlockStr`. Se pasa como `seriesMilestonesAndThreads: seriesMilestonesBlockStr || undefined` en **las 8 invocaciones** existentes a Architect/Ghostwriter (5 sites en main scope, 1 en resume, 2 en qa_rewrite). **Mejoras detectadas por code review post-implementación y aplicadas en la misma sesión**: el code review (architect) detectó que las 2 invocaciones de Ghostwriter en `rewriteChapterForQA` (sites 13340 inicial y 13387 retry) NO habían recibido el campo `seriesMilestonesAndThreads` aunque el bloque estaba computado en el scope — fix aplicado en la misma sesión añadiendo el campo a ambas. Trade-offs y limitaciones: la auto-extracción fire-and-forget es best-effort sin garantías de finalización; si crashea a mitad (p.ej. tras insertar milestones pero antes de threads), las llamadas posteriores con `skipIfExists=true` saltarán dejando extracción parcial permanente — workaround: existe el endpoint manual `/guide/extract` que el usuario puede llamar con `force` (aún no implementado el flag, pero se puede lanzar tras borrar las filas). El extractor NO usa transacción ni unique constraint a nivel DB, por lo que una llamada concurrente entre auto-extracción y manual puede insertar duplicados (riesgo bajo: el modelo tarda ~30s y rara vez se solapan). Estas mejoras quedan para Fix posteriores si se observan en producción. Solo afecta a series creadas a partir de Fix80; series existentes deben llamar `/guide/extract` manualmente (o usar el botón en la UI) para poblar sus tablas — desde ahí los volúmenes 2+ ya recibirán el bloque inyectado.
- **[Fix79] Anchor inviolable del protagonista único de la serie — al convertir libro→serie se fija el personaje principal en `series.protagonistName` y se propaga al consolidator, Architect y Ghostwriter para que NINGÚN secundario pueda "ascender" a protagonista en los volúmenes 2+ (v8)**: Queja del usuario: "sigue sin funcionar bien la generación de series, me cambia el personaje principal por uno secundario". Causa: Fix78 introdujo la Biblia de Serie consolidada con clasificación de roles (`protagonista` / `secundario_recurrente` / etc.) pero NO había un anchor estable. Cada regeneración el modelo elegía "protagonista" basándose en el material crudo de los volúmenes, y un secundario muy presente en escenas (love interest, sidekick) podía marcarse como protagonista en una regeneración tardía, contaminando el bloque inyectado al Architect/Ghostwriter del siguiente volumen — que entonces escribía un libro donde el "verdadero" protagonista quedaba relegado. El bloque inyectado pedía "no renombrar" pero no destacaba CUÁL era EL protagonista único. Implementación: **(1) Schema** (`shared/schema.ts:73`): nueva columna `series.protagonistName text` — anchor inmutable de la serie. Migración aplicada con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (drizzle-kit push interactivo bloquea CI). **(2) Endpoint convert-to-series** (`server/routes.ts:3199-3237`): tras `getProject`, antes de `createSeries`, lee `worldBibleByProject(projectId)` del vol 1 y extrae el primer character con `role`/`rol` que contenga "protagon"/"main"/"principal" (o `chars[0]` si no encuentra explícito). Lo pasa como `protagonistName` al `createSeries`. Best-effort: si no hay WB, queda null y el consolidator lo fijará tras la primera regeneración. **(3) Endpoint hermano reedit→series** (`server/routes.ts:3565-3598`): misma extracción del primer libro (`resolvedBooks[0]` ya ordenado por `seriesOrder`) leyendo `getReeditWorldBibleByProject` — sólo aplica a libros de tipo `reedit` con WB estructurado; los importados quedan null para que decida el consolidator. **(4) Agente consolidator** (`server/agents/series-world-bible-consolidator.ts`): nuevo input opcional `protagonistAnchor?: string`. Bloque "🚨 PROTAGONISTA_ANCHOR (INVIOLABLE)" inyectado en el prompt ANTES del previousBlock. System prompt amplía con sección "🚨 REGLA DEL PROTAGONISTA ÚNICO (CRÍTICA)" con 4 reglas: exactamente 1 personaje con rol=protagonista, primer índice del array, anchor inviolable, sin anchor mantener el del vol 1. **Sanitización post-modelo robusta** (~L186-294): si llega anchor → busca el personaje por nombre exacto y luego por coincidencia laxa del primer token (p.ej. "Iris" matchea "Iris Vela"); si no existe en la salida, lo inyecta como ficha mínima y anota incoherencia; degrada cualquier OTRO protagonista a `secundario_recurrente`; lleva el anchor a índice 0. Sin anchor: si hay 2+ protagonistas elige el de más `volumenes_apariciones` (empate → primero del array) y degrada el resto; si hay 0 protagonistas asciende `personajes[0]`; SIEMPRE reordena al ganador a índice 0. **Helper estático** `extractProtagonistName(wb)`. **(5) renderForPrompt** reescrito: bloque destacado "🌟 PROTAGONISTA ÚNICO DE LA SERIE" con todos los datos del protagonista arriba, y "RESTO DE PERSONAJES ESTABLECIDOS — NINGUNO puede sustituir al protagonista" abajo. **(6) Architect** (`server/agents/architect.ts:540-548`): regla 0 añadida al bloque inyectado: "EL PROTAGONISTA DE LA SERIE ES EL QUE FIGURA COMO 🌟 PROTAGONISTA ÚNICO. La escaleta DEBE girar en torno a él, lleva el arco vertebrador, abre y cierra el libro. PROHIBIDO 'ascender' un secundario aunque tenga mucho tiempo en pantalla. La cámara y el POV permanecen con el protagonista oficial". **(7) Ghostwriter** (`server/agents/ghostwriter.ts:799-804`): regla equivalente al inicio del bloque de Biblia de Serie. **(8) Orchestrator** (`server/orchestrator.ts:10853-10882`, `regenerateSeriesWorldBible`): lee `series.protagonistName` como `protagonistAnchor` y lo pasa al consolidator. Tras `upsertSeriesWorldBible`, si la serie aún NO tenía anchor fijado (caso típico: series pre-Fix79 o reedit con libros importados), llama `extractProtagonistName(result.worldBible)` y persiste con `storage.updateSeries`. Si ya estaba fijado, NO se sobreescribe (anchor inmutable). **(9) Vía de corrección manual** (`server/routes.ts:80-91`): `updateSeriesSchema` permite `protagonistName: string|null` para corregir el anchor cuando la extracción automática del WB vol 1 eligió mal — única vía soportada para mover el anchor; el resto del sistema lo trata como inmutable. **Mejoras detectadas por code review post-implementación y aplicadas en la misma sesión**: la primera versión (1) tenía la sanitización del anchor envuelta en `if (worldBible.personajes.length > 0)`, lo que dejaba sin enforcement el caso de respuesta vacía/fallback del modelo cuando había anchor → ahora la rama del anchor SIEMPRE se ejecuta, inyecta la ficha mínima si la lista vino vacía; (2) sin anchor, si había exactamente 1 protagonista pero NO en índice 0, no se reordenaba → ahora se reordena en todos los casos; (3) el endpoint hermano `/api/reedit-projects/convert-to-series` no fijaba `protagonistName` aunque sí leyera worldBibles de reedit (gap de cobertura señalado por architect) → añadida extracción análoga; (4) el `updateSeriesSchema` no permitía `protagonistName`, dejando el anchor hard-locked sin vía de corrección si la heurística eligió mal → añadido al schema. Sin migración SQL adicional. Trade-off: la heurística "primer character del WB vol 1" puede fallar si el WB no marca explícitamente roles y los personajes vienen ordenados arbitrariamente — por eso existe el `updateSeries` schema para corregir. Solo afecta a series nuevas y a la próxima regeneración de SWB de series existentes (que entonces fijarán su anchor a partir de la consolidación).

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