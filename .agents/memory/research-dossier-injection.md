---
name: Dossier documental de investigacion
description: Como se inyecta contexto factual (historico/geografico/etnografico) al Narrador en todos los caminos de escritura
---

Regla: para dar un material nuevo al Narrador en TODOS los caminos de escritura (generacion, resume, regeneracion, ~7 call sites), engancharlo en `getEnrichedWorldBible` (punto unico) como clave `_<nombre>` y mapearla en el prompt del ghostwriter, en lugar de tocar cada call site.

**Why:** los call sites de ghostwriter.execute son muchos y divergen; el enriquecimiento centralizado ya inyecta hilos, timeline, notas, etc.

**How to apply:** persistir el material como worldRule con categoria `__<nombre>` (patron `__narrative_threads`); si requiere IA, generarlo lazy con cache de promesa por proyecto y persistir tambien el resultado negativo (aplica=false) para no re-pagar la llamada. Regla de prudencia factual del Narrador: dato del mundo real no cubierto por dossier/canon => vaguedad verosimil, nunca precision inventada.
