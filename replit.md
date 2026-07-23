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

- **[Fix252] Verificador de datos del capítulo (fase 3 de las 4 features pedidas)**: petición del usuario ("comprobador de datos históricos, geográficos, etc."). **Backend** (`server/routes.ts`): `POST /api/projects/:id/chapters/:chapterId/fact-check` — extrae la prosa pre-`---CONTINUITY_STATE---` (techo 60k chars), prompt de fact-checker en español: verifica fechas/cronología histórica, geografía, nombres y títulos reales, cifras/hechos físicos y cultura material; NO señala los elementos ficticios de la novela ni licencias narrativas; veredictos `incorrecto`/`dudoso`/`correcto` (máx. 20 hallazgos, incorrectos primero). DeepSeek v4-flash thinking disabled temp 0.2, `repairJson` con fallback regex, `recordRawAiUsage` agente "fact-checker", 502 si la IA no devuelve JSON válido. **Frontend** (`chapter-viewer.tsx`): botón "Verificar datos" (ShieldCheck) en la cabecera del visor; el resultado se cachea ligado al `chapter.id` (reabrir el diálogo no re-paga la llamada; "Volver a verificar" fuerza una nueva); diálogo con resumen + tarjetas coloreadas por veredicto (rojo/ámbar/verde) con categoría, explicación y sugerencia de corrección. Probado en vivo: 404 cap ajeno y verificación real del Epílogo del proyecto de prueba con hallazgos geográficos coherentes (Danakil, Mekele, Al Hudayda). Footer `v10.0.85`→`v10.0.86`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix251] Los iconos de título de capítulo se mudan al encabezado del visor**: petición del usuario ("no deben estar en la tarjeta sino en el encabezado del capítulo al lado del título original"). `chapter-list.tsx` vuelve a su versión pre-Fix249 (tarjetas limpias, solo queda la varita de rediseño; se elimina `RowWrapper`). `chapter-viewer.tsx`: lápiz (edición inline con Enter/Esc) + Sparkles (diálogo de sugerencias IA con "Otras sugerencias") junto al título del capítulo en la cabecera; estado ligado al id del capítulo para no arrastrar borradores al cambiar de capítulo; Sparkles deshabilitado si el cap no tiene contenido. Los endpoints de Fix249 no cambian. Footer `v10.0.84`→`v10.0.85`. Sin migración. tsc PASS + smoke PASS.

- **[Fix250] El texto del capítulo ya se puede editar a mano (fase 2, parte 1)**: queja del usuario ("no puedo editar el texto del capítulo") — el visor era solo lectura. **Backend** (`server/routes.ts`): `PATCH /api/projects/:id/chapters/:chapterId/content` — valida vacío y pertenencia al proyecto; 409 si el capítulo está `writing`/`editing` (no pisar a los agentes); preserva la cola técnica `---CONTINUITY_STATE---` del contenido guardado si el texto nuevo no la trae; recalcula `wordCount` solo sobre la prosa. **Frontend** (`chapter-viewer.tsx`): botón "Editar texto" en la cabecera del visor (oculto si el cap se está generando o no tiene contenido); `Textarea` con la prosa RAW pre-marker (`getEditableProse`, SIN las transformaciones lossy de `cleanContentForDisplay`: lo que se edita es el texto real guardado); Guardar/Cancelar con confirm si hay cambios sin guardar; contador de palabras en vivo; el estado de edición va ligado al id del capítulo para que cambiar de capítulo no arrastre el borrador. Probado en vivo: 400 vacío, edición real aplicada y restaurada, wordCount recalculado. Pendiente de la fase 2: regeneración de pasajes con IA. Footer `v10.0.83`→`v10.0.84`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix249] Títulos editables + sugerencias IA (fase 1 de las 4 features pedidas)**: petición del usuario. **Backend** (`server/routes.ts`): `PATCH /api/projects/:id/chapters/:chapterId/title` (valida vacío/200 chars y pertenencia al proyecto) y `POST /api/projects/:id/title-suggestions` — sin `chapterId` en el body sugiere 6 títulos para la NOVELA (premisa + títulos de caps + inicio del cap 1); con `chapterId` (validado: inválido = 400, no cae al modo novela en silencio) sugiere 6 para ese capítulo desde su texto; DeepSeek v4-flash thinking disabled, `repairJson` con fallback regex, `recordRawAiUsage` agente "title-suggester", 502 si la IA no devuelve sugerencias válidas. **Frontend**: `chapter-list.tsx` — lápiz de edición inline por capítulo (Enter guarda, Esc cancela) + Sparkles con diálogo de sugerencias aplicables en un clic; `RowWrapper` renderiza la fila como `div` en modo edición para no anidar `<button>` dentro de `<button>` (HTML inválido). `manuscript.tsx` — Sparkles junto al lápiz del título del proyecto con diálogo equivalente (aplica vía `renameMutation` existente) y botón "Otras sugerencias". Probado en vivo: PATCH real aplicado y restaurado, validaciones 400, y el endpoint IA devolvió 6 títulos coherentes con la novela de prueba. Footer `v10.0.82`→`v10.0.83`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix247] El botón "Resolver N Issues" deja de ser una cinta de correr infinita**: queja del usuario ("Esto no se termina nunca") + log real (EL PERGAMINO DE LOS MÁRTIRES, 23/7 08:03-08:08): cada resolución re-evalúa el manuscrito y el Revisor Final SIEMPRE devuelve ~2 issues nuevos en cada relectura aunque la nota sea 9/10 — el contador nunca llega a cero y la UI empuja a seguir para siempre. **Arreglos**: (1) `orchestrator.ts` en `resolveDocumentedIssues` — contador `_resolvePasses` persistido dentro del propio JSON `finalReviewResult` (sin migración); con nota ≥9 y (2+ pasadas O issues que no bajan), se marca `_issuesConverged` y el activity log declara el manuscrito TERMINADO con los issues restantes como pulido OPCIONAL. Relanzar la Revisión Final completa resetea el contador (resultado fresco, deseado). (2) `dashboard.tsx` — con convergencia, nota "Manuscrito TERMINADO" y el botón ámbar pasa a outline "Pulir de todos modos (opcional)": la vía manual nunca se cierra. **[Fix247b] Honestidad editorial** (objeción del usuario: "no aprobó ni holístico ni beta, no es publicable"): al converger se leen `holisticScore`/`betaScore` frescos y se persisten `_readersMetTargets` (Hol≥7 Y Beta≥9) + `_readerScores` en el mismo JSON; "TERMINADO y listo para exportar" SOLO si los lectores están en meta; si no, aviso warning "publicable CON RESERVAS" con las notas y la vía para subirlas (relanzar pulido / chat editorial), y la UI muestra la variante ámbar equivalente. **[Fix248] Botón "Relanzar pulido Holístico+Beta"** (preocupación del usuario: "de lo contrario estoy exportando una novela muerta"): el endpoint `POST /api/projects/:id/resume-polish` ([Fix177], resetea el contador anti-estancamiento) existía SIN botón en la UI; ahora la variante ámbar de convergencia incluye el botón (mutation con manejo específico del 409 "pulido ya activo"), dando una vía real para subir las notas de los lectores — clave tras v10.0.78, que desbloqueó la nota estructural del Epílogo que mantenía al Holístico clavado en 6. **[Fix248b]** (pregunta del usuario "¿Dónde está el botón?"): la primera versión solo aparecía tras los flags de convergencia nuevos, que los proyectos existentes aún no tienen — ahora hay un bloque independiente en todo proyecto `completed` con lectores bajo meta (Hol<7 o Beta<9), oculto solo si la rama ámbar de convergencia ya muestra el mismo botón. Footer `v10.0.78`→`v10.0.82`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix246] El Epílogo con título propio deja de ser "el Capítulo -1" y sus reescrituras estructurales ya no se anulan por longitud**: log real (EL PERGAMINO DE LOS MÁRTIRES, 22/7, pulido en curso). **Dos bugs en `orchestrator.ts`**: (1) `buildSectionsListFromChapters` resolvía el tipo de sección por TÍTULO exacto ("Prólogo"/"Epílogo"); el epílogo se titulaba "El legado de la ceniza" → tipo "chapter" y todo el pipeline editorial lo llamaba "el Capítulo -1". Ahora el tipo se resuelve por `chapterNumber` (0=prólogo, -1=epílogo, -2=nota del autor), título como fallback. (2) La reescritura estructural del epílogo (eliminar el 80% de POVs, ordenada por el Traductor estructural) producía 2067 palabras vs suelo 2640 (original×0.85) y la guarda de `rewriteChapterForQA` la anulaba SIEMPRE ("Conservando original") — la nota jamás podía aplicarse, iteración tras iteración. Ahora, con `_structuralTranslateDepth > 0`, el suelo pasa al mínimo quirúrgico del proyecto (×0.90) sin el clamp del original; el fallback normal conserva la guarda anti-contracción intacta (Fix227). Footer `v10.0.77`→`v10.0.78`. Sin migración. tsc PASS + smoke PASS + architect PASS.


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

Preferred communication style: Simple, everyday language. Communicate ALWAYS in Spanish.

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
