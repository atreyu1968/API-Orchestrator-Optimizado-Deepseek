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