---
name: Terminal "failed" status must stay manually resumable
description: Un estado terminal creado para escapar del watchdog de auto-recuperacion debe seguir siendo reanudable por la via MANUAL, o se crea un callejon sin salida.
---

Cuando un proyecto agota la auto-recuperacion, se marca con un estado terminal
("failed") elegido a proposito para que el watchdog/auto-recovery NO lo reintente en
bucle. Ese mismo estado debe seguir aceptandose en la ruta de reanudacion MANUAL
(endpoint resume + boton de UI), porque el propio mensaje al usuario le pide
"reanudalo manualmente".

**Why:** separar "no auto-reintentar" de "no reanudar nunca" es facil de confundir:
si el estado terminal se excluye de AMBOS caminos, el usuario queda sin forma de
continuar (callejon sin salida), aunque el sistema le diga que puede.

**How to apply:** al anadir un estado terminal para frenar la auto-recuperacion,
revisa que las listas de "estados reanudables" del endpoint de resume Y del boton de
UI lo incluyan. El watchdog/auto-recovery usa su propio mecanismo (heartbeat/actividad
reciente), no el endpoint manual: anadir el estado al resume manual NO reactiva el
bucle automatico.
