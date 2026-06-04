---
name: Structural generation gates (deterministic dims vs label bypass)
description: Por qué los auditores de variedad por ETIQUETA se saltan, y la pauta para añadir una nueva dimensión determinista al gate del SA.
---

# Gates estructurales en la GENERACIÓN (escaleta + prosa)

Los defectos recurrentes de las novelas (deus ex machina, acto 2 plano, set-pieces calcados, secundarios abandonados) se atacan EN LA GENERACIÓN con dimensiones deterministas del Auditor Estructural (`scene-shape-auditor.ts`), no solo con el corrector posterior.

## Lección durable: variedad por ETIQUETA ≠ variedad real
- Un auditor que mide variedad contando un CAMPO de etiqueta (p. ej. `forma_dominante`) se salta cuando el contenido es idéntico pero la etiqueta difiere: dos persecuciones marcadas "accion_fisica" y "presion_unica" pasan el filtro aunque el lector perciba la misma coreografía.
- **Por qué importa:** la repetición que cansa al lector es de CONTENIDO (escenario/táctica/oposición/coste), no de etiqueta.
- **Cómo se atacó (decisión):** la diferenciación por contenido de set-pieces se dejó como HEURÍSTICA DE PROMPT (instrucción al Arquitecto), NO como auditor determinista, porque medir "misma coreografía" con reglas mecánicas da demasiados falsos positivos. Solo se vuelve determinista lo que se puede medir sin ambigüedad.

## Pautas durables para una dimensión determinista nueva
- **Conservadora**: preferir falso-negativo a falso-positivo. Reservar la severidad `alta` para el caso INEQUÍVOCO; gatear por tamaño mínimo de novela; excluir roles ya cubiertos por otras dims.
- **Series-safe**: penalizar solo lo que ocurre DENTRO del volumen; un arco que continúa en el siguiente tomo mantiene presencia en este y no debe marcarse.
- **El gate efectivo es la severidad `alta`, no "existe un problema"**: el bucle SA solo fuerza retry por `alta` o por agregado bajo el umbral. Un problema real pero emitido siempre como `media` puede pasar el gate (un solo `media` no baja el agregado lo suficiente). Si el defecto que persigues DEBE bloquear, asegúrate de que su variante inequívoca se emita como `alta`. (Esto hundió la 1ª revisión: el caso "se evapora y reaparece tarde" caía en una rama `media` y pasaba.)
- **No-gating exclusivo**: una dim amplia/ruidosa NO va a `CRITICAL_SECOND_HALF_DIMS` (que gatea por sí sola). Contribuye igual al agregado y al retry por `alta`. Reservar el gate crítico exclusivo para colapsos inequívocos de segunda mitad.
- Hay que registrar la dim en TODOS los mapas de dims del bucle SA + la regla mecánica + el mapeo SA→WBA; olvidar uno la deja a medias (los nombres concretos se leen en el código).
