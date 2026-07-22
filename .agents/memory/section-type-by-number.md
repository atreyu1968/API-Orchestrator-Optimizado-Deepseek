---
name: Tipo de seccion por chapterNumber
description: Prologo/epilogo/nota de autor se identifican por numero, no por titulo
---
Regla: el contrato estable de secciones es chapterNumber (0=prologo, -1=epilogo, -2=nota del autor). Nunca identificar el tipo por match de titulo exacto ("Prólogo"/"Epílogo").

**Why:** los prologos/epilogos generados suelen llevar titulo literario propio; un match por titulo los degrada a tipo "chapter" y el pipeline editorial los rotula "el Capítulo -1", ademas de perder logica especifica de prologo/epilogo.

**How to apply:** en cualquier codigo nuevo que clasifique capitulos/secciones, comparar chapterNumber primero y usar el titulo solo como fallback.
