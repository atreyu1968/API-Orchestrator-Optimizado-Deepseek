---
name: Cirugía sobre capítulo ya corto — dos bugs encadenados
description: Un capítulo en la zona gris [FLEXIBLE_MIN, TARGET_MIN) entra al bucle de cirugía post-finalización y queda atascado en un bucle infinito de rechazos. Dos fixes aplicados.
---

## El problema

**Zona gris**: el Ghostwriter acepta capítulos en `[FLEXIBLE_MIN, TARGET_MIN)` donde `FLEXIBLE_MIN = TARGET_MIN * 0.90`. Para un proyecto de 2200w mínimo, eso es [1980w, 2200w). Un capítulo a 2019w pasa el gate del Narrador original pero está por debajo del mínimo real.

En el bucle de pulido post-finalización, `surgeryFloor = minWordsPerChapter = 2200w`. Cualquier cirugía sobre ese capítulo corto es rechazada por Fix_SurgeryWordFloor antes de guardarse.

**Bug de fallthrough**: cuando Fix_SurgeryWordFloor rechaza (resultado < floor), el código no hace `return` — cae al bloque Fix69-B ("ninguna ancló texto literal"), que también hace `return` sin llegar nunca al Ghostwriter (PASO 2). El comentario "Se cae al Ghostwriter" era incorrecto. El Ghostwriter nunca se alcanzaba.

Resultado observado: el capítulo queda marcado como `completed / needsRevision: false` a 2019w, el log muestra los dos mensajes contradictorios en el mismo timestamp, y el bucle lo salta para siempre.

## Los dos fixes (Fix_ShortChapterPreSurgery + Fix_SurgeryWordFloor-B)

**Fix A — Pre-check antes de PASO 1** (`Fix_ShortChapterPreSurgery`):
Al entrar a `rewriteChapterForQA`, antes de llamar al Cirujano, se comprueba `originalWordCount < surgeryFloor`. Si es verdad, se loguea y se salta directamente a PASO 2 (Ghostwriter), que sí tiene redes de longitud.

**Fix B — Flag en Fix_SurgeryWordFloor** (`Fix_SurgeryWordFloor-B`):
Se añade `let surgeryRejectedByFloor = false` antes del bloque de operaciones. Cuando Fix_SurgeryWordFloor rechaza, se setea el flag. Antes de Fix69-B se comprueba: si `surgeryRejectedByFloor`, se salta Fix69-B y la ejecución cae naturalmente a PASO 2.

**Why:** Fix A es la solución proactiva (nunca intentar cirugía si el capítulo ya está corto). Fix B es la red de seguridad (si por algún motivo la cirugía se intenta igualmente y el resultado sigue corto, no cae al lugar equivocado). Ambos son necesarios.

**How to apply:** Siempre que se añada una nueva ruta de rechazo dentro del bloque `if (operations.length > 0)` de `rewriteChapterForQA`, verificar que no hace `return` sin haber alcanzado PASO 2, o establecer `surgeryRejectedByFloor = true`.

## También relevante

- `qaGlobalReportBlock` se usa tanto en PASO 1 (prompt del Cirujano) como en PASO 2 (prompt del Ghostwriter). Debe definirse antes de cualquier branch de Fix_ShortChapterPreSurgery.
- `worldBibleContextForPatcher` y `neighborExcerptsForPatcher` son exclusivos de PASO 1 y van dentro del `else` de Fix_ShortChapterPreSurgery (no hace falta computarlos si se va directo al Ghostwriter).
