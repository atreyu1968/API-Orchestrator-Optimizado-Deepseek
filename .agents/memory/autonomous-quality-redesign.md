---
name: Autonomous quality redesign (6 gates)
description: El rediseño de calidad de LitAgents es 100% autónomo (sin guía humana); patrón y orden de las puertas.
---

# Rediseño de calidad autónomo de LitAgents

Rediseño aprobado por el usuario para subir la CALIDAD FINAL de las novelas (coste secundario). Premisa dura: **100% autónomo, SIN guía humana** — el usuario NO puede leer escaletas internas, así que `awaiting_structural_guidance` y cualquier "esperar al humano" están PROHIBIDOS en las puertas nuevas. Las puertas salen por **CALIDAD**, no por contador de iteraciones.

**Why:** las novelas salían con defectos crónicos (sobre todo finales NO ganados: un poder externo/secundario resuelve el conflicto central mientras el protagonista observa pasivo). Las dimensiones DETERMINISTAS del Auditor Estructural miden tokens/etiquetas, no la SEMÁNTICA de quién resuelve el clímax, así que dejan pasar el deus ex machina. La guía manual no servía y atascaba novelas durante horas.

## Orden de construcción de las 6 puertas (acordado)
P1 agencia (HECHA) → P4 editor de prosa (HECHA) → P5 lectura final por ejes → P0 concepto → P2/P3 semillas + generación con guía viva → P6 degradar el auditor determinista (incluye quitar la dependencia de `awaiting_structural_guidance`).

## Patrón canónico de una puerta (copiar el bucle de Integridad Narrativa del orchestrator)
1. Agente crítico SEMÁNTICO (LLM) que juzga UNA preocupación y devuelve `veredicto` + `directivas_arquitecto` accionables.
2. Bucle de convergencia: juez → inyecta feedback al Arquitecto (campo dedicado en `ArchitectInput`, espejo de `plotIntegrityFeedback`) → Arquitecto rehace → re-juzga. Best-effort: conserva la mejor escaleta vista (anti-regresión).
3. **Salida por calidad** (umbral + condiciones duras), no por agotar iteraciones.
4. **Auto-escalado ante estancamiento** (score que no mejora): subir intensidad de la directiva y, como nivel máximo, que el JUEZ redacte el arreglo concreto. Nunca consultar a un humano.
5. **Red dura determinista (fail-safe)**: si no converge, restaurar la mejor versión y aplicar una acción determinista que GARANTICE propagación (p.ej. estampar un campo vinculante en la escaleta que honran las puertas de generación/prosa). Un detector determinista de APOYO solo añade evidencia/log; nunca debe gatear en exclusiva (ver memoria de falsos negativos deterministas).

## Puerta 1 (agencia) — rúbrica
Regla de oro: el conflicto central se resuelve en el clímax por una acción PROPIA del protagonista, sembrada antes; triunfa PORQUE HA CAMBIADO. Columna estructural = los 5 hitos del "Plan Maestro" del usuario: Incidente Incitador, Primer Giro, Punto Medio (vira pasiva→activa), Momento Oscuro, Clímax ganado por el cambio.

**How to apply:** al construir P4/P5, reusar este patrón exacto. El fail-safe de P1 estampa `mandato_agencia` en los caps del clímax; las puertas de generación/prosa (P3/P4) deben CONSUMIR ese campo para materializar la agencia en la prosa.
