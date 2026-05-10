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

- **[Fix58] Vinculación a serie en el flujo de import del reedit + helper compartido `series-context-builder` (v7.9)**: Hasta ahora, vincular un manuscrito reeditado a una serie requería dos pasos manuales: (1) subir el .docx en `/reedit`; (2) ir a `/series` o usar `POST /api/series/:id/link-reedit` después. Si el usuario olvidaba el paso 2, el reedit Stage 8 (Fix24) corría como libro suelto y los lectores Holístico/Beta —incluso con Fix57 ya merged— no recibían contexto de serie porque `project.seriesId` era null. Implementación: (a) Nuevo módulo `server/utils/series-context-builder.ts` (~95 LOC) que extrae el helper antes inline en `orchestrator.ts:5442`. Función pura `buildSeriesContextForReviewers({ seriesId, seriesOrder, loadThreadsAndEvents? })` que devuelve string|undefined: carga `storage.getSeries`/`getMilestonesBySeries`/`getPlotThreadsBySeries`, opcionalmente invoca un callback inyectado para hilos heredados+eventos clave previos (que en el orchestrator principal lee el texto íntegro de los volúmenes anteriores), y produce el bloque markdown "## CONTEXTO DE SERIE" con posición del volumen `N de M`, `isLastVolume`, hilos heredados (top 25), eventos clave (top 25), milestones obligatorios DEL volumen (`[OBLIGATORIO]`/`[opcional]`) y plot threads no resueltos (top 30). (b) `server/orchestrator.ts:5439` ahora delega en el helper inyectándole `() => this.loadSeriesThreadsAndEvents(project)` como callback, manteniendo el comportamiento idéntico de Fix57. (c) `server/orchestrators/reedit-orchestrator.ts:5147` reemplaza el bloque mínimo inline (~20 LOC) por una llamada al MISMO helper sin callback, así el reedit Stage 8 ahora recibe el contexto rico (milestones + plot threads de la serie + título), no solo el bloque básico de Fix57. (d) `POST /api/reedit-projects` (`server/routes.ts:8292`) ahora destructura `seriesId` y `seriesOrder` del body multipart; valida que el id existe (`storage.getSeries(id).catch(() => null)`) y, si es válido, persiste ambos campos en `createReeditProject`; si el id no existe se ignora silenciosamente con `console.warn` para no bloquear el import. (e) UI en `client/src/pages/reedit.tsx`: nuevos states `uploadSeriesId` (`"none"|"create"|<idStr>`), `uploadSeriesOrder`, `newSeriesTitle`, `newSeriesTotalBooks`; nueva `useQuery(["/api/series"])` para poblar el dropdown; nuevo `createSeriesMutation` que llama `POST /api/series` y al completar setea `uploadSeriesId` con el id retornado (sin necesidad de submodal aparte). En el formulario, tras el select de idioma, bloque "Pertenece a serie (opcional)" con `Select` (testid `select-reedit-series`) que ofrece `Ninguna serie / + Crear nueva serie… / <series existentes>`; si "create" aparece sub-bloque con `Input` título (`input-new-series-title`) e `Input` numérico de volúmenes planificados (`input-new-series-total`); si != "none" aparece `Input` numérico "N° de volumen" (`input-reedit-series-order`); cuando ese N° > 1, banner amarillo informando que los lectores esperarán hilos heredados de los volúmenes anteriores y que se pueden subir en la página `/series` (link wouter `link-series-page`). El `handleUpload` ahora resuelve el id antes del POST (creando la serie primero si "create"), añade `seriesId`+`seriesOrder` al FormData, y resetea los nuevos states tras éxito. Sin migración SQL (las columnas `seriesId`/`seriesOrder` ya existían en `reedit_projects` desde antes).

- **[Fix57] Holístico y Beta reciben CONTEXTO DE SERIE para no penalizar arcos largos en volúmenes intermedios (v7.9)**: Bug reportado en producción: las novelas que pertenecen a una serie nunca recibían APROBADO de los lectores Holístico ni Beta, porque ambos leían el manuscrito sin saber que era el vol N de M y exigían el cierre de TODAS las tramas — incluidas las que están diseñadas para resolverse en volúmenes posteriores. El auto-loop del Beta (Fix47) entraba así en bucle hasta el máximo de iteraciones sin converger. Implementación: (a) Nuevo campo opcional `seriesContext?: string` en los inputs de `HolisticReviewerAgent.runReview` (`server/agents/holistic-reviewer.ts`) y `BetaReaderAgent.runReview` (`server/agents/beta-reader.ts`). El bloque se renderiza tras `worldBibleBlock` y antes de `translationBlock` en ambos prompts. (b) Nueva regla 5 en el `SYSTEM_PROMPT` de los dos agentes: "Si recibes un bloque '## CONTEXTO DE SERIE' indicando que NO es el último volumen, no exijas el cierre de los hilos de serie ni emitas instrucciones para forzarlo; sí controla que el arco autoconclusivo del libro y los milestones obligatorios del volumen ocurran." (c) Nuevo helper privado `buildSeriesContextForReviewers(project)` en `server/orchestrator.ts` (~L5445, ~70 LOC) que retorna `undefined` cuando `project.seriesId` es null y, cuando hay serie, carga `storage.getSeries`, `loadSeriesThreadsAndEvents` (reusado de FinalReviewer L3756), `getMilestonesBySeries` y `getPlotThreadsBySeries`, y produce un markdown con: posición del volumen (`N de M`), `isLastVolume` (gating crítico), hilos heredados (top 25), eventos clave previos (top 25), milestones obligatorios DEL volumen actual (marcados `[OBLIGATORIO]` vs `[opcional]`) y plot threads de la serie aún no resueltos con su importancia y estado (top 30). Best-effort: si alguna carga falla, devuelve `undefined` y los reviewers operan como antes. (d) Tres invocaciones cableadas: `runHolisticReview` (~L5510), `runMidNovelBetaReview` (~L5552) y `runBetaReview` (~L5610). El log de `createActivityLog` añade el sufijo `[Fix57: con contexto de serie]` cuando se inyecta. (e) Reedit Stage 8 (`server/orchestrators/reedit-orchestrator.ts` L5141) también pasa un `seriesContext` simplificado, construido inline desde las señales `isSeries`/`esVolumenIntermedio`/`seriesOrder`/`seriesTitle` ya calculadas (no carga threads/milestones porque el reedit-orchestrator no tiene esos helpers a mano y el bloque mínimo ya basta para el gating principal). Sin migración SQL.

- **[Fix56] El copyright del EPUB siempre corresponde al pseudónimo, no al titular de la cuenta (v7.9)**: Bug reportado en producción: aunque cada novela tiene su propio pseudónimo asignado, el copyright del EPUB exportado mostraba siempre el nombre real del titular (Francisco Javier González Rolo). Causa raíz: en `epub-exporter.ts:355`, cuando una editorial tenía `copyright_line` configurado en `publishers`, esa línea SOBRESCRIBÍA literalmente el copyright generado con el `authorName` (pseudónimo), sin interpolación alguna. El usuario había guardado "© [su nombre real]" en su editorial y ese texto aparecía en TODOS los libros independientemente del pseudónimo. Implementación: refactor de la lógica de copyright en `generateGenericManuscriptEpub` (~L357-378). (a) Soporte de placeholders `{author}` y `{year}` en `publisher.copyrightLine` mediante regex case-insensitive; si están presentes se interpolan con el pseudónimo y el año en curso, y la línea reemplaza al copyright por defecto. (b) Si la línea de la editorial NO contiene `{author}`, deja de tratarse como copyright principal y pasa a ser un **pie editorial adicional** que se muestra debajo; el copyright principal se vuelve a generar siempre con `labels.copyrightDefault(authorName, year)`, garantizando que el pseudónimo aparezca aunque la editorial tenga texto custom. Si contiene `{year}` pero no `{author}` también se interpola el año. (c) Nueva variable `extraPublisherCopyrightLine` insertada en `copyrightBody` justo debajo del copyright principal y antes de `publisherLine`. Compatible hacia atrás: editoriales con `copyright_line` vacío siguen funcionando como antes (default con pseudónimo); editoriales con `copyright_line` literal ahora muestran el pseudónimo correcto + su pie editorial debajo; editoriales que quieran control total pueden usar plantilla con `{author}`/`{year}`. Cubre los tres exportadores EPUB (proyectos originales, reedits, traducciones de Fix55) porque todos usan `generateGenericManuscriptEpub`. Sin migración SQL.

- **[Fix55] EPUB y auto-loop del Beta para traducciones CREADAS (no subidas) (v7.9)**: Las traducciones viven en dos sitios distintos del sistema: las **subidas** (cargas un .docx para traducir) viajan por `reedit_projects` y ya tenían EPUB (Fix51) + bucle Beta (Fix52); las **creadas** (traduces una novela ya completada en el sistema desde `/export`) viven en la tabla `translations` (markdown plano), pasaban por el `TranslatorAgent` capítulo a capítulo y NO tenían ni EPUB ni pulido lingüístico. Este fix cierra ambas brechas para el segundo grupo. Implementación: (a) Tres columnas nuevas en `translations`: `autoBetaLoop: boolean default false`, `autoBetaLoopMaxIterations: integer default 2` (rango 1-10), `betaReviewNotes: text` (notas finales del Beta tras el bucle), `betaReviewIterationsRun: integer default 0` (contador). Status amplía con `"polishing"` para que la UI muestre el estado intermedio. (b) Nuevo servicio aislado `server/services/translation-beta-polish.ts` (~310 LOC) con tres piezas: `parseTranslationMarkdown(md, lang)` que reconstruye `chapters[]` desde `translations.markdown` (split por `## headings` localizados a 7 idiomas, detecta números via regex `Capítulo|Chapter|Chapitre|Kapitel|Capitolo|Capítol \d+` y casos especiales Prólogo=0/Epílogo=-1/Nota del Autor=-2); `rebuildTranslationMarkdown(chapters)` para el reverso; clase interna `TranslationPolisherAgent` (DeepSeek V4-Flash) con system prompt restrictivo "NO retraduces, NO añades prosa, NO eliminas escenas, aplica QUIRÚRGICAMENTE preservando significado/nombres propios/markdown"; y `runAutoBetaLoopOnPlainTranslation(translationId)` que itera: parsea markdown → `BetaReaderAgent.runReview({translationMode:true, targetLanguage})` → si notes vacíos APROBADO → extrae instrucciones del bloque `INSTRUCCIONES_AUTOAPLICABLES` (reusa `repairJson` con el escapado de Fix54) → criterio aprobación `total === 0 || (altas === 0 && total <= 3)` → si no, agrupa por `capitulos_afectados` → llama `polisher.polish()` por cada capítulo afectado pasándole TODAS sus instrucciones (1 call por cap por iter, no por instrucción) → validación de seguridad descarta el pulido si `newLen < origLen * 0.6` (probable alucinación) → reconstruye markdown, persiste, repite. Acumula tokens en `translations.inputTokens/outputTokens` y persiste `betaReviewNotes` con las notas de la última iter para que el usuario las consulte. (c) Nuevo endpoint `GET /api/translations/:id/export-epub?publisherId=X&styleId=Y` en `server/routes.ts` (~L7353) que parsea el markdown con el nuevo parser, resuelve el autor desde el pseudonym del proyecto fuente (original o reedit, best-effort), valida `styleId` contra whitelist `classic|modern|romance|minimal` (igual que Fix53), y llama `generateGenericManuscriptEpub` (Fix51). (d) `GET /api/projects/:id/translate-stream` ahora acepta `?autoBetaLoop=true&autoBetaLoopMaxIterations=N` desde la query, persiste los flags al crear la translation row y tras `res.end()` dispara el bucle en background con `import()` dinámico (NO bloquea el SSE ya cerrado, errores quedan en consola + persiste `status: "completed"` ante fallo). Solo los proyectos `source === "original"` aceptan el flag; las translations de reedit ya tienen Fix52. (e) UI en `client/src/pages/export.tsx`: en el form "Nueva Traducción" un `Checkbox` "Pulir con el Lector Beta tras traducir" (testid `checkbox-auto-beta-loop-translation`, solo visible para `source === "original"`) + `Input` numérico de iteraciones cuando está marcado; en cada fila de traducción completada un botón "EPUB" que abre Dialog con select de editorial + estilo (testids `select-translation-epub-publisher` / `select-translation-epub-style` / `button-confirm-export-translation-epub`); badge `Beta: N iter` cuando `betaReviewNotes` existe + botón ojo que abre Dialog con `<pre>` mostrando las notas; badge `Puliendo (iter N)` cuando `status === "polishing"`. (f) `startup-schema-check.ts` actualizado con las 4 columnas nuevas. Acción para el VPS tras pull: `psql "$DATABASE_URL" -c "ALTER TABLE translations ADD COLUMN IF NOT EXISTS auto_beta_loop BOOLEAN DEFAULT false; ALTER TABLE translations ADD COLUMN IF NOT EXISTS auto_beta_loop_max_iterations INTEGER DEFAULT 2; ALTER TABLE translations ADD COLUMN IF NOT EXISTS beta_review_notes TEXT; ALTER TABLE translations ADD COLUMN IF NOT EXISTS beta_review_iterations_run INTEGER DEFAULT 0;"` (alternativa al `npx drizzle-kit push --force`).

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