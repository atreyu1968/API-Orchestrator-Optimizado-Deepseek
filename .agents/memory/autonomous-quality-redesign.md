---
name: Autonomous quality redesign (6 gates)
description: El rediseño de calidad de LitAgents es 100% autónomo (sin guía humana); patrón y orden de las puertas.
---

# Rediseño de calidad autónomo de LitAgents

Rediseño aprobado por el usuario para subir la CALIDAD FINAL de las novelas (coste secundario). Premisa dura: **100% autónomo, SIN guía humana** — el usuario NO puede leer escaletas internas, así que `awaiting_structural_guidance` y cualquier "esperar al humano" están PROHIBIDOS en las puertas nuevas. Las puertas salen por **CALIDAD**, no por contador de iteraciones.

**Why:** las novelas salían con defectos crónicos (sobre todo finales NO ganados: un poder externo/secundario resuelve el conflicto central mientras el protagonista observa pasivo). Las dimensiones DETERMINISTAS del Auditor Estructural miden tokens/etiquetas, no la SEMÁNTICA de quién resuelve el clímax, así que dejan pasar el deus ex machina. La guía manual no servía y atascaba novelas durante horas.

## Orden de construcción de las 6 puertas (acordado)
P1 agencia (HECHA) → P4 editor de prosa (HECHA) → P5 lectura final por ejes (HECHA) → P0 concepto (HECHA) → P6 degradar el auditor determinista (HECHA) → P2/P3 semillas + generación con guía viva (HECHA, Fix152).

## Puerta 6 (degradar el auditor determinista) — ADVISORY
El Auditor Estructural DETERMINISTA (`runArchitectStructuralAudits`, tokens/etiquetas, no semántica) era el gatekeeper final del diseño y, al no alcanzar `MIN_PUBLISHABLE_SA_SCORE` (7) o quedar una dim crítica de 2ª mitad KO, ponía `status="awaiting_structural_guidance"` + `return` (bloqueaba el Narrador esperando guía MANUAL). **Arreglo**: ese bloque del gate (tras cerrar `outerSALoop` en `_generateNovel`) pasa a ADVISORY — restaura `worldBibleData=bestSAOverall.data` (mejor escaleta), loguea warning y continúa al Beta + Narrador; NUNCA toca el status ni hace `return`. Se conservan el bucle SA + auto-guidance Fix118 (mejora autónoma; ya no bloquea) y `faChronicSoleBlocker`. La calidad real la cubren P1/P4/P5.

**Why:** los detectores deterministas dan falsos negativos crónicos (Fix145/146) que atascaban novelas horas; el objetivo es 100% autónomo y el usuario no técnico no corrige escaletas. **How to apply:** la ruta de RESUME (snapshot de `pendingStructuralGuidance` + endpoint `/api/projects/:id/structural-guidance`) se DEJA intacta por compatibilidad para recuperar proyectos ya atascados — solo se elimina el ÚNICO setter que ENTRA en ese estado. Tras cualquier toque a este gate, verificar por grep que no quede otro setter activo de `awaiting_structural_guidance`.

## Patrón canónico de una puerta (copiar el bucle de Integridad Narrativa del orchestrator)
1. Agente crítico SEMÁNTICO (LLM) que juzga UNA preocupación y devuelve `veredicto` + `directivas_arquitecto` accionables.
2. Bucle de convergencia: juez → inyecta feedback al Arquitecto (campo dedicado en `ArchitectInput`, espejo de `plotIntegrityFeedback`) → Arquitecto rehace → re-juzga. Best-effort: conserva la mejor escaleta vista (anti-regresión).
3. **Salida por calidad** (umbral + condiciones duras), no por agotar iteraciones.
4. **Auto-escalado ante estancamiento** (score que no mejora): subir intensidad de la directiva y, como nivel máximo, que el JUEZ redacte el arreglo concreto. Nunca consultar a un humano.
5. **Red dura determinista (fail-safe)**: si no converge, restaurar la mejor versión y aplicar una acción determinista que GARANTICE propagación (p.ej. estampar un campo vinculante en la escaleta que honran las puertas de generación/prosa). Un detector determinista de APOYO solo añade evidencia/log; nunca debe gatear en exclusiva (ver memoria de falsos negativos deterministas).

## Puerta 1 (agencia) — rúbrica
Regla de oro: el conflicto central se resuelve en el clímax por una acción PROPIA del protagonista, sembrada antes; triunfa PORQUE HA CAMBIADO. Columna estructural = los 5 hitos del "Plan Maestro" del usuario: Incidente Incitador, Primer Giro, Punto Medio (vira pasiva→activa), Momento Oscuro, Clímax ganado por el cambio.

**How to apply:** al construir P4/P5, reusar este patrón exacto. El fail-safe de P1 estampa `mandato_agencia` en los caps del clímax; las puertas de generación/prosa (P3/P4) deben CONSUMIR ese campo para materializar la agencia en la prosa.

## Puerta 5 (lectura final por ejes) — rúbrica
Lee la novela COMPLETA ya escrita (no el plan) y la audita por 4 ejes ortogonales que ningún lector previo vigilaba de forma vinculante: promesa→pago (cabos sueltos/Chéjov), coherencia causal global (giros sembrados, sin conveniencias), consistencia de personaje (MOTIVACIONAL, no física), cierre temático. Mismo patrón canónico que P4 (snapshot/restore `isBetter`, fail-safe del peor cap, re-lectura "revertir por defecto" `mustRevert`, `restoreSnapshot` fuerza `status:"completed"`, todo best-effort, NUNCA `awaiting_structural_guidance`). Reescribe por capítulo vía `rewriteChapterForQA(..., "editorial", directiva)`.

**Lección (series-awareness de auditorías de cierre):** cualquier auditoría que exija "cierre/pago de un arco DENTRO del volumen" (p.ej. `auditArcoSecundario`: arco abandonado, cierre fantasma) da FALSOS POSITIVOS en sagas, donde el arco continúa en el siguiente libro. Patrón de arreglo: tipo opcional `SeriesAuditContext {isSeriesVolume,isFinalVolume}` threadeado por `runArchitectStructuralAudits` (ausente = standalone, comportamiento intacto); relajar SOLO las señales basadas en cierre en volumen NO final; conservar las independientes del cierre (no aparece nunca, brecha larga) como aviso. Calcular el contexto UNA vez (un solo `getSeries`); total desconocido → conservador NO final (filosofía anti-falso-positivo del auditor; el cierre real lo cubren P5 y los lectores).

## Puerta 0 (forjador de concepto) — variación ADVISORY del patrón
Eleva la premisa CRUDA del autor a un CONCEPTO RECTOR (250-450 palabras: gancho/logline + deseo-necesidad-herida + motor de conflicto + antagonismo espejo + mundo + columna temática + 2-4 promesas al lector) ANTES de que corra el Arquitecto, para subir el SUELO de calidad de toda la novela. Regla inviolable **ELEVAR, NUNCA SUSTITUIR**: respeta género/tono/idea central/personajes/escenario declarados; solo afila. Salida JSON con autocrítica (`puntuacion_concepto`, `veredicto`, 5 `ejes`: originalidad/especificidad/motor_dramatico/columna_tematica/gancho, `debilidades`). Bucle `runConceptForgeGate` (MAX=3, umbral 8, apto si score>=8 && apto && minEje>=6); auto-escala audacia reinyectando concepto previo + debilidades; conserva el mejor.

**Diferencia clave con P1/P4/P5:** P0 es ADVISORY, NO tiene fail-safe estructural ni snapshot/restore de prosa — el concepto no se "estampa" en nada vinculante; simplemente se antepone a `effectivePremise` como bloque "CONCEPTO RECTOR" + premisa original, y fluye al WBA(Fase 1) + Arquitecto. Si el agente falla → `null` → premisa original (best-effort puro). **Solo standalone** (`!seriesContextContent`) y solo en `_generateNovel` (en serie el concepto ya está fijado; en resume el Arquitecto ya corrió). El fail-safe natural de una puerta pre-plan = degradar a la entrada original, no forzar reescrituras.
