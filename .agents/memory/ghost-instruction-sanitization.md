---
name: Citas muertas: sanear, no purgar entero
description: Como tratar instrucciones editoriales que citan prosa de versiones anteriores del texto.
---

Regla: cuando una instruccion editorial cita prosa que YA no existe en el texto
vigente (lectores con memoria de versiones viejas + reverts a snapshot), retirar
SOLO la cita muerta (marcador en su lugar) y conservar la intencion semantica;
una "puntual" sin ninguna cita viva baja a "estructural". Nunca descartar la
instruccion entera solo por citas obsoletas.

**Why:** la purga total mataba iteraciones completas del pulido (1 aplicada / 11
purgadas en un log real): se pagaba la relectura de novela entera sin aplicar nada.

**How to apply:** el saneador determinista debe usar EXACTAMENTE la misma
extraccion/normalizacion de citas que la purga downstream, o la purga seguira
matando lo que el saneador dejo pasar.

Regla hermana: un brazo de reescritura debe contar exito por DIFF real del
contenido en BD (antes/despues), no por intentos — rewriteChapterForQA puede ser
no-op silencioso (purga fantasma, cirujano que rechaza) y un "completada: N caps"
falso concede relecturas extra que cuestan una lectura de novela cada una.
