---
name: Cirugía dirigida vs regeneración total para feedback de jueces
description: Cuándo el feedback de un juez de escaleta debe repararse quirúrgicamente en vez de regenerar todo
---

Regla: si un juez (Beta, auditor) devuelve problemas ANCLADOS a capítulos concretos, la corrección debe ser cirugía dirigida sobre la mejor versión vigente (reparar solo los caps citados y empalmar), NO regenerar la escaleta/World Bible desde cero. La regeneración total solo como fallback para quejas globales sin ancla.

**Why:** regenerar todo en cada iteración es una lotería: arregla la queja citada pero re-tira los dados sobre el resto. Caso real: 3 iteraciones del bucle Beta, 3 sietes con problemas DISTINTOS cada vez (whack-a-mole), novela escrita sobre escaleta 7/10 que luego tocó techo en el pulido.

**How to apply:** criterio de anclaje = TODOS los problemas mayores citan capítulos existentes. Además, los defectos medibles (p.ej. >3 caps de resolución tras el clímax por tension_objetivo) se detectan en código y se inyectan como problema mayor citable — no se deja que un juez LLM los encuentre (o no).
