---
name: Grounding con pajar combinado vs por-capitulo
description: Validar citas de una instruccion multi-capitulo contra el conjunto de caps y luego purgar por-capitulo crea no-ops masivos.
---

Regla: toda auditoria de citas literales debe hacerse en el MISMO ambito en que
se ejecuta la instruccion. Si una instruccion multi-capitulo se valida contra
el pajar combinado de sus capitulos (cita "viva" en el conjunto) pero luego se
enruta y purga capitulo a capitulo, la cita esta muerta en casi todos los caps
y la purga anula la instruccion entera en cada uno — iteraciones y brazos de
reparacion completos quedan en no-op sin que ningun log individual lo delate.

**Why:** una novela real perdio 11/12 reescrituras de una iteracion de pulido y
el brazo estructural completo por este desajuste de ambitos; el Holistico se
quedo estancado sin municion.

**How to apply:** al purgar por-capitulo, antes de descartar, retirar solo las
citas muertas y dejar pasar la intencion semantica si queda sustancia (con
aviso al cirujano de que declare "no aplica" si corresponde a otro cap). Purga
total solo cuando la instruccion era esencialmente la cita.
