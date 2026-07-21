---
name: Auto-aplicación de acciones destructivas e irreversibles necesita gate + tope
description: Por qué el borrado automático de capítulos en el auto-loop debe pasar por unanimidad de lectores y un tope por novela, no ejecutarse al instante en FASE 0.
---

# Borrar (o cualquier acción irreversible) en bucles automáticos: gate + tope, nunca directo

El bucle de auto-revisión (Holístico+Beta) corre muchas iteraciones. Si una acción
DESTRUCTIVA e IRREVERSIBLE (borrar capítulo) se ejecuta directamente cada iteración,
el daño se acumula sin freno y la red de seguridad revert-on-regression NO puede
deshacerlo (un capítulo borrado no vuelve con un snapshot de prosa).

**Regla:** una acción auto-aplicada que es irreversible debe (1) requerir consenso
fuerte (en este caso unanimidad de AMBOS lectores, vía `applyConfirmedAdminActions`)
Y (2) tener un tope global por run (`MAX_AUTO_CHAPTER_DELETIONS_PER_RUN`), no por
iteración. El tope se pasa como presupuesto RESTANTE a cada llamada y se acumulan solo
las acciones REALMENTE ejecutadas, para que 8 iteraciones no multipliquen el tope.

**How to apply:** no ejecutes la acción destructiva en la fase temprana (FASE 0
`applyChapterDeletions`); enruta la intención a `pendingAdminActions` (jsonb existente,
sin migración) como `delete_chapter` con dedup por target (el parser re-emite la misma
orden cada iteración). El gate de unanimidad ya existía para acciones admin; el auto-loop
solo tenía que DEJAR de saltárselo. Añade un guard defensivo en la fase temprana que
vacíe cualquier instrucción destructiva residual cuando `fromAutoLoop`.

**Why el flujo manual NO se toca:** el enrutado se activa con un flag
(`routeDeletesToPending`, default false). El borrado MANUAL conserva su ejecución
directa porque ahí hay un humano confirmando, no un bucle desatendido.

Politica (decision del usuario, jul 2026): los lectores del pulido deben preferir REESCRITURA SEVERA del capitulo (tipo "estructural", conservar material unico + sustituir lo que no funciona) sobre proponer borrar/fusionar; delete/merge queda como ultimo recurso solo para redundancia genuina sin material unico. Aplica a los prompts de Holistico, Beta y el traductor estructural — mantener esa jerarquia si se tocan esos prompts.
