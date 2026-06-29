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

- **[Fix167] Novelas de SERIE creadas desde IMPORTADOS daban error al generar: la guía de la serie nunca llegaba al guiaEstilo (Narrador) ni al pre-flight de voz, así que el volumen abortaba pese a tener guía**: el usuario reportó que al crear novelas de una serie desde importados se crean los proyectos y la guía de la serie, pero "esta no se inyecta a los proyectos" y dan error al generar. **Diagnóstico**: la guía de serie (`series.seriesGuide`) viajaba SOLO dentro de `seriesContextContent` → `effectivePremise`, que recibe el ARQUITECTO; nunca se plegaba a `styleGuideContent`. Los volúmenes que crea el endpoint `POST /api/reedit-projects/convert-to-series` (server/routes.ts) nacen con `styleGuideId: activeStyleGuideId` (null salvo que el pseudónimo tenga una guía activa) y SIN `narrativeVoice`. Resultado: en `_generateNovel` (server/orchestrator.ts) el pre-flight de voz canónica [Fix108] solo inspecciona `styleGuideContent + extendedGuideContent` (vacíos) y aborta con `status="idle"` y el error "no se ha podido determinar la voz narrativa canónica" — aunque la guía de serie SÍ incluye su bloque OBLIGATORIO `## VOZ NARRATIVA CANÓNICA` (POV + tiempo verbal, ver `style-guide-generator.ts`). Además, aun pasando el pre-flight, el Narrador (que recibe `fullStyleGuide = styleGuideContent`, NO la premisa) nunca recibía la voz/estilo de la saga. **Arreglo** (solo `server/orchestrator.ts`, sin migración): nuevo helper `buildSeriesGuideStyleBlock(seriesId)` (best-effort, jamás lanza) que devuelve un bloque "GUÍA DE LA SERIE ..." con `series.seriesGuide`; se pliega a `styleGuideContent` (a) en `_generateNovel` ANTES del pre-flight [Fix108] (así el extractor detecta POV+tiempo verbal del bloque canónico de la serie y el Narrador hereda la voz/estilo) y (b) en `_resumeNovel` por paridad (único canal hacia el Narrador en resume, donde no se reconstruye `effectivePremise`). NO hay duplicación: el Arquitecto sigue recibiendo la guía vía `seriesContextContent`/`effectivePremise` y NO recibe `guiaEstilo`; el Narrador recibe `guiaEstilo` y NO recibe la premisa — ningún agente la ve dos veces. Footer `v10.0.13`→`v10.0.14`. Coste 0 LLM (+1 lectura DB barata por generación/resume). Sin migración. tsc PASS.

- **[Fix166] Puerta de tiempo verbal TEMPRANO: detecta el tiempo verbal REAL (gramatical) de la PROSA de los primeros capítulos y lo fija antes de que se propague al resto**: tras Fix165 (el tiempo verbal INFERIDO de la guía es POCO fiable), el usuario eligió (vía `user_query`) reforzar el sistema con una puerta autónoma sobre la PROSA REAL. **Diagnóstico**: el sistema solo "veía" el tiempo verbal vía (a) el detector de voz por regex sobre la guía (poco fiable) y (b) el Revisor Final, que lo detecta al TERMINAR y tiene PROHIBIDO cirugía cap-a-cap; un capítulo temprano que deriva de pasado a presente/mixto se propaga a todo el libro y llega irreparable. **Arreglo** (sin migración): (1) nuevo agente `server/agents/tense-consistency-judge.ts` (`TenseConsistencyJudgeAgent`, espejo de `act2-pacing-editor`: `useThinking:true`, `thinkingBudget 8192`, `maxOutputTokens 16384`, `repairJson`, saneamiento defensivo): lee la PROSA real de los primeros caps y juzga el tiempo de la NARRACIÓN (ignora diálogo y presente histórico puntual) → por-cap `{numero, tiempo: pasado|presente|mixto}`, `tiempo_dominante`, `consistente`, `resumen`, `capitulos_desviados[]`. (2) plumbing al Narrador: `GhostwriterInput.tiempoVerbalCanonico?:string` + bloque directivo; `ParsedWorldBible.tiempo_verbal_establecido?:string`; passthrough en `convertPlotOutline` + read-back en `reconstructWorldBibleData` (persistencia jsonb en `plotOutline`). (3) puerta `runEarlyTenseGate` (`server/orchestrator.ts`, espejo de `runAct2ProseGate`): ventana = primeros 4 caps completados; **objetivo** = canon EXPLÍCITO si `tenseSource==="canonical"`, si no el tiempo DOMINANTE real (consistencia interna, nunca pelear contra el tiempo natural); dominante "mixto" sin canon → NO toca la prosa (Fix165: no fabricar canon dudoso). Reescribe SOLO los desviados vía `rewriteChapterForQA(..., "editorial", directiva)` conservando hechos/diálogo/estilo/longitud; `MAX_PASSES=2`, tope `MAX_TENSE_REWRITES=4`; **revert-by-default**; log honesto; try/catch (jamás bloquea). Tras converger FIJA el tiempo (`this.establishedTense` + persistencia) para que los caps FUTUROS no deriven. (4) hook one-shot en `_generateNovel` (`earlyTenseGateAttempted`): dispara con `completedSoFar>=3 && total>=6 && remainingAfter>=2 && !aborted`; ambas call-sites (gen y resume) inyectan `tiempoVerbalCanonico` desde el tiempo establecido/persistido — la puerta NO corre al reanudar pero el resume SÍ honra el tiempo persistido. Footer `v10.0.12`→`v10.0.13`. Coste: ≤2 lecturas LLM + ≤4 reescrituras acotadas, una vez por novela. Sin migración. tsc PASS.

- **[Fix165] Tiempo verbal fantasma: el detector de voz confundía "presente narrativo"/"avanza en presente" (cronología) con tiempo verbal gramatical, y el Revisor Final lo elevaba a CRÍTICO**: el usuario preguntó "¿cómo es posible esto?" al ver que el Revisor reportaba TODO el manuscrito (Prólogo→Cap30→Epílogo, correctamente en PASADO) como en voz equivocada frente a un canon "presente", marcándolo crítico y sin poder corregirlo cap-a-cap. **Diagnóstico**: `narrative_voice` (jsonb explícito de Fix108) está VACÍO en todos los proyectos, así que la voz se infiere por regex de la guía (`extractStyleDirectives`, `server/utils/style-directives.ts`). Los patrones sueltos `\ben presente\b` / `\ben pasado\b` cazaban frases de CRONOLOGÍA/AMBIENTACIÓN —la guía de autor decía "la investigación avanza en presente con flashbacks" y la de serie "el presente narrativo"— y las confundían con TIEMPO VERBAL, fabricando un canon "presente" fantasma. Ese canon se inyectaba al Narrador (que aun así escribió en pasado, lo correcto para noir) y al Revisor Final, que por diseño (`buildFinalReviewerDirectiveBlock`) eleva a CRÍTICO un manuscrito entero en "voz equivocada" y tiene PROHIBIDO pedir cirugía cap-a-cap. El manuscrito estaba BIEN; el detector estaba mal. El usuario eligió (vía `user_query`) la OPCIÓN 2: afinar el detector + salvaguarda en el Revisor Final. **Arreglo** (solo `server/utils/style-directives.ts`, sin migración): (1) el regex de tiempo verbal ELIMINA los patrones sueltos `en presente`/`en pasado`; ahora solo detecta con pista GRAMATICAL explícita (`tiempo/verbo(s) presente|pasado`, `tiempo verbal: X`, `narrado/a en X`, `pretérito ...`) — "presente narrativo" y "avanza en presente" dejan de activar nada. (2) nuevo `tenseSource: "canonical"|"inferred"` en `StyleDirectives`: "canonical" si el texto contiene el marcador del bloque explícito Fix108 (`synthesizeVoiceBlock`), "inferred" si viene de regex sobre la guía libre. (3) `buildFinalReviewerDirectiveBlock` añade una EXCEPCIÓN cuando `tenseSource==="inferred"`: un desajuste GLOBAL de SOLO tiempo verbal NO se eleva a CRÍTICO (se degrada a MENOR, sugiriendo confirmar el tiempo deseado); la PERSONA/POV conserva su criterio CRÍTICO intacto. `tenseSource` fluye sin plumbing porque `final-reviewer.ts` pasa el resultado de `extractStyleDirectives` directo a `buildFinalReviewerDirectiveBlock`. Footer `v10.0.11`→`v10.0.12`. Coste 0 LLM. Sin migración. tsc PASS. Architect review PASS.

- **[Fix164] Borrado automático de capítulos en el bucle de auto-revisión: deja de ser desmedido e irreversible — ahora exige UNANIMIDAD de ambos lectores Y tope de muy pocos por novela**: el usuario reportó que al aplicar correcciones tras las lecturas Holística+Beta el sistema "borra capítulos de forma desmedida e irreversible sin arreglar el problema" y eligió (vía `user_query`) la OPCIÓN B: permitir borrado automático SOLO con acuerdo de AMBOS lectores Y con tope de muy pocos capítulos por novela. **Diagnóstico** (`server/orchestrator.ts`): dos vías de borrado — (1) FASE 0 `applyChapterDeletions` ejecutaba los `eliminar` del parser AL INSTANTE, sin gate, cada iteración del loop e irreversiblemente (la red revert-on-regression no puede deshacer un capítulo borrado): la culpable; (2) `applyConfirmedAdminActions` ya exigía unanimidad para `delete_chapter` pero el auto-loop no la usaba. **Arreglo** (solo `server/orchestrator.ts`, sin migración): (a) `extractAutoInstructionsFromReview` acepta `routeDeletesToPending` y `pendingAdministrative` lleva `targetChapters?`; en `fromAutoLoop`, los `eliminar` ya NO entran en FASE 0 — se enrutan a `pendingAdministrative` como `delete_chapter` (solo caps positivos). (b) El bloque `fromAutoLoop` separa `deleteActions` y los persiste en `pendingAdminActions` (jsonb existente) con dedup por `targetChapter`. (c) `applyConfirmedAdminActions` acepta `deletionBudget` (def. `Infinity`) y devuelve `chaptersDeleted`; al agotar el presupuesto la acción `delete_chapter` se MANTIENE pendiente (no se ejecuta) con log; solo incrementa el contador tras un borrado REAL. (d) `runAutoHolisticReviewLoop` define `MAX_AUTO_CHAPTER_DELETIONS_PER_RUN=2`, lleva `deletionsThisRun`, pasa el presupuesto RESTANTE cada iteración y acumula los borrados reales (tope efectivo por novela aunque el loop dé 8 iteraciones). (e) Guard defensivo en FASE 0: si `fromAutoLoop` y quedan instrucciones de borrado residuales, se vacían con log. **El flujo MANUAL de borrado NO se ve afectado** (`routeDeletesToPending=false` por defecto). Footer `v10.0.10`→`v10.0.11`. Coste 0 LLM. Sin migración. tsc PASS. Architect review PASS.

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