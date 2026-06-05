# LitAgents v9

LitAgents orchestrates autonomous AI literary agents to manage the entire novel-writing workflow, from authoring to translation and management.

## Run & Operate

To run the application locally, ensure you have Node.js installed.

```bash
# Install dependencies
npm install

# Run database migrations
npx drizzle-kit push:pg

# Start the development server
npm run dev
```

**Environment Variables:**

- `DATABASE_URL`: Connection string for your PostgreSQL database.
- `DEEPSEEK_API_KEY`: API key for DeepSeek V4-Flash models.
- `FISH_AUDIO_API_KEY`: API key for Fish Audio TTS service.

## Stack

- **Frameworks**: React, Express
- **Runtime**: Node.js
- **Language**: TypeScript
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Build Tool**: Vite (client), esbuild (server)
- **UI**: shadcn/ui (Radix UI, Tailwind CSS)
- **Routing**: Wouter
- **State Management**: TanStack Query
- **AI Models**: DeepSeek V4-Flash (all agents)

## Where things live

- **Database Schema**: `shared/schema.ts`
- **API Endpoints**: `server/routes.ts`
- **AI Agents**: `server/agents/`
- **Orchestration Logic**: `server/orchestrator.ts`
- **Frontend Pages**: `client/src/pages/`
- **Design System/Styling**: `client/tailwind.config.ts`, `client/src/index.css`
- **World Bible Management**: `server/utils/world-bible-format.ts`
- **Series Milestones/Threads Extractor**: `server/utils/series-milestones-extractor.ts`
- **AI Usage Recording Helper**: `server/utils/ai-usage.ts`

## Recent fixes

> Historial completo en `CHANGELOG.md`. Aquí solo los fixes aún recientes.

- **[Fix146] `arco_secreto` y `dosificación` dejan de generar falsos negativos/positivos que mantienen el score por debajo de 7 (mismo origen que Fix145)**: el usuario aportó el log real de "EL GRABADO DE LA LUNA NEGRA" tras la versión anterior; el diagnóstico fue que la novela llevaba ~16 h atascada NO solo por `falso_aliado` sino por VARIAS dimensiones a la vez: `arco_secreto` (casi siempre 2 problemas, cobertura 50-90%), `escalada_acto2` (1-4) y `dosificación` crónicamente baja (cobertura 15-47%). El usuario pidió investigar `arco_secreto` y `dosificación` como posibles falsos negativos (igual que `falso_aliado`) y hacerlos más tolerantes. **Arreglo (A) `arco_secreto` (`server/agents/scene-shape-auditor.ts`, `auditArcoSecreto`)**: fallback TOLERANTE antes de penalizar `siembra_textual_insuficiente_*` (espejo de Fix145). La siembra estricta exige tokens ≥4 chars del `hecho_revelado` en caps previos; cuando el Arquitecto SÍ siembra pero con sinónimos/tokens cortos (los logs muestran Fix117 auto-sincronizando 5-10 revelaciones por iteración → señal de que la siembra existe pero no casa token a token), daba falso negativo. Segunda pasada relajada: `extractSiembraTokens` parametrizado con `minLen` (3 en el fallback, captura ley/rey/mar/fe); un cap previo cuenta si tiene ≥1 token fuerte (no nombre propio), o ≥2 hits cualesquiera, o es un `setup_capitulo` DECLARADO con ≥1 hit de cualquier tipo (se confía en la declaración explícita del Arquitecto respaldada por una traza textual). Si la pasada relajada alcanza `minSiembra` → concede cobertura; además degrada de "alta" a "media" cuando hay AL MENOS una traza textual. **Control negativo**: un hecho sin ninguna traza en caps previos sigue penalizando "alta". **Arreglo (B) `dosificación` (`auditDosificacion`)**: denominador `expectsRev` más preciso. Antes contaba tipo J (confrontación, que puede ser pura acción sin revelación) y CUALQUIER cap con `eventos_pivotales>0` (casi todos) → inflaba el denominador, hundía la cobertura y disparaba un FALSO POSITIVO `dosificacion_no_declarada` (media, -0.7) iteración tras iteración. Ahora un cap "espera" revelación dosificable solo si es tipo M (revelación), si ya DECLARA `revelaciones_dosificadas`, o si su corpus contiene lenguaje de revelación inequívoco (`STRONG_REVELATION_HINTS`, sin "verdad"/"descubre" sueltos). Como `withRev ⊆ expectsRev`, la cobertura queda acotada a ≤1. **Control negativo**: un tipo M sin array declarado sigue contando como no-cubierto. Sandbox: arco positivo tolerante 100% / arco negativo 0% con 1 alta; dosif tolerante 100% sin falso positivo / dosif negativo 0% con 1 problema. Footer `v9.3.9`→`v9.4.0`. Coste 0 LLM (detectores deterministas). Sin migración. tsc PASS. Architect PASS.

- **[Fix145] `falso_aliado` deja de atrapar la novela en bucle por un falso negativo: detector del reveal del traidor más tolerante + red de seguridad en el gate**: la novela "EL GRABADO DE LA LUNA NEGRA" llevaba ~6 h atascada en auditoría estructural y se bloqueaba (`awaiting_structural_guidance`) pese a guía manual dos veces. La dimensión determinista `falso_aliado` (`server/agents/scene-shape-auditor.ts`, `auditFalsoAliado`) daba SIEMPRE 0% de cobertura; el audit on-demand del WBA confirmó WB suficiente (8/10) → FALSO NEGATIVO del detector (el Arquitecto sí declaraba el giro pero no con la estructura exacta esperada). Su único problema `reveal_no_declarado` (media, -0.7) dejaba el agregado <7 (`MIN_PUBLISHABLE_SA_SCORE`) iteración tras iteración. El usuario pidió **las dos cosas**. **Arreglo (A) detector más tolerante**: (1) nueva `STRONG_CORPUS_REVEAL_KEYWORDS`; (2) tokens de nombre relajados para nombres cortos (≥4 → ≥3 → token más largo ≥2); (3) en `revelaciones_dosificadas`, si hay UN solo traidor la keyword basta sin nombrarlo (≥2 traidores siguen exigiendo nombre); (4) fallback TOLERANTE por corpus antes de penalizar: si no hay reveal en la escaleta estructurada, busca en el último 40% (cap ≥ `minRevealCap`) co-ocurrencia de token del nombre + keyword fuerte en prosa y concede cobertura. Sandbox: prosa con keyword → 100%, nombre corto + revDos sin nombre (1 traidor) → 100%, control sin reveal → sigue 0% `reveal_no_declarado`. **Arreglo (B) red de seguridad en el gate (`server/orchestrator.ts`)**: `faChronicSoleBlocker` = agregado<MIN && sin KO crítico de 2ª mitad && todos los problemas FA son `reveal_no_declarado` && score sin la penalización FA (`10-2*altas-0.7*medias`, clamp[1,10]) ≥ MIN; si true se omite el gate (`&& !faChronicSoleBlocker`) y se continúa a generación con `console.warn` + `activityLog` warning (el Narrador debe materializar el giro en prosa). `falso_aliado` no está en `CRITICAL_SECOND_HALF_DIMS`. Footer `v9.3.8`→`v9.3.9`. Coste 0 LLM. Sin migración. tsc PASS. Architect PASS.

- **[Fix144] El reparador de JSON recupera comas faltantes entre elementos de array/objeto (ahorra un reintento de 8 min del Arquitecto)**: el usuario reportó el log real de "EL GRABADO DE LA LUNA NEGRA": `Arquitecto falló (intento 1): Phase 2 JSON parse error: Expected ',' or ']' after array element in JSON at position 2171. Reintentando...`. No es fatal (el Arquitecto reintenta hasta 3 veces y siguió), pero la Fase 2 (escaleta de 35 caps, ~8 min) devolvió JSON con dos elementos PEGADOS sin coma. Las 5 estrategias de `repairJson` (`server/utils/json-repair.ts`) fallaron: no es truncamiento (texto completo, error al inicio) ni comillas internas, y `manualRepair` solo inserta comas entre elementos separados por SALTO DE LÍNEA (sus regex exigen `\n`), no en la misma línea. Comprobado en sandbox que `jsonrepair` SÍ arregla un caso aislado de coma faltante → el caso real es ENTRELAZADO (coma faltante + otro artefacto, p.ej. comilla interna sin escapar, que desincroniza los strings). **Arreglo**: nueva `insertMissingCommas(text)` STRING-AWARE (camina char a char, nunca toca contenido en comillas, idempotente sobre JSON válido); marca `valueJustEnded` al cerrar valor (`}`/`]`/fin de string/número) e inserta coma ante el inicio de otro elemento (`{`/`[`/`"`/dígito/`-`/`t/f/n`) sin coma ni `:` por medio; consume el token bare entero (no parte números). Enganchada en `repairJson` como 3 intentos tras la estrategia 2.5 y antes de la 3: (2.6) directo; (2.7) pipeline COMBINADO `escapeUnescapedInnerQuotes`→`insertMissingCommas`→parse + variante con `jsonrepair` de red final (caso entrelazado). Cada intento en su `try/catch`. Footer `v9.1.0`→`v9.3.8`. Coste 0 LLM. Sin migración. tsc PASS. Architect PASS.

- **[Fix143] Prevención TEMPRANA de fallos en la GENERACIÓN: lecturas holísticas tempranas guía-only, gate previo más estricto ante dimensión crítica KO y reintento de originalidad con "revisar"**: el usuario pidió atacar los defectos estructurales lo antes posible DENTRO de la generación (no a posteriori con el corrector). Tres frentes, alcance ligero, coste LLM acotado, sin migración. **(A)** Tres lecturas HOLÍSTICAS tempranas guía-only (`server/orchestrator.ts`), espejo del Beta de mid-novela (Fix135-C): nuevos `midNovelHolisticCritique` + 3 flags one-shot (reset en `_generateNovel`); `runMidNovelHolisticReview` es una variante SCOPED (solo caps `completed` con contenido, devuelve solo el texto y NO persiste `holisticScore`/`lastHolisticNotes` para no pisar el dashboard ni confundir al bucle dual; sí `trackTokenUsage`); `runMidNovelHolisticPass` la envuelve best-effort; triggers a ~30%/55%/80% con las guardas del Beta (`betaEligible`); nuevo `combinedMidNovelCritique()` (Holístico primero + Beta, 12k/parte) inyectado como `editorialCritique` en los Ghostwriters de los caps RESTANTES → la 2ª mitad se escribe guiada SIN reescribir lo ya escrito. **(B)** Gate previo más estricto: nuevo helper `criticalSecondHalfKODims(problemas)` (mismas dims críticas que Fix135-A: `escalada_acto2`/`arco_secreto`/`deus_ex_machina`, KO si count≥2 O alta). El `break` del outer SA loop solo sale si `score≥MIN` **y** sin KO crítico; si el agregado pasa pero hay KO crítico y no se aplicó aún auto-guidance → 1 pasada extra (reutiliza Fix118) con un `reason` específico; si persiste → gate `awaiting_structural_guidance`. El gate ahora dispara si `score<MIN` **o** KO crítico (audita el best 1 vez, hoist de `finalAudit`); log/UI distinguen "agregado OK pero dim crítica KO" de "agregado bajo el mínimo". `generateMechanicalGuidanceFromProblems` admite `reason?` opcional. Caso real cazado: "LUNA NEGRA" 7.9/10 con `escalada_acto2` KO (2 medios) ya no pasa silencioso. **(C)** El Crítico de Originalidad reintenta (ONE-shot) también con `veredicto==="revisar" && score_originalidad<7` (antes solo "rechazado"); caso real 6/10 que pasaba sin corregir clichés. Coste: (A) hasta 3 lecturas best-effort; (B) 0 LLM salvo la pasada extra ya prevista; (C) a lo sumo 1 rediseño extra. Sin migración. tsc PASS. Architect PASS.

- **[Fix142] Cierre de fugas estructurales en la GENERACIÓN: arco de secundario abandonado (nueva 9ª dimensión determinista), set-pieces clonados y siembra real del clímax**: el usuario reportó que las novelas SIEMPRE salían con los mismos defectos (deus ex machina, acto 2 plano, set-pieces calcados y, sobre todo, **secundarios abandonados** — caso "Leonor": presentado como relevante y luego evaporado para un cierre no ganado). Objetivo: atacarlos EN LA GENERACIÓN (escaleta + escritura), no con el corrector. Tres fugas de la maquinaria existente: (1) ninguna dimensión vigilaba la continuidad de un secundario con arco (las de secreto/traidor/trauma no cubren al secundario normal; los auditores de cierre corren POST-generación); (2) `auditFormaEscena` mide variedad por ETIQUETA `forma_dominante` (dos persecuciones con etiqueta distinta pasan aunque la coreografía sea la misma); (3) deus ex / acto 2 ya gateados, pero el Ghostwriter no siembra de verdad en la prosa lo que el Arquitecto declara en `setup_capitulos`. **(A)** Nueva 9ª dimensión `arco_secundario` en `server/agents/scene-shape-auditor.ts` (`auditArcoSecundario`): reutiliza el escaneo de tokens de nombre de `auditArcoSecreto`; CONSERVADORA (solo personajes con `arco_transformacion` declarado y ≥2 campos con texto; excluye protagonista/antagonista/traidor; solo ≥10 caps). Detecta `personaje_con_arco_ausente` (media), `arco_secundario_abandonado` (presentado pronto y ausente del tramo final; ALTA solo si ≥4 apariciones tempranas + desaparición de todo el tercio final, si no media), `cierre_fantasma_secundario` (caso "Leonor": presentado pronto, AUSENTE de todo el acto central y reaparece al final solo para cerrar el arco → ALTA, fuerza retry) y `desaparicion_prolongada` (brecha ≥max(5,45%); ALTA si reaparece ya en el tramo final tras presentarse pronto, si no media). Una severidad ALTA fuerza retry del bucle SA vía `dimensionHasAltaSA` aunque el agregado cruce el umbral. Compatible con SERIES (solo penaliza desapariciones DENTRO del volumen). **(B)** Enganchada al gate del bucle SA en `server/orchestrator.ts` (los 5 mapas de dims) + regla en `auto-mechanical-guidance.ts` + mapeo SA→WBA. NO se añade a `CRITICAL_SECOND_HALF_DIMS` (contribuye al agregado y al retry por alta, sin gatear en exclusiva). **(C)** Prompt del Arquitecto (`architect.ts`): instr. 18 (set-pieces del mismo tipo deben variar escenario/táctica/oposición/coste, no solo la etiqueta). **(D)** Prompts Arquitecto (instr. 17: continuidad de secundarios, prohibido cierre fantasma) + Ghostwriter (`ghostwriter.ts`, punto 5: sembrar en la PROSA con tokens concretos, presencia textual real del salvador del clímax, secundarios que toman decisiones en escena). Coste 0 LLM extra salvo algún retry más del Arquitecto ante un abandono real (acotado por el presupuesto). Sin migración. tsc PASS. Architect PASS.

- **[Config] Umbral del Holístico para la ortotipográfica bajado a 7+ (Beta se mantiene en 9+)**: a petición del usuario (nota de libro comercial), `TARGET_HOLISTIC_SCORE` pasa de 8 a 7 en el auto-loop dual (`server/orchestrator.ts`); el target dual para la ortotipográfica final es ahora Beta≥9 AND Holístico≥7. Las guardas relativas (Fix89, Fix135) usan la constante y se ajustan solas. Sin migración. tsc PASS.

- **[Fix140] Ante una regresión de lectores, el auto-loop REINTENTA desde la mejor versión avisando al lector (en vez de abortar)**: continuación de Fix139; el usuario eligió "reintentar desde la mejor versión avisando del fallo, usando el límite de iteraciones que ya existe". Nuevo `regressionWarning?` opcional en `beta-reader.ts` y `holistic-reviewer.ts` (+ `regressionBlock` que pide releer la MEJOR versión siendo conservador/muy selectivo; sin el aviso, comportamiento idéntico). `runBetaReview`/`runHolisticReview`/`_runHolisticReview` lo aceptan en `options`. **Dual loop** (`runAutoHolisticReviewLoop`): en regresión (caída combinada ≥1.0), si el best cumple target → ortho+return; si no y `iter<MAX_ITERATIONS` → set `regressionAwareness`, `prevScores=best`, recarga proyecto y `continue`; si no queda presupuesto → persiste best y return; se limpia el aviso al guardar nuevo mejor snapshot. **Beta loop** (`runAutoBetaLoop`): cambia Fix112 — ahora revierte al best en la 1ª regresión y reintenta con aviso mientras quede presupuesto; al agotarlo conserva best (ortho si cumple target, si no `completed`); al reintentar REBOBINA `appliedNotesHistory` a `iter<=bestSnapshot.iter` para no confundir Fix120. Coherente con Fix133 (el aviso es contexto OPERATIVO, no notas previas de contenido). **Architect PASS** (sin bucle infinito: `continue` solo con `iter<MAX`, nunca en la última iteración; mayor coste posible pero acotado al presupuesto y aceptado por el usuario; firmas retrocompatibles). Coste LLM acotado. Sin migración. tsc PASS.

- **[Fix141] El cirujano de QA ya no malgasta una reescritura cuando la instrucción pertenece a OTRO capítulo**: en runs reales el cirujano recibía instrucciones cuyo texto decía que el cambio era de otro capítulo (cap 11: "requieren cambios en 26/27, no en el 11"; cap 14: "pide modificar el cap 23") y `rewriteChapterForQA` (`server/orchestrator.ts`) las pasaba igual al Narrador, gastando una llamada y arriesgando degradar el capítulo equivocado. **Arreglo**: nuevo branch tras `isInstructionStaleOrAlreadySatisfied` que usa el helper nuevo `surgeonReasonBelongsToOtherChapter(reason, capActual)`; si la instrucción apunta a otro capítulo, avisa por log, marca el capítulo `completed` (sin `needsRevision`, `revisionReason:null`), dispara callbacks y `return` SIN fallback al Narrador. Dos señales conservadoras: A (regex "no en el cap {actual}/este/actual") y B (verbo de modificación + nº de capítulo ≠ actual). Verificado: cap 11 → Señal A, cap 14 → Señal B. **Architect PASS**. Coste 0 LLM (ahorra llamadas). Sin migración. tsc PASS.

## Architecture decisions

- **Autonomous Agent Orchestration**: Uses a modular agent system (`BaseAgent` inheritance) for specialized tasks, managed by a central orchestrator, allowing for complex, multi-step literary workflows.
- **DeepSeek V4-Flash Context Window**: Leverages the 1M token context window of DeepSeek V4-Flash by injecting full previous chapter texts, entire previous volumes (for series), and pseudonym catalogs into agent prompts for enhanced coherence and reduced repetition.
- **Two-Step Editorial Workflow**: Editorial notes are first parsed and previewed (structured JSON output) before application, giving users control over AI-suggested changes and enabling a human-in-the-loop approval process.
- **Robustness and Auto-Recovery**: Includes mechanisms like best-effort buffers for agent outputs, automatic retry logic for failed generations (Architect, word count), persistence of partial progress (KDP pipeline, mid-generation checkpoints), and defensive filters for AI-generated instructions to prevent errors and ensure continuity.
- **Server-Sent Events (SSE) for Background Tasks**: Long-running AI operations (e.g., holistic review, editorial parsing) respond immediately with HTTP 202 and stream updates via SSE, preventing timeouts and keeping the UI responsive. Heartbeats are implemented to maintain connections.

## Product

- **Novel Generation**: Orchestrates AI agents for authoring new literary works.
- **Re-editing Pipeline**: Provides publication-quality re-editing with 12 specialized agents for deep analysis and correction.
- **Literary Adaptation & Translation**: Supports translation into 7 languages with a focus on publication-ready prose.
- **Series Management**: Features inter-book continuity, prequel/spin-off creation, and unified World Bible management across series volumes.
- **KDP Metadata Generation**: Automates the creation of Amazon KDP publishing metadata (descriptions, keywords, categories) for multiple markets.
- **Audiobook Generation**: Converts completed manuscripts into audiobooks using TTS, supporting pause/resume and parallel chapter generation.
- **Guide Workshop**: AI-powered generation of writing and style guides, including pseudonym-specific and series-coherence guides.
- **Back Matter System**: Configurable back matter pages (review requests, "also by" lists, author bios) for exports.
- **Manuscript Import**: Supports various file formats (`.docx`, `.txt`, `.md`) with intelligent chapter detection for re-editing or translation.

## User preferences

Preferred communication style: Simple, everyday language. Communicate ALWAYS in Spanish.

## Gotchas

- **KDP Pipeline Execution**: KDP pipeline runs in the background and persists progress incrementally. Partial failures are tolerated (market marked with `error`, pipeline continues).
- **Architect Timeout**: The Architect agent's phase 2 can take up to 18 minutes for large novels (post-[Fix18] extended schema); the orchestrator's frozen monitor (`HEARTBEAT_TIMEOUT_MS`) is set to 22 minutes, leaving a 4-min safety margin. Phase 1 keeps the default 12-min timeout.
- **Structural Notes Handling**: Editorial notes requesting structural changes (delete/merge chapters) are explicitly *not* auto-applied but logged as administrative actions requiring manual confirmation, preventing accidental data loss or corruption.
- **SSE Connection Stability**: Long-running background processes (holistic review, editorial parsing) rely on SSE. Cloudflare can close idle connections. A heartbeat mechanism and DB persistence for results are implemented as safeguards.
- **Re-running Series Arc Verification**: For standalone projects, `runStandaloneArcCheck` is invoked after `finalizeCompletedProject` to audit arc closure.
- **Narrator Header Leakage**: The Ghostwriter agent has defensive sanitization to prevent meta-referential chapter headers from appearing in the generated prose.
- **DeepSeek `temperature`/`top_p`**: When `thinking` is enabled for DeepSeek models, `temperature` and `top_p` parameters are silently ignored.

## Pointers

- **OpenAI-compatible SDK**: Used for all DeepSeek API calls. [DeepSeek API Docs](https://www.deepseek.com/docs)
- **Drizzle ORM**: [Drizzle Documentation](https://orm.drizzle.team/docs/overview)
- **TanStack Query**: [TanStack Query Documentation](https://tanstack.com/query/latest)
- **Tailwind CSS**: [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- **Fish Audio API**: [Fish Audio API Documentation](https://fishaudio.com/docs)