---
name: Backup/import invariants
description: Reglas duraderas del volcado (data-export) y la restauracion (data-import) de LitAgents.
---

# Backup / Import (data-export / data-import)

Reglas que futuras ampliaciones DEBEN respetar al tocar los endpoints de copia/restauracion.

- **Toda tabla nueva "de creador" debe entrar en export Y import a la vez.** El export es un `Promise.all` de `getAll*` y el import recrea en orden de dependencias (FK). Anadir a uno solo deja copias incompletas o restauraciones a medias. Guias = styleGuides + extendedGuides + generatedGuides (esta ultima se olvido historicamente).
  **Why:** un backup que omite una tabla se percibe como "incompleto" y pierde trabajo del usuario al restaurar.

- **El import remapea IDs por dependencia, nunca conserva el id del backup.** Se mantienen mapas oldId→newId (pseudonym, series, project) y CADA FK hija debe mapearse con ellos. Olvidar el remapeo (paso que fallaba en styleGuides) crea FK invalidas silenciosas.
  **How to apply:** al anadir una tabla con FK, mapear su columna con el Map del padre ANTES del insert.

- **Seudonimos/series se REUSAN por nombre/titulo, no se duplican.** Sin unique constraint, insertar a ciegas duplica todo en cada import. Se busca por nombre (seudonimo) / titulo (serie) en estado pre-import; si existe, se reusa su id.

- **Colision de guias = marcar "(importada)" en el titulo, NO descartar.** La deteccion se evalua contra el estado PRE-import (snapshot al inicio). Claves de colision: styleGuide por seudonimo; generatedGuide por seudonimo O serie; extendedGuide por titulo (no tiene vinculo). Evitar doble sufijo comprobando si ya termina en "(importada)".
  **Why:** el requisito del usuario es no perder ninguna guia al restaurar sobre una BD con datos.

- **`sourceUrl` en data-import hace fetch remoto sin allowlist (SSRF pendiente).** Riesgo preexistente; si se endurece seguridad, empezar por aqui.
