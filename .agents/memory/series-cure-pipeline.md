---
name: Cura de Serie (pipeline reutilizable)
description: Patron del runner de cura a nivel de serie y sus guardas de concurrencia/rollback
---

- El runner de cura vive en memoria (registry por seriesId) y encadena endpoints EXISTENTES via self-fetch a 127.0.0.1:PORT (verify-project, apply-corrections, structural-rewrite) + forcePolishResume; no duplica logica de agentes.
- **Regla de arranque atomico**: cualquier "start" con registry en memoria debe hacer check+set SINCRONO (sin await entre el guard y el set), y limpiar el registro si la preparacion falla. **Why:** dos POST simultaneos pasaban el guard y duplicaban runs caros de LLM.
- **Regla de insercion de capitulos**: renumerar +1 descendente ANTES de generar, y garantizar rollback (try/catch envolvente restaurando los numeros originales capturados pre-shift) si falla generacion o insercion. **How to apply:** cualquier operacion que desplace chapter_number antes de un paso que puede fallar.
- Acciones destructivas o hallazgos sin capitulo concreto nunca se auto-ejecutan en la cura: se degradan a sugerencias (coherente con la politica de acciones destructivas en auto-loops).

## Gancho de orquestador sobre un runner en memoria
Si el orquestador tiene un "gate" que exige una pasada completa del runner antes de continuar, y el runner tambien puede lanzarse a mano, el gate debe ESPERAR una pasada ya en marcha (con techo de tiempo), nunca devolver null y seguir: seguiria con texto a medio corregir. **Why:** objecion del architect en la pasada de verificacion de novela completa. **How to apply:** en la entrada sincrona del runner, si status running → poll hasta terminal o timeout; manejar la carrera get/start reintentando el get.
