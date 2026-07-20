---
name: Reparacion en caliente mid-novela
description: Las lecturas intermedias durante la generacion deben reparar lo ya escrito, no solo guiar lo futuro
---

Regla: una lectura de calidad a mitad de generacion que solo INYECTA su critica como guia para capitulos futuros no cura los defectos que viven en capitulos ya escritos — llegan intactos al final. Debe traducirse en reescrituras dirigidas EN CALIENTE sobre lo ya escrito.

**Why:** el usuario constato que las pasadas holisticas mid-novela "no aportaban nada": el resultado final seguia malo porque nada reparaba el texto ya generado.

**How to apply:** patron = juez planificador (critica fresca -> hallazgos con capitulos concretos, max ~4) + memoria de hallazgos abiertos entre pasadas (resuelto = la lectura fresca ya no lo menciona; reincidente escala) + ejecucion via la maquinaria de reescritura verificada con frenos duros (solo critica/alta, tope por pasada y por run, tope de intentos por hallazgo). En flujos desatendidos, activar el guard de auto-loop para que la reescritura no persista acciones que pidan confirmacion humana.

Escena nueva (told-not-shown): si el hallazgo es "evento decisivo relatado a posteriori", la cura correcta es AÑADIR una escena dramatizada como SUBCAPITULO dentro del capitulo que lo resume, con el corse de longitud levantado solo hacia ARRIBA (el suelo anti-encogimiento nunca se relaja). NUNCA insertar capitulos nuevos en plena generacion: renumerar rompe el mapeo escaleta<->capitulos del bucle que sigue escribiendo (la insercion real de capitulos solo es segura post-generacion, via el endpoint de la cura con shift+rollback).
