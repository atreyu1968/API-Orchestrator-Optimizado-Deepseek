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

- **[Fix127] La descarga de logs del re-edit incluye opiniones de los lectores y soluciones aplicadas**: el usuario quería analizar desde el log descargado por qué los defectos no se corrigen entre iteraciones o aparecen nuevos. `GET /api/reedit-projects/:id/logs/download` solo volcaba el `.log` plano de eventos, sin el contenido cualitativo de los revisores ni el historial de qué se aplicó. **Raíz**: en Stage 8 las notas crudas del Holístico+Beta se parseaban a `pendingEditorialParse` y se descartaban (solo persistían los scores `/10`). **(1) `server/orchestrators/reedit-orchestrator.ts`**: en Stage 8, antes de parsear, se persiste un audit report durable `auditType: "holistic_beta_notes"` (`{holisticNotes, betaNotes, completedAt}`, truncado a 60k por bloque, try/catch aislado). La rama de traducción ya guardaba `auto_beta_loop_translation_raw`. **(2) `server/routes.ts`** (descarga): tras el log base anexa dos secciones. **(A) OPINIONES DE LOS LECTORES**: scores `/10` actuales + texto completo (cronológico) de `holistic_beta_notes` y `auto_beta_loop_translation_raw`. **(B) SOLUCIONES APLICADAS**: cronológico de `holistic_beta_applied` (resumen + contadores + `perInstruction` con estado APPLIED/FAILED/SKIPPED/KEPT_PENDING) más las instrucciones aún pendientes en `pendingEditorialParse` (PROBLEMA/SOLUCIÓN/PRESERVAR). **Robustez**: bloque extra en `try/catch` global (si falla, el log base se descarga igual); `fmtDate` valida fechas inválidas; lectura de reports con `.catch(() => [])`. **Caveat**: proyectos previos a Fix127 no tendrán `holistic_beta_notes` hasta re-correr Stage 8 (sin backfill); bloques truncados a 60k. tsc PASS. Architect PASS (reserva de `fmtDate` aplicada). Sin migración (`reedit_audit_reports.findings` es JSONB). Coste 0 LLM. No emojis. Español simple.

- **[Fix126] Voz narrativa editable a mano cuando la guía no la especifica (cierra el gap de Fix122 con guías antiguas)**: el usuario reportó que al crear un proyecto desde una guía anterior a Fix125 (p.ej. una novela por pseudónimo cuya sección "3. VOZ Y NARRADOR" dice "Tercera persona limitada" pero NO indica el tiempo verbal de forma explícita) el sistema mostraba "No se ha detectado voz narrativa en la guía... el sistema abortará la generación" y abortaba el pre-flight (Fix108). Causa: Fix122 dejó el panel de voz como SOLO-LECTURA, así que si la guía no traía POV+tiempo explícitos el usuario no tenía forma de fijarlos en la UI y quedaba bloqueado (el extractor no infiere el tiempo verbal a partir de la prosa, solo de frases/bloques explícitos). **Arreglo (solo frontend, `client/src/components/config-panel.tsx`)**: nuevo memo `guideProvidesVoice` que corre `extractNarrativeVoiceFromGuide` sobre la guía seleccionada. **(1)** Si la guía aporta POV+tiempo COMPLETOS → el panel sigue SOLO-LECTURA (la guía es la fuente de verdad, intención de Fix122 intacta). **(2)** Si NO los aporta (guía antigua descriptiva, o ninguna guía) → el panel pasa a EDITABLE con tres `<Select>` (POV / tiempo verbal / tipo de narrador opcional) que escriben en el campo `narrativeVoice` vía un merge `setPart`. El objeto completo `{pov, tense, narratorType?}` cumple `narrativeVoiceConfigSchema`, se persiste en `projects.narrativeVoice` y el pre-flight Fix108 lo sintetiza (`synthesizeVoiceBlock`) y lo detecta → ya no aborta. Si el usuario rellena solo uno de POV/tiempo, el `zodResolver` del formulario bloquea el submit con `FormMessage`. Botón "Limpiar" resetea a null. No hay clobber con el autorelleno de Fix114 (este solo escribe cuando detecta pov+tense, y en ese caso el panel es solo-lectura). **Coste**: 0 LLM, sin migración (campo y schema ya existían desde Fix108). tsc PASS. Architect PASS. No emojis. Español simple.

- **[Fix125] Voz narrativa canónica en TODAS las guías generadas + detección robusta del bloque**: hasta ahora solo la rama `idea_writing` del generador emitía el bloque literal `## VOZ NARRATIVA CANÓNICA` (POV / Tiempo verbal / Tipo de narrador); las guías de estilo (`author_style`, la preferida según el usuario), de novela por pseudónimo (`pseudonym_style`) y de serie (`series_writing`) no lo incluían, así que al crear un proyecto desde ellas la voz no se detectaba y el pre-flight (Fix108) abortaba o quedaba a mano. Cambios: **(1)** `server/agents/style-guide-generator.ts` — añadido el mismo bloque OBLIGATORIO al final del system prompt de las tres ramas que faltaban, con el formato literal idéntico al de `idea_writing` (author_style: "voz predominante de este estilo autorial"; pseudonym_style: "coherente con el apartado 3 VOZ Y NARRADOR"; series_writing: "voz que comparten TODOS los volúmenes"). **(2)** Bug crítico detectado por el architect: el regex de tiempo verbal NO reconocía el formato del propio bloque (`Tiempo verbal: presente` — el "verbal:" rompía el match `tiempo\s+presente`), de modo que el bloque generado quedaba sin `tense` detectable y el pre-flight Fix108 abortaba igualmente. Corregido en los DOS extractores gemelos (`shared/narrative-voice-extractor.ts` para autorelleno cliente Fix114 y `server/utils/style-directives.ts` para inyección en prompts) añadiendo: alternativa `tiempo\s+verbal\s*:\s*(presente|pasado)`; soporte de `POV: dual primera|dual tercera` (antes solo detectaba dual por frases como "narración dual"); y `Tipo de narrador: X` con dos puntos (`narrador\s*:?\s*(omnisciente|limitado|testigo)`). Verificado con casos directos del bloque exacto: detecta first/third/second/dual_first/dual_third + present/past + narratorType. **Coste**: 0 LLM extra (prompts + regex). **Sin migración**. tsc PASS. Architect review aplicada (el fallo del tense lo encontró el architect; sin él las guías habrían salido con el bloque pero seguirían sin detectarse). No emojis. Español simple.

- **[Fix124] Adaptación del flujo al algoritmo A9 + COSMO ("A10") de Amazon**: Amazon desplegó en 2025 una capa COSMO sobre A9 que entiende intención de búsqueda y mide engagement (tiempo en página, Look Inside, KENP read-through). Los prompts KDP del proyecto y el Ghostwriter estaban escritos solo contra A9 clásico, perdiendo señal en COSMO. Cambios (todo en bloque): **(1)** `server/agents/kdp-metadata-generator.ts` — nuevo bloque **PRINCIPIO #0 — A9 + COSMO** al inicio del system prompt explicando los 4 ejes (especificidad gana al stuffing, engagement = nueva moneda, stuffing penalizado, prueba social/tráfico externo suben de peso); REGLA #4 (subtítulo) reescrita para ficción exigiendo "subgénero + ambientación/época/arquetipo" en frase natural y para no-ficción prohibiendo listas de palabras sueltas separadas por comas (COSMO lo lee como spam). **(2)** `server/agents/kdp/keyword-optimizer.ts` — system prompt menciona explícitamente la capa COSMO; bloque CRITICAL CONTEXT añade dato cuantitativo "frases de 5-7 palabras = ~69% de búsquedas que convierten; frases de 1-3 palabras = ~8%, preferir long-tail"; REQUIREMENT #6 reescrito (post-architect) eliminando "mix short and long" — ahora dicta long-tail dominante (4-7+ palabras), short-tail solo como sinónimo secundario ocasional. **(3)** `server/agents/kdp/market-metadata.ts` — bloque "Amazon's A9 Algorithm" renombrado a "A9 + COSMO Algorithm" con explicación de la nueva señal de engagement (KENP), refuerzo anti-stuffing en subtítulo/descripción y recordatorio de que la sinopsis debe crear expectativas concretas para sostener la lectura hasta el final. **(4)** `server/agents/ghostwriter.ts` — nueva REGLA #6 "MICRO-HOOK DE ENGAGEMENT (KENP — algoritmo COSMO/A10)" tras la regla de LONGITUD, con dos sub-reglas: APERTURA del capítulo debe reenganchar (prohibido abrir con resumen, paisaje neutro o reflexión filosófica) y CIERRE debe respetar el `tipo_cierre` que marca la escaleta PERO plantando una semilla de avance incluso en cierres reposados/ambiguos (imagen sin resolver, pregunta interna del POV, gesto sin explicar). Explícitamente NO contradice el cap del 70% de cliffhangers que aplica el orquestador ni la rotación de `tipos_permitidos` del Architect — es una capa de continuidad emocional, no un cliffhanger adicional. **(5)** Nuevo componente `client/src/components/kdp-promo-checklist.tsx` — checklist estática agrupada en 5 bloques (metadata sin stuffing, engagement, tráfico externo, consistencia 3-4 semanas, prueba social fresca) con iconos lucide, persistencia por `meta.id` en localStorage (`kdp-promo-checklist:{id}`) y contador progreso por grupo + total. Cada item tiene `data-testid` y `<label htmlFor>` correcto. **(6)** `client/src/pages/kdp-metadata.tsx` — nueva pestaña "Promoción" (icono Rocket) montada SIEMPRE (no condicional) tras "Landing"; push incondicional al array `tabs` (L613) + `TabsTrigger` + `TabsContent` que renderiza `<KdpPromoChecklist projectId={meta.id}/>`. **Coste**: 0 LLM extra (solo cambios de prompt). **Sin migración**. Architect PASS con una corrección aplicada (REQUIREMENT #6 del keyword-optimizer). No emojis. Español simple.

- **[Fix123] Edición de guías en el Taller (cierra el gap de Fix122)**: tras dejar la voz canónica como solo-lectura (Fix122), corregir POV/tiempo verbal mal detectado exigía editar la guía origen, pero el Taller solo permitía ver/descargar/borrar/aplicar. **Backend** (server/routes.ts L11034): `PATCH /api/guides/:id` acepta `title` (≤200) y/o `content`, valida no-vacíos, llama a `storage.updateGeneratedGuide`. Resto de campos (`guideType`, `sourceAuthor`, tokens, `createdAt`) inmutables (metadatos de generación). 400 si nada actualizable, 404 si no existe. **Frontend** (client/src/pages/guides.tsx): nuevo `GuideEditDialog` con `useState` de title+content rehidratado vía `useEffect([guide])` cada vez que cambia la guía — evita arrastrar ediciones sin guardar al cambiar de guía. Textarea monospace ~55vh. Botón Guardar deshabilitado si `!dirty || !valid || isPending`. Tras éxito invalida `['/api/guides']` y cierra. Nota debajo del textarea recuerda el bloque que Fix114 espera (`## VOZ NARRATIVA CANÓNICA` + `POV:` + `Tiempo verbal:` + `Tipo de narrador:`). Botón con icono `Pencil` en cada tarjeta. **Caveat propagación**: si la guía ya está aplicada a un pseudónimo, los cambios NO se propagan automáticamente — la copia vive en `pseudonyms.styleGuide`, el usuario debe re-pulsar "Aplicar a pseudónimo" para sustituirla (deliberado: evita machacar guías ajustadas a mano desde la sección de pseudónimos). Sin migración. Architect PASS.

- **[Fix122] Voz narrativa canónica de solo lectura en el config panel**: tras Fix114 (autorelleno desde la guía), el usuario podía seguir editando los 3 `<Select>` de POV/tiempo verbal/tipo de narrador en `config-panel.tsx` permitiendo introducir un valor contradictorio con la guía. **Implementación** (client/src/components/config-panel.tsx L924-1021): bloque "Voz narrativa canónica" reemplazado por panel render-only con `POV_LABELS`/`TENSE_LABELS`/`NARRATOR_LABELS`. Si la guía seleccionada incluye POV+tense, caja muted/30 con los 3 valores detectados y nota "Detectado desde la guía seleccionada". Si la guía no los especifica o no hay guía seleccionada, banner ámbar explica qué falta y dirige al usuario a editar la guía añadiendo el bloque `## VOZ NARRATIVA CANÓNICA`. El `useEffect` de Fix114 sigue rellenando el field al cambiar `styleGuideId`/`extendedGuideId`; al guardar el proyecto se persiste igual. `skipInitialAutofillRef` intacto. Backend pre-flight guard de Fix108 sigue abortando si `narrativeVoice` viene null y el extractor regex tampoco detecta. Sin migración.

- **[Fix121] Diálogo "Regenerar capítulo" con instrucciones opcionales del usuario**: el botón de regenerar capítulo en `dashboard.tsx` no permitía añadir contexto del usuario al rehacer el capítulo. **Frontend** (client/src/pages/dashboard.tsx): nuevo `Dialog` con `Textarea` opcional + botón con `disabled+isPending`. **Backend** (server/routes.ts L2175): endpoint `/api/projects/:id/regenerate-chapter/:chapterNumber` acepta `userInstructions` del body y los prepend al `refinementInstructions` con header "INSTRUCCIONES DEL USUARIO (PRIORITARIAS)". Architect PASS.

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