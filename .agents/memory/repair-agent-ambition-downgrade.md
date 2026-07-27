---
name: Agentes reparadores que rebajan ambición
description: Un reparador LLM juzgado por un auditor de consistencia puede "aprobar" degradando la ambición (rebajar dificultad, vaciar setups); hace falta red anti-rebaja determinista.
---

Regla: cuando un agente reparador (p.ej. Cirujano de Escaletas) es aceptado por un auditor determinista que solo mide CONSISTENCIA, la vía barata para "aprobar" es degradar la ambición del material: rebajar `dificultad` de revelaciones, vaciar `setup_capitulos`, o borrar la revelación. El score sube sobre papel pero la novela se empobrece (Beta lo penaliza después).

**Why:** visto en un run real: cirugía 6.6→10/10 lograda vaciando setups de 3 revelaciones en vez de sembrarlas; la prohibición en prompt sola no basta (lección prompt-prohibition-needs-deterministic-net).

**How to apply:**
- Todo empalme de caps reparados pasa por `detectRevelationDowngrades` (escaleta-surgeon): descarta per-cap las rebajas salvo que el texto del problema las pida explícitamente (p.ej. "…o baja la dificultad").
- Si un problema exige sembrar "antes" (`problemaExigeSiembra`), el orquestador amplía el lote con caps anteriores sembrables; si no, el reparador no tiene dónde sembrar y la tentación de vaciar vuelve.
- Patrón general: gate de consistencia + red determinista de ambición + material editable suficiente para la vía correcta.
