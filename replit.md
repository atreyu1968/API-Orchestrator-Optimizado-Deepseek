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

- **[Fix249] Títulos editables + sugerencias IA (fase 1 de las 4 features pedidas)**: petición del usuario. **Backend** (`server/routes.ts`): `PATCH /api/projects/:id/chapters/:chapterId/title` (valida vacío/200 chars y pertenencia al proyecto) y `POST /api/projects/:id/title-suggestions` — sin `chapterId` en el body sugiere 6 títulos para la NOVELA (premisa + títulos de caps + inicio del cap 1); con `chapterId` (validado: inválido = 400, no cae al modo novela en silencio) sugiere 6 para ese capítulo desde su texto; DeepSeek v4-flash thinking disabled, `repairJson` con fallback regex, `recordRawAiUsage` agente "title-suggester", 502 si la IA no devuelve sugerencias válidas. **Frontend**: `chapter-list.tsx` — lápiz de edición inline por capítulo (Enter guarda, Esc cancela) + Sparkles con diálogo de sugerencias aplicables en un clic; `RowWrapper` renderiza la fila como `div` en modo edición para no anidar `<button>` dentro de `<button>` (HTML inválido). `manuscript.tsx` — Sparkles junto al lápiz del título del proyecto con diálogo equivalente (aplica vía `renameMutation` existente) y botón "Otras sugerencias". Probado en vivo: PATCH real aplicado y restaurado, validaciones 400, y el endpoint IA devolvió 6 títulos coherentes con la novela de prueba. Footer `v10.0.82`→`v10.0.83`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix247] El botón "Resolver N Issues" deja de ser una cinta de correr infinita**: queja del usuario ("Esto no se termina nunca") + log real (EL PERGAMINO DE LOS MÁRTIRES, 23/7 08:03-08:08): cada resolución re-evalúa el manuscrito y el Revisor Final SIEMPRE devuelve ~2 issues nuevos en cada relectura aunque la nota sea 9/10 — el contador nunca llega a cero y la UI empuja a seguir para siempre. **Arreglos**: (1) `orchestrator.ts` en `resolveDocumentedIssues` — contador `_resolvePasses` persistido dentro del propio JSON `finalReviewResult` (sin migración); con nota ≥9 y (2+ pasadas O issues que no bajan), se marca `_issuesConverged` y el activity log declara el manuscrito TERMINADO con los issues restantes como pulido OPCIONAL. Relanzar la Revisión Final completa resetea el contador (resultado fresco, deseado). (2) `dashboard.tsx` — con convergencia, nota "Manuscrito TERMINADO" y el botón ámbar pasa a outline "Pulir de todos modos (opcional)": la vía manual nunca se cierra. **[Fix247b] Honestidad editorial** (objeción del usuario: "no aprobó ni holístico ni beta, no es publicable"): al converger se leen `holisticScore`/`betaScore` frescos y se persisten `_readersMetTargets` (Hol≥7 Y Beta≥9) + `_readerScores` en el mismo JSON; "TERMINADO y listo para exportar" SOLO si los lectores están en meta; si no, aviso warning "publicable CON RESERVAS" con las notas y la vía para subirlas (relanzar pulido / chat editorial), y la UI muestra la variante ámbar equivalente. **[Fix248] Botón "Relanzar pulido Holístico+Beta"** (preocupación del usuario: "de lo contrario estoy exportando una novela muerta"): el endpoint `POST /api/projects/:id/resume-polish` ([Fix177], resetea el contador anti-estancamiento) existía SIN botón en la UI; ahora la variante ámbar de convergencia incluye el botón (mutation con manejo específico del 409 "pulido ya activo"), dando una vía real para subir las notas de los lectores — clave tras v10.0.78, que desbloqueó la nota estructural del Epílogo que mantenía al Holístico clavado en 6. **[Fix248b]** (pregunta del usuario "¿Dónde está el botón?"): la primera versión solo aparecía tras los flags de convergencia nuevos, que los proyectos existentes aún no tienen — ahora hay un bloque independiente en todo proyecto `completed` con lectores bajo meta (Hol<7 o Beta<9), oculto solo si la rama ámbar de convergencia ya muestra el mismo botón. Footer `v10.0.78`→`v10.0.82`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix246] El Epílogo con título propio deja de ser "el Capítulo -1" y sus reescrituras estructurales ya no se anulan por longitud**: log real (EL PERGAMINO DE LOS MÁRTIRES, 22/7, pulido en curso). **Dos bugs en `orchestrator.ts`**: (1) `buildSectionsListFromChapters` resolvía el tipo de sección por TÍTULO exacto ("Prólogo"/"Epílogo"); el epílogo se titulaba "El legado de la ceniza" → tipo "chapter" y todo el pipeline editorial lo llamaba "el Capítulo -1". Ahora el tipo se resuelve por `chapterNumber` (0=prólogo, -1=epílogo, -2=nota del autor), título como fallback. (2) La reescritura estructural del epílogo (eliminar el 80% de POVs, ordenada por el Traductor estructural) producía 2067 palabras vs suelo 2640 (original×0.85) y la guarda de `rewriteChapterForQA` la anulaba SIEMPRE ("Conservando original") — la nota jamás podía aplicarse, iteración tras iteración. Ahora, con `_structuralTranslateDepth > 0`, el suelo pasa al mínimo quirúrgico del proyecto (×0.90) sin el clamp del original; el fallback normal conserva la guarda anti-contracción intacta (Fix227). Footer `v10.0.77`→`v10.0.78`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix245] Los bucles de revisión de escaleta (Lector Beta y Auditor Estructural) ya no mueren en silencio sin reintentar**: log real (EL PERGAMINO DE LOS MÁRTIRES, 22/7) — el Lector Beta de Escaletas dio 7/10 (< umbral 8, iter 1/3, 1 problema mayor: Acto 3 alargado, arco de Azucena sin materializar) y en el MISMO segundo salió "Estructura narrativa completada": el bucle rompía si `instrucciones_revision` venía vacía, con solo un console.warn invisible en el Registro de Actividad. Mismo patrón que Fix240 causa B en el bucle WBA. **Arreglos en `orchestrator.ts`**: (1) bucle Beta — con score bajo sin instrucciones, se SINTETIZAN desde `beta.problemas` (mayores primero, máx 8, descripción+sugerencia) y se reintenta; solo se rompe si tampoco hay problemas accionables (con aviso visible). (2) Auditor Estructural, mismo agujero: `needsRetry` exigía instrucciones no vacías — ahora si pide revisión (score<7 / alta / dim crítica KO) con instrucciones vacías, sintetiza desde el resumen de problemas; si tampoco hay, aviso visible. (3) Todas las salidas antes silenciosas del bucle Beta escriben en el activity log: resultado inválido, retry fallido, excepción del retry, catch exterior. Footer `v10.0.76`→`v10.0.77`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix244] Una reanudación durante la Fase 2 silenciosa del Arquitecto ya no arrasa el trabajo en curso**: log real de producción (EL ARCHIVO DE LOS HOMBRES MUERTOS, 21/7) — la Fase 2 empezó a las 10:09:58 ("Timeout: 18 min", sin más logs hasta terminar) y a las 10:19:42 una reanudación encontró "sin World Bible ni capítulos" (se persisten al FINAL de Fase 2), el guard [Fix103] solo miraba actividad <120s, vio "muerto" y reinició desde cero tirando ~30 min de trabajo (World Bible auditada + escaleta en curso). **Arreglo**: `storage.getLastMeaningfulActivityLog` nuevo (devuelve createdAt+message; la versión Time-only delega en él, watchdogs intactos); el guard de `resumeNovel` detecta si el último log real anuncia una fase silenciosa del Arquitecto (`Fase 1/2` o `Fase 2/2` + `Timeout: N min`, N en 1..60) y amplía la ventana de frescura a N+4 min; si no, sigue 120s. Log del bloqueo incluye la ventana aplicada. Footer `v10.0.75`→`v10.0.76`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix243] Los lectores prefieren REESCRITURA SEVERA a borrar/fusionar capítulos**: idea del usuario — el bucle de pulido proponía demasiadas fusiones/borrados (destructivos, requieren confirmación y destruyen material único; caso real: la novela descartada por Fix237) cuando casi siempre una reescritura profunda del cap arregla el problema conservando su función. **Cambio de política en 3 prompts** (la infraestructura ya existía: tipo "estructural" → reescritura completa vía `rewriteChapterForQA`): (1) `holistic-reviewer.ts` — "estructural" declarado HERRAMIENTA PREFERENTE con guía de reescritura severa (qué conservar/sustituir/lograr); "eliminar" y "fusionar" pasan a ÚLTIMO RECURSO (solo redundancia genuina sin material único / caps tan delgados que ni reescritos se sostienen); el ejemplo del JSON ya no muestra un "eliminar" sino una reescritura severa; en la verificación de acciones admin pendientes, un **discard** por material único ahora pide añadir además una instrucción "estructural" de reescritura severa del cap problemático. (2) `beta-reader.ts` — mismas dos reglas (tipos + discard→reescritura). (3) `structural-instruction-translator.ts` — regla dura nueva: si el objetivo de fondo se logra con reescritura severa (feasiblePart), NO emitir delete/merge; destructivas solo si la nota lo pide explícitamente o hay redundancia genuina. Sin cambios de código ejecutable ni de esquema. Footer `v10.0.74`→`v10.0.75`. Sin migración. tsc PASS + smoke PASS + architect PASS.


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
