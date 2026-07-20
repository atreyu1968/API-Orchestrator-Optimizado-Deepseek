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

## Propulsion narrativa (avance vs tension)
La dimension determinista "propulsion_avance" verifica AVANCE material (cambio irreversible + decision no pasiva + vectores primarios), no tension local. Reglas de diseno: la severidad ALTA solo dispara si la cobertura del bloque declarado es >=50% (protege escaletas legacy sin el campo); las decisiones pasivas se detectan por regex en espanol (cuidado con tildes: cubrir variantes con y sin acento); el contrato viaja escaleta -> ghostwriter (ejecutar EN pagina + regla anti-relleno) -> lectura holistica mid-novela (tabla objetivo/resultado/coste/irreversible). No entra en CRITICAL_SECOND_HALF_DIMS.

## Secuencias macro (repeticion a nivel de TRAMO, no de capitulo)
Un ciclo interno (peligro-descanso-conversacion-peligro) que se repite cada 4-5 caps con etiquetas distintas se escapa a TODAS las defensas por-capitulo o ventana-de-4; el lector detecta la repeticion de SECUENCIA antes que la de capitulo. Deteccion determinista: n-gramas (3-5) de tipo_capitulo repetidos 3+ veces sin solapar (alta, gate cobertura de etiquetas >=80%), token nucleo de funcion_estructural dominante (media), racha de caps de transito (media/alta). Endurecimientos post-review: dedupe de n-gramas por COBERTURA de caps (dedupe por subcadena suprime ciclos cortos independientes); tokens de transito genericos ("ruta","camino") solo cuentan en funcion_estructural, los inequivocos (vehiculos/verbos de viaje) en funcion/titulo/ubicacion. Espejo de prompt: self-check del Arquitecto por TRAMOS + prueba de eliminacion a nivel de secuencia + max 3 caps de desplazamiento a un mismo destino (viajes largos = elipsis).
