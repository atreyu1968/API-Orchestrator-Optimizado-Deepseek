---
name: Renumeracion de capitulos tras borrar/fusionar
description: Al borrar/fusionar capitulos hay que compactar la numeracion, pero NUNCA dentro de un bucle que resuelve targets por numero.
---

# Renumeracion de capitulos tras borrar/fusionar

La tabla `chapters` NO tiene indice UNIQUE en `(project_id, chapter_number)` — solo PK en `id`. Los especiales son Prologo=0, Epilogo=-1, Nota=-2 (nunca se renumeran). Los positivos deben quedar contiguos 1..N.

Helper compartido: `renumberChaptersSequential(projectId)` compacta los positivos a 1..N en orden ascendente (destino siempre <= actual, asi que sin UNIQUE una sola pasada es segura), idempotente. Lo usan el borrado manual (routes) y el bucle autonomo (orchestrator).

## Regla dura: renumerar UNA sola vez, DESPUES del bucle de acciones

**Why:** en `applyConfirmedAdminActions` las acciones pendientes del mismo lote referencian el capitulo por NUMERO (`targetChapter`/`secondaryChapter`), y cada iteracion re-lee `getChaptersByProject`. Si renumeras dentro del bucle tras cada delete/merge, desplazas los numeros y las acciones siguientes apuntan al capitulo equivocado -> se borra el que no es (perdida de contenido). Lo detecto code review como fallo severo.

**How to apply:** ejecutar TODOS los delete/merge del lote primero (resolviendo por numero, sin tocar la numeracion), y llamar a `renumberChaptersSequential` UNA vez al terminar el for, condicionado a `chaptersDeleted > 0`, best-effort (try/catch, un fallo no revierte los borrados; se corrige en la siguiente pasada). El endpoint manual procesa 1 accion por llamada, asi que ahi si puede renumerar justo tras el borrado.

**Alcance:** el helper solo toca `chapter_number` (mas el saneo del encabezado, ver abajo); NO remapea referencias a numeros de capitulo en World Bible ni en pending admin actions (igual que el borrado manual). El bucle autonomo relee el manuscrito limpio cada iteracion, asi que trabaja ya con la numeracion compactada. La ruta editorial Phase-0 (`applyChapterDeletions`) tiene su propio mecanismo con renumberMap que SI actualiza referencias del World Bible — no confundir con este helper ligero.

## El content arrastra un encabezado meta que hay que sanear al renumerar

El `content` de cada capitulo incluye un encabezado markdown incrustado (`# Capitulo N: titulo`). Al renumerar SOLO la columna, ese encabezado queda con el numero ANTERIOR y contradice la nueva posicion.

**Why:** el exportador (epub/markdown/docx) ya elimina ese encabezado con `stripMetaChapterHeader` y regenera el suyo desde `chapter_number`+`title`, asi que el EBOOK final nunca lo muestra. PERO el ensamblador de manuscrito y los lectores Holistico/Beta leen el `content` CRUDO y etiquetan con `CAPITULO ${chapter_number}` (columna) MAS el numero incrustado obsoleto -> "doble numeracion", un falso positivo que hace que el lector emita instrucciones ("unificar la doble numeracion del capitulo N") y el pulido gaste iteraciones para nada.

**How to apply:** al renumerar un capitulo (cambia su numero), sanear tambien su encabezado con `stripMetaChapterHeader` (seguro porque el export lo regenera; idempotente: solo persistir si el content realmente cambio). Para reparar novelas YA renumeradas sin encabezado saneado, un UPDATE SQL atomico con `regexp_replace` por-fila es seguro incluso con el bucle de pulido activo (las cirugias no reañaden encabezado, asi que no hay perdida de trabajo). Un capitulo cuyo encabezado no lleva numero (p.ej. `# El velo y la sombra`) no genera contradiccion de numero y se deja igual (mismo criterio que el exportador).
