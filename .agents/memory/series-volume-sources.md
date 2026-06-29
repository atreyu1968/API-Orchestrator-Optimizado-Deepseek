---
name: Fuentes de volumenes de una serie
description: Una serie puede tener volumenes en tres tablas distintas; cualquier logica que recorra "volumenes previos/de la serie" debe mirar las tres.
---

# Una serie vive en tres tablas, no solo en `projects`

Los volumenes de una serie pueden residir en:
- `projects` — volumenes de GENERACION nuevos.
- `imported_manuscripts` — libros importados (`getImportedManuscriptsBySeries`).
- `reedit_projects` — libros reeditados (`getReeditProjectsBySeries`).

Las series creadas DESDE IMPORTADOS tienen sus volumenes previos en
`imported_manuscripts`/`reedit_projects`, NUNCA en `projects`.

**Regla:** cualquier gate/consulta que razone sobre "volumenes previos" o
"todos los volumenes de la serie" (orden de serie, continuidad, conteos) debe
unir las TRES fuentes por `seriesOrder`. Un libro importado o reeditado es prosa
YA escrita: cuenta como existente Y completado.

**Why:** el guard de orden de serie solo miraba `projects`, asi que en series
desde importados no hallaba el volumen 1 y bloqueaba la generacion del vol 2 con
un 409 -> el bug aparecia EXCLUSIVAMENTE en series desde importados.

**How to apply:** al tocar cualquier validacion/lectura de volumenes de serie,
comprobar si solo usa `getProjectsBySeries`; si es asi, casi seguro falta sumar
importados y reeditados.
