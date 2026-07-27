---
name: DeepSeek thinking comparte el techo de salida con el contenido
description: Por que un agente juez con thinking + entrada enorme devuelve null (JSON vacio/cortado) y como dimensionar maxOutputTokens.
---

# DeepSeek V4: `max_tokens` es el techo COMBINADO de razonamiento + contenido

En `base-agent.ts`, cuando `useThinking:true` y `thinkingBudget>=8192`, se fuerza
`reasoning_effort:"max"`. Se envia UN solo `max_tokens` (= `maxOutputTokens`) que
DeepSeek reparte entre el razonamiento (`reasoning_content`) y la respuesta real
(`message.content`).

**Sintoma:** un agente juez que devuelve `result:null` ("respuesta vacia" o "JSON
invalido" porque falta el score) de forma intermitente, sobre todo cuando lee
entradas grandes.

**Por que:** con esfuerzo de razonamiento alto sobre un prompt grande, el modelo
gasta casi todo el presupuesto pensando y se queda sin tokens para emitir el JSON
-> `content` vacio o cortado a la mitad.

**Regla de dimensionado:** un agente con `useThinking:true` cuya ENTRADA es grande
necesita un `maxOutputTokens` holgado (>=16384), aunque su SALIDA esperada sea un
JSON compacto. El techo debe cubrir razonamiento + salida, no solo la salida.
Referencia sana en este repo: el Revisor Holistico (lectura grande) usa 16384.

**How to apply:** al crear/ajustar un agente juez que lee mucho (novela completa,
muchos capitulos) y razona, NO dejes `maxOutputTokens:8192`. Si el `null` persiste
en entradas extremas pese a 16384, la mitigacion siguiente es un reintento
degradando el esfuerzo (`thinkingBudget<8192` -> "high", o `useThinking:false`),
no subir el techo indefinidamente.

**Why:** las puertas de calidad son advisory (nunca bloquean); un `null` no rompe
la novela, pero OMITE silenciosamente la puerta -> se pierde la verificacion. El
coste se factura por uso real, asi que subir el techo no encarece salvo cuando de
verdad se necesita.

**Actualización (jul 2026):** el rescate de contenido vacío puede devolver contenido NO vacío pero aún cortado (finish_reason=length). Solución: un segundo boost acotado (tope duro) solo si el contenido parece JSON incompleto, y si aun así llega cortado, devolver `truncated: true` en la respuesta para que el caller use repairJson()/su reintento propio en vez de JSON.parse a ciegas. Nunca bucles sin tope.
