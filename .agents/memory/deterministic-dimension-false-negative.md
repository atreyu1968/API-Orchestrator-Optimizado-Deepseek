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

## El patrón se repite en VARIAS dimensiones a la vez

Un atasco crónico de la auditoría estructural casi nunca es de UNA sola dimensión:
tratar la dimensión señalada en el log más reciente (p.ej. `falso_aliado`) suele dejar
la novela todavía <7 por otras deterministas (`arco_secreto`, `escalada_acto2`,
`dosificación`) que fallan en paralelo. Cuando aparezca un atasco crónico, NO asumir
que basta con la dimensión del último log; revisar TODAS las deterministas con el mismo
escrutinio (¿siembra real que el patrón no casa? ¿denominador de cobertura inflado?).

**Dos sabores de error a vigilar:**
1. **Falso negativo por siembra exacta (mismo arreglo que `falso_aliado`):** la siembra
   estricta exige tokens largos del hecho en caps previos; el Arquitecto siembra con
   sinónimos/tokens cortos (señal: el autopatch de sincronización mueve 5-10 revelaciones
   por iteración → la siembra EXISTE). Solución: pasada relajada parametrizando la
   longitud mínima de token, y confiar en un `setup_capitulo` DECLARADO si tiene ≥1 traza
   textual. Degradar severidad (alta→media) cuando hay traza débil; control negativo
   (0 trazas) mantiene "alta".
2. **Falso POSITIVO por denominador de cobertura inflado:** una métrica "X% de caps que
   deberían tener Y lo declaran" se hunde si el denominador cuenta caps que NO deberían
   tener Y. Caso `dosificación`: contaba tipo J (confrontación) y todo cap con
   `eventos_pivotales>0` (casi todos). Acotar el denominador a señales inequívocas
   (tipo exacto, array ya declarado, o keywords FUERTES de corpus — nunca palabras
   comunes como "verdad"/"descubre" que reinflan). Garantizar `withY ⊆ expectsY` para
   que la cobertura quede ≤1.

**Why:** estos detectores son deterministas (coste 0 LLM) pero su precisión depende de
patrones sintácticos frágiles; un patrón demasiado estricto en la siembra o demasiado
laxo en el denominador convierte una novela publicable en un bucle de horas.

3. **Falso POSITIVO por umbral matemáticamente imposible sobre una escala discreta corta:**
   una métrica "debe CRECER cada N capítulos" sobre una escala de pocos niveles (apuesta:
   baja=1<media=2<alta=3<critica=4) es imposible de cumplir en un tramo largo (acto 2 de
   ~18 caps): no hay suficientes escalones para subir uno cada 3 caps. Caso `escalada_acto2`:
   marcaba `bucle_sin_escalada` en CUALQUIER tramo de 3+ caps no creciente, así que sostener
   "alta"/"critica" cerca del clímax (tensión alta sostenida = BUENA escritura) o descender
   desde el pico (respiro deliberado) daba falso positivo crónico — 3-4 problemas por
   iteración que nunca bajaban, ~70 min de bucle re-corriendo al Arquitecto. Solución: penalizar
   un tramo no creciente SOLO si su rank MÁXIMO es bajo (<= "media"): el lector solo siente
   "presión sin escalada" cuando se estanca en niveles BAJOS; tolerar tramos que tocan
   "alta"/"critica". La escalada global real la garantiza el pico mínimo (`acto2_plano`: un
   acto 2 sin ningún "alta"/"critica" sí penaliza) + las puertas SEMÁNTICAS. Control negativo:
   meseta/descenso en "baja"/"media" sigue marcando bucle.

**Regla transversal (post-Fix151):** una vez que el gate determinista es ADVISORY (no bloquea),
estos falsos positivos ya no atascan la PUBLICACIÓN, pero SÍ malgastan tiempo/coste en el bucle
de mejora previo (re-correr al Arquitecto 8+ veces buscando bajar una métrica que es imposible
de bajar). Aflojar el detector sigue mereciendo la pena por COSTE, no solo por desbloqueo. Y al
aflojar, distinguir falso negativo (relajar reconocimiento de la señal real) de falso positivo
por umbral imposible (corregir el umbral), porque el arreglo es distinto.
