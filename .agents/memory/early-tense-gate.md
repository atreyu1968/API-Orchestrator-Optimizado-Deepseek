---
name: Puerta de tiempo verbal temprano
description: Por que el tiempo verbal se juzga sobre la PROSA real (no sobre la guia) y como se fija para los capitulos futuros.
---

# Puerta de tiempo verbal temprano

El tiempo verbal de una novela debe detectarse sobre la PROSA REAL ya escrita (tiempo GRAMATICAL), no sobre la guia de estilo.

**Why:** el tiempo "deseado" inferido por regex de la guia es poco fiable (puede ser un falso positivo: "presente narrativo"/"avanza en presente" describen CRONOLOGIA, no gramatica). El Revisor Final detecta el desajuste demasiado tarde (al terminar) y tiene PROHIBIDO pedir cirugia cap-a-cap, asi que una deriva temprana de tiempo se propaga a todo el libro y llega irreparable.

**How to apply:**
- Objetivo del tiempo = el canon EXPLICITO solo si `tenseSource==="canonical"` (extractStyleDirectives); si no, el tiempo DOMINANTE real de los primeros capitulos. Nunca imponer un tiempo inferido ni pelear contra el tiempo natural del manuscrito.
- Si el dominante es "mixto" y no hay canon, NO tocar la prosa (no fabricar un canon dudoso).
- La puerta corre UNA vez, temprano (primeros ~4 caps), reescribe solo los desviados (revert-by-default), y FIJA el tiempo establecido para que los capitulos FUTUROS no deriven; se persiste en `plotOutline` (jsonb, sin migracion) para honrarse al reanudar, aunque la puerta no vuelve a correr en resume.
- `extractStyleDirectives` devuelve el tiempo en INGLES ("present"/"past"); el juez trabaja en espanol ("presente"/"pasado") -> mapear.
