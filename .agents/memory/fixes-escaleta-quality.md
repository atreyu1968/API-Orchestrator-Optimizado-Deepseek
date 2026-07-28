---
name: Fixes A-E calidad de escaleta
description: 5 fixes para que la escaleta salga estructuralmente sana y el bucle Holístico+Beta no necesite fusiones posteriores.
---

## Fix A — `revelaciones_climax` en World Bible
**Regla:** El Arquitecto declara en Phase 1 (`world_bible.revelaciones_climax[]`) cada giro nuclear con sus `siembras_obligatorias` (token concreto + capítulo + forma). El resumen de Phase 1 → Phase 2 incluye este campo. El auto-check #26 de Phase 2 verifica que cada token aparece textualmente en los caps declarados y en un acto ANTERIOR al del reveal.
**Why:** Sin inventario declarado de reveals, el Arquitecto los siembra genéricamente ("atmósfera de sospecha") o no los siembra. Eso es lo que el Auditor de Integridad llama `revelacion_huerfana` y el Holístico pide resolver moviendo caps enteros.
**How:** Campo nuevo en Phase 1 schema (architect.ts ~línea 410); pass-through en phase1Summary (architect.ts ~línea 1531); auto-check #26 (architect.ts Phase 2 prompt, tras Fix239).

## Fix B — Lote ampliado del Cirujano PI con caps sembrables
**Regla:** Si el Auditor PI detecta `revelacion_huerfana`, antes de llamar al Cirujano PI se añaden al lote hasta 3 caps del Acto 1 no incluidos todavía (preferencia por Acto 1 explícito, fallback a caps inmediatamente anteriores). Sin esto el Cirujano no tiene dónde plantar la siembra y la única salida es vaciar `setup_capitulos` (rebaja prohibida).
**Why:** El mismo problema ya existía en el camino Beta (Fix274 en runBetaFeedbackEscaletaSurgery); Fix B replica la lógica en el camino PI (orchestrator.ts ~línea 3022).
**How:** orchestrator.ts, bloque `[FixB-PI-Sembrable]` justo antes del `if (targetsPI.length > 0)`.

## Fix C — Criterio de siembra más estricto (Auditor de Integridad)
**Regla:** Tres criterios obligatorios para validar una siembra (falla cualquiera = `revelacion_huerfana`, severidad alta):
- CRITERIO A: acto anterior al del reveal (no mismo acto)
- CRITERIO B: token concreto (nombre, objeto, dato factual) en objetivo_narrativo/informacion_nueva/beats — NO atmósfera genérica
- CRITERIO C: ≥3 siembras independientes para dificultad "alto", ≥2 para "medio"; siembras con mismo token no cuentan como independientes
**Why:** El criterio anterior ("≥2 menciones/atmósferas") aceptaba siembras genéricas en el mismo acto. Eso explica que el Holístico encontrara revelaciones sin preparación real en libros que el PI Auditor había dado por buenos.
**How:** plot-integrity-auditor.ts SYSTEM_PROMPT, sección "FORESHADOWING TARDÍO".

## Fix D — Restricciones de género en Acto 2 (thriller/suspense/policial/noir)
**Regla:** Auto-check #26 en Phase 2 del Arquitecto. Si el género incluye esas palabras:
- (a) Cada cap del Acto 2 debe tener ≥1 beat de acción externa. Cap de pura introspección sin presión externa = PROHIBIDO.
- (b) No 2 caps consecutivos con `informacion_nueva` = "ninguna"/"reflexión interna"/vacía.
- (c) Cada `siembra_obligatoria` de `revelaciones_climax` aparece como token textual en el cap declarado.
**Why:** El Arquitecto no tenía restricción explícita por género; para un thriller generaba caps del Acto 2 de pura introspección porque las reglas generales (variedad de forma, esqueleto variado) no prohibían la introspección como forma dominante. El Holístico luego los marcaba como "el Acto 2 se aplana".
**How:** architect.ts Phase 2 prompt, check #26 tras Fix239.

## Fix E — Lote del brazo de ritmo hacia atrás (Act2PacingPolishArm)
**Regla:** Cuando `runAct2PacingPolishArm` identifica caps problemáticos, añade hasta 2 caps inmediatamente anteriores del tramo como caps de "contexto". Se procesan primero con directiva específica: "prepara el terreno para la escalada del cap siguiente (solo afina el cierre, no alteres hechos)". Lista separada `pacingContextNums` para no contaminar el tipo `Act2Problem[]`.
**Why:** La inercia del Acto 2 arranca 1-2 caps antes del cap que el lector percibe como lento. Reescribir solo el cap detectado produce una directiva de ritmo que choca con el cap anterior que lo estableció.
**How:** orchestrator.ts `runAct2PacingPolishArm`, bloque `[FixE-PacingBatchBack]` tras construir `ordered`.
