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

- **[Fix263] Estado "completada con issues": una novela nunca queda "completed" limpio con issues pendientes**: REGLA DURA del usuario (guardada en User preferences). **`server/services/completion-status.ts`** (nuevo): `collectKnownPendingIssues` (issues no resueltos del Revisor Final + instrucciones editoriales pendientes `pendingEditorialParse` + fichas del verificador de datos persistidas como worldRule `__fact_check_pending`) y `recomputeCompletionStatus(projectId,{forceFinalize})` → `"completed"` solo si está limpio, si no `"completed_with_issues"` (con activity log explicando qué queda y cómo resolverlo; al resolver el último issue promociona a "completed" con log de éxito). **`server/orchestrator.ts`**: los 22 sitios que marcaban `status:"completed"` ahora pasan por el recompute (forceFinalize); recompute también tras persistir resultados de auto-review y en salidas del beta-loop; los gates de "volúmenes previos completados" de la Biblia de Serie aceptan ambos estados. **`server/services/novel-fact-check.ts`**: al terminar la pasada persiste las fichas pendientes (`persistFactCheckPending`) y expone `resolveFactCheckPending` para retirarlas al corregirlas. **`server/routes.ts`**: el apply de fact-check retira las fichas corregidas y recomputa; consumir instrucciones editoriales recomputa; ~14 gates `status === / !== "completed"` migrados a `isProjectCompletedStatus` (nuevo helper en `shared/schema.ts`) para que exportar/traducir/audiolibro/KDP funcionen igual con issues pendientes. **Cliente**: dashboard/manuscript/kdp/pseudonyms/costs/series aceptan el nuevo estado para gating y muestran etiqueta ámbar "Completada con issues". Sin migración (status es text). Footer `v10.0.96`→`v10.0.97`. tsc PASS + smoke PASS.

- **[Fix262] Reescritura por TRAMOS en el brazo estructural de segunda mitad**: petición del usuario (mejoras de ritmo/tensión, 3ª de 3). **`server/orchestrator.ts`** (`runStructuralSecondHalfRescue`): los capítulos objetivo se agrupan en tramos de hasta 3 caps CONSECUTIVOS; antes cada cap recibía una instrucción idéntica y aislada (picos sueltos en vez de escalada). Ahora cada cap conoce su papel en el tramo (abre siembra / continúa escalada / cierra pagando con coste irreversible) y la regla de tensión estrictamente creciente; el cap se relee FRESCO de BD antes de reescribir (dentro del tramo el anterior acaba de cambiar) y `rewriteChapterForQA` ya releía vecinos frescos, así que el N+1 continúa la versión NUEVA del N. Revert por capítulo (snapshot del bucle + conteo Fix230) intacto; activity log por tramo. Footer `v10.0.95`→`v10.0.96`. Sin migración. tsc PASS + smoke PASS.

- **[Fix261] Auditor de la Curva de Tensión (nueva puerta pre-escritura)**: petición del usuario (2ª de 3). **`server/agents/tension-curve-auditor.ts`** (nuevo, patrón plot-integrity-auditor): juez semántico DeepSeek v4-flash (thinking 8192) que audita la forma GLOBAL de la curva de la escaleta con métricas deterministas pre-computadas (`computeTensionCurveMetrics`: run plano más largo, pico y su posición relativa, pendiente del acto 2, valles, caída máxima) + escaleta condensada; 7 familias: meseta_plana, acto2_sin_escalada, climax_sin_pico, pico_prematuro, sin_valles, zigzag_ilogico, arranque_sobretenso; respeta estructuras no convencionales declaradas y es prudente sin datos de tensión. **`server/orchestrator.ts`**: puerta tras la Puerta 1 (Agencia) y antes del bucle SA — MAX 3 iters, umbral 7/10, histórico anti-regresión, best-effort (fallo ⇒ sigue), reusa Fase 1 en retries (`reusePhase1Json`), empalme Fix235 si el retry llega truncado, restauración de mejor escaleta. **`server/agents/architect.ts`**: campo `tensionCurveFeedback` + bloque de prompt con regla dura: los cambios tocan CONTENIDO (beats/eventos/apuestas), PROHIBIDO maquillar solo `tension_objetivo`. Footer `v10.0.94`→`v10.0.95`. Sin migración. tsc PASS + smoke PASS.

- **[Fix260] Contrato de escenas con cambio de valor en la escaleta**: petición del usuario (mejoras de ritmo/tensión/emoción, 1ª de 3; lección craft-guard-layering: los defectos nacen en la escaleta). **`server/agents/architect.ts`**: campo `escenas` (2-4 por cap: proposito/valor con polaridad "+→−" o "−→+"/conflicto/cierre) en el schema de Fase 2, regla 9b (toda escena debe cambiar el valor emocional; prohibidas escenas neutras) y verificación final. **`server/agents/ghostwriter.ts`**: tipo en `GhostwriterInput` + sección "CONTRATO DE ESCENAS" vinculante tras los beats (cada escena debe entregar su cambio de valor; no fusionar escenas que anulen polaridades). **`server/orchestrator.ts`**: `escenas` en `SectionData` y en los 11 mapeos de chapterData (junto a `giro_emocional`). Footer `v10.0.93`→`v10.0.94`. Sin migración. tsc PASS + smoke PASS.

- **[Fix259] Verificación de datos de TODA la novela con corrección automática**: petición del usuario ("ejecutar el verificador en toda la novela una vez finalizada y que resuelva todos los issues"; y "mejoraría la novela antes del holístico y beta"). **`server/services/novel-fact-check.ts`** (nuevo): runner en memoria que recorre los capítulos en orden narrativo y por cada uno: verificar (endpoint Fix252/256 vía self-fetch) → aplicar SOLO los "incorrecto" con sugerencia (endpoint Fix255) → re-verificar, máx. 2 rondas de corrección por capítulo (lección de los bucles que persiguen jueces oscilantes); los "dudoso" y los sin sugerencia NUNCA se tocan (pueden ser retcons deliberados) — van al informe final para decisión humana ficha a ficha (Fix258). Estado consultable, cancelable, activity logs por capítulo; capítulo que falla (413/409) se anota y se continúa. **`server/orchestrator.ts`**: pasada automática ANTES del gate del Holístico (Fix29) para que Holístico y Revisor Final lean el texto ya corregido; best-effort (fallo ⇒ pipeline sigue), no se repite si ya se completó en la sesión. **`server/routes.ts`**: POST/GET/POST `fact-check-novel[/status|/cancel]` (409 si el proyecto está generándose o ya hay run). **`manuscript.tsx`**: botón "Verificar novela" con progreso en vivo y diálogo de informe (pendientes con veredicto/categoría/capítulo, relanzar, cancelar). Probado en vivo (proyecto 247, 32 caps): 3 caps revisados, 8 correcciones aplicadas en cap 2 con re-verificación, 8 pendientes en informe, cancelación limpia. Footer `v10.0.92`→`v10.0.93`. Sin migración. tsc PASS + smoke PASS.

- **[Fix258] Corrección individual por ficha en el verificador de datos**: petición del usuario ("permitir modificar una a una las fichas de datos dudosos mediante un botón independiente"). **`client/src/components/chapter-viewer.tsx`**: cada ficha `incorrecto`/`dudoso` con sugerencia gana su propio botón "Corregir esta ficha" (con `window.confirm` que muestra dato y corrección; el cambio se guarda directo); reutiliza el endpoint `fact-check/apply` de Fix255 enviando `findings: [f]` (el backend ya aceptaba lista arbitraria — sin cambios de servidor). Al corregir, se retira SOLO esa ficha de la caché del diálogo por IDENTIDAD (no por índice, evita retirar la equivocada si el resultado se reemplaza; las demás siguen disponibles sin re-verificar) y se invalida la query de capítulos; spinner por ficha (`applyingFindingIdx`) y TODOS los botones del diálogo (masivo, re-verificar y por-ficha) deshabilitados mientras hay cualquier corrección en curso (objeciones del architect aplicadas). El botón masivo "Corregir errores automáticamente" sigue igual. Footer `v10.0.91`→`v10.0.92`. Sin migración. tsc PASS + smoke PASS.




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
