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
revert-by-default vía el `bestSnapshot` del bucle. En la rama de regresión, reescribe
desde el MEJOR snapshot, no desde la versión regresada.

## Los brazos de reescritura deben alcanzarse desde TODA salida terminal

**Why:** enganchar los brazos de reescritura SOLO en algunas ramas de abandono
(sin-instrucciones, estancamiento, regresión-rendición) dejó un punto ciego: un run que
OSCILA (mejora/regresa alternando) resetea `stalledIterations` (al guardar nuevo-best) y
nunca llega al tope anti-paliza `consecutiveNonImproving`, así que termina saliendo por
la ruta de "máximo de iteraciones" — que NO tenía gancho — y los brazos NUNCA se
disparan pese a que un lector seguía corto. (Run real: Holístico tope 6/meta 7, Beta
tope 8/meta 9, cerrado sin que ningún brazo corriera.)

**How to apply:** centraliza los brazos en un helper único (`tryFinalRescueArms`) que
dispare el estructural si el Holístico < meta Y/O la prosa si el Beta < meta, y úsalo en
CADA cierre terminal del bucle, incluido el de máximo de iteraciones — no solo en las
ramas de abandono. Para poder RE-leer tras reescribir en el cierre por máximo, concede
una relectura extra ACOTADA más allá de `MAX_ITERATIONS` (var `rescueReadsRemaining` +
`while (iter < MAX || rescueReadsRemaining > 0)`), pero cierra a la fuerza en esa pasada
extra (guarda `if (rescueReadsRemaining > 0)` → finalize) y mantén los flags one-shot
para no re-disparar. No gates artificiales (p.ej. brazo Beta gated a `holistic>=meta`):
si el cuello de botella es el Holístico, querrás el brazo estructural, no bloquear el de
prosa. Sin riesgo de bucle infinito: en la pasada extra (iter ya = MAX) todos los
`continue` internos siguen gateados por `iter<MAX`.

## El pulido advisory se lanza fire-and-forget: DEBE ser resumible

**Why:** el bucle de pulido se dispara con `void loopPromise` DESPUÉS de marcar el
proyecto `status="completed"`. No es un status "processing", así que ni el watchdog de
reedición ni la reanudación de generación lo cubren: un reinicio/caída del server DURANTE
el bucle lo mata en silencio y el libro queda con su nota mediocre y los arreglos sin
aplicar (caso real: un libro de serie murió en la iteración 1 tras DETECTAR sus arreglos
pero antes de aplicarlos). Un trabajo caro y de larga duración que no está bajo ningún
status resumible es un punto ciego de recuperación.

**How to apply:** persiste un flag booleano de "pulido en curso" en el proyecto ANTES de
lanzar el bucle y límpialo en el `finally` (solo una caída DURA impide llegar al finally
→ el flag queda en true → señal de "hay que reanudar"). En el arranque, escanea proyectos
`completed` con el flag y relanza, con un TOPE de reanudaciones persistido para no gastar
tokens si el pulido se cuelga siempre. Ofrece además un disparador manual (endpoint) para
rescatar libros terminados antes del fix.

**Guard de exclusión compartido (evita doble bucle):** con DOS puntos de entrada al mismo
bucle (el `finalize` normal y el auto-resume/rescate), un disparo manual concurrente
mientras ya corre lanzaría un SEGUNDO bucle sobre el mismo libro → doble gasto de tokens +
escrituras concurrentes de capítulos/scores. El guard debe ser COMPARTIDO entre ambos
caminos (un registro común, no un set privado de cada módulo). En deploy single-instance
basta un Set en memoria de proceso; multi-instancia exigiría lock atómico en BD. Marca en
el registro ANTES de cualquier await y libera en `finally` (y en un `catch` de la
preparación, para no dejar el id "pegado" si falla antes de enganchar el finally del bucle).

**El gate de reanudación es el FLAG, no el status:** el filtro de auto-resume NO debe
exigir `status="completed"` además del flag de pulido-pendiente. Durante el pulido el
status pasa temporalmente a `applying_editorial` (antes de aplicar cirugías; vuelve a
`completed` al terminar), así que un kill A MITAD de una cirugía deja el proyecto en
`applying_editorial` → un filtro que exige `completed` se lo salta y el pulido NUNCA
reanuda (el libro se queda "parado" pese al flag). El flag de pulido-pendiente ya se pone
únicamente post-finalización, así que por sí solo implica novela terminada: filtra SOLO
por él y, al reanudar, restaura `status="completed"` si quedó atascado en
`applying_editorial` (el bucle exige `completed` para re-leer y la UI lo mostraba como
"aplicando").

**El tope de reanudaciones debe contar con reinicios BENIGNOS:** cada reinicio consume
una reanudación aunque el pulido estuviera progresando bien. En dev los checkpoints/merges
reinician el server con frecuencia, así que un tope bajo (p.ej. 3) se agota sin que el
pulido llegara a colgarse de verdad. Deja margen holgado (p.ej. 8); el bucle interno ya
está acotado por su propio tope de iteraciones, así que una reanudación que arranca
termina sola.

## Las admin actions del bucle autónomo son MEMORIA INTERNA, nunca user-facing

**Why:** el bucle autónomo persiste sus candidatos de delete/merge de capítulos en el
MISMO almacén (`projects.pendingAdminActions`) que las acciones del flujo MANUAL, pero con
`source="auto-review-loop"`. Las usa como memoria de unanimidad cross-iteración (un borrado
solo se aplica si ambos lectores coinciden; si no, se descartan al cerrar). No son para el
usuario. Cualquier superficie user-facing que lea ese almacén sin filtrar por `source`
expone esas acciones internas como si el sistema pidiera confirmación humana — rompe la
autonomía total.

**How to apply:** toda ruta user-facing sobre `pendingAdminActions` debe discriminar por
`source`: el GET de listado EXCLUYE `auto-review-loop` (solo muestra las manuales); el
"descartar todas" PRESERVA `auto-review-loop` (borrarlas a mano deja al bucle en curso sin
candidatos). El único que puede tocar las internas es el propio bucle.

## El guardián anti-fantasma puede ESTANCAR la calidad si descarta correcciones válidas

**Why:** el pulido no subía el Beta (se plantaba a un punto de la meta) porque iteración
tras iteración descartaba muchas notas del revisor "ANTES del cirujano — cita un pasaje que
ya no existe". Las mejoras de craft nunca llegaban a la prosa. El guardián de
instrucción-fantasma (`instruction-grounding.ts`) extrae las citas literales entre comillas
y descarta la instrucción si NINGUNA aparece en el texto vigente — pero el extractor tragaba
como "cita de prosa" el META-COMENTARIO del propio revisor colado entre comillas/paréntesis
(p.ej. "(cap 10, escena de la despensa) desactiva la gravedad...", ". localizar la línea
exacta..."). Eso jamás existe en la prosa → falso fantasma → arreglo legítimo tirado. Un
guardián que confunde la INSTRUCCIÓN con la PROSA citada bloquea la mejora que debía habilitar.

**How to apply:** al auditar citas contra el texto, (1) excluye de las citas auditables los
fragmentos que son claramente meta-comentario (arrancan con puntuación suelta, referencian
"cap N"/"escena"/técnica narrativa, o contienen verbos-orden editoriales tipo
localizar/desactivar/reescribir/eliminar); si tras el filtro no quedan citas, deja PASAR la
instrucción (no la trates como fantasma). (2) El matching de citas debe ser tolerante a
diferencias inocuas: quita acentos (simétrico cita↔texto) y maneja los puntos suspensivos
("inicio... final") partiendo la cita y exigiendo cada fragmento en orden. El fantasma
GENUINO (prosa realmente inexistente) se sigue descartando. Riesgo a vigilar: heurística de
meta demasiado amplia puede dejar pasar alguna instrucción stale; el bucle tiene revert de
seguridad, pero si aparece sobre-permisividad, exige 2 señales meta en vez de 1.

## Un advisory loop solo debe hacer cambios REVERSIBLES (nada estructural irreversible)

**Why:** el pulido oscilaba entre 7 y 8 sin subir porque las "mejoras" que lo bajaban
NO eran ruido de medicion: coincidian con cirugia ESTRUCTURAL (fusionar/borrar
capitulos). Dos causas se sumaban: (1) los veredictos de los lectores IA FLUCTUAN entre
lecturas del mismo manuscrito — una ronda ambos aprueban "fusionar cap X", la siguiente
lo rechazan ("cap X tiene la revelacion crucial") — asi que una aprobacion por unanimidad
PUNTUAL ejecutaba una fusion que destruia contenido clave; (2) es IRREVERSIBLE: el
revert-by-default restaura el CONTENIDO de los capitulos supervivientes pero NO reconstruye
la estructura de un capitulo ya borrado (el snapshot solo guarda contenido → "DRIFT
ESTRUCTURAL"), asi que el daño se cuela pese al revert. Las ediciones de PROSA si son
reversibles y funcionaban.

**How to apply:** en un bucle advisory que confia en "prueba-y-revierte", PERMITE solo
operaciones cuyo revert sea COMPLETO (prosa por-capitulo, restaurable desde snapshot).
PROHIBE las irreversibles (borrar/fusionar capitulos) aunque los lectores las aprueben:
intercepta por `actionType` en el ejecutor del auto-loop (`applyConfirmedAdminActions`,
unico call-site el bucle) ANTES de mutar, marcalas discarded+processed y loguealas como
sugerencia. El flujo MANUAL (endpoint propio en routes.ts, con confirmacion) conserva la
cirugia estructural. Regla general: no confies decisiones IRREVERSIBLES a un juez LLM con
varianza; reservalas a un camino con confirmacion humana o hazlas de verdad reversibles
(guardar estructura completa) antes de automatizarlas.
