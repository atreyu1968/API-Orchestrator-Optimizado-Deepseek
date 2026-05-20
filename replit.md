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

- **[Fix100] Ejecución real de acciones administrativas pendientes (merge_chapters / delete_chapter) desde la tarjeta de UI**: Queja del usuario: "he pedido que fusione dos capítulos y me dice [tarjeta con 'Fusionar capítulo 19 → afecta también a Cap. 20' + razón completa] pero no se hacerlo". Diagnóstico: la tarjeta `pendingAdminActions` en `client/src/pages/manuscript.tsx` (líneas 573-637 pre-Fix100) solo exponía un botón `Trash2` de descartar y un texto "hazlo manualmente desde la lista de capítulos". El backend tenía `GET` y `DELETE` de pending-admin-actions en `server/routes.ts` pero NINGÚN endpoint de ejecución. El comentario en `server/orchestrator.ts:8375` lo decía explícitamente: "Otros tipos (merge_chapters, split_chapter, etc.) no tienen ejecutor automático todavía". Solo `delete_chapter` se ejecutaba (y solo desde el flujo desatendido Fix76 tras aprobación Holístico+Beta, NO desde la tarjeta del usuario). **Implementación**: **(A)** Nuevo endpoint `POST /api/projects/:id/pending-admin-actions/:actionId/execute` en `server/routes.ts` (~línea 8576). Soporta `merge_chapters` y `delete_chapter`; el resto de tipos (`split_chapter`, `swap_chapters`, `reorder_chapters`, `move_content`, `structural_restructure`, `global_style`) devuelve 400 con motivo claro. Para `merge_chapters` el cap a eliminar es `secondaryChapter` (porque el flujo del structural-translator ya absorbió la prosa del origen en el destino vía `feasibleParts` ANTES de emitir esta acción — anexar otra vez duplicaría texto); para `delete_chapter` es `targetChapter`. Lógica: `deleteChapter(target.id)` + iterar capítulos posteriores en orden ascendente actualizando `chapterNumber - 1` (orden ascendente evita colisión transitoria en el índice). Luego re-lee el proyecto y filtra la acción del array `pendingAdminActions` (merge anti-TOCTOU para no pisar acciones nuevas añadidas en paralelo). Caso degenerado: si el cap ya no existe, limpia la tarjeta sin error y registra `level: "warning"`. Registra activity log con `[Fix100]` y resumen ("Fusión ejecutada: cap 19 absorbe a cap 20; cap 20 eliminado; N cap(s) renumerado(s) -1"). **(B)** Frontend en `client/src/pages/manuscript.tsx`: nuevo `executeAdminActionMutation` que llama POST execute e invalida 3 queries (`pending-admin-actions`, `chapters`, project). Helper `isExecutableAdminAction(type)` que devuelve true solo para los dos tipos soportados. Handler `handleExecuteAdminAction(action)` con `window.confirm` cuya redacción cambia según `merge_chapters` ("Esto eliminará el capítulo 20 — su contenido ya fue absorbido por el capítulo 19 en el paso de prosa — y renumerará los capítulos posteriores. ¿Continuar?") vs `delete_chapter` ("Esto eliminará el capítulo X y renumerará..."). Nuevo botón "Ejecutar" con icono `Check` (o `Loader2` spinning durante la mutación) visible SOLO si `isExecutableAdminAction(action.type)`, agrupado junto al botón Trash2 en un `<div className="flex items-center gap-1 shrink-0">`. Ambos botones se deshabilitan mutuamente durante operaciones en curso. **Test IDs**: `button-execute-admin-action-{id}` siguiendo el patrón existente de `button-dismiss-admin-action-{id}`. **Backwards-compat**: el endpoint DELETE existente sigue funcionando; las tarjetas de tipos no soportados (`split_chapter`, etc.) siguen mostrando solo el botón de descartar como antes. **Universal**: aplica a cualquier proyecto independientemente de género/idioma/longitud. Sin emojis.

- **[Fix99] Guard post-loop del Arquitecto + logs explícitos de rechazo por count en retries de auditores**: Queja del usuario: "Retry estructural devuelve menos capítulos — Intento 1: 35 caps. Intento 2 (retry): 35 caps. Intento 3 (post-bajada): 23 caps en lugar de 33 pedidos. El orquestador siguió adelante con 23 y la novela terminó con 35". Rango establecido por el usuario: 30-35 caps con preferencia 33. **Diagnóstico**: los 4 bloques de retry de auditores (originalidad líneas 1767-1855, integridad PI Fix18 líneas 1947-1991, estructural Fix92 líneas 2058-2115, beta-reader Fix9 líneas 2253-2312) ya invocaban `isAcceptableEscaletaCount(project, reviewedLen)` que en modo rango devuelve `escaletaLength >= min+extras && escaletaLength <= max+extras`. 23 < 30 → rechazado correctamente, conservaban el outline previo. La impresión del usuario de que "siguió con 23" venía de logs ambiguos ("outline inválido" sin explicar QUÉ fue inválido — count, personajes, matriz_arcos). **Bug real detectado**: el bucle PRINCIPAL de retries del Arquitecto (`MAX_ARCHITECT_RETRIES = 3` líneas 1313-1685) tiene un fallo en el ÚLTIMO intento: cuando `!hasEnoughChapters` o `!hasCharacters||!hasChapters` y `architectAttempt === MAX`, el código NO ejecuta `worldBibleData = null` ni `continue` (porque `architectAttempt < MAX_ARCHITECT_RETRIES` es false), por lo que `worldBibleData` (asignado en línea 1399 con el JSON parseado del último intento) **mantiene la escaleta mala**. El guard final a continuación solo verifica `escaleta_capitulos?.length` (no vacío) — 23 caps > 0 pasa el guard y el Narrador escribe sobre escaleta truncada. **Implementación**: **(A)** nuevo helper `formatAcceptableEscaletaRange(project)` en `server/orchestrator.ts` que produce etiqueta legible del rango aceptable: en modo rango devuelve `"[min+extras, max+extras] (rango min-max + extras extras)"`; en modo exacto devuelve `">= expected-2 (esperado expected)"`. **(B)** Nuevo **guard post-loop [Fix99]** insertado entre el `break` final del while y el guard de "escaleta vacía" (~línea 1697): si `worldBibleData` existe pero `!isAcceptableEscaletaCount(project, finalLen)`, intenta restaurar `bestWorldBibleData` (si su count está en rango) o anula `worldBibleData` para que el guard inmediato siguiente marque el proyecto FAILED. Loguea con `level: "warn"` cuando se restaura best, `level: "error"` cuando no hay best válido y se falla el proyecto, ambos con metadata `{fix: "Fix99", finalLen, rangeLabel}` para diagnóstico. **(C)** Mejorados los **4 logs de rechazo** en los bloques de auditores: cambiados de genérico "produjo un outline inválido (X/Y)" a explícito "RECHAZADA: X caps fuera del rango aceptable [min+extras, max+extras] (rango min-max + extras extras) (o sin personajes)". El bloque beta-reader además distingue tres motivos: count fuera de rango, count en rango pero falta matriz_arcos/estructura_tres_actos, o sin personajes. **Backwards-compat**: el helper es aditivo; la lógica de validación (`isAcceptableEscaletaCount`) no cambia — Fix90 sigue intacto. **Universal**: aplica a modo exacto y modo rango (Fix90). Sin emojis (✅/⚠️/❌ ya existían como convención de orchestrator logs).

- **[Fix98] Anti-prosa-plana: detección inteligente de frases hechas con reescritura contextual + anti-negación como motor de acción**: Queja literal de un beta lector profesional (6.5/10) sobre el manuscrito real: "la prosa es funcional pero plana, plagada de frases hechas ('figura de cera', 'el silencio creció') y de negaciones que ralentizan el ritmo en escenas de acción". Diagnóstico: las blacklists existentes del Ghostwriter (A clichés tradicionales, A2 clichés de IA, A3 muletillas fisiológicas, B regla de una vez, B2 epítetos repetidos, E reiteración atmosférica) cubren torrentes-de-emociones, corazones-desbocados y "crucial/enigmático" pero NO la familia de frases hechas de estatismo/silencio/tiempo suspendido ni la regla operativa anti-negación que mata el ritmo en escenas físicas. Iteración del usuario tras primer borrador: "hay que mejorar la black list de frases hechas, el editor debe detectar de forma inteligente y dar alternativas" — pivote de **lista cerrada** a **marco de detección semántica con generación contextual de alternativas**. Implementación: **(A) Ghostwriter** (`server/agents/ghostwriter.ts`): nueva sección **A4 — FRASES HECHAS DE ESTATISMO / SILENCIO / TIEMPO SUSPENDIDO** estructurada como **AUTOCHEQUEO de 4 criterios** ((a) primeras 3 palabras predicen las siguientes 3 = frase hecha; (b) personificación automática de lo abstracto = fórmula prefabricada; (c) comparación genérica que no añade información; (d) ausencia de ángulo/color/peso/sonido/temperatura/número contable = etiqueta abstracta) seguido de 6 **FAMILIAS SEMILLA** (estatismo metafórico, silencio personificado, tiempo suspendido, atmósfera cortable, rostro inexpresivo, frío fisiológico metafórico) con la nota explícita "ejemplos típicos, no lista cerrada — la regla cubre cualquier variante de estas familias". Cierra con **REESCRITURA OPERATIVA por función** (no por palabra): inmovilidad → micro-acción mantenida + primer gesto que la rompe; silencio → sonido residual específico del espacio; tiempo lento → acción contable; inexpresividad → gesto micro concreto; shock corporal → acción involuntaria; tensión atmosférica → detalle físico que traiciona tensión. Insiste en que la alternativa debe ser ESPECÍFICA al pasaje (mobiliario, objetos, sonidos ya presentes en la escena), no genérica. Nueva sección **F — ANTI-NEGACIÓN COMO MOTOR DE ACCIÓN**: en escenas de acción/persecución/pelea/emergencia/confrontación física, PROHIBIDO construir el motor narrativo con verbos negados ("no pudo/no podía/no consiguió/no logró/no alcanzó/no acertó/no se movió/no se atrevió/no era capaz/sin poder/sin lograr"). Razón pedagógica explícita: las negaciones ralentizan procesamiento y dejan la imagen mental en blanco. 6 ejemplos de reescritura afirmativa concreta. Regla operativa: >20% de verbos negados en un párrafo de acción física = prosa plana. Exclusión explícita: en diálogo, reflexión y pensamiento fragmentado la negación SÍ es válida. **(B) Copyeditor** (`server/agents/copyeditor.ts`): nueva sección **4.b — DETECCIÓN INTELIGENTE Y REESCRITURA DE FRASES HECHAS** reescrita por completo según pedido del usuario. Apertura literal: "Tu trabajo aquí NO es aplicar una lista de tachadura. Es ACTUAR COMO UN BETA LECTOR PROFESIONAL". Estructura: (1) 5 **CRITERIOS DE DETECCIÓN** semánticos (combinación consagrada, cero novedad sensorial, personificación automática de lo abstracto, comparación por defecto, reacción corporal de catálogo); (2) 6 **FAMILIAS PROTOTÍPICAS** como ejemplos seminales explícitamente abiertas a variantes y fórmulas análogas; (3) **HEURÍSTICA DE 6 PASOS DE GENERACIÓN INTELIGENTE DE ALTERNATIVAS** (localizar función → elegir herramienta de mostración apropiada → especificidad al pasaje → respeto al ritmo → respeto al POV → respeto al género); (4) **REGLA DE PRUDENCIA** para no tocar voces irónicas declaradas en la guía de estilo (la frase hecha como guiño consciente UNA vez ≠ muletilla recurrente); (5) **REPORTE OBLIGATORIO** con formato exacto "ORIGINAL → SUSTITUTA — razón breve (familia + criterio aplicado)" en el array `frases_hechas_eliminadas` para que el lector del informe vea siempre la alternativa propuesta, no solo el problema. Nueva sección **4.c — ANTI-NEGACIÓN COMO MOTOR DE ACCIÓN** mirror de F del Ghostwriter. La interfaz `CopyEditorResult` añade dos campos opcionales `frases_hechas_eliminadas?: string[]` y `negaciones_accion_reescritas?: string[]`. **Backwards-compat**: los campos son opcionales; runs antiguos no rompen el parser. Toda la regulación es prompt-side (no nuevos auditores regex), siguiendo el patrón de las blacklists existentes A/A2/A3/B/B2/E. **Universal por género**: los criterios son semánticos (no temáticos), aplicables a thriller, romance, fantasía, drama, literaria. Sin emojis.


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