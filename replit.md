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

- **[Fix115] Auditor Estructural llega al 7/10 antes de escribir — audit on-demand WB↔SA + gate de publicabilidad con guidance manual del usuario**: Tras queja del usuario ("el Auditor Estructural debe llegar al 7/10 antes de escribir; no quiero que aborte el proyecto si no lo consigue"). Diagnóstico: el bucle SA tenía un techo natural — con `MAX_SA_ITERATIONS=6` (Fix107), si la World Bible carecía de munición dramática para resolver una dimensión KO concentrada (p.ej. `arco_secreto` con 8 problemas en iter 1), el Arquitecto rediseñaba la escaleta una y otra vez sobre la MISMA base y oscilaba sin pasar de 4.4/10. Fix110 introdujo audit pre-flight de WB pero (a) skipea series y (b) si pasaba 7/10 una vez, ya no se reauditaba aunque luego el SA fallara. Plan acordado con el usuario: A+B+D+E con alternativa a C (endurecer prompt, NO patch-mode invasivo). Umbral mínimo publicable estricto 7/10. **Implementación**: **(T001)** nueva columna `pendingStructuralGuidance jsonb` en `projects` con triple cobertura para Ubuntu: SCHEMA_PATCH idempotente en `server/db.ts` (runtime al boot), REQUIRED_COLUMN en `server/startup-schema-check.ts` (assert duro de schema), ALTER en el bloque pre-create de `update.sh` + sanity check duro al estilo Fix113 que reintenta y emite error explícito si falla. `install.sh` ya cubre fresh installs porque `script/build.ts` corre `drizzle-kit push --force` durante `npm run build`, creando la columna desde `shared/schema.ts`. `status` es `text` (no enum) así que `"awaiting_structural_guidance"` no requiere ALTER TYPE. **(T002+T003 fusionados)** en `_generateNovel` bucle SA (server/orchestrator.ts L2390-2880): vars de estado `wbaExternalDone`/`wbaExternalFeedback`/`prevTopAreaSA`. Tras computar `koDimensions` cada iter, calculamos `topKO` (dimensión con más count) + `topArea`; si en 2 iters consecutivas la MISMA `topArea` tiene count≥3 y `!wbaExternalDone`, disparamos `this.worldBibleAuditor.audit({phase1Json: bestSA.data, ...})` (máx 1 vez por bucle, ~3-5 min worst-case). Si devuelve `feedback_para_arquitecto` accionable, lo capturamos en `wbaExternalFeedback` con delimitadores y header explicativo ("Score actual de la WB: X/10; ENRIQUECE primero la WB, luego rediseña") y lo prependemos a `feedbackWithHistorySA` para el siguiente retry. Si falla técnicamente, marcamos `wbaExternalDone=true` para no reintentar en bucle. Cubre tanto vol 1 (cuando Fix110 pre-flight ya falló) como vol N de serie (donde Fix110 está skipeado). **(T004 prompt-only)** texto del `historyBlockSA` endurecido con "NO HAY MEDIO TONO: o respetas la lista OK al pie de la letra o tu intento se descarta" — confiamos en Fix109d existente para validación post-hoc (early-stop por regresión consecutiva). **(T005)** `MAX_SA_ITERATIONS` 6→8 y nueva constante `MIN_PUBLISHABLE_SA_SCORE=7`. **(T006 — gate human-in-the-loop)** tras el restore-best del final del bucle SA, si `bestSA.score < MIN_PUBLISHABLE_SA_SCORE` (7), NO escribimos la novela: persistimos `pendingStructuralGuidance = {bestScore, threshold, problemas, resumenAuditor, worldBibleSnapshot, savedAt, iterations, wbaExternalRan}`, seteamos `status="awaiting_structural_guidance"`, activity log `level:"warning"` y `return` sin invocar Narrador. Nuevo endpoint `POST /api/projects/:id/structural-guidance` (routes.ts L1110) recibe `{guidance: string}` ≥10 chars, lo appendea a `architectInstructions` con delimitadores claros + timestamp + contexto (score previo, umbral), resetea `status="idle"` y arranca `orchestrator.generateNovel(refreshedProject)`. En `_generateNovel` (L1383, ANTES del bucle WBA), nueva lógica de reanudación: si `project.pendingStructuralGuidance.worldBibleSnapshot` existe, lo usa como `prefortifiedPhase1Json` (vía Fix106 `reusePhase1Json`) y SALTA el bucle WBA (el snapshot ya viene auditado); limpia `pendingStructuralGuidance` antes de continuar. Nuevo componente `StructuralGuidancePanel` (client/src/components/structural-guidance-panel.tsx) montado en dashboard.tsx cuando `status==="awaiting_structural_guidance"`: muestra mejor score vs umbral, resumen del Auditor, lista de problemas residuales con severidad/area/caps/sugerencia (ScrollArea 64h), textarea para guidance manual (`min 10 chars`, monospace), botón de envío con loader + invalidación de cache. **Backwards-compat**: proyectos pre-Fix115 nunca entran al gate (siempre tuvieron Fase 1 fortificada vía Fix110 o flujo clásico); el snapshot solo se persiste cuando el gate se activa. **Coste**: 0 worst-case adicional si SA converge normalmente; +3-5 min por audit on-demand si bottleneck concentrado detectado; +2 iters SA disponibles (6→8) ya con la WB fortificada. **No emojis. Español simple.**

- **[Fix114] Auto-relleno de la voz narrativa canónica desde la guía de estilo/extendida seleccionada**: Tras feedback ("los campos de narrative voice se deben rellenar automáticamente desde la guía de estilo del autor, solo en caso de que no aparezcan instrucciones en dicha guía lo hará el usuario"). El campo `narrativeVoice` (Fix108) se introdujo como input manual obligatorio en `config-panel.tsx`, pero el usuario quería el comportamiento natural: si la guía ya menciona "tercera persona" + "tiempo verbal: presente", esos campos se deben rellenar solos al seleccionarla; solo si la guía no lo dice, el usuario los completa a mano. **Implementación**: **(1)** Nuevo módulo `shared/narrative-voice-extractor.ts` con `extractNarrativeVoiceFromGuide(text)` — subconjunto puro (sin imports server-only) del extractor regex de `server/utils/style-directives.ts`, detecta `pov` (first/third/dual_first/dual_third/second), `tense` (present/past) y `narratorType` (omnisciente/limitado/testigo) con guardas de negación (descarta "evita la tercera persona", etc.) y rechaza ambigüedad mixta primera+tercera. **(2)** `config-panel.tsx`: useEffect que watch `styleGuideId` + `extendedGuideId`; cuando cambian, busca el `content` en la cache de TanStack Query (`styleGuides`/`extendedGuides`, ya disponibles), prioriza la guía extendida (más prescriptiva), corre el extractor y autorellena `narrativeVoice` con `form.setValue(..., {shouldDirty:true})`. Solo autorellena si `detected && pov && tense` (no inventamos tiempo verbal si la guía no lo dice — los selectores quedan vacíos y el usuario los fija a mano). Ref `lastAutoFilledFromRef` con clave `e:X|s:Y` para no re-disparar el effect en cada render mientras la guía no cambie. **(3)** FormDescription de la sección actualizada: explica que los campos se rellenan solos si la guía los menciona y que si quedan vacíos y la guía tampoco lo indica, el pre-flight (Fix108) aborta la generación. **Backwards-compat**: proyectos existentes con `narrativeVoice` ya seteado lo mantienen; cambiar de guía sobre un proyecto editable autorellena si la nueva guía es prescriptiva (`shouldDirty:true` para que el botón "Guardar" se active y el usuario sepa que ha cambiado). **Fix114 post-review (architect)**: dos bugs arreglados: **(a)** dedup prematuro — si el usuario tenía guía seleccionada antes de que la query devolviera el `content`, el ref se marcaba como "procesado" en la primera ejecución y nunca se autorellenaba cuando llegaban los datos. Solución: `styleGuidePending`/`extendedGuidePending` early-return ANTES de tocar el ref. **(b)** Overwrite en mount — proyectos en edición con `narrativeVoice` previo se machacaban al montar el form. Solución: `skipInitialAutofillRef` inicializado a `true` cuando `defaultValues.narrativeVoice` ya venía seteado; en la primera ejecución del effect respetamos la voz previa y a partir de la siguiente sí autorellenamos como en proyecto nuevo. Sin emojis.

- **[Fix113] Sincronización de schema en Ubuntu: `narrative_voice` (Fix108) + chequeo de tablas recientes**: Tras revisar el sistema de bootstrap DB para VPS self-hosted, detectada brecha: `narrativeVoice` (jsonb en `projects`, añadido en Fix108) NO estaba en `SCHEMA_PATCHES` (server/db.ts) ni en `REQUIRED_COLUMNS` (server/startup-schema-check.ts). En Ubuntu, sin esa columna, POST/PATCH `/api/projects` fallaría en runtime al guardar la voz canónica del form de configuración. **Implementación**: **(1)** Añadido `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "narrative_voice" jsonb` al `SCHEMA_PATCHES` (idempotente, se aplica en cada boot). **(2)** Añadido `{table:"projects",column:"narrative_voice",addedIn:"Fix108"}` al `REQUIRED_COLUMNS`. **(3)** Aprovechando la revisión, añadidas también las columnas históricas que faltaban en el chequeo (`last_holistic_notes` Fix82, `min_chapter_count`/`max_chapter_count` Fix90) para que el assert detecte cualquier desincronización en proyectos viejos. **(4)** `REQUIRED_TABLES` ampliado de 2 a 16 entradas: si en Ubuntu falta alguna tabla añadida en updates posteriores al primer `drizzle-kit push` (audiobook_*, kdp_metadata, book_catalog, project_back_matter, name_blacklist, proofreading_*, reedit_audit_reports, reedit_world_bibles, series_arc_*, generated_guides), el server aborta el arranque con instrucciones claras (`drizzle-kit push --force`) en vez de fallar silenciosamente en runtime cuando se usa esa funcionalidad. **Verificado**: boot log muestra `schema patches applied (7)` (antes 6) y `assertSchemaUpToDate` no aborta. **Backwards-compat**: todos los `ALTER` son `IF NOT EXISTS`; instalaciones que ya tengan las columnas/tablas pasan sin tocar nada.

- **[Fix112] Auto-loop Beta con best-tracking + revert por regresión consecutiva (deja de empeorar la novela sin recuperación)**: Tras queja del usuario ("tampoco tiene sentido que el loop automático baje todas las puntuaciones y empeore la novela de un paso a otro y no se revierta"), diagnóstico: `runAutoBetaLoop` (`server/orchestrator.ts` L12481, Fix47) tenía un control de flujo MUY rudimentario comparado con `runAutoHolisticReviewLoop` (Fix81/Fix89): solo contaba instrucciones extraídas por el parser (`total`/`altas`) e iteraba ciegamente — **NO trackeaba el score numérico del Beta**, **NO guardaba snapshot del mejor estado**, **NO revertía cuando una iteración degradaba el manuscrito**. Si el cirujano cap-a-cap empeoraba el texto (cosa que ocurre cuando el patcher mete reescrituras agresivas o el structural-translator rompe coherencia local), el loop continuaba sobre la versión degradada hasta agotar las 3 iteraciones — el usuario veía cómo la puntuación bajaba de paso en paso sin recuperación posible. **Implementación**: portado el patrón de `runAutoHolisticReviewLoop` adaptado al Beta single-score. **(1)** `snapshotManuscript` y `restoreSnapshot` helpers inline (mismo patrón Fix81 v2: snapshot por ID+chapterNumber+content; restoreSnapshot detecta drift estructural cuando el set de IDs difiere y solo restaura por ID lo que aún existe). **(2)** Constantes: `TARGET_BETA_SCORE=9` (alineado con el holístico) y `REGRESSION_THRESHOLD=0.5` (más estricto que el 1.0 del dual porque aquí solo hay UN score; una caída de 0.5 ya es señal clara). **(3)** Tracking: `bestSnapshot {score, chapters, iter}`, `prevBetaScore`, `initialBetaScore`, `consecutiveRegressions`. **(4)** Cada iter, tras `runBetaReview` y antes de procesar instrucciones: si `bestSnapshot.score − betaScore ≥ 0.5` → `consecutiveRegressions++` con activity log warning; si llega a `≥2` → restoreSnapshot al mejor estado + log explícito + ejecutar ortotipográfica si `bestSnapshot.score ≥ TARGET` o marcar `status="completed"` si no, y `return`. Si el score iguala o supera al best (con tolerancia) → reset del contador (regresiones no consecutivas no penalizan). **(5)** Si el score actual supera al best → snapshot nuevo + actualización del bestSnapshot. **(6)** En la salida por `approved` (≤3 instrucciones, 0 altas) o por `maxIterations`: si el current está por debajo del best ≥0.5, restauramos al best ANTES de la ortotipográfica final / persistencia — el polish y la entrega siempre van sobre la mejor versión vista, nunca sobre una degradada. **Coste**: 0 LLM calls extra (el score ya venía del Beta, solo lo aprovechamos); coste de DB es 1 SELECT + N UPDATE por restore (raro, solo en regresión). **Backwards-compat**: si el Beta no emite `score` (`null`), todo el bloque de regresión se salta y el loop se comporta como pre-Fix112. **Scope**: solo `runAutoBetaLoop`. `runAutoHolisticReviewLoop` ya tenía esta lógica desde Fix81/Fix89. **Fix112 post-review (architect)**: detectados dos gaps menores y arreglados: **(a)** la rama `!notesText` (Beta devuelve manuscrito limpio) no aplicaba el guard de restore best — ahora sí, cubre el caso de varianza del modelo donde el Beta no ve problemas pero el score es inferior al best. **(b)** En `maxIterations` con restore al best: las instrucciones persistidas en `pendingEditorialParse` fueron generadas sobre el current PRE-restore — el activity log ahora avisa explícitamente al usuario y `source` se renombra a `auto_beta_loop_max_iter_restored_to_best` para que el dashboard pueda mostrar un warning antes de aplicar manualmente.

- _Fix112, Fix111, Fix110, Fix109, Fix108 movidos a `CHANGELOG.md` v9.1.2/v9.1.3/v9.1.4._


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