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

- **[Fix52] Auto-loop del Lector Beta sobre traducciones (v7.9)**: Pulido lingüístico automático opt-in para reediciones que sean traducciones. Hasta ahora el pipeline reedit (que también procesa traducciones) terminaba con Stage 8 (Holístico+Beta+Closure) y dejaba `pendingEditorialParse` para revisión humana. Las traducciones suelen necesitar una segunda pasada del Beta enfocada SOLO en fluidez del idioma destino, sin tocar significado. Implementación: (a) Dos columnas nuevas en `reeditProjects`: `autoBetaLoopOnTranslations: boolean default false` + `autoBetaLoopOnTranslationsMaxIterations: integer default 2` (rango 1-10). (b) `BetaReaderAgent.runReview` acepta dos params nuevos `translationMode?: boolean` + `targetLanguage?: string`. Cuando `translationMode=true`, inyecta un bloque crítico ANTES del manuscrito que: (i) restringe el rol a evaluar fluidez/naturalidad/calcos sintácticos/falsos amigos/inconsistencias terminológicas/residuos sin traducir; (ii) PROHÍBE proponer cambios de significado, retraducir secciones, juzgar estructura/arcos/ritmo o eliminar/fusionar capítulos; (iii) restringe el JSON a tipos `puntual`/`estructural` con `categoria` mayoritariamente `estilo`/`dialogo`. Mapa de idiomas localizados (es/en/fr/de/it/pt/ca). (c) Nuevo método privado `runAutoBetaLoopOnTranslation(projectId, projectTitle)` en `reedit-orchestrator.ts` (~L5294, ~140 LOC). Lógica idéntica al patrón Fix47: lee capítulos → `betaAgent.runReview({translationMode, targetLanguage: detectedLanguage})` → `parseHolisticBetaForReedit` → si `total === 0 || (altas === 0 && total <= 3)` STOP "aprobado" → si no, persiste pending y llama `applyHolisticBetaInstructions(projectId, autoApplicableIds)` → repite. En la última iteración o si parser falla, persiste el último parseo en `pendingEditorialParse` para revisión manual. Best-effort: cualquier error se loguea vía `logReeditEvent` sin tirar excepción al caller. (d) Hook en Stage 8 justo después del bloque de parseo (`runStage8PostReeditReviews` ~L5274), corre solo si el flag está activo. (e) UI: nuevo `Switch` "Pulido Beta automático (traducciones)" + `Input` numérico de iteraciones (1-10) en el formulario de upload de `reedit.tsx` (testids `switch-auto-beta-translation`, `input-auto-beta-translation-iter`). Subtexto explicativo: "Solo si este manuscrito es una traducción. Relee y pule fluidez en idioma destino." (f) Endpoint `POST /api/reedit-projects` lee los dos campos del FormData con normalización (`"true"`/`true` → boolean, parseInt clamp 1-10). (g) `startup-schema-check.ts` actualizado con las dos columnas nuevas. Acción para el VPS tras pull: `psql "$DATABASE_URL" -c "ALTER TABLE reedit_projects ADD COLUMN IF NOT EXISTS auto_beta_loop_on_translations BOOLEAN DEFAULT false; ALTER TABLE reedit_projects ADD COLUMN IF NOT EXISTS auto_beta_loop_on_translations_max_iterations INTEGER DEFAULT 2;"` (alternativa SQL para evitar el prompt de drizzle-kit).

- **[Fix51] Exportador EPUB con Editoriales (publishers) y back-matter KDP-compliant (v7.8)**: Nuevo formato de salida disponible además de DOCX y Markdown. Implementación: (a) Nueva tabla `publishers` (id, name, logoDataUrl base64, websiteUrl, copyrightLine, createdAt) + CRUD completo en `server/storage.ts` y `/api/publishers` (GET/POST/PATCH/DELETE) en `routes.ts` ~L3937. (b) Nuevo servicio `server/services/epub-exporter.ts` (~470 LOC) usando `jszip`: emite EPUB 3.0 válido con `mimetype` STORED, `META-INF/container.xml`, `OEBPS/{content.opf, toc.ncx, nav.xhtml, css/styles.css, xhtml/*}`. Estructura de páginas: portada (con logo del publisher si existe), copyright (línea customizable + bloque legal estándar), capítulos (con `<span class="drop-cap">` en la primera letra del primer párrafo), back-matter de petición de reseña KDP-compliant (sin "5 estrellas", sin incentivos, solo "una reseña honesta en Amazon"), y página "Sobre el autor" si hay bio/web/also-by. Localizado a 7 idiomas (es/en/fr/de/it/pt/ca). Dos funciones expuestas: `generateManuscriptEpub({project, chapters, pseudonym, publisher, ...})` para proyectos PRINCIPALES y `generateGenericManuscriptEpub({title, authorName, language, chapters, publisher, ...})` para REEDICIONES y TRADUCCIONES (que viajan por el mismo pipeline reedit y reusan `detectedLanguage` para etiquetas localizadas). (c) Tres endpoints: `GET /api/projects/:id/export-epub?publisherId=X` (proyecto principal completado, ~L682) y `GET /api/reedit-projects/:id/export-epub?publisherId=X` (reedits y traducciones, ~L9572). El parámetro `publisherId` es opcional; si se omite el EPUB se genera sin bloque editorial. (d) UI: nueva página `/publishers` (`client/src/pages/publishers.tsx`) con grid de cards + dialog Crear/Editar (subida de logo en base64 client-side, máx 1 MB), registrada en sidebar bajo "Editoriales" (icono `Building2`). En `dashboard.tsx` el botón único "Exportar Word" se reemplazó por un `DropdownMenu` con dos opciones (Word/EPUB); EPUB abre un Dialog con `Select` de editorial. Análogo en `client/src/pages/reedit.tsx` (botón "Exportar EPUB" + dialog con select). (e) `startup-schema-check.ts` actualizado con la tabla `publishers` y la columna `holistic_gate_verdict` (Fix49). Acción para el VPS tras pull: `set -a; source /etc/litagents/env; set +a; npx drizzle-kit push --force` y aceptar "create table" cuando pregunte por publishers (NO seleccionar el rename desde user_sessions). Si la TUI da problemas en SSH, alternativa SQL directa: `psql "$DATABASE_URL" -c "CREATE TABLE publishers (id SERIAL PRIMARY KEY, name TEXT NOT NULL, logo_data_url TEXT, website_url TEXT, copyright_line TEXT, created_at TIMESTAMP DEFAULT NOW()); ALTER TABLE projects ADD COLUMN IF NOT EXISTS holistic_gate_verdict JSONB;"`.

- **[Fix50] Documentar omisión deliberada de previousChaptersFullText en semantic detector (v7.8)**: En `reedit-orchestrator.ts:568-577` se añadió comentario explicativo aclarando que `previousChaptersFullText` está deliberadamente ausente en la llamada al `semanticRepetitionDetector` porque ese agente ya recibe el manuscrito íntegro vía `fullManuscript` (parámetro distinto, contenido equivalente). El parámetro `void` previo que parecía un olvido era intencional. Cero cambios funcionales.

- **[Fix49] Veredicto de reparabilidad del Holístico (gate semántico antes del Final Reviewer) (v7.8)**: Antes el gate del Holístico (Fix29) inyectaba sus hallazgos al ciclo 0 del FR pero no clasificaba si los problemas eran reparables por la cirugía cap-a-cap o requerían intervención humana. Ahora el prompt del Holístico (`server/agents/holistic-reviewer.ts:99-121`) emite, además de `INSTRUCCIONES_AUTOAPLICABLES`, un segundo bloque JSON entre `<!-- VEREDICTO_GATE_INICIO -->` y `<!-- VEREDICTO_GATE_FIN -->` con `severidad_global` (`reparable | reparable_con_reservas | irreparable_automaticamente`) e `issues_irreparables[]`. El parser `parseHolisticGateVerdict()` (`orchestrator.ts:12952`) extrae el bloque, lo valida y persiste en `projects.holisticGateVerdict` (jsonb nuevo). Si la severidad es `irreparable_automaticamente` se loguea un activity log `level=warn` para que la UI pueda mostrar un banner pidiendo intervención manual; el FR sigue corriendo (puede pulir lo demás reparable) en lugar de bloquear el flujo. El prompt instruye al Holístico a ser CONSERVADOR: solo marcar irreparable si genuinamente la cirugía cap-a-cap no puede resolverlo (cambios de POV/voz/foco que requieren reescritura íntegra; arcos coordinados de 5+ caps).

- **[Fix48] WorldBibleExtractor con ventana 30k chars/cap (v7.8)**: `reedit-orchestrator.ts:782-796` aumentó el truncado del manuscrito por capítulo que se pasa al `manuscript-analyzer` de 12k a 30k chars y añade log con el número de capítulos truncados. Antes capítulos largos (>12k chars, ~2000 palabras) perdían el 33-50% de su contenido en el extractor inicial de la Biblia, lo que provocaba lagunas de personajes/lugares. Con DeepSeek V4-Flash y su contexto de 1M, 30k es seguro y cubre el 95% de capítulos sin truncar.

- **[Fix47] Auto-loop con Lector Beta en pipeline principal (v7.8)**: Antes el flag `autoHolisticReview` (Fix24/25) solo invocaba Holístico+Beta UNA vez tras el `completed`, parseaba y dejaba las instrucciones en `pendingEditorialParse` para que el usuario revisara y aplicara con un click. El usuario pidió un modo "más autónomo": que el Beta lea, aplique las correcciones automáticamente, vuelva a leer, y repita hasta que el Beta esté contento. Implementación: (a) Dos campos nuevos en `projects`: `autoBetaLoop: boolean default false` + `autoBetaLoopMaxIterations: integer default 3` (rango 1-10). (b) Nuevo método `runAutoBetaLoop(project)` en orchestrator (~L9868) que itera: `runBetaReview` → si `notesText` vacío STOP "aprobado" → `parseEditorialNotesOnly` → cuenta instrucciones de prioridad `"alta"` y total. **Criterio de aprobación**: `total === 0 || (altas === 0 && total <= 3)`. Si aprobado STOP. Si no, marca `status="applying_editorial"` (Fix36 — el monitor de congelación usa timeout extendido), llama a `applyEditorialNotes(project, "", instructions)` con las instrucciones pre-parseadas, recarga el proyecto y repite. Al alcanzar el máximo de iteraciones con observaciones aún pendientes, persiste el último parseo en `pendingEditorialParse` con `source: "auto_beta_loop_max_iter"` para que el usuario decida manualmente. Si el parser falla en alguna iteración, `persistBetaNotesAsPending` guarda las notas crudas (`source: "auto_beta_loop_parser_failed"`) y aborta. (c) Hook en L9852, justo después del check de `autoHolisticReview` — si ambos flags activos ambos corren (el Beta-loop ejecuta el ciclo completo). (d) UI: nuevo `FormField` en `client/src/components/config-panel.tsx` con `Checkbox` (`data-testid="checkbox-auto-beta-loop"`) + slider condicional (1-10, default 3) que solo aparece cuando el checkbox está marcado. Icono `Repeat` de lucide. (e) `server/startup-schema-check.ts` (Fix46) actualizado con las dos columnas nuevas para que el VPS falle fast si no se aplica la migración. Acción para el VPS tras pull: `sudo bash -c 'set -a; source /etc/litagents/env; set +a; npx drizzle-kit push --force'` + `sudo systemctl restart litagents`.

- **[Fix46] Fail-fast si la BD del VPS queda desincronizada del schema (v7.8)**: Tras Fix45 surgió un caso real: el push del paso 3 de `update.sh` falló silenciosamente (sudo no propagaba `DATABASE_URL`) y el build del paso 5 con `SKIP_DB_PUSH=1` se saltó la red de seguridad. El servicio quedó "active running" pero todas las rutas que tocaban BD devolvían 500 (`column "pending_admin_actions" does not exist` de Fix40). Tres protecciones añadidas: (a) Nuevo `server/startup-schema-check.ts` con `assertSchemaUpToDate()`: consulta `information_schema.tables`/`columns` por un set declarado de tablas/columnas críticas (Fix34/38/40/43) y, si falta alguna, escribe en stderr el listado exacto de qué falta + las instrucciones para correr el push manual con el env cargado, y hace `process.exit(1)`. systemd reintenta y falla en bucle, pero el log queda con el motivo claro en vez de devolver 500 enmascarado. (b) `server/index.ts` invoca el check como primera operación del bootstrap (antes de `setupAuth`/`registerRoutes`/`listen`). (c) `script/build.ts` ahora aborta con `process.exit(1)` si `SKIP_DB_PUSH≠1` y `DATABASE_URL` está ausente, y también si el `drizzle-kit push` devuelve error (antes lo tragaba como warning). Acción para el VPS: añadir `set -a; source /etc/litagents/env; set +a` antes del paso 3 de `update.sh` para que `drizzle-kit push` siempre tenga credenciales reales.

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