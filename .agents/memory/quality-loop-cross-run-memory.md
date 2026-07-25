---
name: Memoria entre rondas en bucles de calidad
description: Los bucles de calidad relanzables necesitan memoria persistida entre rondas o repiten la meseta indefinidamente.
---

Regla: cualquier bucle de calidad que pueda relanzarse (manual, auto-resume tras reinicio) debe persistir un historial de rondas (mejor score, si mejoró) y consultarlo al arrancar; sin eso, cada relanzamiento parte de cero y repite el mismo techo.

**Why:** caso real de 3 días: 5 rondas completas de pulido (2 lectores releyendo la novela entera hasta 8 veces por ronda) terminando siempre en el mismo techo, porque nada recordaba las rondas previas. Además, con un juez ruidoso (±1), perseguir el último punto de una meta es estadísticamente inútil: aceptar la meseta cuando el mejor histórico está a ≤1 punto de las metas.

**How to apply:** al añadir o tocar bucles iterativos con jueces IA: (a) persistir historial de rondas (worldRule o similar), (b) exigir que la nueva ronda SUPERE el mejor histórico en sus primeras iteraciones o cortar, (c) aceptar la meseta tras N rondas sin mejora cerca de las metas, (d) contar EMPATES como no-mejora en los cortes por estancamiento (los cortes solo-por-regresión dejan pasar empates infinitos), (e) registrar la ronda con flag one-shot para no duplicar el registro entre múltiples salidas del bucle.
