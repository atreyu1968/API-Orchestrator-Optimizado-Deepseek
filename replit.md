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

- **[Fix246] El Epílogo con título propio deja de ser "el Capítulo -1" y sus reescrituras estructurales ya no se anulan por longitud**: log real (EL PERGAMINO DE LOS MÁRTIRES, 22/7, pulido en curso). **Dos bugs en `orchestrator.ts`**: (1) `buildSectionsListFromChapters` resolvía el tipo de sección por TÍTULO exacto ("Prólogo"/"Epílogo"); el epílogo se titulaba "El legado de la ceniza" → tipo "chapter" y todo el pipeline editorial lo llamaba "el Capítulo -1". Ahora el tipo se resuelve por `chapterNumber` (0=prólogo, -1=epílogo, -2=nota del autor), título como fallback. (2) La reescritura estructural del epílogo (eliminar el 80% de POVs, ordenada por el Traductor estructural) producía 2067 palabras vs suelo 2640 (original×0.85) y la guarda de `rewriteChapterForQA` la anulaba SIEMPRE ("Conservando original") — la nota jamás podía aplicarse, iteración tras iteración. Ahora, con `_structuralTranslateDepth > 0`, el suelo pasa al mínimo quirúrgico del proyecto (×0.90) sin el clamp del original; el fallback normal conserva la guarda anti-contracción intacta (Fix227). Footer `v10.0.77`→`v10.0.78`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix245] Los bucles de revisión de escaleta (Lector Beta y Auditor Estructural) ya no mueren en silencio sin reintentar**: log real (EL PERGAMINO DE LOS MÁRTIRES, 22/7) — el Lector Beta de Escaletas dio 7/10 (< umbral 8, iter 1/3, 1 problema mayor: Acto 3 alargado, arco de Azucena sin materializar) y en el MISMO segundo salió "Estructura narrativa completada": el bucle rompía si `instrucciones_revision` venía vacía, con solo un console.warn invisible en el Registro de Actividad. Mismo patrón que Fix240 causa B en el bucle WBA. **Arreglos en `orchestrator.ts`**: (1) bucle Beta — con score bajo sin instrucciones, se SINTETIZAN desde `beta.problemas` (mayores primero, máx 8, descripción+sugerencia) y se reintenta; solo se rompe si tampoco hay problemas accionables (con aviso visible). (2) Auditor Estructural, mismo agujero: `needsRetry` exigía instrucciones no vacías — ahora si pide revisión (score<7 / alta / dim crítica KO) con instrucciones vacías, sintetiza desde el resumen de problemas; si tampoco hay, aviso visible. (3) Todas las salidas antes silenciosas del bucle Beta escriben en el activity log: resultado inválido, retry fallido, excepción del retry, catch exterior. Footer `v10.0.76`→`v10.0.77`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix244] Una reanudación durante la Fase 2 silenciosa del Arquitecto ya no arrasa el trabajo en curso**: log real de producción (EL ARCHIVO DE LOS HOMBRES MUERTOS, 21/7) — la Fase 2 empezó a las 10:09:58 ("Timeout: 18 min", sin más logs hasta terminar) y a las 10:19:42 una reanudación encontró "sin World Bible ni capítulos" (se persisten al FINAL de Fase 2), el guard [Fix103] solo miraba actividad <120s, vio "muerto" y reinició desde cero tirando ~30 min de trabajo (World Bible auditada + escaleta en curso). **Arreglo**: `storage.getLastMeaningfulActivityLog` nuevo (devuelve createdAt+message; la versión Time-only delega en él, watchdogs intactos); el guard de `resumeNovel` detecta si el último log real anuncia una fase silenciosa del Arquitecto (`Fase 1/2` o `Fase 2/2` + `Timeout: N min`, N en 1..60) y amplía la ventana de frescura a N+4 min; si no, sigue 120s. Log del bloqueo incluye la ventana aplicada. Footer `v10.0.75`→`v10.0.76`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix243] Los lectores prefieren REESCRITURA SEVERA a borrar/fusionar capítulos**: idea del usuario — el bucle de pulido proponía demasiadas fusiones/borrados (destructivos, requieren confirmación y destruyen material único; caso real: la novela descartada por Fix237) cuando casi siempre una reescritura profunda del cap arregla el problema conservando su función. **Cambio de política en 3 prompts** (la infraestructura ya existía: tipo "estructural" → reescritura completa vía `rewriteChapterForQA`): (1) `holistic-reviewer.ts` — "estructural" declarado HERRAMIENTA PREFERENTE con guía de reescritura severa (qué conservar/sustituir/lograr); "eliminar" y "fusionar" pasan a ÚLTIMO RECURSO (solo redundancia genuina sin material único / caps tan delgados que ni reescritos se sostienen); el ejemplo del JSON ya no muestra un "eliminar" sino una reescritura severa; en la verificación de acciones admin pendientes, un **discard** por material único ahora pide añadir además una instrucción "estructural" de reescritura severa del cap problemático. (2) `beta-reader.ts` — mismas dos reglas (tipos + discard→reescritura). (3) `structural-instruction-translator.ts` — regla dura nueva: si el objetivo de fondo se logra con reescritura severa (feasiblePart), NO emitir delete/merge; destructivas solo si la nota lo pide explícitamente o hay redundancia genuina. Sin cambios de código ejecutable ni de esquema. Footer `v10.0.74`→`v10.0.75`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix242] Auditoría preventiva del bucle WBA: dos agujeros más del mismo tipo, cerrados antes de que muerdan**: tras [Fix241] el usuario pidió asegurar que no quedaran más fugas; lectura línea a línea del bucle completo encontró dos. **(1) Empate de score en la vía de ÉXITO**: `if (score > bestWBA.score)` con `>` estricto — un retry enriquecido que empata (6/10 con 8 personajes vs 6/10 con 6) se descartaba igual que en el caso Fix241, pero con el auditor funcionando; ahora, con empate, sustituye si el material es ≥ en ambos ejes y estrictamente mayor en alguno (activity log `[Fix242]`). **(2) JSON de Fase 1 con defectos menores mataba el bucle entero**: `JSON.parse` directo hacía `break` y quemaba las iteraciones restantes por una coma colgante; ahora intenta `repairJson` (devuelve objeto, NO re-parsear) antes de rendirse. Verificado también que `enforceDensityFloors` muta el resultado por referencia (la degradación sí llega a `bestWBA.result` y a la decisión final) y que los `break` por fallo de Fase 1 preservan bestWBA para la decisión final. Footer `v10.0.73`→`v10.0.74`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix241] El retry enriquecido ya no se pierde cuando el auditor de World Bible falla técnicamente (+ techo de tokens del WBA)**: log real de la 2ª pasada (ya con v10.0.72, EL ARCHIVO DE LOS HOMBRES MUERTOS): [Fix240] funcionó (retry con 8 personajes/5 subtramas, sin degenerar), pero el WBA devolvió "respuesta vacía del LLM" en la iter 2 y, pese a que el log prometía "se reutilizará sin auditar", el código (`if (phase1LookValid && !bestWBA)`) descartaba la Fase 1 nueva porque ya existía bestWBA — se reusó la vieja de 6 personajes (5/10). **Dos arreglos**: (1) `orchestrator.ts` — rama nueva: si la Fase 1 del retry es válida y NO pierde material (personajes ≥ y subtramas ≥ que la mejor), SUSTITUYE el `phase1Json` de bestWBA (conserva su score; es la misma base + el enriquecimiento pedido), con activity log `[Fix241]`; el mensaje de fallo del WBA ahora distingue "se reutilizará" vs "sustituirá si no pierde material". (2) `world-bible-auditor.ts` — `maxOutputTokens` 10240→20480: el techo es COMBINADO razonamiento+contenido (thinkingBudget 8192 dejaba ~2K para el JSON), causa probable de la respuesta vacía con Fases 1 grandes. Footer `v10.0.72`→`v10.0.73`. Sin migración. tsc PASS + smoke PASS + architect PASS.


- **[Fix239] Las quejas RECURRENTES de los informes (hilos sueltos, heridas que desaparecen, motivación por carta, muletillas de imagen) ganan defensa propia**: el usuario aportó los informes Holístico+Beta de la novela nueva y señaló que las quejas se repiten entre novelas. Mapeo: acto 2 repetitivo ya cubierto (Fix200/223/232/238); lo que NO tenía guardia se ataca en 3 capas. **(1) Arquitecto (`architect.ts`)**: regla dura 7 "REGLA DE PAGO (Chéjov inverso)" — todo objeto/documento/herida con peso dramático declara DESTINO en la escaleta (pago o cierre explícito en página; caso real: pasaporte falso nunca usado, sobre lacrado sin resolver); heridas con TRAYECTORIA continua (limitan la acción hasta curación/estabilización declarada; caso real: herida en la nuca desaparece caps 10-21); regla dura 8 "MOTIVACIÓN DE ANTAGONISTAS ESCENIFICADA" — prohibido que la motivación del villano/topo llegue SOLO por documento (caso real: Ochoa revelado por nota, nunca escenificado), y el antagonista principal proyecta sombra sobre el acto 2 (caso real: Arredondo aparece en el cap 24 de 35); self-check nuevo ítem 25 verifica las tres. **(2) Ghostwriter**: regla B1 anti-imagen-firma repetida ENTRE capítulos (máx 2 usos por libro de una imagen atmosférica o tic fisiológico; casos reales: "la luz del candil temblaba" ×9 caps, "manos temblorosas" ×15) + regla 4 de continuidad física "HERIDAS ACTIVAS" (una herida sin curar limita la acción en CADA cap hasta cierre declarado). **(3) Detector DETERMINISTA `detectCrossChapterCatchphrases`** (`server/utils/cross-chapter-catchphrases.ts`) — n-gramas (4-6 palabras, ≥2 de contenido, sin acentos) que aparecen en 4+ capítulos DISTINTOS, dedupe por solape de secuencia; cableado en el pase ortotipográfico del orquestador: se calcula UNA vez sobre el manuscrito completo y cada capítulo recibe SOLO las muletillas que le afectan como instrucción de variación al Corrector (los correctores por-capítulo no pueden ver repetición inter-capítulo); best-effort + log resumen. Probado con tsx (5 casos PASS, incluidos negativos de umbral y stopwords). Footer `v10.0.70`→`v10.0.71`. Sin migración. tsc PASS + smoke PASS + architect PASS.

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
