---
name: Second-half quality system (SA gate + structural rescue + dual mid-novel Beta)
description: Por qué y cómo se ataca el bajón de la segunda mitad en orchestrator.ts, y los frenos que NUNCA hay que quitar.
---

# Bajón de la segunda mitad — sistema de tres frentes

El acto 2 / segunda mitad de las novelas decae de forma recurrente. Tres mecanismos cooperan en `server/orchestrator.ts` para combatirlo. Lo importante son las **decisiones de diseño**, no el código (que se lee directamente).

## Por qué existe cada freno (no quitarlos sin entender esto)

- **Gate de dimensiones críticas del Auditor Estructural (SA)**: el score AGREGADO del auditor puede cruzar el umbral (≥7) con una dimensión crítica de segunda mitad (`escalada_acto2` / `arco_secreto` / `deus_ex_machina`) todavía KO, porque el umbral mira el agregado, no exige que cada dimensión esté sana. Por eso se fuerza retry mientras alguna esté KO.
  - **Por qué se respeta `lastIter` y `earlyStopByRegression`**: sin esos topes, una dimensión que el Arquitecto no consigue arreglar haría iterar hasta agotar tokens. El gate sube la barra, los topes acotan el coste, y `bestSA` restaura el mejor visto. No conviertas el gate en bucle infinito.

- **Brazo estructural del bucle Holístico+Beta** (`runStructuralSecondHalfRescue`): existe porque el cirujano cap-a-cap IGNORA por seguridad las instrucciones estructurales (decisión previa: evitar borrados/fusiones accidentales). Resultado: un sag estructural detectado por el Holístico nunca se corregía — el bucle releía, no veía mejora y abandonaba. El rescate reescribe capítulos completos del tramo flojo (vía `rewriteChapterForQA`, que ya tiene fallback a Narrador + verificación del Editor + revert por capítulo).
  - **Por qué SOLO en las ramas de abandono** (`instructions.length===0` y `stalled≥2`), no en cada iteración: es la última bala antes de rendirse; meterlo en el flujo normal multiplicaría el coste LLM.
  - **Por qué one-shot por bucle** (`structuralRescueDone`): evita la cadena reescritura→relectura→reescritura. Si tras un rescate sigue sin converger, se acepta la salida normal.
  - **Por qué NO se engancha en la rama de regresión**: el `bestSnapshot` del propio bucle ya protege a nivel manuscrito — si la reescritura empeora el combinado, el mecanismo de regresión restaura la mejor versión. Hookear ahí sería redundante y arriesgado.
  - **Filosofía de la instrucción de reescritura = Fix132**: escalada de apuesta monótona, pagada con coste tangible e irreversible, anti deus ex machina (prohibido salvadores sin sembrar), conservar hechos canónicos y World Bible — cambiar intensidad/consecuencias, no hechos.

- **Doble pasada del Beta de mid-novela** (`runMidNovelBetaPass` a ~45% y ~70%): antes corría una sola vez a ~2/3, demasiado tarde para enderezar la segunda mitad MIENTRAS se escribe. La crítica vigente (`midNovelBetaCritique`) se inyecta como `editorialCritique` en los Ghostwriters restantes.
  - **Por qué usa el helper scoped `runMidNovelBetaReview`** y no `runBetaReview`: el segundo, vía `loadFullNovelContext`, incluiría placeholders de capítulos aún sin escribir (contenido "") y degradaría la crítica.
  - Flags one-shot por pasada (`midNovelBetaAttempted` / `midNovelBetaSecondAttempted`) se marcan ANTES de la llamada para garantizar one-shot aunque la lectura falle.

**Riesgos asumidos conscientemente (architect)**: el gate SA hereda la dependencia de `instrucciones_revision` no vacías; la heurística de keywords del rescate puede dar falsos positivos (mitigado por one-shot + snapshot); marcas 45%/70% con `Math.floor` pueden disparar un capítulo antes en novelas muy cortas (aceptable).
