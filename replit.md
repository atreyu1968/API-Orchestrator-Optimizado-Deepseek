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
- **[Fix270b] Móvil: botones de edición en "Proyectos Existentes"**: en Configuración, cada fila de proyecto apilaba título+badges y botones en una línea y en móvil los botones (convertir en serie/editar/ver/borrar) quedaban cortados. **`client/src/pages/config.tsx`**: fila `flex-col sm:flex-row` (botones debajo, alineados a la derecha) y filtro de autor a ancho completo en móvil. Footer `v10.1.5`→`v10.1.6`.
- **[Fix270] Vista móvil: controles visibles**: petición del usuario. Header (`client/src/App.tsx`): el selector de proyecto ya no empuja el toggle de tema/logout fuera de pantalla (selector `w-full max-w-[360px] min-w-0`, popover acotado a `100vw-1rem`, gaps/padding compactos en `sm`). Páginas: padding raíz `p-6`→`p-3 sm:p-6` en dashboard, config, costs, pseudonyms, queue, series, thought-logs, world-bible, import, export, guides, audiobooks, kdp-metadata, book-catalog, reedit-series, publishers, name-blacklist, manuscript. Dashboard: `flex-wrap` en cabecera de Progreso del Manuscrito y en Coste de Generación. Footer `v10.1.4`→`v10.1.5`. Sin migración. tsc PASS + smoke PASS.
- **[Fix269] Techo combinado thinking en 16 agentes más**: barrido tras el Fix268 — todos los agentes con `useThinking: true` y `maxOutputTokens` < 16384 subidos a 16384 para evitar el mismo fallo silencioso de JSON vacío/truncado con entradas grandes. Afectados: originality-critic, plot-integrity-auditor, tension-curve-auditor, agency-critic, surgical-patcher, structural-instruction-translator, world-bible-arbiter, series-world-bible-consolidator, editorial-notes-parser, chapter-expander (config de análisis), concept-forge, kdp-metadata-generator y kdp/* (manuscript-analyzer, landing-content, marketing-kit, market-metadata). Footer `v10.1.3`→`v10.1.4`. Sin migración. tsc PASS + smoke PASS.
- **[Fix268] El Lector Beta de Escaletas nunca respondía**: en los logs siempre aparecía "[Fix245] no devolvió un resultado válido". Causa: `maxOutputTokens: 8192` con thinking activado — el techo de DeepSeek es COMBINADO (razonamiento+contenido), y con escaletas de 30+ caps el razonamiento agotaba el presupuesto dejando el JSON vacío. **`server/agents/outline-beta-reader.ts`**: `maxOutputTokens` 8192→24576 (patrón ya aplicado a otros jueces en Fix del techo combinado). Footer `v10.1.2`→`v10.1.3`. Sin migración. tsc PASS + smoke PASS.

- **[Fix267] Fugas estructurales cerradas en tres capas: Cirujano de Escaletas, residuos vinculantes al Narrador y escalada del brazo estructural**: aprobado por el usuario tras el análisis del log (SA nunca aprobó 5.9–7.3 con residuos arco_secreto/falso_aliado; retries del Arquitecto oscilan 1/10↔1.8/10; brazo Fix135-B corrió 3× sobre caps 18–25 con cirugías cosméticas del 2.8–6.8%). (1) **`server/agents/escaleta-surgeon.ts`** (nuevo): `EscaletaSurgeonAgent.repair` (thinking 8192, techo 32768) repara SOLO los capítulos citados por los residuos del SA devolviendo caps completos (filtrados contra allowed-set); **`server/orchestrator.ts`**: `runEscaletaResidualSurgery` en la puerta advisory Fix151 — máx 2 rondas, máx 10 caps, empalme por número, re-audit determinista (gratis), acepta solo si el score sube sin aumentar altas; si limpia ⇒ log de éxito y sin advisory. (2) Lo que siga sucio se persiste como worldRule `__structural_residuals` (máx 12; pase limpio ⇒ limpia) vía `persistStructuralResiduals`, se inyecta como `_residuos_estructurales` en `getEnrichedWorldBible` (ambos caminos) y **`server/agents/ghostwriter.ts`** lo rinde como sección VINCULANTE: si el cap actual está citado, el Narrador DEBE resolver el residuo en escena. (3) Escalada del pulido: `runStructuralSecondHalfRescue` guarda historial en worldRule `__structural_rescue_history` (últimas 6 pasadas); si ≥2 pasadas previas solapan targets ⇒ modo ESCALADO: instrucción declarada estructural/no-quirúrgica (cae al fallback de reescritura completa con Narrador) que autoriza cambiar eventos de la escena respetando canon; la MESETA ACEPTADA de Fix266 NO se acepta si la escalada aún está pendiente (concede una ronda más). Footer `v10.1.1`→`v10.1.2`. Sin migración. tsc PASS + smoke PASS.

- **[Fix266] Sostenibilidad: memoria de meseta en pulido, gestión masiva de fact-check y corte por estancamiento del SA**: aprobado por el usuario tras el análisis del log de 3 días (5 rondas de pulido en meseta Beta=8/Hol=6-7, 186 fichas fact-check bloqueando 2 días, bucle SA quemando 8 iters con empates). (1) **`server/orchestrator.ts`** (`runAutoHolisticReviewLoop`): historial de rondas persistido como worldRule `__polish_history` (últimas 10: beta/holístico/iters/improved); si esta ronda no SUPERA el mejor combinado histórico en 2 iteraciones ⇒ cierre advisory por "meseta persistente entre rondas"; si ya hubo ≥2 rondas sin mejorar y el mejor histórico está a ≤1 punto de ambas metas ⇒ MESETA ACEPTADA: no se relanza la ronda completa (log success). Registro de ronda en cierre advisory y en salida por convergencia aceptable (flag one-shot). (2) **`server/services/novel-fact-check.ts`** + **`server/routes.ts`** + **`manuscript.tsx`**: GET `fact-check-pending` (count/corregibles/dudosas/applying) y POST `.../bulk` (`apply_corregibles` en background vía self-fetch al endpoint apply Fix255 en lotes ≤20 agrupados por capítulo, check+set síncrono anti-doble-run; `discard_dudosas`/`discard_todas` ⇒ resolve+recompute); card ámbar con los 3 botones (patrón Fix265). (3) **`server/orchestrator.ts`** (bucle SA): nuevo `consecutiveNoImproveSA` — 3 iters seguidas sin superar el best (EMPATES incluidos, que Fix109d no contaba) ⇒ early-stop con log propio y mejor escaleta restaurada. Footer `v10.1.0`→`v10.1.1`. Sin migración. tsc PASS + smoke PASS.

- **[Fix265] Auditor de Cierre de Tramas conectado a GENERACIÓN con reparación automática**: queja del usuario ("siguen quedando tramas secundarias abandonadas"). Diagnóstico: el `PlotThreadClosureAuditor` (Fix32) solo corría en reedición; en generación los validadores finales (ArcCheck) solo LOGUEAN cuando la novela ya está completed — nadie repara. **`server/orchestrator.ts`** (`runPlotThreadClosureRescue`, anclado tras la pasada Fix259 y antes del gate Holístico): auditar la novela completa (lectura saneada sin CONTINUITY_STATE; volumen-intermedio detectado uniendo projects+reedits, precuela = intermedio) → hilos "abierta_colgante" + "cierre_parcial" de principal/secundaria (máx 5, priorizados por tipo) → reescritura del capítulo objetivo (el que cite el `fix_sugerido`, si no la última aparición) vía `rewriteChapterForQA` con expansión de escena (Fix227), hilos agrupados por capítulo con instrucción de cierre EN ESCENA sin deus ex machina → re-auditoría ÚNICA solo si hubo cambios reales (conteo Fix230). Lo que siga colgando (+overflow) se persiste como worldRule `__plot_threads_pending`. **`server/services/completion-status.ts`**: nueva fuente 4 en `collectKnownPendingIssues` + helpers `persistPlotThreadsPending` (vacío ⇒ limpia), `resolvePlotThreadsPending` y `getPlotThreadsPending` — regla dura Fix263: la novela queda "completada con issues" hasta cerrarlas. Vía de salida MANUAL (lección terminal-status-manual-resume): **`server/routes.ts`** GET/POST `plot-threads-pending[/resolve]` + card ámbar en **`manuscript.tsx`** con botón "Marcar resuelta" por trama; el one-shot de sesión permite rerun si la rule sigue activa (re-audita y limpia tras correcciones manuales). Best-effort (fallo ⇒ pipeline sigue). Footer `v10.0.98`→`v10.1.0`. Sin migración. tsc PASS + smoke PASS.

- **[Fix264] Cinco agentes mejor exprimidos (auditoría de aprovechamiento)**: petición del usuario ("todos"). (1) **`server/agents/editor.ts`**: techo de salida 8192→16384 (el techo es COMBINADO razonamiento+JSON; con capítulos largos el thinking se lo comía y el JSON llegaba truncado — patrón DeepSeek ya conocido). (2) **`server/agents/continuity-sentinel.ts`**: thinking activado (4096) + techo 4096→16384 (juez de derivas temporales/contradicciones sutiles sin razonamiento). (3) **`server/agents/semantic-repetition-detector.ts`** y **`server/agents/voice-rhythm-auditor.ts`**: thinking activado (4096) + techo 4096→16384 (distinguir eco deliberado de repetición accidental, y juzgar deriva de voz, requieren razonamiento). (4) **`server/agents/beta-reader.ts`**: perfil de lector ESPECIALIZADO en el género objetivo (bloque dinámico con `generoObjetivo`): compara con lo mejor del género, exige los momentos obligados, señala clichés quemados; nota de especialista, no de lector casual. (5) **`server/agents/copyeditor.ts`** + **`server/orchestrator.ts`**: el Estilista recibe `muletillasGlobales` — muletillas detectadas deterministicamente (reusa `detectCrossChapterCatchphrases` de Fix239) en los capítulos YA COMPLETADOS (helper `computeGenerationMuletillas`, best-effort, min 3 caps) en los 2 caminos de pulido; si una frase gastada reaparece en el capítulo, la varía. Footer `v10.0.97`→`v10.0.98`. Sin migración. tsc PASS + smoke PASS.

- **[Fix263] Estado "completada con issues": una novela nunca queda "completed" limpio con issues pendientes**: REGLA DURA del usuario (guardada en User preferences). **`server/services/completion-status.ts`** (nuevo): `collectKnownPendingIssues` (issues no resueltos del Revisor Final + instrucciones editoriales pendientes `pendingEditorialParse` + fichas del verificador de datos persistidas como worldRule `__fact_check_pending`) y `recomputeCompletionStatus(projectId,{forceFinalize})` → `"completed"` solo si está limpio, si no `"completed_with_issues"` (con activity log explicando qué queda y cómo resolverlo; al resolver el último issue promociona a "completed" con log de éxito). **`server/orchestrator.ts`**: los 22 sitios que marcaban `status:"completed"` ahora pasan por el recompute (forceFinalize); recompute también tras persistir resultados de auto-review y en salidas del beta-loop; los gates de "volúmenes previos completados" de la Biblia de Serie aceptan ambos estados. **`server/services/novel-fact-check.ts`**: al terminar la pasada persiste las fichas pendientes (`persistFactCheckPending`) y expone `resolveFactCheckPending` para retirarlas al corregirlas. **`server/routes.ts`**: el apply de fact-check retira las fichas corregidas y recomputa; consumir instrucciones editoriales recomputa; ~14 gates `status === / !== "completed"` migrados a `isProjectCompletedStatus` (nuevo helper en `shared/schema.ts`) para que exportar/traducir/audiolibro/KDP funcionen igual con issues pendientes. **Cliente**: dashboard/manuscript/kdp/pseudonyms/costs/series aceptan el nuevo estado para gating y muestran etiqueta ámbar "Completada con issues". Sin migración (status es text). Footer `v10.0.96`→`v10.0.97`. tsc PASS + smoke PASS.

- **[Fix262] Reescritura por TRAMOS en el brazo estructural de segunda mitad**: petición del usuario (mejoras de ritmo/tensión, 3ª de 3). **`server/orchestrator.ts`** (`runStructuralSecondHalfRescue`): los capítulos objetivo se agrupan en tramos de hasta 3 caps CONSECUTIVOS; antes cada cap recibía una instrucción idéntica y aislada (picos sueltos en vez de escalada). Ahora cada cap conoce su papel en el tramo (abre siembra / continúa escalada / cierra pagando con coste irreversible) y la regla de tensión estrictamente creciente; el cap se relee FRESCO de BD antes de reescribir (dentro del tramo el anterior acaba de cambiar) y `rewriteChapterForQA` ya releía vecinos frescos, así que el N+1 continúa la versión NUEVA del N. Revert por capítulo (snapshot del bucle + conteo Fix230) intacto; activity log por tramo. Footer `v10.0.95`→`v10.0.96`. Sin migración. tsc PASS + smoke PASS.

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

**Regla dura de finalización**: una novela NUNCA puede quedar en estado "completed"/finalizada si hay issues conocidos sin resolver (hallazgos de jueces, fact-check pendiente, dimensiones críticas suspensas, etc.). Los gates best-effort pueden dejar pasar la generación, pero el estado final debe reflejar que quedan issues pendientes.

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
