---
name: Residuos estructurales vinculantes
description: Como manejar los problemas estructurales que un gate advisory deja pasar — persistir como objetivos vinculantes del Narrador y limpiar SOLO en pase realmente limpio.
---

Regla: cuando un gate advisory deja pasar una estructura con problemas conocidos, esos problemas deben persistirse como objetivos VINCULANTES para la capa siguiente (el Narrador los recibe en su prompt y debe resolverlos en escena), nunca quedarse solo en un log informativo.

**Why:** los logs "advisory" no reparan nada; el analisis de un run de 3 dias mostro residuos (arco_secreto/falso_aliado) atravesando todo el pipeline sin que nadie los atacara.

**How to apply:**
- Limpiar la persistencia SOLO cuando el pase es genuinamente limpio (score publicable, sin KO, sin rutas de excepcion). Un `else` generico que limpia tambien cubre las rutas de excepcion (p. ej. gate omitido por falso negativo cronico) y borra residuos sin resolver — persistirlos explicitamente en esas rutas.
- Brazos de reescritura repetidos sobre el mismo tramo sin subir la nota = parches cosmeticos; escalar a reescritura profunda (instruccion declarada estructural para forzar el fallback de reescritura completa) antes de aceptar una meseta.
