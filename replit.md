# LitAgents v7.9

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

## Recent fixes

> Historial completo en `CHANGELOG.md`. Aquí solo los fixes aún recientes.

- **[Fix68b] Precuelas se juzgan como "primer libro cronológico" en lugar de "novela autoconclusiva" (v7.9)**: Bug residual reportado tras Fix68: el usuario observó que aunque Fix68 ya impedía contaminar al Beta con hitos del Vol. 1, el Beta seguía evaluando la precuela como "novela autoconclusiva" y por tanto se quejaba de que "el manuscrito sigue siendo el primer tercio de una novela, no una novela completa", "se siente inconclusa", "termina cuando debería empezar la trama" — críticas estructurales que NO aplican a una precuela porque "el lector seguirá leyendo Vol. 1+". Causa: aunque Fix68 marcaba el bloque como PRECUELA y eliminaba la exigencia de los hitos del Vol. 1, mantenía la rúbrica de "júzgala como NOVELA AUTOCONCLUSIVA por su propia trama" (`final-reviewer.ts:651` original y `series-context-builder.ts:80` con "la precuela en sí se juzga como novela independiente"). El Beta interpretaba "autoconclusiva" como "novela cerrada con final", lo que automáticamente activaba el reproche de "es solo un primer acto" cuando la precuela legítimamente terminaba con arcos amplios abiertos hacia Vol. 1+. Implementación: reformulación coordinada del marco mental del bloque PRECUELA en 4 sitios — (a) `series-context-builder.ts:79-93`: cinco párrafos explícitos que enmarcan la precuela como "el PRIMER libro cronológico de una serie planificada de N volúmenes" donde "el lector seguirá leyendo Vol. 1+", con bloques diferenciados "Lo que SÍ debes evaluar" (arco puntual interno que el libro elige plantear), "Lo que NO debes hacer" (no penalizar personajes vivos, conflictos abiertos, finales con cliffhanger) y "Coherencia inversa" (única auditoría estricta: no contradecir volúmenes posteriores); (b) `final-reviewer.ts:647-680`: nuevo encabezado "PRECUELA (Vol. 0 — PRIMER LIBRO CRONOLÓGICO)" con prohibición explícita "NO JUZGUES ESTA NOVELA COMO AUTOCONCLUSIVA NI COMO NOVELA INDEPENDIENTE" y bullet "NO reportes 'arco_incompleto' ni 'el manuscrito termina como un primer acto' ni 'se siente inconcluso'"; (c) `arc-validator.ts:285-292`: encabezado actualizado a "PRIMER LIBRO CRONOLÓGICO", añadido bullet "NO reportes 'arco incompleto' ni 'el manuscrito termina como un primer acto' porque queden abiertos hilos largos hacia Vol. 1+"; (d) `beta-reader.ts:160-162`: nueva rama explícita "Si el bloque indica PRECUELA (Vol. 0)" dentro de la sección 5 (CONTEXTO DE SERIE) con las mismas reglas, y nota en L161 sobre hilos POSTERIORES que no necesitan re-presentación ni cierre. Se preserva la auditoría del arco interno (la precuela debe cerrar lo que ELLA promete plantear) y la coherencia inversa hacia volúmenes posteriores. Sin migración SQL. Solo afecta a evaluaciones nuevas.

- **[Fix68] Precuelas no contaminan al Beta con hitos del Vol. 1 + Beta audita realismo geográfico/histórico (v7.9)**: Dos bugs reportados por el usuario en el mismo mensaje. (A) "Cuando creo una precuela no se añaden hitos a la serie y el Beta piensa que deben ser los del Vol. 1, lo que genera frustración en su evaluación". Causa: en `server/utils/series-context-builder.ts:50` se calculaba `volumeNumber = opts.seriesOrder || 1`. Una precuela se crea con `seriesOrder: 0` y `projectSubtype: "prequel"` (ver `server/routes.ts:3290`), pero `0 || 1` colapsa a 1, así que el helper cargaba los hitos del Vol. 1 (`milestones.filter(m => m.volumeNumber === volumeNumber)` con `volumeNumber === 1`) y los metía en el bloque "## CONTEXTO DE SERIE" como si fueran obligatorios para la precuela. El Beta, al no ver esos hitos en el manuscrito (porque pertenecen a otro libro), se quejaba de incumplimiento estructural. Implementación: (a) `SeriesContextOptions` ahora acepta `projectSubtype`. (b) `isPrequel = projectSubtype === "prequel" || seriesOrder === 0`; `volumeNumber` es 0 para precuela, `seriesOrder` si es > 0, fallback 1 si no se sabe. (c) Si es precuela, el bloque "CONTEXTO DE SERIE" se renderiza como "PRECUELA (Vol. 0)" con explicaciones específicas (los hilos largos son FUTURO; no exijas su cierre; la coherencia es inversa: la precuela no debe contradecir lo ya escrito en volúmenes posteriores). (d) Si no hay hitos registrados para Vol. 0, se imprime aviso explícito "NO uses los hitos de Vol. 1+: pertenecen a libros POSTERIORES". (e) Bloque "HILOS DE LA SERIE" recibe nota específica para precuelas. (f) Los dos callers (`server/orchestrator.ts:5634` y `server/orchestrators/reedit-orchestrator.ts:5154`) ahora pasan `projectSubtype`. (B) "El Beta debería criticar también aspectos geográficos e históricos cuando la historia transcurre en lugar y época concreta". Implementación: nueva sección obligatoria "## REALISMO GEOGRÁFICO E HISTÓRICO" en el FORMATO OBLIGATORIO del prompt del Beta (`server/agents/beta-reader.ts`) que cubre anacronismos (objetos/tecnología/palabras), geografía (distancias, climas, edificios), cultura material e idioma, hechos históricos (fechas/personajes públicos) y convenciones sociales. Incluye salida explícita "No aplica: ambientación no-realista." para novelas de fantasía/SF/mundo inventado, y "Sin problemas relevantes detectados." cuando la prosa sí da pistas y está limpia, para que el modelo no invente errores. Sin migración SQL. Aplica a generaciones nuevas; relanza el Beta sobre la precuela y debería evaluarla como autoconclusiva sin pedirle los hitos del Vol. 1.

- **[Fix67] El verificador de arcos lee el manuscrito completo (sin truncar a 8 000 chars/cap) (v7.9)**: Bug crítico reportado por el usuario: tras finalizar un volumen, el verificador de arcos respondió "los capítulos finales (no proporcionados) deben cubrir explícitamente la confrontación con Noburo, la activación de la campana en el Santuario…" — el usuario notó que "el verificador de series no está leyendo el libro completo". Causa: en `server/orchestrator.ts:10869` (`runSeriesArcVerification`) y `server/orchestrator.ts:11099` (`runStandaloneArcCheck`) cada capítulo se truncaba con `content.substring(0, 8000)` antes de pasarlo al `ArcValidator`. Con capítulos típicos de 4 000-6 000 palabras (~24 000-36 000 chars) el verificador solo veía el primer 25-40 % de cada capítulo, perdiéndose precisamente los desenlaces que estaba auditando. Para empeorarlo, el propio `ArcValidator` aplicaba un segundo truncado a 100 000 chars en `server/agents/arc-validator.ts:263` (`input.chaptersSummary.substring(0, 100000)`). Implementación: (a) ambos sitios del orchestrator pasan ahora `content` íntegro de cada capítulo sin `substring` ni marca de truncado; (b) `arc-validator.ts:266` recibe `${input.chaptersSummary}` completo (eliminado el `.substring(0, 100000)`). DeepSeek V4-Flash tiene 1M de contexto: una novela de 200 000 palabras ≈ 800 000 tokens y cabe holgada. Sin migración SQL. Aplica a verificaciones nuevas (series y standalone); puedes relanzar la verificación de arcos sobre novelas ya generadas y ahora sí leerá el libro entero.

- **[Fix66] La guía de escritura extendida deja de inyectarse dentro de la PREMISA del Arquitecto (v7.9)**: Bug crítico reportado por el usuario: "es como si los proyectos estén ignorando las guías de escritura — tal vez se trata de una novela romántica y la convierte en fantasía y cambia los personajes y la trama planificada". Causa: en `server/orchestrator.ts:1141-1143` se construía `effectivePremise = project.premise + "\n\n--- GUÍA DE ESCRITURA EXTENDIDA ---\n" + extendedGuideContent + seriesContextContent` y se pasaba ese campo combinado al Arquitecto como `premise`. En el prompt del Arquitecto (`server/agents/architect.ts:447`) ese valor se renderiza como `Idea: "${ideaInicial}"` con `ideaInicial = input.premise`. Si la guía extendida contenía la trama de OTRA novela (típicamente una novela ejemplo del autor para imitar voz, p. ej. una de fantasía con sus propios personajes y trama detallada), el modelo recibía algo como `Idea: "premisa romántica corta + 10000 palabras de fantasía con tramas y personajes propios"` y el bloque más largo y detallado dominaba — el Arquitecto reescribía género, personajes y trama usando la guía como si fuera la idea real. Para empeorarlo, la misma guía iba DUPLICADA como `extendedGuideContent` parámetro independiente que se renderiza en el bloque "MATERIALES DE REFERENCIA DEL AUTOR". Implementación: (a) `effectivePremise` ahora solo concatena `seriesContextContent` cuando aplica; la guía extendida se elimina del campo premise (sigue viajando como `extendedGuideContent` parámetro independiente que el Arquitecto renderiza en su propio bloque). (b) El bloque "MATERIALES DE REFERENCIA DEL AUTOR" en `architect.ts:553-564` recibe una sección "ALCANCE ESTRICTO — ES MATERIAL DE REFERENCIA, NO LA PREMISA" con reglas explícitas: NO cambiar el GÉNERO declarado, NO copiar personajes/lugares/trama del material como personajes/lugares/trama de esta novela; SÍ imitar voz/ritmo/léxico/estilo si es del mismo autor; SÍ usar datos históricos/técnicos/contexto factual. Sin migración SQL. Solo afecta a generaciones nuevas; las novelas ya generadas con este bug requieren regenerar el plan del Arquitecto desde cero (botón "regenerar arquitecto") con el género correcto fijado.

- **[Fix65] El Arquitecto fase 1 valida coherencia de calendario al fijar fechas concretas (v7.9)**: Bug observado en la novela "La Herrumbre de los Días": el Arquitecto fijó "Caradec muere domingo 14 de enero" pero capítulos posteriores mencionaban viernes/jueves/lunes que no encajaban con un calendario real, y el WB-arbiter detectó la lesión sin poder repararla porque la incoherencia estaba en el canon. El Final Reviewer marcó esto como "lesión persistente" y degradó el veredicto a "APROBADO CON RESERVAS". Implementación: instrucción adicional dentro de la rúbrica de `linea_temporal` en el prompt fase 1 del `ArchitectAgent` (`server/agents/architect.ts:604-616`) que exige derivar TODOS los días de la semana mencionados desde la fecha real cuando se usen fechas concretas, o bien usar marcadores relativos ("tres días después", "la semana siguiente") si no se necesita precisión de calendario. Sin migración SQL. Solo afecta a generaciones nuevas.

- **[Fix64] Cap en pulido sobrevive al reinicio del orquestador (no se regenera desde cero) (v7.9)**: Bug raro pero costoso observado en cap 26 de "La Herrumbre de los Días": el log mostró `13:06:04 Cap 26 aprobado (8/10) → puliendo...` y 69s después `13:07:13 Estructura narrativa completada → Retomando generación. 11 capítulos pendientes`, regenerando el cap 26 desde cero (~5 min y tokens duplicados). Causa: el contenido aprobado por el Editor solo se guardaba en BD AL FINAL, tras el pulido del Estilista; si algo (timeout, restart, abort) interrumpía entre la aprobación y la finalización del pulido, la rama de resume veía el cap como pendiente sin contenido y lo regeneraba. Implementación: (a) Tras aceptar `bestVersion.content` como aprobada por el Editor y antes de invocar al `Estilista`, se persiste en BD con `status: "polishing"` (en ambas ramas: `generateNovel` ~L2450 y `resumeNovel` ~L3250). (b) En la rama de resume, antes de calcular `pendingChapters`, se filtran los caps con `status === "polishing" && content > 200 chars` y se aceptan como `completed` directamente, registrando un activity log que explica la decisión. Trade-off: perdemos el pulido cosmético (cambios menores de prosa) pero conservamos el capítulo aprobado por el Editor en lugar de re-narrarlo desde cero. Sin migración SQL: el campo `status` ya es text libre en chapters.

- **[Fix63] Salida temprana del Final Reviewer tras 2 restauraciones Fix39 consecutivas con snapshot ≥9/10 (v7.9)**: Patrón observado en "La Herrumbre de los Días": ciclos 1-2 puntuaron 9/10, pero ciclos 3-5 fueron 8→6→7 (3 regresiones consecutivas), todas restauradas correctamente por Fix39 al snapshot del ciclo 2; ciclo 6 volvió a 9/10 y aprobó. Resultado: ~10 minutos extra de Final Reviewer cuyas reescrituras solo fueron a la papelera. Implementación: (a) Nueva variable `consecutiveFix39Restorations` declarada junto a `bestManuscriptSnapshot` en `runFinalReview` (`server/orchestrator.ts:3735-3740`). (b) Se incrementa cada vez que entramos en la rama de restauración Fix39 y se resetea cuando hay un nuevo best score O cuando un ciclo no entra en la rama de restauración. (c) Si el contador alcanza 2 Y el snapshot está en ≥9/10, devolvemos `classifyExit(...)` con `forceKind="approved"` antes de seguir quemando ciclos. El Revisor Final está demostradamente empeorando el manuscrito en ese punto y el snapshot ya cumple la barra de calidad. Sin migración SQL.

- **[Fix62] Pre-filtrado de capítulos sin issues aplicables y enrutado correcto de foreshadowing por `capitulo_setup` (v7.9)**: Observado en logs: ~18% de las cirugías del semantic-detector se descartaban con "instrucción no aplicable" — el detector enviaba foreshadowing planteado en cap 17 a los caps 3, 12 y 33 que no podían resolverlo (cap 3 está antes del setup, cap 33 nunca lo menciona). El cirujano detectaba el problema y descartaba, pero gastábamos llamadas LLM. Implementación en ambas ramas (`generateNovel` ~L2733 y `resumeNovel` ~L3451): (a) Pre-filtrado: solo se conservan capítulos con al menos un cluster aplicable (`c.capitulos_afectados?.includes(chapterNum)`) o un foreshadowing cuyo `capitulo_setup ≤ chapterNum` (un cap solo puede resolver pistas plantadas antes o en él mismo). (b) El bloque `foreshadowingIssues` aplica el mismo filtro `capitulo_setup ≤ chapterNum` antes de enumerar las pistas. (c) El texto de la nota también se suavizó de "DEBES resolverlo" a "Si tiene sentido en este capítulo, resuélvelo o referénciaolo; si no aplica, ignora esta nota" para no forzar al cirujano a inventar. Sin migración SQL.

- **[Fix61] El Plan Quirúrgico aborta tras regresión catastrófica (caída ≥3 puntos) (v7.9)**: En "La Herrumbre de los Días" varios caps cayeron tras la primera reescritura: cap 6 (7→5), cap 9 (8→5), cap 22 (6→4). El sistema seguía intentando hasta agotar `maxRefinementLoops`, gastando ~6-7 min por capítulo en reescrituras que solo empeoraban el original. Implementación: en ambas ramas de la generación de capítulos (`generateNovel` ~L2387-2409 y `resumeNovel` ~L3168-3185), tras incrementar `refinementAttempts++`, comprobamos `bestVersion.score >= 7 && currentScore > 0 && bestVersion.score - currentScore >= 3`. Si se cumple, registramos un activity log de nivel warning, emitimos un status "El Plan Quirúrgico está empeorando el capítulo" y rompemos el loop conservando la mejor versión. La verificación va antes del check anti-stagnation original (`attemptsSinceBestImprovement >= 2`) para cortar antes y ahorrar la siguiente reescritura. Sin migración SQL.

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

Preferred communication style: Simple, everyday language.

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