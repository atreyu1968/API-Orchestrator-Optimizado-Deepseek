---
name: Re-edit coverage gating & selective reverts
description: Reglas durables del motor de re-edit de LitAgents — cómo dar por cubierta una instrucción y cómo revertir snapshots sin perder arreglos válidos.
---

## Cobertura por instrucción (NO usar flag global)

Regla: una instrucción editorial puntual solo se da por CUBIERTA si hay evidencia POR INSTRUCCIÓN — una operación del cirujano cuyo `justification` empieza por el índice 1-based de la instrucción (`"N:"`). Nunca por un flag global tipo `appliedOk` ("se aplicó alguna operación en el capítulo").

**Why:** el architect lo señaló como bug severo (FAIL) dos veces en esta familia de cambios. Con `|| appliedOk`, en cuanto el cirujano aplicaba UNA operación se marcaban cubiertas TODAS las instrucciones del capítulo, dejando puntuales sin resolver y sin escalar a reescritura — exactamente lo contrario del objetivo "cubrir todas".

**How to apply:** al revisar/editar la lógica de cobertura en `applyEditorialNotes` (server/orchestrator.ts), exige el match `"N:"` por instrucción; si el cirujano reporta "aplicada" pero ninguna operación la mapea, escala a reescritura con el Narrador. `siembra_ausente` no se fuerza (anti deus ex machina): va al Revisor Final. El reedit-orchestrator usa `instructionCount:1` por pasada, así que el bug no aplica ahí.

## Reversiones selectivas por capítulo

Regla: al revertir al mejor snapshot por regresión de score, restaura SOLO los capítulos que la reseña vigente sigue señalando (`extractFlaggedChapters` sobre las notas actuales), conservando el resto. Fallback a restore completo si el conjunto viene vacío. Se aplica únicamente en los PUNTOS DE REGRESIÓN (Revisor Final, loop holístico, loop Beta), NO en los restores de salida (aprobación / máx-iteraciones), que restauran completo a propósito.

**Why:** un revert completo deshacía arreglos legítimos que una reseña posterior ya no señalaba, perdiendo trabajo bueno por una caída de nota global.

**How to apply:** `restoreSnapshot` acepta `restoreOnly?: Set<number>`; maneja drift estructural (capítulos del snapshot que ya no existen). No introducir reversión selectiva en los restores de salida — es una decisión deliberada.

## Capas de auto-revert tras aplicar notas editoriales

Tras `applyEditorialNotes` hay DOS gatillos de revert distintos en `recalculateFinalScoreAfterEdits`, con umbrales y señales DELIBERADAMENTE diferentes — no unificarlos:
- Catastrófico del REVISOR FINAL (Fix69-C): caída ≥2.0 de la nota del Revisor Final → revierte y cortocircuita (`return`) ANTES del bloque de lectores.
- Regresión de LECTORES (Fix139): si la lectura real (Holístico/Beta) empeora aunque el Revisor Final no caiga catastróficamente. Guardas: ambos lectores con nota nueva Y previa, `bestDelta<=0` (ninguno mejoró), `worstDelta<=-1.0` (al menos uno bajó ≥1 punto), Y la nota del Revisor Final NO mejoró (ambas comparables y `new<=prev`).

**Why:** las notas editoriales pueden mantener o subir la nota del Revisor Final y AUN ASÍ empeorar la lectura del lector real; sin Fix139 ese caso solo se avisaba y nunca revertía. Regla de ambigüedad: si el Revisor Final MEJORA o no es comparable (falta alguna nota), NO se revierte por lectores — revertir tiraría una ganancia real o se basaría en datos incompletos. El architect dio FAIL hasta exigir ambas notas del Revisor Final presentes.

**How to apply:** todo revert post-edición debe ser coherente texto+score+informe (filosofía Fix134): al restaurar la prosa (a `preEditContent`, `continuityState:null`), repón TAMBIÉN los scores e informes previos (`finalScore`/`finalReviewResult`, `holisticScore`/`betaScore`, `lastHolisticNotes`/`lastBetaNotes` + timestamps), porque la re-evaluación de lectores ya persistió las notas NUEVAS. Restaura notas por `!== null` (no truthy) para cubrir versión previa sin notas (`""`). El World Bible modificado en la sesión NO se revierte (solo prosa de capítulos): avisar por log.
