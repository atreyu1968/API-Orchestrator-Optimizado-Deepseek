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

## Aceptación ABSOLUTA vs DELTA + brazo de PROSA última-milla

**Why:** el target dual del pulido (Beta≥9 AND Holístico≥7) casi nunca se clava al
100%, pero el caso REAL típico es "Holístico EN su meta absoluta y Beta a un punto"
(p.ej. Beta=8/Holístico=7). Un criterio de salida que solo mira el DELTA del Holístico
(debe SUBIR ≥+2 desde el inicio) marca falsamente "no convergida" una novela que
empezó alta y solo subió +1 pero YA está en meta. Lo que importa es el VALOR ABSOLUTO,
no cuánto subió.

**How to apply:** la salida aceptable debe disparar con `absoluteOk` (cada lector ≥ su
meta, con tolerancia -1 al Beta) **O** el delta histórico — no solo el delta. El criterio
absoluto NO debe exigir `initialHolisticScore` (puede no existir si la 1.ª lectura
falló).

**Why (brazo última-milla):** el cirujano cap-a-cap PARCHEA, no reescribe prosa; cuando
toca techo con el Beta solo regresa (oscila) y nunca lo sube. Subir el Beta de verdad
exige REESCRIBIR la prosa (craft) de los capítulos peor valorados.

**How to apply:** brazo `runBetaProseLastMileRewrite` que reescribe SOLO craft
(voz/ritmo/diálogo/mostrar-no-contar), PROHIBIDO tocar hechos/canon/longitud; objetivos
= capítulos anclados por el Beta con contenido real; one-shot por run; tope de caps;
revert-by-default vía el `bestSnapshot` del bucle. Engánchalo en las ramas de ABANDONO
(sin-instrucciones, estancamiento, regresión-rendición), nunca en el flujo normal, para
acotar coste. En la rama de regresión, reescribe desde el MEJOR snapshot, no desde la
versión regresada.
