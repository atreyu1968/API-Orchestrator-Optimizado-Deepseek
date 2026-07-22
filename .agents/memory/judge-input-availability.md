---
name: Juez que exige material de entrada
description: Como manejar agentes/jueces que requieren notas u otro material que puede faltar en el estado
---
Regla: cuando un paso automatico (juez, diagnostico) exige material de entrada (p.ej. notas de lectura), no debe salir en silencio si falta. Cadena: (1) copiar el material al estado en el momento en que se produce; (2) si falta, recuperarlo de su fuente persistida (fila del proyecto); (3) ultimo recurso, generarlo fresco (lectura puntual), preservando estados de pasos ya cerrados; (4) solo entonces rendirse con log claro.

**Why:** el pipeline de calidad guardaba las notas de los lectores en la fila del proyecto pero no en el estado del run; el juez de decisiones exigia las notas del estado y hacia no-op silencioso — el panel prometia "decisiones pendientes" que nunca aparecian y el usuario lo percibio como proceso roto.

**How to apply:** al añadir un consumidor nuevo de material producido por otro paso, verificar en que almacen queda ese material y copiarlo al estado compartido en origen; en el consumidor, implementar recuperacion escalonada + log, nunca return silencioso.

Regla 2 (misma familia): un veredicto "necesita revision" sin `instrucciones_revision` NO debe romper el bucle de retries en silencio — sintetizar las instrucciones desde la lista de problemas (severos primero, descripcion+sugerencia) y reintentar; solo rendirse si tampoco hay problemas accionables, siempre con aviso en el activity log (console.warn es invisible para el usuario). Este agujero aparecio 3 veces: bucle WBA, Lector Beta de escaletas y Auditor Estructural.
