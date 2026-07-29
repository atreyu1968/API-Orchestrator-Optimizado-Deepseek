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

## Patrones clave

**Why:** `applyOperations` del SurgicalPatcherAgent se reutiliza para las podas del DensityPruner (mismo formato find_exact/replace_with). No duplicar la lógica de anclaje normalizado.

**Why:** El orden puntual→densidad→siembra→estructural es seguro porque las estructurales (que relanzcan applyEditorialNotes) pueden cambiar capítulos que los pasos anteriores ya procesaron — al revés causaría que las podas se apliquen sobre texto que luego se regenera.

**SSE:** El runner envía eventos via el canal SSE existente del proyecto (`activeStreams`). El cliente escucha `external_review_parsed`, `intervention_start/progress/done/failed`, `external_review_done`.
