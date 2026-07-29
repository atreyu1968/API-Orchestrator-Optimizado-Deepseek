---
name: Sistema de Revisión Editorial Externa
description: Flujo independiente del pipeline principal para aplicar críticas de lectores externos con tres agentes nuevos.
---

## Arquitectura

### Agentes nuevos
- `server/agents/critique-classifier.ts` — `CritiqueClassifierAgent`: parsea crítica libre → plan estructurado con intervenciones clasificadas (puntual/densidad/siembra/estructural)
- `server/agents/density-pruner.ts` — `DensityPrunerAgent`: poda redundancias (12-18%) eliminando el loop acontecimiento→explicación→interpretación→recordatorio
- `server/agents/retroactive-seeder.ts` — `RetroactiveSeederAgent`: planta semillas retroactivas en caps tempranos para preparar revelaciones tardías

### Orquestador independiente
- `server/external-review-runner.ts` — `runExternalReview()`: ejecuta intervenciones en orden seguro (puntual → densidad → siembra → estructural)

### Schema
Dos campos añadidos a `projects`:
- `externalReviewStatus: text` — null/"parsing"/"parsed"/"running"/"completed"/"failed"
- `pendingExternalReview: jsonb` — shape `ExternalReviewPlan` (ver `critique-classifier.ts`)

### Rutas
- `POST /api/projects/:id/external-review/parse` — clasifica crítica → guarda plan (202 + SSE)
- `POST /api/projects/:id/external-review/run` — ejecuta intervenciones seleccionadas (202 + SSE)
- `GET /api/projects/:id/external-review` — devuelve estado y plan actual

### UI
- `client/src/components/external-review-dialog.tsx` — diálogo de 3 pasos: plantilla/crítica → plan con checkboxes → ejecución con logs en tiempo real
- Accesible desde dashboard en proyectos completados: botón "Revisión Editorial Externa" con icono Sparkles

## Badge "Revisado por editor"
Cuando `externalReviewStatus === "completed"`, el `ProjectSelector` muestra un badge morado "✨ Revisado por editor" en lugar del badge de estado de generación. Aplica tanto al botón de cabecera como a cada fila del desplegable.

## Patrones clave

**Why:** `applyOperations` del SurgicalPatcherAgent se reutiliza para las podas del DensityPruner (mismo formato find_exact/replace_with). No duplicar la lógica de anclaje normalizado.

**Why:** El orden puntual→densidad→siembra→estructural es seguro porque las estructurales (ChapterRewriteAgent) regeneran el capítulo entero — al revés causaría que las podas se apliquen sobre texto que luego se regenera.

**SSE:** El runner envía eventos via el canal SSE existente del proyecto (`activeStreams`). El cliente escucha `external_review_parsed`, `intervention_start/progress/done/failed`, `external_review_done`.

## Fix: structural interventions (ChapterRewriteAgent)
`runEstructural` ya NO usa `applyEditorialNotes` (pipeline de generación). Usa `ChapterRewriteAgent` (`server/agents/chapter-rewriter.ts`) que recibe el capítulo completo + instrucción + `contradictionsToRemove[]` y devuelve un capítulo reescrito coherente. `contradictionsToRemove` lo genera el `CritiqueClassifier` para intervenciones estructurales. Guarda backup en `preEditContent`.

**Why:** `applyEditorialNotes` añadía contenido correcto sin eliminar el contradictorio → dos versiones convivían. El ARE reescribe desde cero.

## Fix: puntual multi-capítulo (OccurrenceScannerAgent)
`runPuntual` con `capitulosAfectados.length > 1` ahora usa `OccurrenceScannerAgent` (`server/agents/occurrence-scanner.ts`) como primer paso: escanea todos los capítulos juntos semánticamente y devuelve TODAS las ocurrencias (incluyendo rephrasings). Solo cae a cirugía individual si el escáner no devuelve resultados.

**Why:** el Cirujano solo parcheaba el ancla identificada por el Classifier; si el mismo error aparecía con 3 fórmulas distintas, solo se corregía la primera.
