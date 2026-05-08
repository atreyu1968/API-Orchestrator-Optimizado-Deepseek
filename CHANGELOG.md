# Changelog — LitAgents

Historial detallado de fixes y novedades. Las entradas más recientes están en `replit.md` ("Recent fixes"); cuando se asientan, se trasladan aquí.

---

## v7.7 — Holístico gate + Beta mid-novela

- **[Fix29+30] Holístico gate pre-Final-Reviewer + Beta mid-novela como editorialCritique**: Dos mejoras del orquestador principal que aprovechan los lectores completos para reducir ciclos quemados y mejorar la segunda mitad del manuscrito. (a) **[Fix29]** Antes del primer ciclo de `runFinalReview` (`server/orchestrator.ts` ~L3595) se invoca `runHolisticReview` UNA sola vez sobre el manuscrito completo y, si devuelve notas (>200 chars), se trunca a 12k chars y se almacena en `holisticGateNotes`. En el ciclo 1 del FR esas notas se anteponen a `issuesPreviosCorregidos` con prefijo `[FIX29 — INFORME HOLÍSTICO PRE-FINAL-REVIEWER, alta prioridad estructural]`. En ciclos 2+ ya no se reinyectan (evita duplicar). Best-effort. NOTA: re-invocar al Arquitecto post-generación NO es viable (los capítulos ya existen y un nuevo outline los dejaría huérfanos). (b) **[Fix30]** Nuevo campo opcional `editorialCritique?: string` en `GhostwriterInput` renderizado como bloque "📖 CRÍTICA DEL LECTOR BETA SOBRE LA PRIMERA MITAD" (truncado a 8k). En el loop principal de generación, después de `runProactiveSemanticScan`, si `completedSoFar >= floor(totalChapters * 2/3)` y quedan ≥2 capítulos por escribir y la novela tiene ≥6 capítulos en total, se dispara `runMidNovelBetaReview` UNA sola vez (variante scoped que filtra a solo capítulos `completed` con contenido) y se guarda `notesText` en `midNovelBetaCritique`. Las llamadas posteriores al Ghostwriter reciben `editorialCritique`. Flag `midNovelBetaAttempted` garantiza one-shot incluso si falla.

## v7.6 — Holístico+Beta del reedit + logs descargables + auditor de cierre

- **[Fix34] Holístico+Beta del reedit con human-in-the-loop**: Replica del "mismo proceso" del pipeline principal en el reedit. (a) Nuevo campo `reeditProjects.pendingEditorialParse: jsonb` (`shared/schema.ts` L640) — requiere `npx drizzle-kit push:pg`. (b) Util reutilizable `server/utils/reedit-editorial-parser.ts` con `parseHolisticBetaForReedit({notesText, chapterIndex, projectTitle})`: primero intenta extraer bloques `<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO/FIN -->` (camino determinista, sin LLM); si no hay, cae a `EditorialNotesParser.execute()`. Normaliza tipos a `puntual|estructural|global_rename` (auto-aplicables) vs `eliminar|fusionar|global_style|regenerate_chapter|restructure_arc` (administrativos). Asigna `id` numérico estable para tracking en UI. (c) Stage 8 del reedit ([Fix24]) extendido: tras persistir los `reeditAuditReports` de Holístico+Beta, concatena ambos `notesText`, llama al parser y persiste `pendingEditorialParse` en el reedit_project. (d) Nuevo método `ReeditOrchestrator.applyHolisticBetaInstructions(projectId, selectedIds[])`: enruta `puntual`/`estructural` a `SurgicalPatcherAgent` por capítulo, `global_rename` a find/replace word-boundary determinista vía regex Unicode, y administrativas a skip. (e) Tres endpoints nuevos en `server/routes.ts`: `GET .../pending-editorial-parse`, `POST .../apply-holistic-beta-instructions`, `DELETE .../pending-editorial-parse`. (f) UI en pestaña Auditorías de `client/src/pages/reedit.tsx`: nueva `Card` con cada instrucción (checkbox, badges de tipo/categoría/prioridad, capítulos afectados, razón de no-auto-aplicable). Botones "Aplicar seleccionadas" y "Descartar".

- **[Fix33] Logs descargables del reedit**: Nuevo sistema de logs persistentes por proyecto de reedit. `server/utils/reedit-logger.ts` expone `logReeditEvent(projectId, level, stage, message, {chapter, context})`. Cada llamada hace append asíncrono fire-and-forget (mutex por `projectId`) a `data/reedit-logs/{projectId}.log` (no versionado). Formato por línea: `[ISO_TS] [LEVEL] [stage] [cap=N?] mensaje {json context?}`. `emitProgress` del `ReeditOrchestrator` emite también `logReeditEvent` por cada evento. Endpoints: `GET .../logs/download`, `GET .../logs/stats`, `DELETE .../logs`. UI: pestaña Auditorías añade botones "Descargar logs" y "Borrar".

- **[Fix32] Auditor de Cierre de Tramas en post-reedit**: Nuevo agente `PlotThreadClosureAuditorAgent` integrado como cuarta tarea paralela del Stage 8 del reedit ([Fix24]). Lee el manuscrito completo y produce inventario exhaustivo de TODAS las tramas y subtramas con estado individual de cierre (`cerrada`, `cierre_parcial`, `abierta_intencional` con justificacion, `abierta_colgante` con `fix_sugerido`), evidencia textual breve de apertura y cierre por trama, agregados (`puntuacion_cierre 0-10`, contadores por estado, `tramas_colgantes_criticas`). Persiste como `reeditAuditReports.auditType = "plot_threads_closure"`. Detecta automaticamente VOLUMEN INTERMEDIO de saga para ser tolerante con ganchos abiertos.

## v7.3 — Aprovechar el contexto de 1M en reedición y dos lectores en paralelo

- **[Fix24..28+31] Aprovechar 1M ctx en reedit + dos lectores en paralelo**: (a) **[Fix24] Stage 8 post-reedit** (`reedit-orchestrator.ts:runStage8PostReeditReviews`): nuevo método best-effort lanzado tras marcar el reedit como `completed` que ejecuta `HolisticReviewerAgent` + `BetaReaderAgent` (+ `ManuscriptAnalyzerAgent` si hay `seriesId`) sobre el manuscrito reeditado y persiste tres `reeditAuditReports` con auditType `holistic_review` / `beta_review` / `series_snapshot`. Un fallo aquí NO revierte el reedit. (b) **[Fix25] Beta paralelo en `runAutoHolisticReviewLoop`**: Holístico + Beta vía `Promise.allSettled`, ambos `notesText` se concatenan con cabeceras separadoras y se pasan en una sola llamada al parser. (c) **[Fix26] `previousChaptersFullText` + `previousVolumesFullText` en chapter-expander**: nuevos campos opcionales en `ChapterExpansionInput` y `NewChapterInput`. (d) **[Fix27] Capítulos previos íntegros en QA del reedit**: wrappers `auditContinuity` y `auditVoiceRhythm` aceptan parámetro nuevo `previousChaptersFullText`. (e) **[Fix28] ManuscriptAnalyzer con presupuesto adaptativo de 800K chars**: si la suma de capítulos cabe, se envía ÍNTEGRO; si excede, recorte head+tail por capítulo proporcional al ratio y mínimo 2000 chars por capítulo. (f) **[Fix31] Regen del snapshot de saga al final del reedit**: integrado dentro del Stage 8.

## v7.2 — Robustez post-revisión tras logs reales

- **[Fix18] Plot Integrity Auditor**: Nuevo agente que audita la escaleta del Arquitecto en 3 dimensiones —foreshadowing/seeds-payoffs, coherencia operacional del antagonista, ritmo y densidad del acto 3. Loop de retry (max 2 iter, threshold 7/10) que reinvoca al Arquitecto via `plotIntegrityFeedback`. PHASE2 del Arquitecto extendido con 6 campos opcionales por capítulo (`siembra`, `cosecha`, `tension_objetivo`, `dias_diegeticos`, `eventos_pivotales`, `justificacion_antagonica`).
- **[Fix19] Cabecera de capítulo duplicada en exportación**: Nueva utilidad `stripMetaChapterHeader` aplicada como defensa en profundidad en exportación ES, traducciones, pipeline de reedición y docx-exporter.
- **[Fix20] Timeout Arquitecto Fase 2 ampliado**: Fase 2 sube a 18 min; `HEARTBEAT_TIMEOUT_MS` del queue-manager pasa de 15 → 22 min. `BaseAgent.generateContent` emite activity log al reintentar tras timeout. `QueueManager.checkHeartbeat` consulta DB antes de declarar congelado.
- **[Fix21] Cap absoluto ±15% en fallback de cirugía → narrador**: `hardLower/hardUpper` garantiza que el fallback nunca se desvíe más del ±15% del original.
- **[Fix22] Buffer de instrucciones rechazadas por el cirujano para el Revisor Final**: Nueva propiedad `staleInstructionsForFinalReviewer` que se vacía al inicio de cada `runFinalReview`. Las instrucciones rechazadas se reinyectan con prefijo `[FALSO POSITIVO YA VERIFICADO POR EL CIRUJANO — NO VUELVAS A EMITIRLO]`.
- **[Fix23] Logging de pulidos anómalos en CopyEditor**: Si un pulido excede 5 min, `console.warn` con duración y nombre de capítulo.

## v7.1 — Reedición conectada a la saga

- **Coherencia inter-libro al reeditar**: Cuando se reedita un libro de una serie, los tres agentes principales del flujo de reedición reciben el texto íntegro de los volúmenes anteriores. Cada prompt incluye un bloque "VOLUMENES ANTERIORES DE LA SERIE".
- **Cache resiliente por proyecto**: Helper `getPreviousVolumesFullTextForReedit(project)` con cache `Map<projectId, string>`. Solo se cachea cuando el resultado es un estado confirmado.
- **Reuso del helper estático** `Orchestrator.buildPreviousVolumesFullText` (presupuesto 600K chars, newest-first).
- **7 puntos de cableado**: 1x Editor, 1x Copyeditor y 5x Reescritor Narrativo.

## v7.0 — Aprovechar el 1M de contexto de DeepSeek V4

- **T001 — Series en el Arquitecto**: Helper `Orchestrator.buildPreviousVolumesFullText` que carga el texto íntegro de los volúmenes previos.
- **T002 — Reedición: capítulos previos del manuscrito al editor**: `ReeditOrchestrator.buildPreviousReeditChaptersFullText` pasa el texto íntegro de los capítulos ya editados.
- **T003 — Re-arquitectura mid-novela**: Nuevo endpoint `POST /api/projects/:id/regenerate-outline` con body `{ fromChapter, instructions? }`. UI con icono de varita mágica en cada capítulo ≥ 2.
- **T004 — Catalogo del pseudonimo (anti-self-repetition)**: Helper `Orchestrator.buildPseudonymCatalog`.
- **T005 — Voz de referencia (extendedGuide) integra al Arquitecto**: Se carga el contenido completo de `extended_guides.content`.

## v6.9 — Taller de Guías: "Novela para Pseudónimo"

- **Cambio de propósito de "Estilo de Pseudónimo" → "Novela para Pseudónimo"**: La IA inventa una novela original completa apropiada para ese seudónimo.
- **Creación automática de proyecto**: Al terminar la generación se crea el proyecto vinculado al seudónimo.
- **Contrato del agente**: La primera línea de la respuesta debe ser `TÍTULO DE LA NOVELA: ...`.

## v6.8 — Revisor Holístico, Beta-Reader y Fix Crítico de Escaleta

- **Nuevo agente Revisor Holístico (severo)**: Lee la novela completa y devuelve un dictamen editorial duro estilo editor profesional.
- **Nuevo agente Beta-Reader**: Resena en primera persona desde la perspectiva de un lector exigente.
- **Límite de notas editoriales 50K → 200K caracteres**.
- **FIX CRÍTICO — Escaleta perdida en agentes de revisión**: Bug latente en 8 sitios duplicados donde se construía `escaleta_capitulos: worldBible.plotOutline as any[] || []`. Ahora todos usan el helper centralizado `reconstructWorldBibleData`.

## v6.7 — Migración a DeepSeek V4

- **Backend de IA migrado a DeepSeek V4-Flash**: Todos los agentes ahora usan DeepSeek V4-Flash via API compatible con OpenAI.
- **Reducción de costos ~5x**: De $0.30/$2.50 (Gemini 2.5 Flash) a $0.14/$0.28 por millón.
- **Eliminación total de Gemini**.

## v6.6 — Notas Editoriales en Dos Pasos

- **Soporte multi-capítulo en notas editoriales**.
- **Previsualización antes de aplicar**: Nuevo flujo en dos pasos con checkboxes de selección.
- **Carga de notas desde archivo**: Acepta `.txt` y `.md`.
- **Snapshot pre-edición + diff visual**: Cada capítulo modificado muestra un botón "Ver cambios".
- **Revisión Final automática post-editorial**.
- **Cancelación entre capítulos**.
