---
name: Detectores cross-capitulo alimentando agentes por-capitulo
description: Patron para defectos que solo se ven leyendo el manuscrito entero (muletillas, imagenes-firma) cuando los agentes correctores trabajan capitulo a capitulo.
---

Regla: un agente por-capitulo NUNCA puede ver repeticion ENTRE capitulos. Para atacar muletillas/imagenes-firma repetidas, calcular un detector determinista UNA vez sobre el manuscrito completo y pasar a cada agente por-capitulo SOLO los hallazgos que afectan a su capitulo, como instruccion de variacion.

**Why:** los lectores se quejaban de imagenes repetidas x9-x15 caps y ningun corrector por-capitulo podia detectarlo; anadir la queja al prompt no basta sin evidencia concreta.

**How to apply:** calculo unico antes del bucle, best-effort (try/catch no bloqueante), log resumen. En detectores de n-gramas: exigir palabras de contenido (anti-stopwords), umbral de capitulos DISTINTOS, y dedupe de ventanas solapadas con fronteras de token (espacios alrededor), nunca substring crudo. Ojo con harnesses sinteticos: un filler que se repite entre caps (o cuyos digitos se normalizan fuera) inunda los resultados y da falsos FAIL.
