---
name: Resume freshness guard self-deadlock
description: Por qué un guard anti-reanudación que mide "actividad reciente" no debe contar sus propios logs ni mezclar logs globales.
---

# Guard de frescura de reanudación: no contar tu propio ruido

**Regla:** cualquier guard que decida "no actuar porque hay actividad reciente"
y que ADEMÁS escriba un log registrando esa decisión, debe EXCLUIR sus propios
logs (y los logs de auto-recovery/watchdog) al medir la frescura. Si no, su
propio log se vuelve la "actividad más reciente" del siguiente intento y se
auto-bloquea en bucle perpetuo aunque el worker real esté muerto.

**Regla 2:** la frescura "por proyecto" debe consultarse con `WHERE projectId = …`
directo. `getActivityLogsByProject(id, N)` incluye también logs globales
(`projectId IS NULL`) y trunca a los N más recientes: si los N están dominados
por logs globales, el filtro en memoria por projectId puede dar falso-negativo
(no ver actividad real del proyecto) y permitir dos orquestadores a la vez.

**Why:** el guard de reanudación (orchestrator `_resumeNovel`) y el monitor de
congelados/heartbeat (queue-manager) compartían este patrón. Los logs META
`Reanudación ignorada` (del propio guard) y `Auto-recovery` (del watchdog) se
generan SIN que haya un worker trabajando; al contarlos como actividad,
mantenían el reloj de 22 min siempre fresco (la auto-recuperación nunca
disparaba) y reseteaban la ventana de 120s del guard (la reanudación manual
nunca procedía). Un proyecto con el worker muerto quedaba irrecuperable.

**How to apply:** usar `storage.getLastMeaningfulActivityLogTime(projectId)`
(query por-proyecto + `NOT ILIKE` excluyendo `Reanudación ignorada` /
`Auto-recovery`) para CUALQUIER medida de "¿sigue vivo el worker?". Los caps de
auto-recovery (que SÍ deben contar los `^Auto-recovery`) usan aparte
`getActivityLogsByProject(...,200)` y no se ven afectados. Si se añade un nuevo
tipo de log META auto-generado, hay que añadirlo a ambos filtros (SQL en storage
y regex en el guard) — están duplicados por ahora.
