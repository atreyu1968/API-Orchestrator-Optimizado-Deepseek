---
name: Invalidación de memoria de meseta tras cirugía estructural
description: La memoria de meseta entre rondas del pulido debe borrarse cuando el manuscrito cambia estructuralmente fuera del bucle.
---

Regla: cualquier vía que mute estructuralmente el manuscrito FUERA del bucle de pulido (fusión/borrado/división por acciones admin, reescritura por chat editorial, rewrite manual de capítulo, purga de duplicados) debe invalidar el historial de meseta persistido (`__polish_history` y `__structural_rescue_history`) con un helper compartido que además deja log de actividad ("el manuscrito cambió estructuralmente").

**Why:** el techo histórico se midió sobre un texto que ya no existe; sin invalidación, el relanzamiento del pulido se corta en la iter 2 "por meseta histórica" justo cuando el usuario ejecutó la cirugía para desbloquear la nota.

**How to apply:** al añadir cualquier endpoint/flujo nuevo que fusione, borre, divida o reescriba capítulos de un proyecto, llamar al helper de invalidación tras el éxito de la mutación (best-effort, nunca revertir la cirugía por un fallo al limpiar).
