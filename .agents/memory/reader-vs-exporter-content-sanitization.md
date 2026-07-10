---
name: Lectores de calidad leen contenido CRUDO, no saneado
description: El export sanea el content de los capitulos pero los lectores Beta/Holistico lo leen crudo; cualquier consumidor nuevo del content debe replicar el saneo.
---

Los agentes que JUZGAN la novela (Beta reader, Holistic reviewer) anteponen su
propia etiqueta canonica de capitulo y luego pegan el `content` tal cual sale de
la BD. El `content` puede arrastrar artefactos de generacion/cirugia (p.ej. una
cabecera meta `# Capitulo N: ...` al inicio, a veces con numero fantasma de un
borrador previo). Si llega crudo al lector, este ve "doble numeracion" u otras
incoherencias y BAJA la nota — no es falta de craft, es ruido de formato.

**Why:** el pipeline de EXPORT (epub/docx/markdown) ya limpia esto con
`stripMetaChapterHeader`, pero ese saneo NO estaba en la ruta de los lectores.
Fue la causa real de que una novela concreta se quedara en Beta 8 mientras sus
hermanas de serie sacaban 9. El techo NO era del pipeline; era un artefacto de
datos que solo veian los lectores.

**How to apply:** cualquier consumidor NUEVO del `content` de capitulos que
importe para una decision de calidad (lectores, ensamblador de manuscrito,
analizadores) debe replicar el mismo saneo que hace el export
(`stripMetaChapterHeader`), no confiar en que el content persistido este limpio.
Mantener export y consumidores-de-calidad en sincronia. El saneo en lectura es
preferible a limpiar la BD (universal, no pisa bucles activos, idempotente).
