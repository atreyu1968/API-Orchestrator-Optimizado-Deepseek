---
name: Bucles de re-evaluacion sin freno de convergencia
description: Por que resolver-y-reevaluar nunca llega a cero issues y como frenarlo
---
Regla: cualquier flujo "corregir → re-evaluar con LLM → mostrar issues restantes" es una cinta de correr: el juez SIEMPRE encuentra matices nuevos en cada relectura, aunque la nota sea 9+/10. El contador nunca llega a cero y la UI empuja al usuario a seguir para siempre.

**Why:** caso real — cada pasada resolvia 2 issues y la re-evaluacion devolvia otros 2; el usuario reporto "esto no se termina nunca".

**How to apply:** persistir un contador de pasadas (puede ir dentro del propio JSON del resultado, sin migracion) y declarar CONVERGENCIA cuando nota >= umbral y (N+ pasadas o los issues no bajan): los issues restantes pasan a pulido OPCIONAL, la UI baja la urgencia (boton outline, texto "terminado") y el activity log lo dice explicitamente. La via manual debe seguir abierta (nunca cerrar el boton).
