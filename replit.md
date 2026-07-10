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

- **[Fix180] Las citas de los revisores (Beta/Holístico) ahora deben ser TEXTUALES y estar atribuidas a su capítulo REAL, para que las correcciones lleguen a la prosa**: complemento de raíz al [Fix179]. El usuario reportó (proyecto 42, libro 3 de la serie 18) que el pulido seguía descartando correcciones del Capítulo 2 con citas que parecían prosa real ("mi primera esposa tambien fue un trato. aprendi a respetarla…"; "no es la primera vez que negocio un precio justo. una vez tu…"). **Diagnóstico verificado contra la BD**: (1) la PRIMERA cita NO existe en NINGÚN capítulo — el revisor la parafraseó/inventó; (2) la SEGUNDA cita SÍ existe pero en el **Capítulo 4** ("—Acepta. No es la primera vez que negocio un precio justo. Una vez tuve que vender mi propia fábrica…"), no en el 2. Era una instrucción multi-capítulo (afectaba cap 2 Y cap 4) SIN plan_por_capitulo, así que la misma cita se comprobaba contra el cap 2 (donde la frase no vive) y el guardián anti-fantasma ([Fix128]/[Fix179], `instruction-grounding.ts`, matching LITERAL por capítulo) la descartaba con razón en el 2. Fix179 hacía que la corrección SÍ aterrizara en el cap 4 (verificado: `el Capítulo 4: cirugía aplicada` a las 14:57 tras el fix, antes se descartaba a las 14:45), pero el revisor seguía generando citas parafraseadas y mal atribuidas → ruido y correcciones perdidas → Beta estancado en 8. **Causa raíz**: el prompt de ambos revisores desalentaba las citas largas (>15 palabras) pero NO exigía que las citas cortas que SÍ usa fueran textuales ni que cada cita se atribuyera al capítulo del que procede. **Arreglo** (solo PROMPT, sin migración, coste 0 LLM): en `server/agents/beta-reader.ts` y `server/agents/holistic-reviewer.ts`, dos reglas nuevas en el bloque REGLAS DEL JSON: (1) **CITAS TEXTUALES EXACTAS** — cualquier fragmento entrecomillado debe ser copia literal palabra-por-palabra del texto ACTUAL (nunca paráfrasis/reconstrucción de memoria); fragmento mínimo identificable; si no puede reproducirla exacta, describir el pasaje SIN comillas y anclar por capítulo+escena; (2) **CADA CITA A SU CAPÍTULO REAL** — una cita solo se asocia al capítulo del que procede de verdad; en multi-capítulo va DENTRO de su entrada de `plan_por_capitulo`, nunca repetida/compartida entre capítulos. No contradicen las reglas previas ("NO citas >15 palabras" piden fragmento mínimo; la exactitud es condicional a SI se entrecomilla). Footer `v10.0.27`→`v10.0.28`. Sin migración. tsc PASS + code review PASS.

- **[Fix179] El pulido dejaba de subir el Beta porque descartaba correcciones VÁLIDAS como "fantasma"**: visto en vivo (proyecto 42, libro 3 de la serie 18): el Beta se estancaba en 8/9 mientras iteración tras iteración se descartaban muchas notas del revisor "ANTES del cirujano — cita un pasaje que ya no existe en el texto actual". Las mejoras de craft que subirían el Beta nunca llegaban a la prosa. **Causa**: el guardián de instrucción-fantasma ([Fix128] `server/utils/instruction-grounding.ts`) extrae las citas literales entre comillas de la instrucción y las descarta si NINGUNA aparece en el texto vigente. Pero el extractor tragaba como "citas de prosa" el META-COMENTARIO del propio revisor colado entre comillas/paréntesis (p.ej. `"(cap 10, escena de la despensa) desactiva la gravedad..."`, `". localizar la línea exacta..."`) — eso jamás existe en la prosa, así que empujaba la instrucción a "fantasma" y la tiraba aunque el arreglo fuese legítimo. Además el matching era substring EXACTO: fallaba con acentos distintos y con citas que usan puntos suspensivos ("inicio... final" omitiendo el centro). **Arreglo** (solo `server/utils/instruction-grounding.ts`, sin migración): (1) `isLikelyMetaFragment` excluye de las citas auditables los fragmentos que arrancan con puntuación suelta, referencian "cap N"/"escena"/técnica narrativa, o contienen verbos-orden editoriales (localizar/desactivar/reescribir/reemplazar/eliminar/añadir/...); si tras el filtro no quedan citas, la instrucción PASA al cirujano en vez de descartarse; (2) `normalizeForMatch` ahora quita acentos (NFD + strip diacríticos, simétrico cita↔texto); (3) `quotePresent` tolera puntos suspensivos partiendo la cita y exigiendo cada fragmento (≥15 chars) en orden. El fantasma GENUINO (prosa realmente inexistente) se sigue descartando — la seguridad de [Fix128] intacta. Footer `v10.0.26`→`v10.0.27`. Coste 0 LLM (menos descartes = MENOS reintentos del bucle). Sin migración. tsc PASS + test manual de las citas reales que fallaban.

- **[Fix178] El pulido autónomo ya NO muestra al usuario "acciones administrativas pendientes"**: el usuario veía en la UI tarjetas de "acciones administrativas pendientes" (delete/merge de capítulos) del pulido post-finalización, como si el sistema le pidiera confirmación — rompía la autonomía total (el pulido debe ser 100% desatendido). **Causa**: el bucle autónomo crea acciones administrativas con `source="auto-review-loop"` como MEMORIA INTERNA para la verificación por unanimidad entre iteraciones ([Fix164]: un borrado solo se ejecuta si Holístico Y Beta coinciden en la misma lectura; si no, se descarta al cerrar el bucle vía `discardLeftoverAutoLoopAdminActions`). Esas acciones nunca fueron para el usuario, pero el endpoint `GET /api/projects/:id/pending-admin-actions` (`server/routes.ts`) las devolvía TODAS sin filtrar por `source`, así que la UI (`manuscript.tsx`) las pintaba y contaba. **Arreglo** (solo `server/routes.ts`, sin migración): el endpoint ahora filtra y EXCLUYE `source="auto-review-loop"`; solo muestra las del flujo MANUAL (`manual-editorial-notes`, `structural-translator`). El almacenamiento interno en `pending_admin_actions` se mantiene (el bucle lo necesita para la unanimidad cross-iteración; se limpia solo al cerrar). Footer `v10.0.25`→`v10.0.26`. Coste 0 LLM. Sin migración. tsc PASS.

- **[Fix177] El pulido post-finalización (Holístico+Beta) ahora es RESUMIBLE tras un reinicio del servidor**: era un punto ciego de recuperación — el bucle de pulido se lanza fire-and-forget (`void loopPromise`) DESPUÉS de marcar el proyecto `status="completed"`, así que no lo cubría ni el watchdog de reedición ni la reanudación de generación (ambos miran `status="processing"`). Un reinicio/caída del server DURANTE el bucle lo mataba en silencio y el libro quedaba con su nota mediocre y los arreglos sin aplicar (caso real: un volumen de serie murió en la iteración 1 tras DETECTAR sus 12 arreglos pero antes de aplicarlos). **Arreglo** (sin migración drizzle; patches idempotentes): (1) `shared/schema.ts` + `server/db.ts` (`SCHEMA_PATCHES`) añaden dos columnas a `projects`: `auto_polish_pending` (bool default false) y `auto_polish_resume_count` (int default 0); (2) `finalizeCompletedProject` marca `autoPolishPending=true` (resetea count=0) ANTES de lanzar el bucle y lo limpia en el `finally` (solo una caída DURA impide llegar al finally → el flag queda en true → señal de "reanudar"); nuevo método público `runAutoPolishResume`; (3) nuevo módulo `server/polish-auto-resume.ts` con `autoResumePendingPolish()` (escanea en arranque proyectos `completed` con el flag y relanza, tope `MAX_POLISH_RESUMES=3` para no gastar tokens si se cuelga siempre) y `forcePolishResume(id)` (rescate manual); (4) `server/index.ts` llama `autoResumePendingPolish` en el arranque; (5) `server/routes.ts` nuevo endpoint `POST /api/projects/:id/resume-polish`; (6) guard de exclusión COMPARTIDO (`server/utils/polish-registry.ts`) entre los dos puntos de entrada (finalize normal + auto-resume/rescate) para que un `/resume-polish` concurrente no lance un segundo bucle sobre el mismo libro (deploy single-instance → Set en memoria; se marca antes de cualquier await y se libera en `finally`+`catch`). Footer `v10.0.23`→`v10.0.24`. Coste 0 LLM (la infraestructura); el rescate en sí reusa el bucle de pulido existente. Sin migración drizzle. tsc PASS. **Refinamiento (footer `v10.0.24`→`v10.0.25`)**: quedaba un punto ciego — `autoResumePendingPolish` filtraba `autoPolishPending=true` **Y** `status="completed"`, pero si el server cae a MITAD de una cirugía el proyecto queda en `status="applying_editorial"` (el bucle lo pone antes de aplicar notas y lo devuelve a `completed` al terminar), así que el filtro se lo saltaba y el pulido NUNCA reanudaba (el libro se quedaba "parado", caso real proyecto 41 tras un reinicio por checkpoint). **Arreglo**: (1) el gate ahora es SOLO `autoPolishPending` (ese flag se pone únicamente en `finalizeCompletedProject`, ya implica novela terminada); (2) `runAutoPolishResume` restaura `status="completed"` al reanudar si estaba atascado en `applying_editorial` (el bucle exige `completed` para re-leer, y la UI lo mostraba como "aplicando"); (3) `MAX_POLISH_RESUMES` 3→8 (los checkpoints/merges de dev reinician el server con frecuencia y cada reinicio consume una reanudación aunque el pulido progresara; en prod systemd bastarían 3-4). Sin migración. tsc PASS.

- **[Fix176] La pausa en horas pico de DeepSeek [Fix172] ahora cubre también el pipeline de reedición de 12 agentes**: era el hueco que quedaba — el flag `pause_on_peak_hours` cubría generación, KDP y los bucles de traducción de `routes.ts`, pero NO `reedit-orchestrator.ts` (uno de los consumidores más caros). **Arreglo** (sin migración): (1) `waitForOffPeakIfEnabled` acepta un 4º parámetro opcional `onHeartbeat` — callback invocado al iniciar la pausa y cada 5 min (`EXT_HEARTBEAT_MS`, < umbral de 8 min del watchdog propio de reedición) para que pipelines con monitor de congelados PROPIO refresquen su latido; (2) puerta enganchada dentro de `checkCancellation` del reedit-orchestrator (se invoca entre capítulos/etapas en ~14 puntos del pipeline → cobertura total con un solo enganche), con `projectId=null` (la FK de `activity_logs` no casa con proyectos de reedición → solo consola), abort si `cancelRequested`/paused/error, y latido vía `updateHeartbeat` (refresca `heartbeatAt`); (3) puertas explícitas adicionales en `runStage8PostReeditReviews` (antes de las lecturas completas Holístico+Beta) y en cada iteración de `runAutoBetaLoopOnTranslation`, que no pasan por `checkCancellation`. Footer `v10.0.22`→`v10.0.23`. Coste 0 LLM. Sin migración. tsc PASS.

- **[Fix175] El actualizador (`update.sh`) ahora ofrece configurar el token de Cloudflare Tunnel**: igual que ya hacía con Fish Audio, si `cloudflared` no está activo pregunta el token (Enter para omitir; también acepta la variable `CF_TUNNEL_TOKEN` o el flag `--cf-token=TOKEN` sin prompt; sin TTY y sin token, omite con log y NO cuelga el update). Si se proporciona, instala `cloudflared` (deb según arquitectura), registra el servicio, lo habilita/arranca y activa `SECURE_COOKIES=true` en `/etc/litagents/env`. Si el túnel ya está activo, no pregunta nada. Espejo del PASO 13 de `install.sh`. Además, reorganización de docs: los fixes 165-171 asentados se movieron a `CHANGELOG.md` (con entrada nueva para el [Fix169], que faltaba). Footer `v10.0.21`→`v10.0.22`. Coste 0 LLM. Sin migración. bash -n PASS, tsc PASS.

- **[Fix174] El Cirujano del camino QA no veía los capítulos CITADOS en las instrucciones y rechazaba cirugías**: visto en vivo (proyecto 40): el Cirujano rechazó una cirugía con "La instrucción se refiere a capítulos posteriores (Capítulo 8 y Capítulo 19) cuyo texto no ha sido proporcionado" y cayó al fallback caro del Narrador (reescritura completa). **Causa**: había dos caminos con contextos distintos — el camino editorial [Fix129] ya añadía extractos de los `capitulos_afectados`, pero `rewriteChapterForQA` (el camino que usan Holístico/Beta y el auto-loop) solo pasaba los vecinos inmediatos [Fix170]. **Arreglo** (solo `server/orchestrator.ts`, sin migración): (1) nuevo helper estático `buildMentionedChapterExcerpts(chapters, currentChapterNumber, instructionsText, excludeNumbers, charsPerSide=1200, maxTotalChars=9000)` — extrae los capítulos mencionados en las instrucciones vía `extractFlaggedChapters` (regex ya existente, cubre Prólogo/Epílogo/Nota) y devuelve extractos cabeza+cola marcados "SOLO LECTURA", ordenados por cercanía al capítulo actual, con tope global 9k chars; (2) enganchado en el call-site del Cirujano de `rewriteChapterForQA`, anexado a `referenceChapters` tras los vecinos (excluyendo numero±1 para no duplicar). El camino editorial no cambia (ya tenía su propio mecanismo). Footer `v10.0.20`→`v10.0.21`. Coste 0 LLM extra (solo ~9k chars más de contexto por cirugía QA que cite otros capítulos; a cambio EVITA fallbacks completos del Narrador). Sin migración. tsc PASS.

- **[Fix173] Titular los volúmenes de serie con título PROPIO al completar la escaleta**: los volúmenes creados en lote nacían con títulos genéricos "NOMBRE SERIE — Vol. N" (visto en DB: projects 40/41/42, serie 18) y nunca se renombraban. **Arreglo** (solo `server/orchestrator.ts`, sin migración): (1) `isGenericVolumeTitle(title, seriesTitle)` — detecta patrones "— Vol./Volumen/Libro N" al final, prefijo "Vol. N..." o título idéntico al de la serie; (2) `maybeRetitleGenericSeriesVolume(project, worldBibleData)` — solo para proyectos con `seriesId` y título genérico: llamada LLM mínima (deepseek-v4-flash, thinking disabled, 512 tokens, registrada en `ai_usage_events` vía `recordRawAiUsage` como `volume-titler`) con premisa + títulos de los primeros 15 caps de la escaleta REAL + títulos de los volúmenes hermanos (coherencia de estilo, sin repetir); valida el resultado (3-120 chars, no genérico) y actualiza `projects.title` + el objeto en memoria (los prompts posteriores usan `project.title`) + activity log "Volumen titulado". Best-effort con try/catch: JAMÁS bloquea la generación; (3) enganchado tras `createWorldBible` en `_generateNovel` y tras `reconstructWorldBibleData` en `_resumeNovel` (paridad: volúmenes pre-fix que reanuden con título genérico también se titulan). Los flujos convert-to-series ya generaban títulos vía LLM con fallback genérico — ese fallback ahora se corrige solo al llegar la escaleta. Footer `v10.0.19`→`v10.0.20`. Coste: 1 llamada LLM barata por volumen genérico, una sola vez. Sin migración. tsc PASS.

- **[Fix172] Suspender el trabajo LLM en horas PICO de DeepSeek y reanudar solo en horas VALLE**: DeepSeek lanza tarificación dinámica a mediados de julio 2026 — las horas pico (9-12 y 14-18 hora de Pekín = 01-04 y 06-10 UTC) duplican el precio. **Arreglo** (sin migración drizzle; schema patch idempotente): (1) nuevo flag global `queue_state.pause_on_peak_hours` (default false; columna añadida vía `SCHEMA_PATCHES` en `server/db.ts` + campo en `shared/schema.ts`); (2) nuevo módulo `server/utils/peak-hours.ts` — `isPeakHourUtc`, `nextValleyStartUtc` y `waitForOffPeakIfEnabled(projectId, label, shouldAbort?)`: espera bloqueante que re-lee el flag cada minuto (desactivarlo en caliente reanuda al instante), respeta cancelaciones/abort vía callback, y emite un log-latido cada 15 min (< timeout 22 min del monitor de congelados, para que una pausa legítima de hasta 4 h no dispare auto-recovery; el latido NO usa las frases excluidas de `getLastMeaningfulActivityLogTime`); (3) puertas insertadas en: bucle de capítulos de `_generateNovel` y `_resumeNovel` (progreso ya persistido cap a cap), iteraciones de `runAutoHolisticReviewLoop` y `runAutoBetaLoop` (las lecturas de manuscrito completo son lo más caro), bucle por-mercado del pipeline KDP (`server/services/kdp-pipeline.ts`) y los 3 bucles de traducción por-capítulo en `server/routes.ts` (traducción, resume y reedición; con projectId=null → solo consola, sus tablas no casan con la FK de activity_logs). El audiolibro NO se pausa (usa Fish Audio, no DeepSeek). (4) UI: checkbox "Suspender en horas pico de DeepSeek" en la página Cola (`queue.tsx`) con aviso de ventanas pico convertidas a hora local y estado actual (pico/valle). Footer `v10.0.18`→`v10.0.19`. Coste 0 LLM. tsc PASS.

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