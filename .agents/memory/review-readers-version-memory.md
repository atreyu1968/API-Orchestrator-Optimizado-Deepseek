---
name: Auto-review readers & version memory
description: En el bucle de auto-revisión de LitAgents, qué lector arrastra memoria de iteraciones previas y cómo evitar que reabra problemas ya resueltos.
---

## Quién arrastra memoria entre iteraciones

- El TEXTO del manuscrito siempre se relee fresco de la BD al inicio de cada lectura (`loadFullNovelContext`). No hay texto cacheado entre iteraciones.
- El **lector Holístico** NO recibe sus notas previas en el prompt: solo persiste `lastHolisticNotes` (para el log/descarga) y compara el score numérico. Lee limpio cada vez.
- El **lector Beta** SÍ recibe su reacción anterior completa (bloque `previousNotesBlock`, hasta ~24k chars) más el historial de notas ya aplicadas por el cirujano (`appliedNotesHistory`).

## Regla durable (anti mezcla de versiones)

Cuando se inyecten notas previas al Beta, el manuscrito actual debe declararse como la ÚNICA fuente de verdad: cada pega antigua hay que RE-LOCALIZARLA en el texto vigente y citar el (cap N) antes de repetirla; si no se encuentra, se da por resuelta y NO se emite instrucción. Excepción de recall: una pega GLOBAL real (ritmo/tono de conjunto) que no se pueda anclar a un capítulo se recoge como observación en prosa, no como instrucción accionable.

**Why:** sin esa salvaguarda el modelo confunde su lectura PASADA con el texto ACTUAL y reabre problemas ya corregidos, ensuciando las correcciones. La regla de "citar capítulo o descartar" intercambia algo de recall por precisión; la válvula de observación global evita perder pegas difusas legítimas.

**How to apply:** al tocar cualquier bloque de notas previas en `server/agents/beta-reader.ts`, conservar (a) la cláusula de fuente de verdad, (b) la regla de re-localización con cita, (c) la válvula de observación no-instruccional para pegas globales, y (d) la intención de Fix38 (prohibido `{"instrucciones": []}`, insistir en lo aún vigente). El Holístico no necesita este tratamiento mientras siga sin recibir notas previas.
