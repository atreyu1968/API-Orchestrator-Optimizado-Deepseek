---
name: Dimensión determinista con falso negativo crónico
description: Una sola dimensión determinista que puede dar falso negativo no debe poder gatear/atascar toda la novela indefinidamente.
---

# Dimensión determinista con falso negativo crónico

Cuando un auditor determinista (p.ej. el Auditor Estructural / scene-shape-auditor)
puntúa una dimensión por patrones sintácticos exactos sobre la escaleta, esa
dimensión PUEDE dar 0% por un falso negativo: el contenido real existe pero no con
la forma que el patrón reconoce. Si esa única dimensión deja el agregado por debajo
del mínimo publicable, la novela se atasca/bloquea iteración tras iteración aunque
el resto esté bien.

**Regla:** ante un detector determinista propenso a falso negativo, atacar en DOS
frentes a la vez (el usuario lo pidió explícito para `falso_aliado`):
1. Detector más TOLERANTE en dirección segura (reduce falsos negativos sin dejar
   pasar fallos reales): relajar tokens para nombres cortos, aceptar señales
   alternativas cuando no hay ambigüedad (p.ej. un solo traidor → la keyword basta),
   y un fallback por CORPUS (buscar co-ocurrencia nombre+keyword fuerte en la prosa)
   antes de penalizar.
2. Red de seguridad en el GATE: si el ÚNICO motivo de quedar bajo el mínimo es esa
   dimensión (score recalculado sin su penalización ≥ mínimo) y no hay KO de
   dimensión crítica, continuar a generación con aviso (log + activityLog), en vez
   de bloquear. El paso siguiente (Narrador) puede materializar lo que el detector
   no supo ver.

**Why:** caso real "EL GRABADO DE LA LUNA NEGRA": `falso_aliado` siempre 0% (falso
negativo confirmado por el audit on-demand del WBA: WB suficiente 8/10, problema de
implementación de escaleta). Su único `reveal_no_declarado` (media, -0.7) dejaba el
agregado <7 (MIN_PUBLISHABLE_SA_SCORE) → ~6 h de atasco + 2 bloqueos pese a guía
manual.

**How to apply:** el detector tolerante debe mantener un control negativo (sin la
señal real, sigue penalizando). La red de seguridad del gate debe ser estricta:
exigir que TODOS los problemas de esa área sean del tipo benigno, que el score sin
esa penalización alcance el mínimo, y que no haya KO de dimensión crítica de segunda
mitad. La dimensión sigue contribuyendo al agregado (no se desactiva), solo deja de
ser bloqueante en exclusiva.
