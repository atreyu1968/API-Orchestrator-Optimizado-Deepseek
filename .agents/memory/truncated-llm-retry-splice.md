---
name: Retry truncado del LLM: empalmar, no descartar
description: Un reintento de outline/lista truncado por corte de salida aun contiene las correcciones; recuperar por empalme con la version previa en vez de rechazar entero.
---

Regla: cuando un agente re-genera una estructura larga (escaleta, lista de caps) y el resultado llega TRUNCADO (menos items que la version previa aceptable), no descartar la revision entera — empalmar la cabeza revisada con la cola de la version previa y devolver el resultado al auditor para re-validacion.

**Why:** el corte casi siempre es limite de salida del LLM; los items presentes SI llevan las correcciones. Descartar entero quema iteraciones del bucle de calidad sin aplicar nada (caso real: escaleta cerro en 6.5/10 con 2 reintentos rechazados por truncados).

**How to apply:** frenos — solo si el retry trae MENOS items que la previa aceptable, minimo absoluto de items y un % minimo de la previa (~40%); heredar numeracion por posicion y campos estructurales (matriz_arcos, estructura_tres_actos) desde la previa si el retry los perdio; NUNCA pasar el empalme directo a escritura: siempre re-auditar. Riesgo residual asumido: si el retry no trunco por la cola sino que reordeno, el empalme posicional puede desalinear — el re-audit es la red.
