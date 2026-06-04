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

## Prevención TEMPRANA en la propia generación (capa preventiva, NO correctiva)

La filosofía de arriba es reactiva (corrige tras escribir). Una segunda capa actúa ANTES/DURANTE para que el defecto no llegue a existir:

- **Gate PREVIO al primer carácter escrito** (helper `criticalSecondHalfKODims`): mismas dims críticas que el gate reactivo (`escalada_acto2`/`arco_secreto`/`deus_ex_machina`, KO si count≥2 O alta), pero aplicado a la ESCALETA antes de generar. El agregado SA puede cruzar 7 con una dim crítica KO (caso real: escaleta 7.9 con `escalada_acto2` KO por 2 medios). Antes eso pasaba silencioso a generación; ahora el `break` del outer SA loop exige `score≥MIN` **Y** sin KO crítico, y el gate `awaiting_structural_guidance` dispara con `score<MIN` **O** KO crítico.
  - **Por qué una sola pasada extra (no bucle)**: si el agregado pasa pero hay KO, se reusa la auto-guidance de Fix118 una vez; si persiste, se PAUSA para guidance humana en vez de iterar a ciegas. El `reason` opcional del generador de guidance evita el texto falso "por debajo del mínimo" cuando el agregado sí pasa.

- **Lecturas HOLÍSTICAS tempranas guía-only** (~30/55/80%), espejo del doble Beta: el Holístico (macro/estructural) diagnostica mientras se escribe y la crítica se inyecta como `editorialCritique` en los caps RESTANTES vía `combinedMidNovelCritique()` (Holístico primero + Beta). NUNCA reescribe lo ya escrito — solo guía lo que falta.
  - **Por qué NO persiste `holisticScore`/`lastHolisticNotes`** (a diferencia de la lectura final): es guía interna; pisar esos campos ensuciaría el dashboard y confundiría al bucle dual final, que relee limpio. Sí registra tokens.
  - Mismas guardas one-shot + `betaEligible` que el Beta; flags marcados ANTES de la llamada.

- **Reintento de originalidad ampliado**: el rediseño ONE-shot del outline antes solo disparaba con `veredicto==="rechazado"`. Un "revisar" con `score_originalidad<7` pasaba con clichés. Ahora cubre ambos. Sigue ONE-shot para acotar coste.
