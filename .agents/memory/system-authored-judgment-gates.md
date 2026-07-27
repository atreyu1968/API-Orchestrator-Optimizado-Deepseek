---
name: Puertas de decisión humana sobre contenido que autoró el sistema
description: Cuándo una "decisión humana pendiente" es en realidad decidible por un juez con el canon
---

Regla: si una puerta pide al humano un juicio que requiere conocimiento que solo el SISTEMA tiene (p.ej. "¿este dato dudoso es un error o una decisión deliberada de la trama?" cuando la trama la diseñó el sistema y el usuario nunca leyó la novela), esa puerta no debe esperar al humano: un juez LLM con acceso al canon (world bible, plan de trama, decisiones registradas) debe adjudicarla automáticamente.

**Why:** el usuario lo señaló explícitamente: se le pedía criterio sobre intenciones narrativas que él no pudo formar. Las fichas quedaban pendientes indefinidamente y bloqueaban el estado "completada".

**How to apply:** adjudicar con sesgo conservador ("ante la duda, deliberado" = no tocar prosa), una sola pasada sin re-verificación (no treadmill), y dejar los botones manuales como fallback para lo que el juez no resuelva. Además, todo post-proceso que corrija texto debe terminar ANTES de marcar el estado que otros esperan (waitFor por status).
