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

## Pauta para añadir una dimensión determinista nueva al gate del SA
1. La función en `scene-shape-auditor.ts` debe ser CONSERVADORA (preferir falso-negativo a falso-positivo): exigir señales fuertes antes de marcar `alta`; gatear por tamaño mínimo de novela; excluir roles ya cubiertos por otras dims.
2. Reutilizar la infraestructura existente (escaneo de tokens de nombre de `auditArcoSecreto`, slices de actos, STOPWORDS) en vez de reinventar.
3. SERIES-safe: penalizar solo desapariciones DENTRO del volumen; un arco que continúa en el siguiente tomo mantiene presencia en este.
4. Registrar la dimensión en TODOS los mapas de dims del bucle SA en `orchestrator.ts` (coverageHistorySA, AREA_TO_COVERAGE_FIELD, dimensionLabels, dimensionCountsSA, dimensionHasAltaSA) + regla en `auto-mechanical-guidance.ts` + mapeo SA→WBA en `world-bible-auditor.ts`. Olvidar uno deja la dim a medias.
5. **Decisión de no-gating:** una dim ruidosa/amplia NO va a `CRITICAL_SECOND_HALF_DIMS` (que gatea en exclusiva). Contribuye igual al agregado y al retry por severidad `alta`, sin forzar iteraciones por sí sola. Reservar el gate crítico para colapsos inequívocos.
