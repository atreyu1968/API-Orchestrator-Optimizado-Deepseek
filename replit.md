# LitAgents v7.1 - Autonomous Literary Agent Orchestration System

## Overview

LitAgents is a Node.js application that orchestrates autonomous AI literary agents using DeepSeek V4-Flash (via OpenAI-compatible API) to manage the entire novel-writing workflow. It provides a comprehensive solution for authoring, re-editing, translating, and managing literary works through AI-driven processes. Key capabilities include orchestrating 12+ specialized AI agents, maintaining a persistent World Bible for consistency, logging AI reasoning, providing a real-time monitoring dashboard, automating refinement loops, auto-recovery from stalled generations, and advanced features for manuscript import, expansion, reordering, translation, approval, prequels, and spin-offs. The system ensures high-quality manuscript completion through robust approval logic and automatic pausing for user intervention.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### Bugfix v7.2 — Arquitecto: escaleta empobrecida + arcos abiertos (May 2, 2026)

Inspección de la BD reveló que **ningún proyecto cumplía el contrato del Arquitecto**: los `chapterOutlines` persistidos siempre tenían `summary: ""` y solo 1-5 beats por capítulo (el prompt exige mínimo 6). El proyecto en curso 33 incluso tenía 0 beats en los 22 capítulos. Causa real: el formato del prompt Phase 2 no incluía `objetivo_narrativo` aunque `persistArchitectOutput` (L7969) intentaba leerlo. El Narrador y el Editor recibían sinopsis vacía y escribían/validaban a ciegas.

**Fix 1 — Prompt del Arquitecto (server/agents/architect.ts).**
- `objetivo_narrativo` añadido al ejemplo JSON de `PHASE2_SYSTEM_PROMPT` (campo: párrafo narrativo de 100-200 palabras, no etiqueta) — entre `funcion_estructural` y `arcos_que_avanza`.
- Reglas críticas reforzadas: el campo es OBLIGATORIO y `beats` exige 6 mínimos con cláusula de longitud (1-3 oraciones cada uno).
- Verificación final del prompt actualizada para auto-checkear `objetivo_narrativo >= 100 palabras` y `beats >= 6` antes de responder.

**Fix 2 — Validación post-Architect (server/orchestrator.ts L1264+).**
- Nueva rama de validación dentro del retry loop (`MAX_ARCHITECT_RETRIES = 3`): tras pasar `hasCharacters`, `hasChapters`, `hasEnoughChapters`, ahora se valida calidad de la escaleta.
- Para cada cap regular (`numero >= 1`): exige `beats.length >= 5` (toleramos 5 aunque el prompt pida 6) y `objetivo_narrativo.trim().length >= 80` chars.
- Si más del 20% (`FAIL_THRESHOLD`) de los caps regulares falla, marca inválido, loguea muestra de los fallos en `activity_logs` ("cap.X: N beats, objetivo Y chars") y reintenta.
- Si tras 3 intentos sigue empobrecida, deja pasar (warning explícito) en lugar de fallar el proyecto: el Narrador escribirá con plan parcial pero el manuscrito no se bloquea.

**Fix 3 — ArcValidator standalone (server/orchestrator.ts L9008+).**
- Nuevo método `runStandaloneArcCheck(project)` invocado desde `finalizeCompletedProject` cuando `!project.seriesId` (justo después de `runSeriesArcVerification`, que sigue siendo no-op para standalone).
- Construye milestones sintéticos in-memory desde `worldBible.plotOutline.estructura_tres_actos` (incidente incitador, puntos de giro de acto 2, clímax, resolución) e hilos sintéticos desde `matriz_arcos.subtramas`. IDs negativos para no chocar con BD.
- Pasa todo al `ArcValidatorAgent` con `volumeNumber: 1, totalVolumes: 1`. Persiste resultado en `activity_logs` (info si pasa, warn con findings si requiere atención). No persiste en `series_arc_verifications` (esa tabla es series-only).
- Si la escaleta no contiene estructura de 3 actos detectable, registra info y termina sin error.

**Fix 4 — Persistencia de subtramas (server/orchestrator.ts `convertPlotOutline`).**
- Antes solo se persistían `premise`, `threeActStructure`, `lexico_historico` y `chapterOutlines`. Las `matriz_arcos.subtramas` que el Architect Phase 1 produce se descartaban silenciosamente.
- Ahora se persisten como `plotOutline.subplots` (cuando el array no esté vacío). El schema `PlotOutline` es passthrough en zod, así que la clave adicional pasa la validación sin romper compatibilidad.

**Fix 5 — Hardening del retry loop (revisión architect aplicada).**
- **Best-effort buffer**: nuevas variables `bestWorldBibleData` + `bestFailRate` mantienen la mejor escaleta vista entre intentos. Si tras agotar `MAX_ARCHITECT_RETRIES` el último intento es peor que uno previo, se restaura el mejor antes de continuar (loguea info en `activity_logs`).
- **Guard de numeración**: si `project.chapterCount > 0` pero `regularCaps.length === 0` (escaleta mal numerada — todos como prólogo, número null), se fuerza retry. Si agota retries en este estado se lanza error (no se continúa con escaleta inservible).

**Fix 6 — Claves reales en `runStandaloneArcCheck`.**
- Lectura corregida de `plotOutline.threeActStructure` (no `estructura_tres_actos` — inexistente en BD) con fallback a las claves raw del Architect por si se invoca sobre datos in-flight.
- Construcción de milestones desde `act1.incitingIncident`, `act2.midpoint`, `act2.complications`, `act3.climax`, `act3.resolution` (claves persistidas reales) más `puntos_de_giro` opcional como array.
- Hilos desde `plotOutline.subplots` (Fix 4) con fallback a `matriz_arcos.subtramas` para invocaciones in-flight.

**Fix 7 — extendNovel persiste outlines nuevos + idempotencia (server/orchestrator.ts L6684+).**
- Bug detectado en auditoría profunda: al extender una novela, `extendNovel` creaba registros de `chapters` con `status=pending` y los outlines vivían SOLO in-memory en `worldBibleData.escaleta_capitulos`. **Nunca se persistían en `plotOutline.chapterOutlines`**. Si la generación se interrumpía, al reanudar `reconstructWorldBibleData` no encontraba los outlines y los caps nuevos quedaban huérfanos (objetivo_narrativo y beats vacíos).
- Ahora tras `createChapter` se ejecuta `storage.updateWorldBible` con los outlines nuevos mapeados al formato persistido (mismo mapping que `convertPlotOutline` y `regenerateOutlineFromChapter`) y mergeados con los existentes.
- **Fix 7.1 (refinamiento tras code review)** — tres robusteces añadidas:
  1. **Coerción numérica** de `c.numero` con `coerceNumExt`, igual que regenerateOutlineFromChapter, para evitar que un modelo que devuelva `"12"` (string) rompa el `===` de `findChapterByNumero` en `buildSectionsList`.
  2. **Idempotencia en createChapter**: antes de cada `createChapter` se consulta el set de `chapterNumber` ya existentes en BD y se saltan los duplicados. Permite reintentos seguros tras crash sin generar capítulos huérfanos en BD.
  3. **Dedup en merge de plotOutline**: en lugar de concatenar `[...existingArr, ...newOutlinesPersist]` (que duplicaría outlines en re-extensiones), se usa `Map<number, outline>` con last-write-wins, garantizando que `plotOutline.chapterOutlines` quede consistente sin importar cuántas veces se ejecute la extensión.

**Fix 9 — Lector Beta de Escaletas (May 2, 2026).**
- **Nuevo agente** `server/agents/outline-beta-reader.ts` (`OutlineBetaReaderAgent`): critica la escaleta del Arquitecto ANTES de escribir, desde la perspectiva del LECTOR OBJETIVO del género. Distinto del `BetaReaderAgent` existente, que opera sobre la novela ya escrita (prosa). Foco en pacing, arcos de personaje, hooks entre capítulos, promesa del género, coherencia tonal, expectativas del lector, estructura de tres actos y subtramas huérfanas (NO clichés — eso lo cubre `OriginalityCriticAgent`).
- **Output JSON estructurado**: `{puntuacion_global (1-10), perfil_lector_objetivo, veredicto: "apto"|"necesita_revision"|"reescribir", resumen, fortalezas[], problemas[{tipo, severidad, capitulos_afectados[], descripcion, como_lo_viviria_el_lector, sugerencia_concreta}], instrucciones_revision}`. Modelo deepseek-v4-flash, useThinking 8192, timeout 8 min.
- **Integración orquestador (server/orchestrator.ts L1519+)**: bucle for tras `OriginalityCritic` con `MAX_BETA_ITERATIONS=2` y `BETA_THRESHOLD=8` (modo AUTOMÁTICO según preferencia del usuario). Si `puntuacion_global < 8`, compone feedback (`perfil_lector_objetivo` + `instrucciones_revision` + top-10 problemas) y re-ejecuta `architect.execute({...,betaReaderFeedback})`. Valida la escaleta rediseñada (`>= expectedChapters - 2` capítulos + personajes presentes) antes de reemplazar `worldBibleData`.
- **Best-effort buffer**: `bestBetaScore` + `bestBetaWorldBibleData` conservan la mejor versión vista; si tras 2 iteraciones la última empeoró, se restaura la mejor. Try/catch global no bloqueante (si el Lector Beta falla, se continúa con la escaleta original — la escritura nunca se bloquea por este agente).
- **Architect input** (`server/agents/architect.ts`): nuevo campo `betaReaderFeedback?: string` inyectado en `commonContext` como bloque de PRIORIDAD MÁXIMA con instrucciones explícitas de respetar el perfil del lector objetivo y aplicar las correcciones del Beta literalmente. Solo se inyecta en la pasada de revisión; la pasada inicial no lo lleva.
- **Token tracking**: cada pasada del Lector Beta y cada revisión del Arquitecto se registran con etiquetas `outline_review` y `world_bible` respectivamente. Activity logs detallados por iteración con metadata (`betaScore`, `veredicto`, `perfilLectorObjetivo`, `problemas`, `fortalezas`).
- **Orden de ejecución**: Architect → bucle de calidad estructural (Fix 2, max 3) → OriginalityCritic (max 1 retry) → **OutlineBetaReader (max 2 iter)** → persistencia World Bible → escritura. Cada etapa solo afecta a la siguiente si pasó la validación; ninguna bloquea el proyecto.

**Fix 8 — regenerateOutlineFromChapter persiste subplots (server/orchestrator.ts L7121+).**
- La re-arquitectura mid-novela (`regenerateOutlineFromChapter`) persistía `chapterOutlines` mergeados pero **descartaba `parsed.matriz_arcos.subtramas`** si el Architect rehacía los hilos. Ahora se persisten también como `plotOutline.subplots` cuando el array es no-vacío, manteniendo coherencia con Fix 4 (`convertPlotOutline`) para que el `ArcValidator` standalone audite la versión actualizada.

**Auditoría completa del flujo planificación → escritura.** La revisión profunda confirmó que el sistema es robusto en 4 puntos críticos:
- `reconstructWorldBibleData` (L2977-2998) mapea correctamente `summary → objetivo_narrativo` y `keyEvents → beats`, así que las rutas de reanudación (`resumeNovel`, `applyMacroOperations`, `regenerateSingleChapter`) reciben siempre la forma raw que el Narrador espera.
- `buildSectionsList` (L7480) y `buildSectionsListFromChapters` (L7442) construyen `SectionData` desde `escaleta_capitulos` ya normalizada, propagando todos los campos extendidos (funcion_estructural, conflicto_central, giro_emocional, arcos_que_avanza, riesgos_de_verosimilitud, etc.).
- Las 7 invocaciones del Ghostwriter (`generateNovel` L1690, `resumeNovel` L2383, `extendNovel` L6837, `regenerateSingleChapter` L5436, `applyMacroOperations` x2, holistic refinement) reciben siempre `chapterData` con la forma raw correcta.
- Las 8 invocaciones del Editor/Copyeditor reciben `sectionData` desde la misma fuente — round-trip simétrico.

**Limitación conocida (no es bug del código actual)**: proyectos creados antes de v7.2 tienen `summary: ""` y `keyEvents` cortos en BD. Al reanudarlos el Narrador recibe objetivo_narrativo vacío, mismo síntoma que motivó esta sesión. Se recomienda regenerar su escaleta con `restructure_arc` o re-arquitectar.

**Validación**: `npx tsc --noEmit` limpio tras los 8 fixes. No requiere `db:push` (sin cambios de schema — `subplots` cabe en passthrough zod). Los fixes solo afectan a generaciones futuras — proyectos ya completados conservan su escaleta empobrecida.

### Cambio funcional — 3 PUENTES sobre el HolisticReviewer (May 2, 2026)

Cierre del bucle del revisor holístico para que **detección → corrección sea fluida** y para que las macro-roturas (capítulo duplicado, cambio de nombre global, re-arquitectura de un arco) tengan tratamiento dedicado y no obliguen al usuario a ediciones manuales pesadas. Tres puentes coordinados sobre el orquestador.

**T001 — Parser editorial: 3 macro-tipos nuevos.**
- `EditorialInstruction.tipo` ahora admite: `regenerate_chapter`, `global_rename`, `restructure_arc` (server/agents/editorial-notes-parser.ts).
- Campos opcionales: `rename_from`/`rename_to` para `global_rename`; `restructure_from_chapter`/`restructure_instructions` para `restructure_arc`.
- System prompts (principal + sección 4-bis de `refineWithContext`) actualizados con las definiciones, validaciones (rename_from debe aparecer realmente en el texto; restructure_from_chapter ≥ 1; consigna ≥ 30 chars) y 4 ejemplos JSON nuevos.

**T002 — PUENTE B: macro-operaciones en applyEditorialNotes (server/orchestrator.ts).**
- Nueva fase 0.5 (entre eliminaciones y cirugía local): `applyMacroOperations(project, worldBible, allChapters, worldBibleData, guiaEstilo, instructions)` filtra macros del flujo quirúrgico y las ejecuta en orden:
  1. **global_rename** — Unicode-aware regex `(?<![\p{L}\p{N}_])${escaped}(?![\p{L}\p{N}_])` con flags `gu`. Sin LLM. Aplica a `chapters.content` (con `preEditContent` snapshot), `worldBibles.characters` (name + aliases + description + backstory), `worldBibles.plotOutline.chapterOutlines` (titulo + summary + beats), `worldBibles.timeline`. Refresca BD entre renames consecutivos para que el segundo opere sobre el estado del primero (fix architect: evita pisado).
  2. **regenerate_chapter** — invoca `regenerateSingleChapter` (helper nuevo) que ejecuta ghostwriter con todo el contexto previo + escaleta + instrucción explícita "REGENERACIÓN COMPLETA desde cero". Snapshot `preEditContent` previo. Política de retries: 1 intento + 1 reintento de expansión si quedó <70% del mínimo, manteniendo el mejor borrador entre los dos. Si ambos intentos devuelven 0 palabras, marca el capítulo como `pending` y loguea error (fix architect: no pierde calidad respecto al bucle robusto del flujo principal).
  3. **restructure_arc** — invoca `regenerateOutlineFromChapter` (helper preexistente) y luego regenera secuencialmente todos los capítulos `>= fromChapter`, refrescando entre capítulos para que el siguiente tenga el anterior reescrito como contexto.
- Tras fase 0.5 reconstruye `allSections` in-place si las macros mutaron capítulos/WB (fix architect: el flujo quirúrgico siguiente no opera sobre escaleta obsoleta).
- Si tras macros no quedan instrucciones quirúrgicas, recalcula nota global y sale por la rama "completed" (corte limpio, igual que el camino "solo eliminaciones").

**T003 — PUENTE A: auto-loop holístico tras finalización (server/orchestrator.ts + shared/schema.ts).**
- Nuevo campo `projects.autoHolisticReview` (boolean, default `false`).
- Si está activo, `finalizeCompletedProject` encadena en background `runAutoHolisticReviewLoop(project)`:
  1. `runHolisticReview` (informe del editor profesional).
  2. `parseEditorialNotesOnly` (instrucciones estructuradas + grounding).
  3. Persiste payload `{resumen_general, instrucciones, count, completedAt, source: "auto_holistic"}` en `projects.pendingEditorialParse` (campo ya preexistente).
  4. Emite callback opcional `onAutoReviewReady({count, resumen})` SOLO si la persistencia tuvo éxito (fix architect: evita estado optimista en cliente sin datos en BD).
- Best-effort: cualquier fallo se loguea en `activity_logs` pero el manuscrito ya está marcado `completed`.

**T004 — PUENTE C: checkpoint mid-generación (server/orchestrator.ts + shared/schema.ts).**
- Nuevo campo `projects.midGenCheckpointEvery` (integer, default `0` = desactivado).
- `runMidGenerationCheckpoint(project, currentChapterNumber, worldBibleData)` se invoca tras `runProactiveSemanticScan` en el bucle principal de `generateNovel`. Si `midGenCheckpointEvery > 0` y `currentChapterNumber % N === 0`, ejecuta:
  - **Detección de duplicado**: Jaccard de tokens únicos (≥4 chars, normalizados sin acentos) entre el último cap completado y el anterior. Umbral 0.35.
  - **Drift de nombre del protagonista**: extrae el primer personaje del WB (rol "protagonista|principal" o el primero), cuenta ocurrencias del nombre canónico vs nombres rivales capitalizados (regex `(?<![\p{L}])\p{Lu}[\p{Ll}]{2,14}(?![\p{L}])` con stopwords iniciales filtradas). Avisa si un rival aparece ≥5× y más que el canónico, o si el canónico no aparece nunca en un cap >800 palabras.
- NO usa LLM. NO bloquea la generación. Si encuentra avisos, loguea `warning` en `activity_logs` y emite `onMidGenCheckpoint?.({atChapter, warnings})`. Wrapping best-effort: si todo falla, la generación sigue.

**OrchestratorCallbacks**: añadidos `onAutoReviewReady?` y `onMidGenCheckpoint?` (ambos opcionales — los 12 sitios donde se construye `callbacks` en routes.ts no se ven afectados).

**Validación**: `npm run db:push` aplicado, `npx tsc --noEmit` limpio. Code review architect aplicado: 4 bugs reales detectados (rename no acumulativo, allSections obsoleto, regenerateSingleChapter sin retries, Puente A optimista) corregidos en esta misma sesión.

### Cambio funcional — Aprovechar el 1M de contexto de DeepSeek V4 en el Arquitecto y la Reedición (May 1, 2026)

Cinco mejoras coordinadas para que el Arquitecto y los agentes de reedición usen el 1M de tokens de DeepSeek V4. Pensado para sagas, manuscritos importados largos y autores con catálogo amplio. Coste estimado total ≈ +$0.30–0.90 por novela según cuántas piezas se activen.

**T001 — Series: texto íntegro de volúmenes previos al Arquitecto.**
- Nuevo helper estático `Orchestrator.buildPreviousVolumesFullText(seriesId, currentProjectId, currentSeriesOrder, budget=600_000 chars)` (server/orchestrator.ts L790+). Itera `getProjectsBySeries`, etiqueta cada volumen con `VOLUMEN N: título`, política newest-first dentro y entre volúmenes. Anota el truncamiento si no caben todos.
- Nuevo campo `previousVolumesFullText?: string` en `ArchitectInput` (server/agents/architect.ts L9-48) renderizado como bloque dedicado en `commonContext` (L411+).
- Cableado en 3 sitios: `generateNovel` inicial (~L1142), reintento tras Crítico de Originalidad (~L1357), `extendNovel` (~L5764).

**T002 — Reedición: texto íntegro de capítulos previos del manuscrito.**
- Nuevo helper privado `ReeditOrchestrator.buildPreviousReeditChaptersFullText(projectId, beforeChapterNumber, budget=600_000 chars)` (server/orchestrators/reedit-orchestrator.ts L1497+). Lee `reedit_chapters`, prefiere `editedContent → originalContent`, newest-first, presenta cronológicamente al modelo.
- Nuevo parámetro opcional `previousChaptersFullText?: string` en los 3 agentes principales: `ReeditEditorAgent.reviewChapter`, `ReeditCopyEditorAgent.editChapter`, `NarrativeRewriterAgent.rewriteChapter`. Cada uno lo renderiza como bloque "MANUSCRITO PREVIO COMPLETO" con instrucciones específicas (detectar epítetos/muletillas/metáforas ya usados, mantener voz coherente).
- Cableado en 7 call sites del orquestador de reedición: 1× editor (~L2776), 1× copyeditor (~L3435), 5× narrativeRewriter (~L3280, ~L3863, ~L4129, ~L4519, ~L4767).

**T002bis — Reedición conectada a series (May 1, 2026).** Cuando un proyecto de reedición pertenece a una saga (`reedit_projects.seriesId` + `seriesOrder`), los 3 agentes de reedición ven también el texto íntegro de los volúmenes anteriores de la serie.
- Nuevo parámetro opcional `previousVolumesFullText?: string` añadido a las 3 firmas de agente: `ReeditEditorAgent.reviewChapter`, `ReeditCopyEditorAgent.editChapter`, `NarrativeRewriterAgent.rewriteChapter`. Cada uno renderiza un bloque dedicado "VOLÚMENES ANTERIORES DE LA SERIE" en el USER_PROMPT con instrucciones de coherencia inter-libro (eventos canónicos previos, voz/tono mantenidos, no contradecir la saga).
- Reusa el helper estático ya existente `Orchestrator.buildPreviousVolumesFullText` (presupuesto 600K chars, newest-first dentro y entre volúmenes, etiqueta `VOLUMEN N: título`).
- Nuevo helper de instancia `ReeditOrchestrator.getPreviousVolumesFullTextForReedit(project, budget=600_000)` con cache `Map<projectId, string>` para no releer la saga en cada capítulo. Variante `getPreviousVolumesFullTextForReeditById(projectId, budget)` que carga el `ReeditProject` por id (mismo cache) para call sites que sólo tienen `projectId` a mano.
- **Política de cache resiliente** (post code-review): sólo se cachea el resultado cuando es un estado *confirmado* — standalone sin saga, lista vacía de volúmenes previos confirmada, o texto completo cargado. Los **errores transitorios** (helper o `storage.getReeditProject` lanzan) NO se cachean, así un fallo puntual de DB no desactiva el contexto de la saga para el resto del flujo: el siguiente capítulo lo reintenta automáticamente.
- Cableado en los mismos 7 call sites del flujo de reedición que T002.

**T003 — Re-arquitectura mid-novela (NUEVO).** Permite al usuario rediseñar la trama desde un capítulo concreto basándose en lo realmente escrito.
- Nuevo método `Orchestrator.regenerateOutlineFromChapter(project, fromChapter, instructions?)` (server/orchestrator.ts L6067+). Carga capítulos completados anteriores como `writtenChaptersFullText` (700K chars), lee la escaleta original como referencia, llama al Arquitecto con los nuevos campos `redesignFromChapter` + `redesignInstructions`, mezcla la respuesta: conserva outlines previos a `fromChapter`, reemplaza el resto. Persiste en `worldBibles.plotOutline.chapterOutlines`.
- Nuevo endpoint `POST /api/projects/:id/regenerate-outline` con body `{ fromChapter, instructions? }` (server/routes.ts L1557+). Ejecuta en background, emite evento SSE `outline_regenerated` al completar.
- Nueva UI en `client/src/components/chapter-list.tsx`: por cada capítulo ≥ 2 aparece (en hover) un icono varita mágica que abre un diálogo con textarea de instrucciones opcionales y dispara la mutación. `manuscript.tsx` pasa el nuevo prop `projectId` al componente.

**T004 — Catálogo del pseudónimo (anti-self-repetition).**
- Nuevo método `storage.getProjectsByPseudonym(pseudonymId)` (server/storage.ts L93/L464+).
- Nuevo helper estático `Orchestrator.buildPseudonymCatalog(pseudonymId, currentProjectId, currentSeriesId, budget=80_000 chars)` (server/orchestrator.ts L820+). Para cada novela del mismo pseudónimo (excluyendo la actual y las de la misma serie), incluye título + premisa (1500 chars) + apertura del primer capítulo completado (600 chars).
- Nuevo campo `pseudonymCatalog?: string` en `ArchitectInput` renderizado en `commonContext` con instrucción explícita de NO repetir giros, estructuras ni clímax del catálogo.
- Cableado en los mismos 3 sitios del Arquitecto que T001.

**T005 — Materiales de referencia íntegros (`extendedGuide`).** Antes solo se usaba la guía sintetizada; ahora la guía extendida (otras novelas del autor, fuentes históricas, research) se inyecta literal.
- Nuevo campo `extendedGuideContent?: string` en `ArchitectInput` renderizado como "MATERIALES DE REFERENCIA DEL AUTOR (íntegros)".
- Carga `project.extendedGuideId → extended_guides.content` justo antes del bucle del Arquitecto en `generateNovel` y también en `extendNovel` (~L5794) y `regenerateOutlineFromChapter`.

**Bugfixes pre-existentes corregidos durante esta tanda**:
- `OriginalityCriticAgent.execute()` renombrado a `analyze()` (mismatch de firma); call site único actualizado en orchestrator.ts L1163.
- Bare `return;` con tipo de retorno incompatible en orchestrator.ts L7441 → `return { chaptersProcessed, totalChanges };`.
- Cast `as unknown as AsyncIterable<any>` para el iterador de stream en server/services/chatService.ts L575.

`npx tsc --noEmit` queda limpio. Ningún esquema cambia (no hace falta `db:push`).

### Cambio funcional — El Narrador ahora recibe el texto íntegro de TODOS los capítulos previos (1M de contexto DeepSeek V4) (May 1, 2026)
Antes, el Ghostwriter solo veía un resumen sintético de capítulos previos (`previousContinuity`) más el texto completo del capítulo inmediatamente anterior (`previousChapterContent`). Esto causaba errores de coherencia cuando se referían a hechos, frases dichas, gestos o detalles concretos de capítulos antiguos (ej: cap 12 contradiciendo algo del cap 4). Ahora aprovechamos los 1M de tokens de contexto de DeepSeek V4-Flash/Pro para pasarle al Narrador el contenido literal de todos los capítulos previos completados, ordenados narrativamente (Prólogo → Cap 1 → … → Epílogo → Nota del autor).

Cambios:
- **`server/agents/ghostwriter.ts`**: nuevo campo opcional `previousChaptersFullText?: string` en `GhostwriterInput`. Se inserta en el prompt justo después de `previousContinuity` y antes del bloque de tarea concreta (las constraints de continuidad siguen al inicio).
- **`server/orchestrator.ts`**: nuevo helper público y estático `Orchestrator.buildPreviousChaptersFullText(chapters, currentChapterNumber, budgetTokens=700_000)`. Filtra `status === "completed"`, excluye el capítulo actual usando orden narrativo (Prólogo=-1000, Epílogo=1M, Nota autor=1M+1), etiqueta cada bloque con `getChapterLabel`, prioriza `editedContent → originalContent → content`. Cuando se excede el presupuesto de tokens (estimado a chars/4, conservador para BPE en español), conserva los más recientes y reemplaza los más antiguos por un placeholder breve.
- **5 sitios automáticos cableados**: `generateNovel` (~L1419), `resumeNovel` (~L2113, recarga del storage UNA vez por capítulo, no por intento de refinamiento), `extend` (~L5757), regeneración de capítulos truncados (~L6078), `rewriteChapterForQA` + retry (~L8868, computado una vez fuera del bucle).
- **3 endpoints manuales en `server/routes.ts` cableados**: `POST /api/projects/:id/regenerate-chapter` (~L1788), `POST /api/projects/:projectId/chapters/:chapterNumber/rewrite` ("Mejorar con instrucciones", ~L4691), `POST /api/series/:seriesId/structural-rewrite` (~L5615; pre-carga capítulos del proyecto una vez antes del bucle, solo aplica cuando `volumeType` no es `reedit`/`imported` por usar esquemas distintos).
- **Coexiste con los mecanismos existentes**: el sliding window de constraints derivadas del `continuityState` sigue al principio del prompt (alta prioridad), el resumen `previousContinuity` se mantiene, y `previousChapterContent` sigue funcionando para `rewriteChapterForQA` (cirugía surgical) — el helper excluye automáticamente el capítulo actual del bloque para evitar conflicto semántico.
- **Coste**: estimado +$0.85 por novela de 30 capítulos (DeepSeek V4-Flash a $0.14/M input). Sin toggle por irrelevante frente a la mejora de coherencia.

### Cambio funcional — La pestaña "Estilo de Pseudónimo" del Taller de Guías ahora INVENTA novelas (May 1, 2026)
Antes, esa pestaña generaba otra guía de estilo del seudónimo (algo redundante si ya tenía una). Ahora cambia de propósito: el usuario solo elige el seudónimo y los parámetros del proyecto (capítulos, palabras/cap, prólogo/epílogo/nota, KU), y la IA inventa una novela original COMPLETA cuya idea, voz y tratamiento son apropiados para ese seudónimo, leyendo su(s) guía(s) de estilo activa(s). Tras generar la guía, se crea automáticamente el proyecto vinculado al seudónimo (igual que hacía "Guía por Idea"). Tab renombrado a "Novela para Pseudónimo".

Cambios:
- **`server/agents/style-guide-generator.ts`**: nuevos campos opcionales (`chapterCountHint`, `hasPrologue`, `hasEpilogue`, `hasAuthorNote`); reescrito el case `pseudonym_style` del system prompt para pedir invención de novela original (premisa, género/subgénero, voz, estructura, personajes, plan capítulo a capítulo, época histórica obligatoria, reglas de escritura, escena modelo); el contenido empieza obligatoriamente por `TÍTULO DE LA NOVELA: ...` y el agente lo extrae con regex robusta (tolera markdown `#`, `**...**`, `- `, comillas `«»"'`); fallback a `Novela original para {pseudonymName}` si la extracción falla.
- **`server/routes.ts`**: `pseudonym_style` ahora pertenece a la rama `isProjectCreatingGuide` junto con `idea_writing` y `series_writing` (crea `extended_guide` + `project`); hidrata `params` con `bio`/`defaultGenre`/`defaultTone` del seudónimo si no llegan del cliente; auto-vincula la primera guía de estilo activa del seudónimo al proyecto creado (`validatedStyleGuideId`); el `premise` del proyecto queda como "Novela original generada para el pseudónimo X — premisa completa en la guía extendida"; `genre`/`tone` del proyecto caen al default del seudónimo antes que a `fantasy`/`dramatic`.
- **Endpoint `/api/guides/:id/apply-to-pseudonym`**: ahora solo acepta `author_style` (antes aceptaba también `pseudonym_style`, que ya no es una guía de estilo). Frontend coherente: el botón "aplicar a pseudónimo" en la librería de guías se oculta para todo lo que no sea `author_style`. **Nota de compatibilidad**: las guías legadas con `guideType='pseudonym_style'` (que SÍ eran guías de estilo) ya no se pueden aplicar por endpoint. Si quieres reutilizarlas, descárgalas como `.md` y crea la `style_guide` manualmente desde la sección de seudónimos.
- **`client/src/pages/guides.tsx`**: `PseudonymStyleForm` reescrito. Selecciona seudónimo, muestra bio/género/tono y guías de estilo activas (con warning ámbar si no hay ninguna), añade los mismos parámetros de proyecto que `IdeaWritingForm` (título opcional, capítulos, min/max palabras, prólogo/epílogo/nota, KU). Banner explicativo arriba para que quede claro que la IA inventa la idea. Botón: "Generar Guía de Novela y Crear Proyecto".

### Hotfix #8 — Prevenir que el Narrador abra capítulos con su propia cabecera meta-referencial (Apr 30, 2026)
El usuario reportó que en los caps 9-13 de su novela, la primera línea del texto narrativo era una repetición meta-referencial de la cabecera del capítulo (ej: «—Capítulo 9: La confesión en la gasolinera», «—**Capítulo 13: La decisión de Iona**»), rompiendo la inmersión. Su petición textual: «se trata de evitar que eso pueda suceder» (no arreglar los datos existentes — eso lo haría él con un script SQL aparte —, sino impedir que el sistema vuelva a generarlo).

Defensa en dos capas:

- **(1) Refuerzo en el SYSTEM_PROMPT del `GhostwriterAgent`** (regla 2 NARRATIVA DIEGÉTICA PURA): añadido párrafo explícito «PROHIBIDO ABSOLUTO REPETIR LA CABECERA DEL CAPÍTULO DENTRO DE LA PROSA» con ejemplos literales de los caps que fallaron y aclaración de que el sistema ya añade el título por su cuenta. Lista las variantes prohibidas (con/sin guion largo, con/sin asteriscos markdown, con/sin acento, prólogo/epílogo/parte/nota del autor).

- **(2) Saneamiento defensivo en código:** nuevo helper `stripChapterHeaderFromOpening(text)` en `server/agents/ghostwriter.ts`, llamado desde **TODAS** las salidas de `extractContinuityState` (camino normal, camino sin separador `---CONTINUITY_STATE---`, y camino de fallback con texto vacío tras separador). La regex está diseñada para ser estricta (evitar falsos positivos en prosa legítima):
  - Casa solo cuando hay `Capítulo|Cap.` + número arábigo o romano + separador (`:` `.` `-` `—`).
  - Casa `Parte` + número/romano/ordinal + separador.
  - Casa `Prólogo|Epílogo|Nota del/de autor` + separador OBLIGATORIO.
  - **NO** mata «—Capítulo cerrado, no hay vuelta atrás» (diálogo legítimo, sin número), «Prólogo de Vasco al diario…» (prosa legítima, sin separador), «Parte del problema era…» (prosa).
  - Anclada a `^` → solo afecta la primera línea, NO toca menciones legítimas a «Capítulo X» en mitad del texto.
  - Loggea warning «Sanitized meta-header from chapter opening» cuando dispara, para que se vea en la actividad cuando el modelo se cuela.

Verificación con tests manuales: 9 casos positivos de cabecera (guion, asteriscos, `Cap.`, romanos, prólogo, epílogo, nota, parte) → todos eliminados; 4 casos negativos de prosa legítima → todos preservados.

### Hotfix #7 — Traducir notas estructurales en instrucciones factibles en lugar de cancelarlas (Apr 30, 2026)
El usuario, sobre el Hotfix #6: «pero entonces lo lógico es que de instrucciones que si sean factibles». Tenía razón: cancelar la nota cuando es estructural arregla el daño pero pierde la intención editorial. Si la nota dice «borrar Cap 8 y fusionar contenido en Cap 10», hay una parte 100% factible (integrar los eventos clave del Cap 8 al final del Cap 10 reescribiendo prosa) y otra que NO lo es por seguridad (eliminar el Cap 8, que es destructiva). El sistema debe hacer la primera y dejar la segunda explícitamente pendiente de tu confirmación.

- **Nuevo agente** `StructuralInstructionTranslatorAgent` (`server/agents/structural-instruction-translator.ts`): recibe la nota original + razón del cirujano + lista de capítulos disponibles (con título, wordCount y resumen de 300 chars), y devuelve un plan estructurado con (a) `feasibleParts[]`: instrucciones de PROSA aplicables a capítulos concretos, (b) `pendingAdministrativeActions[]`: operaciones destructivas que requieren confirmación humana (`delete_chapter`, `merge_chapters`, `split_chapter`, `swap_chapters`, `reorder_chapters`, `move_content`), (c) `unfeasible` + razón si la nota no es traducible. El agente sanea la salida filtrando chapterNumbers que no existen en el proyecto.
- **Cambio en `rewriteChapterForQA` (server/orchestrator.ts):** el bloque del Hotfix #6 ya no cancela inmediatamente. Ahora:
  1. Llama al Traductor para descomponer la nota.
  2. Para cada `feasiblePart`, reinvoca recursivamente la cirugía sobre el capítulo destino correcto con la instrucción reformulada (con el depth correspondiente para evitar bucles), tomando snapshot del contenido antes/después y solo contabilizando el capítulo como modificado si **realmente cambió** (evita inflar el contador y saltar capítulos que no se tocaron).
  3. Para cada `pendingAdministrativeAction`, emite log warning estructurado «ACCIÓN PENDIENTE DE CONFIRMACIÓN — operación X sobre Cap Y» — **NUNCA** se ejecutan automáticamente operaciones destructivas (deuda conocida: hoy estas pendientes solo viven en logs; está pendiente persistirlas en estado estructurado y exponerlas con UI de confirmación dedicada).
  4. Libera el capítulo actual como completed sin tocar su contenido (la nota era para otros capítulos).
  5. Si el Traductor falla o devuelve `unfeasible`, cae al fallback del Hotfix #6 (cancelación con mensaje claro).
- **Guarda anti-destructiva (`isDestructiveProseInstruction`):** rechaza `feasibleParts` cuya prosa derive en vaciar el capítulo (patrones tipo «vacía completamente», «elimina todo el contenido», «deja el capítulo en blanco», etc.) — si el modelo cuela una destructiva como prosa, se reconvierte en pendiente administrativa en lugar de aplicarse.
- **Profundidad recursiva separada en dos contadores** (`_mismatchRerouteDepth` y `_structuralTranslateDepth`) para permitir la cadena legítima «mismatch (Hotfix #5) → traducción estructural (Hotfix #7)» en el cap correcto, sin abrir bucles del mismo tipo.
- **Cambio de contrato:** `rewriteChapterForQA` retorna `{reroutedTo?: number[]}` (array, no número) para soportar múltiples capítulos modificados por una sola traducción. `applyEditorialNotes` itera el array al sumar `reroutedTargets`.
- **Resultado:** una nota como «borrar Cap 8 y fusionar en Cap 10» ahora aplica la integración de prosa al Cap 10 automáticamente y deja registrada la eliminación del Cap 8 como acción pendiente que tú debes confirmar manualmente. Cero daño a capítulos sanos, máxima utilidad de la nota original.

### Hotfix #6 — Notas estructurales (eliminar/fusionar/dividir capítulos) caían al Narrador y dañaban capítulos sanos (Apr 30, 2026)
El usuario reportó: «el Capítulo 8: cirugía no aplicable (La instrucción ordena eliminar el capítulo 8 como entidad independiente y fusionar su contenido en el capítulo 10. Esto constituye una reestructuración global del manuscrito (borrado de un capítulo completo), no una corrección puntual localizable... Cayendo a reescritura completa con Narrador.» El Narrador luego fallaba el QA (7/10) y se conservaba el original. Resultado: la nota se perdía, se gastaban tokens, y el usuario no entendía qué había pasado.

Causa raíz: las notas que piden operaciones ESTRUCTURALES del manuscrito (eliminar capítulo, fusionar capítulos, dividir, mover contenido entre capítulos, reordenar, renumerar, convertir capítulo en sección, etc.) están fuera del alcance del cirujano (que es find/replace localizado) **y también del Narrador** (que reescribe UN capítulo en aislamiento — no puede eliminar el capítulo donde vive ni fusionarlo con otro). El cirujano las rechaza correctamente con un mensaje claro, pero el orquestador caía al Narrador como fallback genérico, que intentaba "cumplir" una orden imposible y producía o un fallo de QA o un capítulo degradado.

- **Fix:** nuevo helper `isStructuralRestructureInstruction(surgeonReason)` en `server/orchestrator.ts` que detecta el patrón en el mensaje del cirujano. Cubre: eliminar/borrar/suprimir capítulo, fusionar/unir/combinar/consolidar capítulos, mover/trasladar/extraer contenido entre capítulos, dividir/partir capítulo en N partes/capítulos/secciones-independientes (acotado para NO disparar con "dividir en párrafos/escenas" que sí es texto), convertir/rebajar capítulo en sección/escena, reordenar/renumerar capítulos, insertar/intercalar capítulo nuevo, "reestructuración global/estructural", "edición estructural", "no es una corrección puntual/localizable". Cuando dispara: cancela el fallback al Narrador, marca el capítulo como completed sin tocarlo, y emite log warning explicando al usuario que debe usar el chat editorial (que sí puede aplicar cambios estructurales) o ajustar el plan/manuscrito manualmente.
- **Posición de la guarda:** entre `isInstructionForOtherChapter` (mismatch de capítulo, intenta reenrutar primero — Hotfix #5) y `isInstructionStaleOrAlreadySatisfied`. Así, una nota mal enrutada que además es estructural se reenruta primero al cap correcto y allí también se cancela limpiamente, en lugar de cancelarse en el cap equivocado sin reenrutar.
- **Resultado:** notas estructurales ya no degradan capítulos sanos; el usuario recibe un mensaje claro indicando que debe usar el flujo correcto (chat editorial o ajuste manual del plan).

### Hotfix #5 — Notas editoriales mal enrutadas reescribían el capítulo equivocado (Apr 30, 2026)
El usuario reportó casos como: «el Capítulo 6: cirugía no aplicable (la instrucción solicita añadir una frase de cierre para Cristian Vallés en el Capítulo -1 (Epílogo), pero el texto proporcionado para este análisis es únicamente el Capítulo 6). Cayendo a reescritura completa con Narrador.»

Causa raíz: el parser editorial (LLM) a veces pone mal el campo `capitulos_afectados` de una instrucción — la nota literal dice claramente "en el Epílogo" pero la instrucción se etiqueta para el Cap 6. Cuando llega al cirujano, este detecta el mismatch correctamente y devuelve `not_applicable_reason` explicándolo. Pero el orquestador en `rewriteChapterForQA` (server/orchestrator.ts) caía de inmediato al fallback de reescritura completa con el Narrador — **reescribiendo un capítulo sano por una nota que no era para él**. Doble daño: el cap se modificaba sin propósito y la nota nunca llegaba a su destino real.

- **Fix #5a (turno anterior, ya commited):** añadida guarda `isInstructionForOtherChapter(reason, currentChapterNumber)` que detecta el patrón en el mensaje del cirujano (frases tipo "no dispongo del texto" / "se proporcionó únicamente el cap X" combinadas con mención a otra sección — Epílogo, Prólogo, Nota del autor o número distinto). Si dispara, cancela la reescritura.
- **Fix #5b (este turno):** cancelar no era suficiente — la nota debe aplicarse al capítulo correcto. Añadido helper `detectInstructionTargetChapter(reason, currentChapterNumber)` que extrae el destino real del mensaje del cirujano (devuelve número de capítulo, -1 para epílogo, 0 para prólogo, -2 para nota del autor, o `null` si no logra identificarlo). `rewriteChapterForQA` ahora acepta un parámetro opcional `_rerouteDepth` (default 0): cuando dispara la guarda y el target es identificable, busca el capítulo correcto en BD, libera el actual sin tocarlo, y reinvoca la cirugía sobre el destino real con `_rerouteDepth=1` (bloquea cadenas de reenrutado para evitar bucles). Si el target no se puede determinar, no existe en el proyecto, o ya hubo un reenrutado previo, cae al comportamiento del Fix #5a (cancelación con mensaje al usuario).
- **Fix #5c (este turno, contabilidad correcta):** tras revisión, se detectó que cuando ocurría reenrutado, `applyEditorialNotes` contaba mal: el chapter original (no tocado) se sumaba a `revertedCount` como falso positivo, el target reenrutado nunca se sumaba a `appliedCount`, y por tanto el recálculo de la puntuación global no se relanzaba aunque sí hubo cambios reales. `rewriteChapterForQA` ahora retorna `{ reroutedTo?: number } | void` indicando el capítulo modificado por reenrutado; `applyEditorialNotes` mantiene un `Set<number> reroutedTargets` que (1) se suma al final a `appliedCount`, (2) hace que el bucle salte al target si también estaba en cola (evita doble proceso), y (3) emite log `info` "Reenrutado automático: X nota(s) editorial(es) se aplicaron al capítulo correcto" para visibilidad del usuario.
- **Resultado:** una nota mal etiquetada por el parser ahora se aplica donde debe (ej. al Epílogo en lugar de al Cap 6), sin tocar el capítulo equivocado, sin gastar tokens en una reescritura destructiva, con contabilidad correcta y con el recálculo de puntuación global ejecutándose como debe.

### Hotfix #4 — Lectores no reconocían el epílogo (Apr 30, 2026)
El usuario reportó: «los lectores no están tomando el capítulo -1 como epílogo». Causa raíz dual en `server/agents/beta-reader.ts` y `server/agents/holistic-reviewer.ts` (los dos únicos lectores que aún no se habían alineado con el patrón canónico que ya seguían `continuity-sentinel`, `semantic-repetition-detector`, `voice-rhythm-auditor` y `final-reviewer`):
1. **Etiqueta cruda:** ambos agentes renderizaban el capítulo al modelo como `## CAPÍTULO -1: ...`. El LLM veía un número negativo sin contexto y lo trataba como un capítulo cualquiera (o lo ignoraba), no como epílogo. Igual problema con `0` (prólogo) y `-2` (nota del autor).
2. **Orden roto:** el sort era `(a, b) => a.numero - b.numero`, lo que ordenaba `-2, -1, 0, 1, 2…`, colocando epílogo y nota del autor **antes** del prólogo en el manuscrito que el modelo leía. Doblemente confuso.
- **Fix:** añadidos helpers locales `getChapterLabel(num)` (devuelve `PRÓLOGO`/`EPÍLOGO`/`NOTA DEL AUTOR`/`CAPÍTULO N`, soporta también códigos legacy `998`/`999`) y `getChapterSortOrder(num)` (prólogo `-1000`, capítulos positivos por su número, epílogo `1_000_000`, nota del autor `1_000_001`). Ambos blindados con `Number()` + `Number.isFinite` por si llega un `numero` no numérico desde algún call site futuro.
- **Prompts:** ambos `SYSTEM_PROMPT` ahora indican explícitamente al modelo que use literales `(prólogo)`, `(epílogo)`, `(nota del autor)` en sus referencias en lugar de `(cap N)`. El `holistic-reviewer` recibe además 3 viñetas con criterios concretos para evaluar prólogo, epílogo y nota del autor (qué juzgar y cómo cualificarlo).
- **Verificado:** `loadFullNovelContext` → `storage.getChaptersByProject` no filtra por número, así que las secciones especiales sí llegan a los lectores; el bug era 100% de presentación al LLM, no de pipeline.

### Hotfix #3 — CONTINUITY_STATE leak in editorial-driven rewrites (Apr 30, 2026)
After Hotfix #2 the user reported that some chapter rewrites visibly contained the internal `---CONTINUITY_STATE---{...}` JSON block appended to the chapter text (real example: chapter mentioning Julián / Elena / Abreu / Cárceles / Valerio's croquis / posada "El Mendigo que no Pide" had the metadata pegado al final). Root cause: `Orchestrator.rewriteChapterForQA` (`server/orchestrator.ts` ~L7996) — the path used by `applyEditorialNotes` for estructural rewrites and by Continuity / Voice / Semantic QA — called `this.ghostwriter.execute(...)` and persisted `writerResult.content` directly. Every other Ghostwriter call site in the orchestrator (L1309, L1987, L5567, L5884) already invoked `extractContinuityState` first; this single function did not.
- Fix: after both Ghostwriter calls (initial L8269 + length-retry L8312), `extractContinuityState` is now invoked and `writerResult.content` is replaced with `cleanContent` BEFORE length checks, editor verification, copyeditor polish and persistence. Length checks now count only real prose (no JSON noise → fewer false out-of-range rejections).
- Defensive saneo final justo antes de `storage.updateChapter`: si por cualquier razón `finalContent` aún contuviera el separador (p. ej. el copyeditor lo dejara pasar), se vuelve a limpiar.
- Bonus de paridad: `chapter.continuityState` ahora se persiste con el estado extraído del Narrador (`extractedContinuityState ?? originalContinuityState`). Antes esta función descartaba el estado nuevo (`void originalContinuityState`), por lo que los capítulos siguientes podían arrancar con continuidad obsoleta tras una nota editorial.
- No se tocó `server/routes.ts` L5651 (`/structural-rewrite`): usa el contrato antiguo `result.result?.prose` que el Narrador actual no devuelve, por lo que ese endpoint ya falla silenciosamente y no escribe ni filtra nada — no es la fuente del bug del usuario. Queda como deuda separada.

### v6.8 — Editorial-Driven Chapter Deletion (Apr 30, 2026)
The two-step editorial-notes flow could already rewrite chapters surgically (puntual) and reorganise content across multiple chapters (estructural), but the only way to **delete** a chapter was the manual "Eliminar capítulo" button — disconnected from the editorial-notes pipeline. If the Beta-Reader, Holistic Reviewer or a human editor wrote "el capítulo 7 es relleno, elimínalo", the system parsed it as an estructural rewrite and tried to condense rather than remove, wasting tokens. v6.8 closes this gap so the system is fully autosuficiente: the same notes pipeline can now propose deletions, the user confirms once, and the orchestrator handles renumbering/world-bible/timeline updates atomically.

- **Parser** (`server/agents/editorial-notes-parser.ts`):
  - `EditorialInstruction.tipo` extended with `"eliminar"` (was `"puntual" | "estructural"`).
  - System prompt rules #10 + #11: tipo "eliminar" only when notes use unequivocal `elimina/borra/quita/suprime` against a specific chapter; "condensa/recorta/abrevia" remain estructural rewrites.
  - Refiner second-pass rule #4: validates the chapter is truly prescindible (no plot beats land elsewhere). If risky, the refiner downgrades to `tipo: "estructural"` with a "condense" plan instead — defence in depth so a hallucinated delete doesn't reach the orchestrator.
- **Orchestrator** (`server/orchestrator.ts`):
  - New `applyChapterDeletions(project, worldBible, allChapters, deletionInstructions, otherInstructions)` (~L4249):
    1. Dedupes target chapter numbers, refuses to touch specials (prologue=0/epilogue=-1/author_note=-2), keeps ≥1 positive chapter alive.
    2. Deletes via `storage.deleteChapter` (cascade auto-cleans `thoughtLogs.chapterId`).
    3. Renumbers surviving positives in **two passes** with `SHIFT_BASE = 10000` to avoid UNIQUE-constraint collisions on `(projectId, chapterNumber)`.
    4. Updates `worldBible.plotOutline.chapterOutlines` and `worldBible.timeline[].chapter` to the new numbering.
    5. Remaps the remaining (non-deletion) instructions' `capitulos_afectados` and `plan_por_capitulo` keys so the downstream loop operates on the new numbering.
    6. Logs warnings about audiobookChapters (NOT renumbered — historical audio assets stay tied to the original number; user is told).
    7. `aiUsageEvents.chapterNumber` also kept historical (audit trail).
  - New `recalculateFinalScoreAfterEdits(project, worldBibleData, guiaEstilo, previousFinalScore)` (~L4527): extracted from the previously-inline post-editorial recalc block so the deletion-only fast path can reuse it.
  - `applyEditorialNotes` gains a **Phase 0** (~L4626) right after instructions are obtained: splits `deletionInstructions` from the rest, calls `applyChapterDeletions`, refreshes `allChapters`/`allSections`/`worldBible`, and if no rewrites remain it short-circuits to `recalculateFinalScoreAfterEdits` + `status: "completed"`. The downstream byChapter loop is unchanged because `instructions` is reassigned to `nonDeletionInstructions` before reaching it.
  - The previously-inline final-review recalc block (~L5106) is replaced by a single call to `recalculateFinalScoreAfterEdits` — same behaviour, no duplication.
- **Frontend** (`client/src/pages/dashboard.tsx`):
  - `EditorialInstructionPreview` type adds `tipo?: "puntual" | "estructural" | "eliminar"`.
  - Each instruction card with `tipo === "eliminar"` renders with a 2-px red border, red Trash2 "Eliminar" badge, red title text, 🗑️ glyph instead of ✏️, and an inline warning "Acción irreversible: el capítulo se borra y los posteriores se renumeran". The "ARCO" purple badge and the per-chapter plan accordion are suppressed for deletions (irrelevant).
  - The "Aplicar" button counts deletions in the selected set: if any are present it turns red, switches the icon to Trash2, and displays "Aplicar N (incluye borrar K cap.)". Clicking it does **not** fire the mutation directly — it opens an `AlertDialog` listing every deletion (chapter numbers + reviewer description) and four explicit warnings (irreversible / renumbering cascades / audiobook desync / cannot undo from UI). Only after "Sí, eliminar y aplicar el resto" does the mutation fire.
  - New `pendingEditorialApply` state holds `{ selected, deletions }` while the AlertDialog is open; cancel resets it without mutating anything.
- **Cost / failure modes**:
  - Deletion phase costs 0 tokens (pure DB work). The post-editorial Final Reviewer pass remains, so a deletion-only batch still consumes one final-review call to produce the new score delta — same cost as before.
  - If the user deletes every positive chapter at once (e.g. selects "borra todos los capítulos"), the safeguard keeps the lowest-numbered positive chapter and logs a warning rather than leaving the project with zero chapters.
  - Existing audiobook files keep their original chapter number embedded in metadata; the user is warned and must regenerate audio if the order matters to them.

#### v6.8 hotfix: parser dropping holistic/beta notes as "non-actionable" (Apr 30, 2026)
After v6.8 shipped, the user reported the editorial-notes flow returning **0 instructions** when fed prose-style notes from the Holistic Reviewer or Beta Reader (Spanish narrative critiques like "el segundo acto pierde fuerza", "el desenlace se siente apresurado"). Root cause: parser rule #4 was strict — *"Si NO puedes determinar capítulos concretos para un problema, OMÍTELO de la salida"* — silently dropping any structural critique without an explicit chapter number. Holistic/Beta outputs are paragraphs of qualitative observations, so 100% got dropped.

- **Parser rule rewrite** (`server/agents/editorial-notes-parser.ts` rules #3-#4): now includes explicit narrative-structure-to-chapter-range inference (apertura→cap 1, primer acto→primer tercio, segundo acto→tercio medio, tercer acto→último tercio, clímax→últimos antes del epílogo, desenlace→últimos 2-3 + epílogo, etc.) and forbids omission for any criticism of the manuscript. If a critique is genuinely transversal ("la prosa abusa de adjetivos"), the parser now assigns `capitulos_afectados` to ALL positive chapters of the index — the user can deselect in the preview.
- **Diagnostic activity logs** (`server/orchestrator.ts` `parseEditorialNotesOnly` ~L4010): when `refinedInstructions.length === 0`, the orchestrator now writes a `warning`-level activity log distinguishing case (a) — parser produced zero drafts → notes were probably non-imperative — from case (b) — parser produced N drafts but the refiner discarded all of them on canon/text grounding → the user gets a concrete suggestion (cite literal text, check chapter exists, write imperatives with chapter number) plus the resumen_general the parser detected.
- **Toast rewrite** (`client/src/pages/dashboard.tsx` `applyEditorialParsePayload` ~L450): the empty-result toast now shows the resumen_general the analyst extracted plus an example of how to phrase a note imperatively, instead of the previous one-line dismissive message. Duration extended to 12s so the user has time to read.

Tradeoff: the inference rules in #3 may produce **false positives** for transversal critiques (the LLM can now bind "la prosa es plana" to all chapters, generating a global pseudo-instruction). Two mitigations: (1) the user always has the preview-with-checkboxes step before anything is applied, so global instructions can be deselected; (2) the per-chapter byChapter loop in `applyEditorialNotes` was already designed to handle one-instruction-per-many-chapters efficiently. False negatives (silent drops) are worse for trust than false positives (visible noise the user can filter), so the asymmetry favors recall over precision at this step.

#### v6.8 hotfix #2: Cloudflare killing SSE during long parses → indefinite spinner (Apr 30, 2026)
User reported "se queda colgado indefinidamente, sobre todo cuando es extenso el comentario del editor". The HTTP 202 + SSE pattern introduced in v6.7 to dodge the Cloudflare 524 timeout was incomplete: the project's main SSE endpoint had **no heartbeat**, so Cloudflare closed the channel after ~100s of inactivity. The parse takes 2-3 minutes of LLM reasoning without emitting any intermediate event, so when `editorial_parse_complete` finally fired it went to a dead stream. Even worse, there was no recovery — once the event was lost, there was no way to retrieve the result.

- **Heartbeat in `GET /api/projects/:id/stream`** (`server/routes.ts` ~L1841): emits `: heartbeat\n\n` every 15s while the connection is open, cleared on `req.on("close")`. Also adds `X-Accel-Buffering: no` header to disable proxy buffering that otherwise eats events until a chunk fills.
- **Persistence to DB** (`shared/schema.ts` `projects.pendingEditorialParse` jsonb): the parse result is now written to the project row when the background task completes, so the client can recover it via polling even if the SSE died. Cleared (a) at the start of each new parse, (b) when the client consumes it via `?consume=true`.
- **`GET /api/projects/:id/pending-editorial-parse`** (`server/routes.ts` ~L1192): returns `{ payload }` and optionally clears the field with `?consume=true`. One-shot retrieval.
- **Polling fallback in client** (`client/src/pages/dashboard.tsx` `startEditorialPolling`, ~L509): on `parseEditorialNotesMutation.onMutate` the client starts polling every 8s. If SSE delivers first, a `editorialPayloadConsumedRef` boolean ref cancels the poll; if SSE never arrives, the poll picks the result from DB. 10-minute hard timeout that releases `isParsingEditorial` and shows a "tardando demasiado" toast so the spinner can never be infinite again.
- **Recovery on-mount** (`client/src/pages/dashboard.tsx` SSE useEffect, ~L785): when the dashboard mounts on a project that has an unconsumed `pendingEditorialParse`, fetch it and apply (covers page reloads mid-parse). Wrapped in `AbortController` so switching projects fast doesn't apply a stale payload onto the new dashboard.

Tradeoff knowingly accepted: the same protection is **not yet** wired into `holistic-review` and `beta-review` (which take 3-5 minutes and are even more vulnerable). The new heartbeat alone protects them in 90% of cases; if the user reports they still hang after this fix, the same pattern (persistence column + GET endpoint + client polling) can be replicated. Decision: ship the parse fix first since that was the reported failure, monitor the other two flows.

### v6.7 — DeepSeek V4-Flash Migration (Apr 2026)

#### Final Review Robustness — three bug fixes (Apr 30, 2026)
Triggered by analysis of an 803-line generation log ("Cenizas de Terciopelo Copia") that showed 4-hour, 7-cycle generations ending unapproved due to systemic agent issues:

1. **WB Arbiter parser hardening** (`server/agents/world-bible-arbiter.ts` L165-225): the previous parser required both `wb_patches` AND `resolved_issue_indices` to be arrays in the model's response, which silently rejected most valid responses (~20 fallback events per generation). Rewritten to require only `wb_patches` array; `resolved_issue_indices` and `unresolved_issue_indices` are derived from the patches when missing. On parse failure, the rejection reason and a 300-char snippet of the raw response are now logged, eliminating the "Parser fallback" black-box behaviour.
2. **Final Reviewer anti-POV-conversion prompt** (`server/agents/final-reviewer.ts` L417-435): added an explicit prohibition section forbidding chapter-wide POV conversions (3rd↔1st person, narrator type, tense). The reviewer was repeatedly requesting whole-chapter rewrites (caps 4, 9, 10, 13, 15 in one log), which the surgical patcher correctly rejects as structural; legitimate intra-chapter POV slips are still allowed but as `severidad: "menor"` issues with a literal ≤25-word quote.
3. **Defensive filters in orchestrator** (`server/orchestrator.ts` L3055-3170, in `runFinalReview`): two new filters run before the existing `HIGH_FP_CATEGORIES` filter:
   - **Anti-POV filter**: regex-based detection of global POV-conversion requests in `instrucciones_correccion` / `descripcion`; matched issues are dropped with a warning activity log. Defence-in-depth in case the prompt change is bypassed.
   - **Anti-hallucination filter**: extracts double-quoted fragments from the issue, normalises (lowercase + collapsed whitespace), and verifies that EVERY auditable quote (≥30 chars / ~6 words) appears literally in at least one of the affected chapters' content. Issues with any fabricated long quote are dropped (uses `.every()`, not `.some()`, so a real-quote-plus-fake-quote combo cannot bypass the filter). Short quotes (<30 chars) are not auditable and pass automatically. Categories `arco_incompleto`, `capitulo_huerfano`, `tension_insuficiente`, `hook_debil` are exempt because they may legitimately describe absence rather than cite text.

#### Phase 1 — Narrative Voice Injection (Apr 30, 2026)
Root cause of repeated POV mismatches: the style guide is a single `text` blob (no structured `pov` field), buried among thousands of tokens of world bible / extended guide content; no agent system prompt explicitly mentions "POV" or "narrative persona". Result: writers ignore explicit duals/first-person directives.

- **New `server/utils/style-directives.ts`**: pure regex extractor for Spanish style guides. Detects POV (`first` / `third` / `dual_first` / `dual_third`), narrator type (omnisciente/limitado/testigo), tense (present/past), and named POV characters (patterns: `POV de X`, `perspectiva de X`, `punto de vista de X`). Includes a **negation guard** (rejects matches preceded within ~25 chars by `evitar`/`prohibido`/`no usar`/`nunca`/`sin`/`jamás`) so a guide saying "evitar narración dual" doesn't activate dual=true. Filters pronouns (`él`/`ella`) from name extraction. Conservative philosophy: returns `detected: false` if confidence is low → no injection happens.
- Three builders produce a highlighted `INVIOLABLE NARRATIVE VOICE` block prepended to each agent's prompt:
  - `buildArchitectDirectiveBlock` — adds rule to mark POV in chapter titles when dual.
  - `buildGhostwriterDirectiveBlock` — strict prose-writing directive.
  - `buildFinalReviewerDirectiveBlock` — tells reviewer how to report POV deviations (CRITICAL "trama" issue if global mismatch, MAYOR + observation to regenerate manually if chapter-specific; never request surgical chapter rewrites).
- **Wiring**: each agent calls the extractor internally on its own `guiaEstilo` input (Ghostwriter additionally concatenates `extendedGuideContent`). Zero changes to the 13 orchestrator call sites.
  - `architect.ts` (L3 + L341-345): prepended to `commonContext`.
  - `ghostwriter.ts` (L2 + L717-723): prepended before `worldBibleFormatted`.
  - `final-reviewer.ts` (L2 + L676-681): prepended before TÍTULO line.
- **Orchestrator log enrichment** (`orchestrator.ts` L3062-3107): the anti-POV filter now extracts the canonical voice and includes it in both the console log and the activity log. When an issue is dropped, the user sees e.g. "Voz canónica del proyecto según la guía: PRIMERA PERSONA con NARRACIÓN DUAL (alternando entre Dante y Elena). Si los capítulos NO están en esta voz, deberás regenerarlos manualmente — la cirugía no puede convertir capítulos enteros." → distinguishes spurious reviewer hallucinations from real upstream drift.
- **Phase 2 (not implemented)**: would require schema with per-chapter `pov` field plus a regeneration pipeline. Phase 1 prevents the bug at the source by ensuring agents see the directive at the top of every prompt.

#### Cloudflare 524 fix on `parse-editorial-notes` (Apr 30, 2026)
The `POST /api/projects/:id/parse-editorial-notes` endpoint was synchronous: it awaited two consecutive AI calls with reasoning enabled (`editorialNotesParser.execute` + `groundEditorialInstructions` second-pass anchoring) before responding. With long notes or many chapters this routinely exceeded 100s, triggering Cloudflare's 524 timeout and showing the user an error page even though the parse succeeded server-side.

- **Backend** (`server/routes.ts` L1083-1160): now validates synchronously, responds **HTTP 202 immediately** with `{ accepted, projectId, message }`, then runs `parseEditorialNotesOnly` in background via `.then/.catch`. On success emits `{ type: "editorial_parse_complete", payload: { resumen_general, instrucciones, count } }` to the project's SSE stream. On failure emits `{ type: "editorial_parse_error", message }` and persists an error activity log.
- **Frontend** (`client/src/pages/dashboard.tsx`):
  - New `isParsingEditorial` state separate from the mutation's `isPending` (the HTTP call is now near-instant, so `isPending` no longer reflects real progress).
  - `parseEditorialNotesMutation.onMutate` sets the flag true; SSE `editorial_parse_complete` / `editorial_parse_error` set it false.
  - Helper `applyEditorialParsePayload` extracted from the previous `onSuccess` handler — fills `editorialPreview`, default-selects all instructions, shows the "Vista previa lista" toast.
  - SSE handler in the existing `useEffect` (already open when the dashboard is mounted) gains the two new event cases.
  - The "Analizar notas" button now disables on `isParsingEditorial` and shows "Analizando notas (puede tardar 1-3 min)…" instead of relying on `mutation.isPending`.
- **Known fragility (not addressed in this fix)**: if the SSE connection drops mid-parse (current `onerror` just closes without reconnecting) or the user navigates away from the dashboard before the parse finishes, the result is lost — the background job completes and burns tokens but has no listener. An optional follow-up would persist the preview to a `projects.editorialPreviewPending` column so the dashboard can recover it on remount/reconnect.
- **Hotfix (same day): SSE was opening only for `status="generating"` projects.** The original design assumed the SSE was always live when the dashboard was mounted, but `client/src/pages/dashboard.tsx` L156 defined `activeProject = projects.find(p => p.status === "generating")` and L610 gated the SSE on that. Editorial-notes parsing runs against **completed** projects, so the SSE was never open when the user clicked "Analizar notas" → the `editorial_parse_complete` event was emitted into an empty `activeStreams` set and the button stayed stuck on "Analizando..." forever. Fixed by changing the gate to `currentProject || activeProject` and using `projectId` (captured locally) inside all `queryClient.invalidateQueries` calls. SSE now opens for any selected project regardless of status.

#### Holistic Reviewer Agent (v6.7)
- **New agent**: `server/agents/holistic-reviewer.ts` — `HolisticReviewerAgent`. Reads the **entire novel** (all chapters concatenated with separators) in a single DeepSeek V4-Flash call. Leverages V4-Flash's 1M-token context window (correct as of April 2026 — earlier internal docs incorrectly listed 128K). Uses `useThinking: true` + `thinkingBudget: 8192` (max reasoning), `maxOutputTokens: 16384`, `timeoutMs: 18 min`.
- **Output**: free-form Spanish editorial report following a strict markdown template (VEREDICTO GLOBAL → PROBLEMAS ESTRUCTURALES → ARCOS DE PERSONAJE → CONTINUIDAD Y COHERENCIA → RITMO Y TENSIÓN → ESCENAS Y CAPÍTULOS PROBLEMÁTICOS → REPETICIONES Y CLICHÉS → SUGERENCIAS CONCRETAS → LO QUE FUNCIONA). Voice: severe professional editor, no marketing language, references chapters as `(cap N)`.
- **Why method is `runReview` not `execute`**: `BaseAgent.execute(input: any): Promise<AgentResponse>` is a default abstract-ish method; overriding it with a different return type triggers TS2416. Renaming sidesteps the issue without touching the base class (other agents that override `execute` either match the signature or rely on `any`).
- **Orchestrator**: `runHolisticReview(project)` at `server/orchestrator.ts` L3974+ loads chapters, the optional style guide content (via `styleGuideId` FK — project doesn't store the guide directly), and a compact world bible summary (top 20 characters, top 15 rules, up to 80 outline entries with truncated descriptions). Tracks tokens under operation `"holistic_review"`. Does NOT mutate project state.
- **Endpoint**: `POST /api/projects/:id/holistic-review` at `server/routes.ts` L1168+. Same async pattern as parse-editorial-notes: returns HTTP 202 immediately, runs in background, emits `holistic_review_complete` / `holistic_review_error` via SSE. Only allowed for `status="completed"`.
- **Frontend**: new purple-themed CTA card above the editorial-notes textarea (`client/src/pages/dashboard.tsx` L1116-1142) with copy "¿No tienes notas todavía?". Triggers `holisticReviewMutation`, shows "Leyendo la novela completa (3-5 min)...". On `holistic_review_complete`, the SSE handler **injects the report into `editorialNotes`** (sets if empty, appends after a `\n\n--- Revisión automática ---\n\n` separator if not). User can then edit/curate and pulse the existing "Analizar notas" → preview → apply flow. Zero new infrastructure beyond the agent + endpoint.
- **Character limit raised**: editorial notes textarea (and `notes.length` validation in both parse-editorial-notes and apply-editorial-notes endpoints) bumped from 50.000 → 200.000 chars. Holistic reports for 100k+ word novels can easily exceed 50k chars, which would have made them un-pasteable into the next step.
- **Known fragilities (not addressed)**: (a) Same SSE-drop weakness as parse-editorial-notes — if the connection breaks during the 3-5 min run, the report is lost (no DB persistence of `pending_holistic_report`). The SSE `onerror` handler now resets `isHolisticReviewing` / `isBetaReviewing` / `isParsingEditorial` flags and shows a destructive toast so the UI doesn't get stuck (added when the Beta Reader landed), but the lost informe still requires a re-run. (b) Cloudflare/nginx proxies may close idle SSE streams; the SSE endpoint at L1698+ has no heartbeats, so a long holistic run with no intermediate events is at risk. If users hit this in practice, add `: keepalive\n\n` heartbeat every 30s. (c) Auth/ownership: any authenticated user can trigger this for any project ID — a cost vector. Pre-existing across all endpoints; out of scope for this feature.

#### Beta Reader Agent (v6.7, sibling of HolisticReviewer)
- **New agent**: `server/agents/beta-reader.ts` — `BetaReaderAgent`. Same infrastructure as the holistic reviewer (single DeepSeek V4-Flash call over the entire novel, `useThinking: true`, `thinkingBudget: 8192`, `maxOutputTokens: 16384`, `timeoutMs: 18 min`) but **opposite voice**: first-person reactions of a qualified beta reader, not a clinical editor. Temperature 0.8 (vs holistic's 0.6) for more natural prose.
- **Output sections** (markdown, fixed format for reproducibility): PRIMERA IMPRESIÓN → EL ARRANQUE → LOS PERSONAJES (mi reacción humana) → MOMENTOS QUE FUNCIONARON → MOMENTOS DONDE PERDÍ INTERÉS → GIROS Y SORPRESAS → EL MUNDO Y LA ATMÓSFERA → EXPECTATIVAS QUE NO SE CUMPLIERON → SI FUERA EL AUTOR, CAMBIARÍA... → ¿LO RECOMENDARÍA?. Voice rules: no marketing/blurb language, no fake enthusiasm, no apologies, no editor jargon (tres-actos, etc.), references chapters with `(cap N)`.
- **Refactor in orchestrator**: extracted `loadFullNovelContext(project)` private helper at `server/orchestrator.ts` ~L3982 that both `runHolisticReview` and `runBetaReview` consume — chapters (sorted), style guide content via `styleGuideId` FK, compact world bible summary, and `cumulativeTokens` reset. Avoids divergence between the two readers.
- **Endpoint**: `POST /api/projects/:id/beta-review` at `server/routes.ts` L1234+. Identical 202+SSE pattern as holistic-review. Emits `beta_review_complete` / `beta_review_error`. Operation tracked under `"beta_review"`.
- **Frontend**: holistic CTA card was redesigned to a 2-column grid with **purple "Lector Holístico (editor severo)"** + **emerald "Lector Beta (lector cualificado)"** buttons, plus a tiny italic legend explaining the difference. Buttons are mutually exclusive (each one disabled while the other is running) — intentional, because each `Orchestrator` instance loads its own `cumulativeTokens` snapshot from the project and concurrent runs would cause last-write-wins on token counters. SSE handler `beta_review_complete` injects the report into `editorialNotes` exactly like the holistic one but uses the separator `--- Lectura beta ---`. Two reports can be stacked in the textarea and the existing parse-editorial-notes flow ingests them as one block.

#### Originality Critic Agent (v6.7)
- **New agent**: `server/agents/originality-critic.ts` — `OriginalityCriticAgent`. Reads the Architect's outline (premise, characters, chapter beats) and scores originality 1-10. Detects 6 cluster types: `premisa_generica`, `personaje_arquetipico`, `tropo_trama`, `giro_predecible`, `setpiece_cliche`, `dialogo_topico`. Uses `thinkingBudget: 8192` (max reasoning).
- **Verdicts**: `aprobado` (score ≥7, proceed), `revisar` (5-6, proceed with warning), `rechazado` (≤4 or 3+ major clusters, re-run Architect).
- **Wired in `server/orchestrator.ts`** between successful World Bible parse (~line 1023) and DB save (~line 1116). Non-blocking: any failure falls through to original outline. On `rechazado`, runs Architect ONCE more with `instrucciones_revision` injected as `architectInstructions`. Validates re-run output (must produce ≥ expectedChapters - 2 chapters); on invalid/failed re-run, keeps original outline.
- **Activity log**: writes `🎭 Crítico de Originalidad — Score X/10 (veredicto)` with cluster details in `metadata.clusters` for dashboard inspection.
- **Token tracking**: tracked under operation `originality_check` and (when re-pass occurs) `world_bible` for the second Architect pass.
- **Architect reasoning bumped**: `thinkingBudget` 4096 → 8192 (max). Decisions made here propagate to 80k+ words; reasoning depth pays off.
- **Final Reviewer new categories**: added `cliche` and `personaje_arquetipico` to `FinalReviewIssue.categoria` (detection-only safety net for clichés that slip through). System prompt updated with examples and false-positive guards.
- **Full migration from Gemini to DeepSeek V4-Flash for all agents** (no fallback). The Google Gemini integration and the entire AI cover-generation feature ("Portadas") have been removed. DeepSeek is now the only AI provider.
- **`server/agents/base-agent.ts`** rewritten to use the `openai` SDK pointing at `https://api.deepseek.com`. Default model is `deepseek-v4-flash`. The agent's `useThinking` flag now maps to DeepSeek's `thinking: { type: "enabled" | "disabled" }` plus `reasoning_effort`. Reasoning tokens are extracted from `usage.completion_tokens_details.reasoning_tokens`.
- **`server/cost-calculator.ts`** updated with DeepSeek pricing (V4-Flash: $0.14 input / $0.28 output per 1M; V4-Pro: $1.74 / $3.48). Legacy Gemini prices retained for historical events. `AGENT_MODEL_MAPPING` routes every agent to `deepseek-v4-flash`.
- **`server/services/chatService.ts`** migrated to OpenAI client with streaming via `chat.completions.create({ stream: true, stream_options: { include_usage: true } })`.
- **All agent files** in `server/agents/*.ts` had their hardcoded `model: "gemini-*"` replaced with `"deepseek-v4-flash"` (or `"deepseek-v4-pro"` where Pro was used). `style-guide-generator.ts` was rewritten to use the OpenAI SDK directly.
- **5 inline AI calls in `server/routes.ts`** (spinoff guide generation, world-bible unification, title generation, milestone extraction, two assess-reedit endpoints) all migrated to OpenAI/DeepSeek.
- **Frontend display**: `client/src/pages/dashboard.tsx` and `client/src/pages/costs.tsx` updated to show DeepSeek V4-Flash/V4-Pro labels and pricing. Cost calculation constants updated to DeepSeek rates.
- **Database default**: `aiUsageEvents.model` default changed from `"gemini-2.5-pro"` to `"deepseek-v4-flash"` in `shared/schema.ts`.
- **Required secret**: `DEEPSEEK_API_KEY`. `GEMINI_API_KEY` is no longer used and has been removed from install/update scripts.
- **Removed cover-generation surface**: deleted `server/replit_integrations/image/`, `server/agents/cover-prompt-designer.ts`, `client/src/pages/covers.tsx`, the `cover_prompts` table from `shared/schema.ts`, all `getCoverPrompt*`/`createCoverPrompt`/`updateCoverPrompt`/`deleteCoverPrompt` storage methods, and the entire `/api/cover-prompts*` and `/api/cover-images/:filename` route block from `server/routes.ts`. The "Portadas" sidebar entry was removed from `client/src/components/app-sidebar.tsx`. Audiobook covers (manual upload via multer) are unaffected.

### v6.6 — Two-Step Editorial Notes Flow (Apr 2026)
- **Multi-chapter arc support in editorial notes**: `EditorialNotesParser` now emits `plan_por_capitulo` distributing a single instruction across multiple chapters with per-chapter roles. The orchestrator injects each chapter's role and its sibling roles into the surgical rewrite prompt.
- **Two-step preview UI**: New `POST /api/projects/:id/parse-editorial-notes` endpoint parses notes without applying. Dashboard shows extracted instructions with checkboxes (all selected by default), arc badges and distributive plans. User filters and clicks apply.
- **Refactored `POST /api/projects/:id/apply-editorial-notes`**: Accepts either `{ notes }` (legacy one-shot) or `{ instructions }` (pre-parsed selection). `Orchestrator.applyEditorialNotes()` takes optional `preParsedInstructions` to skip re-parsing.
- **Pre-edit snapshots**: `chapters.preEditContent` and `chapters.preEditAt` columns added. Snapshot saved before each successful rewrite (skipped on revert) so the user can compare before/after.
- **Word-level diff dialog**: "Ver cambios" button (eye icon) on chapters with a snapshot opens a dialog rendering `diffWords(preEditContent, content)` from the `diff` library — red strikethrough = removed, green = added.
- **File upload for notes**: Dashboard accepts `.txt` and `.md` directly into the editorial-notes textarea.
- **Auto post-edit Final Review**: After rewrites complete (and not cancelled), `FinalReviewerAgent` is relaunched to recalculate the global score. UI shows before→after with delta + arrow indicator (improvement/regression).
- **Cancellation between chapters**: AbortController registered per project; `isProjectCancelledFromDb` check at the start of every chapter loop iteration AND right before the post-edit Final Review (prevents the final-review phase from overwriting a user-issued cancellation with `status="completed"`).

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite).
- **Routing**: Wouter.
- **State Management**: TanStack Query.
- **UI Components**: shadcn/ui (leveraging Radix UI).
- **Styling**: Tailwind CSS (custom theme, light/dark modes).
- **Design System**: Microsoft Fluent Design principles (Inter, JetBrains Mono, Merriweather fonts).

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ES modules).
- **API Pattern**: RESTful endpoints with Server-Sent Events (SSE).
- **Agent System**: Modular agent classes (inheriting from `BaseAgent`) with specialized system prompts for DeepSeek V4-Flash. An orchestrator manages the pipeline, including refinement loops triggered by the Editor agent.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts`, including tables for projects, chapters, world Bibles, thought logs, agent statuses, series, continuity snapshots, arc verifications, imported manuscripts, reedit projects, and translations.

### AI Integration
- **Models**: DeepSeek V4-Flash (all agents — Architect, Ghostwriter, Editor, CopyEditor, FinalReviewer, Translator, validators, Chapter Expander, Restructurer, Reedit agents, ManuscriptAnalyzer). No image generation in the system.
- **Thinking Support**: DeepSeek V4-Flash supports a `thinking: { type: "enabled" | "disabled" }` flag plus `reasoning_effort`. Thinking is OFF by default; agents that need it (Ghostwriter, Architect, Restructurer, Chapter Expander) opt-in with `useThinking: true`. Reasoning tokens are read from `usage.completion_tokens_details.reasoning_tokens`.
- **Token Optimization**: System prompts sent via OpenAI `messages: [{ role: "system", ...}]`. Per-agent `max_tokens` limits: 65536 for writers/translators, 16384 for reviewers, 8192 for editors/analyzers, 4096 for validators/auditors. Default model is `deepseek-v4-flash`.
- **Ghostwriter Quality System**: System prompt includes "Estándar de Excelencia Editorial" section targeting 9/10 on first draft, with 6 quality pillars (human-like prose, concrete sensory immersion, dialogue subtexto, emotional arc progression, hook opening/memorable close, beats as full scenes). Also includes a mandatory pre-delivery self-audit checklist (10 checkpoints matching Editor criteria).
- **Character Name Originality System**: The Architect's system prompt includes a strict anti-name-repetition directive with a blacklist of commonly repeated AI names. The Orchestrator dynamically extracts all character names from existing World Bibles AND reedit World Bibles (excluding projects in the same series) AND all entries from the `name_blacklist` table (user-managed via UI), passing them as `forbiddenNames` to the Architect. The Ghostwriter is instructed to faithfully use only the names defined in the World Bible. The **Style Guide Generator** also receives `forbiddenNames` to avoid suggesting already-used names when generating new guides. The extraction logic lives in `extractForbiddenNames()` (exported from `server/orchestrator.ts`) and is reused in `routes.ts` for all 3 guide-generation call sites.
- **Configuration**: `temperature: 1.0`, `top_p: 0.95` (note: when `thinking` is enabled DeepSeek silently ignores temperature/top_p).
- **Client Setup**: `openai` SDK pointed at `baseURL: "https://api.deepseek.com"` using `DEEPSEEK_API_KEY`.

### Build System
- **Development**: `tsx` for hot reload.
- **Production**: `esbuild` for server, Vite for client.

### Feature Specifications

#### Manuscript Import Pipeline (v6.0)
- Imported manuscripts can be sent directly to the **Re-editor** (creates reedit project with all chapters in pending state) or to the **Translator** (creates completed reedit project visible in export page).
- Both routes filter empty chapters, use `editedContent || originalContent` fallback, and sort properly (prologue first, epilogue/author note last).
- Supports `.docx`, `.doc`, `.txt`, and `.md` file formats with intelligent chapter detection (multilingual regex patterns).
- Server-side file picker for processing files already on the server.

#### Optimized Re-edit Pipeline (v6.0)
- Publication-quality manuscript re-editing with 12 specialized agents.
- Fixed critical bug where final review corrections were silently dropped (`capituloReescrito` vs `rewrittenContent` mismatch) — now all 5 code paths use dual-key fallback.
- All agents use detected language instead of hardcoded Spanish.
- **Editor**: Deep 7-category analysis (continuity, plot, pacing, style, dialogue, characters, setting) with thinking enabled on DeepSeek V4-Flash.
- **CopyEditor**: DeepSeek V4-Flash with thinking, World Bible context, adjacent chapter awareness, and period-appropriate language enforcement.
- **StructuralFixer**: DeepSeek V4-Flash with thinking.
- **NarrativeRewriter**: Fixed `reglasDelMundo` field access (was reading empty `reglas`).
- **Architect Analyzer**: 3000 chars per chapter context (was 500).
- **QA Context Windows**: Continuity 15K, Voice 10K, WorldBible 12K per chapter.

#### Translation & Literary Adaptation (v6.0)
- Literary adaptation into 7 languages (ES, EN, FR, DE, IT, PT, CA) focusing on publication-ready prose.
- Full support for translating re-edited books via `/api/reedit-projects/:id/translate-stream`.
- Proper ID collision handling with `source` + `reeditProjectId` tracking across frontend and backend.
- Resume support for interrupted reedit translations (branching by source type in resume endpoint).
- "Re-editado" badge in translation repository.
- **Editorial Critique-Driven Reedit**: `editorialCritique` column on `reedit_projects` accepts external editor/beta-reader feedback. Injected into NarrativeRewriter (as high-priority corrections) and FinalReviewer (as verification checklist). Available on upload, resume, and restart. UI shows critique in progress tab and restart dialog.
- **System Project Reedit Optimization**: When cloning a system project to reedit (`sourceProjectId` set), the clone route copies the World Bible, maps `worldRules`→`loreRules`, `plotDecisions`+`persistentInjuries`→loreRules, and sets `editedContent` = chapter content. The orchestrator detects system projects and skips Stages 1-3 (structure analysis, editor review, World Bible extraction) — jumping directly to architect analysis, QA, and narrative rewriting. Saves significant time and API costs.
- **Proofreading Agent (Corrector Ortotipográfico Senior)**: New `ProofreaderAgent` for post-production orthotypographic correction. Adapts to genre and author style. Detects AI glitches (cloned paragraphs, broken dialogues, action loops), corrects spelling/typography/punctuation/style, preserves author voice. Works on all 4 source types (projects, reedit, imported, translations). Schema: `proofreading_projects` + `proofreading_chapters`. Routes: GET/POST/DELETE `/api/proofreading`, POST `/api/proofreading/:id/start`, POST `/api/proofreading/:id/apply`. The "apply" route writes corrected content back to the original source. Frontend: `client/src/pages/proofreading.tsx`. Migration: `migrations/0006_add_proofreading.sql`.
- **Thinking Budget Optimization (v6.1)**: All critical agents have per-agent configurable thinking budgets via `useThinking` + `reasoning_effort` in `AgentConfig`. Ghostwriter, Architect, Copyeditor, Editor, Final Reviewer, Proofreader and structural agents opt in to DeepSeek's `thinking: { type: "enabled" }` mode. Reasoning tokens are read from `usage.completion_tokens_details.reasoning_tokens`.
- **Editor Holistic Scoring (v6.1)**: Editor rubric changed from penalty-only system (15+ categories subtracting points) to holistic quality evaluation. Only 3 automatic rejection reasons: continuity grave, knowledge leaks, truncated text. Everything else (clichés, repetitions, purple prose, epithets) are reported as weaknesses but don't cause auto-reject. Scoring guide: 9-10 excellent, 7-8 good, 5-6 mediocre, 3-4 bad.
- **Resolve Documented Issues (v6.4)**: "Resolver Issues" button on dashboard (placed below the issues list) for completed projects with documented issues. Calls `POST /api/projects/:id/resolve-issues` → `orchestrator.resolveDocumentedIssues()`. Targeted fix: reads stored `finalReviewResult.issues`, extracts `capitulos_afectados`, rewrites only affected chapters with issue-specific correction instructions (Ghostwriter → Editor → CopyEditor pipeline), then runs a verification Final Review. Button stays available after each cycle so any newly-detected issues can be re-resolved. Normalizes legacy issue data (`capitulo` → `capitulos_afectados`, `problema` → `descripcion`). Dashboard issue display fixed to use correct field names (`capitulos_afectados[]`, `descripcion`, `categoria`).
- **Final Continuity Audit Disabled (v6.4)**: The post-final-review continuity audit (`runFinalContinuityAudit` + `runPostAuditVerification`) was removed from `finalizeCompletedProject()`. Reason: the second massive pass over the manuscript was over-correcting and breaking scenes. Continuity is already enforced chapter-by-chapter during generation via the Continuity Sentinel; the post-review pass added more harm than benefit. The functions remain defined as dead code in `orchestrator.ts` for easy re-enablement if needed. The finalization flow now goes: Final Review → Orthotypographic Pass → checklist → mark completed.
- **Prequel Support (v6.1)**: Projects can now be created as prequels of existing series. Schema: `projectSubtype` field ("standard" | "prequel") on projects table. Migration: `migrations/add_project_subtype.sql`. Route: `POST /api/series/:id/create-prequel`. Prequels get `seriesOrder: 0` and load ALL volumes from the series as future context (not just previous ones). The orchestrator injects special prequel rules: plant seeds for future events, don't contradict established facts, show character origins, don't reveal future secrets. Only one prequel per series allowed. Inherits author's style guide and pseudonym automatically. Frontend: "Precuela" button on series page with creation dialog.
- Anti-AI filter with per-language crutch word lists.
- Extensive cleanup of AI-generated contamination (style guides, checklists, JSON artifacts).
- Shared `sanitizeContentForTranslation()` function cleans source content before translation (all 3 paths).
- `splitLongParagraphs()` function applied across all output paths (format-ebook, export-markdown, DOCX, chapter viewer) — splits narrative blocks >600 chars at sentence boundaries (~3-4 sentences per paragraph), separates dialogue lines (—, «, ") into their own paragraphs.

#### Taller de Guías (Guide Workshop) (v6.0)
- AI-powered style and writing guide generation module at `/guides`.
- 4 guide types: author_style (emulate known authors), idea_writing (develop story premises + auto-create project), pseudonym_style (define pseudonym identity), series_writing (maintain series coherence).
- `generated_guides` table with fields: id, title, content, guideType, sourceAuthor, sourceIdea, sourceGenre, pseudonymId, seriesId, inputTokens, outputTokens, createdAt.
- Agent: `server/agents/style-guide-generator.ts` using DeepSeek V4-Flash via the OpenAI SDK directly.
- API: `GET /api/guides`, `GET /api/guides/:id`, `DELETE /api/guides/:id`, `POST /api/guides/generate`, `POST /api/guides/:id/apply-to-pseudonym`.
- Frontend: `client/src/pages/guides.tsx` with 5 tabs (library + 4 guide types), guide viewer dialog, apply-to-pseudonym dialog.
- **idea_writing flow**: Collects full project data (title, chapters, prologue/epilogue/author note, words per chapter, Kindle optimization, pseudonym, style guide). On generation: saves as `extendedGuide` (not styleGuide) and auto-creates a project with `extendedGuideId` set. Genre and tone use dropdown selectors matching the config panel options.
- **series_writing flow**: Extended to also create an `extendedGuide` + project (like idea_writing). Selects a series, pseudonym (existing or new), genre, tone, and full project config. Backend enriches the guide with real chapter content from all books in the series (projects, reedit projects, imported manuscripts). Auto-calculates `seriesOrder` from existing books and links the new project to the series with `workType: "series"`. Updates the series' `seriesGuide` field.
- **apply-to-pseudonym**: Only available for `author_style` and `pseudonym_style` guides. Creates a styleGuide linked to the selected pseudonym. Server validates guide type before allowing application.

#### Convert Reedit Projects to Series (v6.0)
- Converts multiple imported/re-edited books into a unified series.
- `reeditProjects` table has `seriesId` and `seriesOrder` columns for series linkage.
- API: `POST /api/reedit-projects/convert-to-series` — accepts `{ books: [{projectId, order}], seriesTitle, totalPlannedBooks, pseudonymId }`.
- Validates: no duplicate project IDs, books not already in a series, bounds on totalPlannedBooks.
- Creates series record, links each reedit project via `seriesId`/`seriesOrder` update.
- Auto-generates a `series_writing` guide using AI (feeds book summaries/excerpts to the style-guide-generator agent).
- Merges World Bible data from all selected books using DeepSeek V4-Flash to deduplicate characters/locations/timeline across books, then updates each book's World Bible with the unified data.
- Series registry (`GET /api/series/registry`) includes reedit projects as volumes alongside regular projects and imported manuscripts.
- Frontend: "Crear Serie" button in the reedit page projects card opens a dialog to select books, reorder them, name the series, and trigger conversion.

#### Spin-off Series Creation (v6.0)
- Create new series derived from existing ones with a character from the original as protagonist.
- Schema: `series` table has `parentSeriesId`, `spinoffProtagonist`, `spinoffContext` columns.
- API: `GET /api/series/:id/characters` extracts unique characters from all world bibles and continuity snapshots in a series. `POST /api/series/:id/generate-spinoff-guide` analyzes parent series novels with DeepSeek V4-Flash to auto-generate a complete series guide.
- Generated guide includes: protagonist profile, inherited world rules, recurring characters, inherited/new plot threads, continuity bible, tone/style directives.
- Orchestrator injects spin-off context (parent series name, protagonist, concept) into chapter generation pipeline alongside the generated guide.
- Frontend: Series creation form has "Serie Origen" selector. When selected, loads characters from parent series for protagonist selection. On creation, auto-generates the writing guide by analyzing all novels.
- Spin-off badge shown in series listing with protagonist name.

#### Word Count Validation & Expansion
- 10% flexible tolerance: `FLEXIBLE_MIN = TARGET_MIN × 0.90`, `FLEXIBLE_MAX = TARGET_MAX × 1.10`.
- `MAX_WORD_COUNT_RETRIES = 5` dedicated retries using separate `wordCountRetries` counter (independent from editor's `refinementAttempts`). After 5 retries, continues forward. Empty responses (0 words) get special handling: longer wait (20s vs 10s), cleared refinement instructions (fresh retry), and detailed error logging including API error reason.
- **`extractContinuityState` robustness**: Uses `lastIndexOf` to find the final `---CONTINUITY_STATE---` separator, ensuring chapter text isn't lost when the model places extra separators. Guards against empty content input, strips stray separators from chapter text, and falls back to treating full content as chapter text if no parseable chapter body is found before the separator.
- **Expansion mode**: When a chapter is short, the system passes existing content as `previousChapterContent` with expansion-specific instructions (not rewrite-from-scratch). The ghostwriter receives the short draft as "BORRADOR ANTERIOR" and is instructed to expand with sensory details, dialogue, internal monologue, and transitions — never deleting what works.
- Applied to all code paths (generate, resume, QA rewrite).
- **Surgical editing philosophy**: All refinement instructions emphasize modifying only problematic passages while preserving working content. `buildRefinementInstructions()` now includes `plan_quirurgico.preservar` and `palabras_objetivo`. QA rewrites set `isRewrite: true`. Continuity violation corrections are explicitly surgical.
- **QA agent unification (v6.6)**: The local copies of `ContinuitySentinelAgent`, `VoiceRhythmAuditorAgent` and `SemanticRepetitionDetectorAgent` that lived inside `server/orchestrators/reedit-orchestrator.ts` were replaced by thin adapter classes that wrap the canonical agents in `server/agents/`. The adapters translate the canonical result schema (`issues[]`, `clusters[]`, `puntuacion_voz/ritmo/originalidad/foreshadowing`, `foreshadowing_detectado` with `capitulo_setup/setup`) back into the legacy field names consumed throughout the reedit-orchestrator (`erroresContinuidad/problemasTono/repeticionesSemanticas`, single `puntuacion`, `foreshadowingTracking` with `plantado/elemento`). This guarantees that future improvements to the canonical agents (prompts, parsing, world-bible handling) propagate automatically to the reedit pipeline. Adapters skip issues with empty `capitulos_afectados` instead of falling back to chapter 0 (Prólogo).

#### Novel Generation & Editing
- **Manuscript Expansion/Reordering**: Agents for expanding chapters, inserting new ones, and reordering chapters for narrative flow. Includes automatic internal header syncing.
- **Automatic Pause & Approval**: System pauses for user input after 5 non-perfect evaluations (applies to both `processProject` and `runFinalReviewOnly`). Requires two consecutive 9+/10 scores with no issues for approval. Editor approval threshold: 9/10 (chapters scoring below 9 are sent back for rewriting). Final Reviewer auto-approval on plateau/cycle-limit also requires 9+. All pause/exit paths persist complete state (revisionCycle, consecutiveHighScores, nonPerfectCount, previousScores, tokens) for reliable resume.
- **Score Regression Detection**: Before applying corrections, chapter content is snapshotted. If the score drops by 2+ points after corrections (e.g. from 9 to 6), the system auto-reverts the chapters to pre-correction state and pauses for user instructions, preventing quality degradation.
- **Chapter Number Extraction**: `server/utils/extract-chapters.ts` provides `ensureChapterNumbers()` which extracts chapter numbers from issue descriptions when the AI omits `capitulos_afectados`. Applied in all 3 orchestrator correction paths (main, reedit, FRO). Final Reviewer prompt reinforced to always include `capitulos_afectados`.
- **JSON Repair**: All AI agents use `server/utils/json-repair.ts` to parse JSON responses from the LLM, handling truncated JSON, missing commas, unclosed strings/brackets automatically.
- **Reedit Assessment**: Before starting a re-edit, users can run `/api/projects/:id/assess-reedit` to get an AI-powered quality assessment (samples 5 chapters, evaluates prose/structure/characters/dialogue/pacing/coherence). Returns "reedit" or "rewrite" recommendation with per-category scores. Has 60s per-project cooldown. Frontend shows results in the auto-reedit dialog with a warning gate when "rewrite" is recommended.
- **Issue Tracking**: Issue hash tracking prevents re-reporting of resolved issues.
- **Enhanced Cancellation & Resume**: Immediate process cancellation and optimized project resumption from `awaiting_instructions`. All three orchestrator methods (`processProject`, `runFinalReviewOnly`, `applyReviewerCorrections`) have full try/catch error handling with status/token persistence on failure.
- **Continuity Validation & Constraints**: Four-layer continuity system: (1) Immediate pre-Editor validation for dead characters, ignored injuries, and location inconsistencies. (2) Editor acts as primary continuity sentinel with full 6-category analysis (physical, temporal, spatial, character state, objects, knowledge leaks) — continuity errors auto-reject the chapter. Editor now receives the FULL style guide (not just genre/tone). (3) Continuity Sentinel runs every 3 chapters checking multi-chapter panoramic patterns (accumulated timeline drift, abandoned threads, cross-chapter contradictions) — triggers rewrites for both CRITICAL and MAJOR severity issues. JSON parse failures now mark checkpoint as NOT approved (fail-safe). (4) **Final Continuity Audit** runs before project completion: scans the full manuscript in overlapping batches of 6 chapters (2-chapter overlap), reloading fresh chapter data per batch. Tracks failed/timeout batches separately and verifies chapter status after rewrites. All QA rewrites (Sentinel, Voice, Semantic) now run CopyEditor polish before saving. **Sentinel N/A fix** (4-level fallback): L1 `capitulos_para_revision` direct → L2 `capitulos_afectados` (scope-filtered) → L3 regex "cap/capítulo N" + Prólogo/Epílogo labels → L4 bare numbers 1–199 in scope. `isEffectivelyApproved`: 0-issue checkpoints treated as approved regardless of `checkpoint_aprobado` flag.
- **World Bible Enrichment**: Automatic update and enrichment of the World Bible with character states and narrative threads after each chapter. Includes full-text sliding context window for Ghostwriter.
- **Author Notes System**: Users can add prioritized author instructions to the World Bible, injected into Ghostwriter and Editor prompts.
- **Cross-Chapter Anti-Repetition**: Multi-layer scene repetition prevention system:
  - `extractScenePatternSummary()` analyzes chapter text for opening/closing/mechanism patterns (regex-based) + AI-reported `scenePatterns` from continuity state
  - Scene patterns from last 6 chapters injected into Ghostwriter as "PATRONES NARRATIVOS YA USADOS" mandatory constraints
  - Editor receives 5 previous chapters (up from 3) with larger excerpts (5000 chars for 2 nearest, 3000 for farther) showing beginning+end for pattern detection
  - Editor has explicit 8-point cross-chapter comparison checklist (scene structure, revelation mechanism, opening/closing type, emotional reactions, resolution patterns, contradictions)
  - `enforceApprovalLogic` treats 2+ `repeticiones_trama` as hard rejection (overrides even 9+/10 score)
  - Ghostwriter continuity state now includes `scenePatterns` (openingType, closingType, revelationMechanism, mainSceneStructures) and `keyDecisions` for tracking
  - `keyDecisions` from continuity state injected into mandatory constraints as "[DECISIÓN]" entries
  - Summary chapter extracts expanded to 1500 chars (800 start + 700 end) instead of 500 chars
  - Local `chapters` array updated in-memory after completion to ensure `buildSlidingContextWindow` has access to completed chapter content during generation
- **PWA Support**: Progressive Web App capabilities including `manifest.json`, service worker, and install-to-home-screen.

### Series Management (Complete Inter-Book Continuity System)
- **Centralized Completion Logic**: `finalizeCompletedProject()` helper ensures continuity snapshot generation and arc verification run on every completion path (8 total).
- **Automatic Continuity Snapshots**: Extracts synopsis, character states, unresolved threads, and key events from completed chapters.
- **Automatic Arc Verification**: Runs ArcValidatorAgent after each book completes to verify milestone fulfillment and plot thread progress. Supports all volume types (project, imported, reedit) via `volumeType` parameter. Schema uses polymorphic volume references (`volumeType` + `projectId`) instead of FK constraints to `projects.id`.
- **Series-Aware Context Loading**: Loads unresolved threads and key events from previous volumes only, filtering by `seriesOrder < currentVolume` to prevent future-book context leakage.
- **Final Reviewer Series Context**: Receives series milestones, plot threads, unresolved threads from prior books, and last-volume flag for thread closure enforcement.
- **Ghostwriter Series Constraints**: Series unresolved threads injected into enriched World Bible across all Ghostwriter paths.
- **Enriched World Bible Resilience**: `getEnrichedWorldBible()` includes series fields in early-return and error fallback paths.
- **Volume Ordering**: Architect series context sorts volumes by `seriesOrder` using `?? 999` for null values.

## Key Orchestrator Methods

| Method | Purpose |
|---|---|
| `finalizeCompletedProject()` | Runs final audit → post-audit re-verification (if corrections made) → orthotypographic pass → process checklist → sets status "completed" → continuity snapshot → arc verification |
| `loadSeriesThreadsAndEvents()` | Loads prior-volume threads/events with seriesOrder filtering |
| `getEnrichedWorldBible()` | Enriches base World Bible with DB character states, narrative threads, author notes, series context |
| `generateSeriesContinuitySnapshot()` | Extracts and saves book completion data for series continuity |
| `runSeriesArcVerification()` | Runs ArcValidatorAgent and stores verification results |
| `runFinalReview()` | Multi-cycle final review with series context, QA rewrites, oscillation protection, and approval logic |
| `runPostAuditVerification()` | 2-cycle scoring-only re-verification after audit corrections (no rewrites). Returns `"passed"` / `"acceptable"` / `"inconclusive"` |
| `runOrthotypographicPass()` | Runs ProofreaderAgent on all completed chapters for orthotypographic corrections |
| `runFinalContinuityAudit()` | Full manuscript continuity audit with capped rewrites (max 8). Returns `{ correctedCount, status, warnings }` |

## External Dependencies

### AI Services
- **DeepSeek API**: `DEEPSEEK_API_KEY` — primary model `deepseek-v4-flash` (all agents) via OpenAI-compatible SDK at `https://api.deepseek.com`. No image generation provider configured.

### Deployment & Database
- **PostgreSQL**: Database accessed via `DATABASE_URL`.
- **Drizzle Kit**: Used for database migrations.

### TTS / Audiobook Services
- **Fish Audio API**: `FISH_AUDIO_API_KEY` — TTS model `speech-1.6` for audiobook generation. Supports MP3/WAV/Opus output, voice cloning via `reference_id`, prosody control (speed/volume), and expressiveness params (`top_p: 0.7`, `temperature: 0.9`, `repetition_penalty: 1.0`).

#### Audiobook Generation (v6.0)
- Converts completed books (projects, reedit projects, imported manuscripts, translations) into audiobooks chapter by chapter using Fish Audio TTS API.
- **Schema**: `audiobook_projects` (title, sourceType, sourceId, voiceId, voiceName, coverImage, format, bitrate, speed, status) + `audiobook_chapters` (chapterNumber, textContent, audioFileName, audioSizeBytes, status). Status values: `pending | processing | completed | error | paused`.
- **Pause/Cancel**: Uses `AbortController` map (`activeAudiobookGenerations`) to track active generation processes. Pause route (`POST /api/audiobooks/:id/pause`) aborts the controller and sets status to "paused", immediately stopping Fish Audio API calls. Resume via standard generate route (skips already-completed chapters). Delete route aborts any active generation before cleanup. All three actions (pause, delete, complete) stop consuming Fish Audio credits.
- **Parallel generation**: Generates up to 3 chapters concurrently (`CONCURRENCY = 3`) using `Promise.all` batches. Skips already-completed chapters. Abort/pause propagates to all active requests in the batch.
- **Text chunking**: Splits chapters >9500 chars at sentence boundaries for API limits; concatenates audio buffers.
- **API Routes**: `GET /api/audiobooks`, `GET /api/audiobooks/:id`, `GET /api/audiobooks/sources/available`, `GET /api/audiobooks/voices/list`, `POST /api/audiobooks` (with cover upload), `POST /api/audiobooks/:id/generate`, `POST /api/audiobooks/:id/pause`, `POST /api/audiobooks/:id/generate-chapter/:chapterId`, `GET /api/audiobooks/:id/download` (ZIP), `GET /api/audiobooks/:id/chapter/:chapterId/audio`, `PATCH /api/audiobooks/:id`, `DELETE /api/audiobooks/:id`.
- **ZIP download**: Includes all completed audio files, cover image (if uploaded), and `metadata.json` with chapter listing.
- **Frontend**: `client/src/pages/audiobooks.tsx` — list/create/detail views. Create form includes source selection, Fish Audio voice picker, format/bitrate/speed sliders, cover upload. Detail view shows per-chapter progress, inline audio players, pause/resume controls, generate-all or per-chapter generation, delete (works even during active generation), and ZIP download.
- Audio files stored in `./audiobooks/project_{id}/` directory.

#### KDP Metadata Generator (v6.0)
- Generates Amazon KDP publishing metadata: subtitle, HTML description (max 4000 chars), 7 search keywords (50 chars each), 2 BISAC categories, series info, AI disclosure.
- **Sources**: Regular projects and reedit projects.
- **KDP Compliance**: HTML description uses only allowed tags (b, i, em, strong, br, p, h4-h6, ul, ol, li). No contact info, reviews, time-sensitive info, or quality claims in description. Keywords avoid trademark terms, "kindle", "ebook". Series name without volume numbers.
- **AI Disclosure**: Defaults to "ai-assisted" (correct for AI-assisted writing tools per Amazon 2025 policy). Confidential to Amazon, not shown to readers.
- **Agent**: `server/agents/kdp-metadata-generator.ts` — extends BaseAgent, uses DeepSeek V4-Flash with thinking. Generates metadata in the target language matching the marketplace.
- **Schema**: `kdp_metadata` table (projectId?, reeditProjectId?, title, subtitle, description, keywords[], bisacCategories[], seriesName, seriesNumber, seriesDescription, language, targetMarketplace, aiDisclosure, contentWarnings, status, notes).
- **API Routes**: `GET /api/kdp-metadata`, `GET /api/kdp-metadata/:id`, `POST /api/kdp-metadata/generate`, `PATCH /api/kdp-metadata/:id`, `DELETE /api/kdp-metadata/:id`.
- **Frontend**: `client/src/pages/kdp-metadata.tsx` — project/reedit selector, language/marketplace picker, metadata generation, full detail viewer with HTML preview, edit all fields, copy individual fields or all metadata, character count warnings for description and keywords.

#### Series Guide Generator Improvements
- **Series creation** (`series.tsx`): Includes optional description/idea field when creating a new series.
- **Series writing form** (`guides.tsx`): Added "Idea / Concepto de la Serie" textarea for the user to describe the series concept (used by the AI to generate the guide). Added "Crear proyectos para todos los volúmenes" checkbox that auto-creates remaining volume projects (not all planned, only the unfilled ones).
- **Multi-volume creation** (`routes.ts`): When `createAllVolumes` is enabled, calculates how many volumes already exist and only creates the remaining ones. Extracts AI-suggested titles from the guide's "PLANIFICACIÓN DE VOLÚMENES" section. Falls back to "Serie — Vol. N" naming.
- **Style guide generator** (`style-guide-generator.ts`): Accepts `seriesIdea` parameter. Includes volume planning section in the prompt when multiple books are planned.
- **Series description auto-save**: If the series has no description and the user provides an idea, it's saved as the series description.

### Back Matter System
- **Book Catalog** (`book_catalog` table): Stores published book entries (title, author, Amazon URL, Goodreads URL, ASIN, synopsis, genre, KU status). Managed via `/book-catalog` page.
- **Project Back Matter** (`project_back_matter` table): Per-project configuration for pages added after the manuscript in exports. Supports:
  - **Review Request Page**: Amazon ToS-compliant review solicitation in 6 languages (ES, EN, FR, DE, IT, PT). Requests reviews on both Amazon and Goodreads. No incentives, just honest request.
  - **Also By Page**: Lists selected books from the catalog with synopses and KU status. Instead of individual Amazon links per book, directs readers to the author's website URL (from pseudonym profile) for all books.
  - **Author Page** ("Sobre el Autor" / "About the Author"): Toggle `enableAuthorPage` + `authorPageBio` text field. Generates a dedicated author biography section at the end of the book in both Markdown and DOCX. Pre-populates from pseudonym bio when creating new config. Multilingual titles in 6 languages.
- **Pseudonym Name Editing (v6.2)**: Pseudonym names can be edited inline from the sidebar list (pencil icon) or from the detail panel. Supports Enter to save, Escape to cancel. Backend validates non-empty names.
- **Pseudonym Website URL**: `pseudonyms.website_url` field stores the author's website. Used in back matter "Also By" and "Author Page" sections. Multilingual CTA texts in 6 languages.
- **Export Integration**: Back matter is automatically appended to DOCX and Markdown exports (all pipelines: project export-markdown, reedit export-markdown, reedit export-md, project DOCX, reedit DOCX) after the author note.
- **Unified Manuscript Download**: Both the "Manuscrito" page and the "Descargar y Traducir" (Export) page use the same backend route (`/api/projects/:id/export-markdown`) ensuring consistent cleaning, formatting, and back matter inclusion.
- **Back Matter Generator**: `server/services/back-matter-generator.ts` — generates both Markdown and DOCX paragraph formats. Accepts `authorWebsiteUrl` parameter.
- **Frontend**: Catalog page at `/book-catalog`, back matter config embedded in the Export page when a project is selected.

### Series Project Editing
- **Series page** (`client/src/pages/series.tsx`): Each project volume has a settings icon (Settings2) that opens the full ConfigPanel dialog for editing chapterCount, minWordsPerChapter, maxWordsPerChapter, and all other project fields. Changes are saved via PATCH `/api/projects/:id`.
- **Config page** (`client/src/pages/config.tsx`): Edit dialog now passes `minWordsPerChapter`, `maxWordsPerChapter`, and `kindleUnlimitedOptimized` in defaultValues so they don't reset to defaults on save.

#### Enhanced Project Selector (v6.4)
- Replaced flat project dropdown with a Popover-based combobox supporting text search and multi-filter capabilities.
- **Text Search**: Filters projects by title, author name, or series name as you type. Search resets on popover close.
- **Filter by Author**: Dropdown showing only pseudonyms that have projects, plus "Sin autor" option.
- **Filter by Series**: Dropdown showing only series that have projects, plus "Sin serie" option.
- **Filter by Status**: Dropdown with all active statuses (Pendiente, Generando, Completado, Archivado, Pausado, Error, Esperando, Planificando, Revisando, Exportando).
- **Active Filter Indicator**: Shows "X de Y proyectos" count when filters are active. Clear-all button resets everything.
- **Rich Project Items**: Each item shows title, status badge (color-coded), author name, and series name with volume number.
- **Component**: `client/src/components/project-selector.tsx`.

#### Series from Project with AI Guide (v6.4)
- **Convert any project to series**: The convert-to-series button now appears on all projects without a series (not just standalone). Available from the Config page.
- **AI Series Guide Generation**: Checkbox "Generar guía de serie con IA" (enabled by default) in the convert dialog. When active, generates a series writing guide using the project's World Bible, characters, timeline, world rules, and chapter excerpts. The guide is saved to the series for maintaining coherence in subsequent volumes.
- **Backend**: `POST /api/projects/:id/convert-to-series` accepts `generateGuide` boolean parameter. Uses `generateStyleGuide` with `series_writing` type.
- **Duplicate route cleanup**: Removed duplicate `POST /api/projects/:id/create-series` route that was redundant with `convert-to-series`.

#### Link Projects to Series (v6.4)
- **Link existing generated projects to series**: `POST /api/series/:id/link-project` route allows linking a generated project to an existing series with a specified volume number.
- **Frontend**: Series dialog "Vincular Existente" now includes "Proyecto Generado" as a third link type alongside "Manuscrito Importado" and "Libro Re-editado".
- Validates volume order conflicts and inherits pseudonym from the series.

### Key NPM Packages
- `openai`: OpenAI-compatible SDK used to call DeepSeek (`baseURL: https://api.deepseek.com`).
- `drizzle-orm` / `drizzle-zod`: ORM and schema validation.
- `express`: Node.js web framework.
- `@tanstack/react-query`: React asynchronous state management.
- `wouter`: React routing library.
- `mammoth`: .docx file parsing.
- `archiver`: ZIP file creation for audiobook downloads.
- Radix UI primitives: Accessible UI components.
