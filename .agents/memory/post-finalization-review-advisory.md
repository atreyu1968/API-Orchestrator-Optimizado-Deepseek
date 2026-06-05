---
name: Post-finalization auto-review loop must be advisory
description: Por qué el bucle Holístico+Beta que corre tras finalizar (runAutoHolisticReviewLoop) nunca debe revocar la aprobación del Revisor Final ni saltar la ortotipográfica.
---

# El pulido post-finalización es ADVISORY, no un nuevo veredicto

`runAutoHolisticReviewLoop` (server/orchestrator.ts) corre DESPUÉS de
`finalizeCompletedProject`, que solo se alcanza con un manuscrito YA APROBADO por el
Revisor Final (9+/10). Por tanto el bucle es un PULIDO opcional, no una nueva puerta
de aprobación.

**Regla:** ningún cierre del bucle debe dejar el manuscrito "no aprobado" ni saltar la
corrección ortotipográfica final. Todo cierre terminal pasa por un helper único
(`finalizeAdvisoryWithOrtho`) que restaura el mejor snapshot, persiste las sugerencias
restantes como pulido OPCIONAL y SIEMPRE ejecuta la ortotipográfica.

**Why:** antes los cierres no-convergidos solo hacían `persistAutoReviewResult` →
dejaban el manuscrito sin pulir pese al 10/10 del Revisor Final; el usuario veía una
novela "no aprobada" que en realidad ya era bestseller.

**Excepción única:** si un cierre depende de un manuscrito ÍNTEGRO y no hay snapshot
limpio que restaurar, NO ejecutes ortho — aborta para revisión manual. Dos casos:
"ambos lectores fallan" sin `bestSnapshot` (fallo operativo de la primera lectura) y
`apply_failed` sin snapshot (applyEditorialNotes pudo dejar la prosa PARCIAL). El
cierre técnico `parser_failed` SÍ es siempre seguro: el parser corre ANTES de tocar la
prosa.

## Anti-paliza en la rama de regresión

**Why:** la rama de regresión (revertir al mejor snapshot y reintentar) hacía
`continue` SIN incrementar ningún contador de estancamiento → una novela que oscilaba
gastaba TODAS las iteraciones dándose de paliza.

**How to apply:** una rama que revierte-y-reintenta debe contar sus rondas
consecutivas sin avance (`consecutiveNonImproving` + tope), resetear el contador solo
al guardar un nuevo mejor snapshot, y cerrar advisory cuando lo agota. El contador de
estancamiento normal (`stalledIterations`) NO cubre la regresión porque la regresión
hace `continue` antes de llegar a él.
