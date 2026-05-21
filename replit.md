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

- **[Fix104] Visibilidad de rechazos de retry por escaleta truncada en los 4 bucles del Arquitecto**: Queja del usuario sobre los logs: "Auditor Estructural iter 1 da 1/10, el Arquitecto reintenta y produce 12 capítulos (de 33 pedidos, rango 30-35), y el siguiente log es directamente 'Lector Beta está leyendo la escaleta...' — no hay rastro del rechazo en el activity log". Diagnóstico: los 4 retry-loops de auditores (Originalidad ~líneas 1850, Integridad ~líneas 2040, Estructural Fix92 ~líneas 2296, Beta Fix9 ~líneas 2548) ya validaban `isAcceptableEscaletaCount` y rechazaban correctamente reintentos con escaleta truncada, pero el rechazo se loguea solo con `console.warn` (no llega al UI del usuario). Resultado: el orquestador internamente conserva la escaleta previa válida y sigue al siguiente auditor, pero el usuario ve "Fase 2/2 completada en 510s. 12 capítulos en la escaleta" seguido de "El Lector Beta está leyendo..." y razonablemente cree que el Beta está leyendo una escaleta de 12 capítulos cuando en realidad lee la previa de 35 caps. **Implementación**: en cada uno de los 4 puntos de rechazo (4 bloques `else` tras `if (reviewedData && ... && acceptCount)`), añadido un `createActivityLog` con `level: "warning"` y `agentRole: "architect"` que explica al usuario qué pasó: "[Fix104] Reintento del Arquitecto (Auditor X) RECHAZADO: produjo N caps fuera del rango aceptable [min+extras, max+extras]. Se conserva la mejor escaleta vista y se continúa el pipeline." Metadata estructurada `{ fix: "Fix104", reviewedLen, rangeLabel, auditor }` para análisis posterior. El bloque Beta además incluye el `betaIter` y el `motivo` específico (count fuera de rango / falta matriz_arcos / sin personajes). **Backwards-compat**: solo añade activity logs, no cambia la lógica de aceptación/rechazo (que ya funcionaba), no cambia schemas. **Universal**: aplica a modo exacto y modo rango (Fix90). Sin emojis.

- **[Fix103] Guard anti-reanudación-destructiva durante generación activa**: Queja del usuario: "tras iter 3 del retry estructural empieza Fase 2 a las 17:11:45, Fase 1 termina a las 17:16:41 con 0 arcos (warning silencioso), y a las 17:21:29 salta '[Orquestador] Reanudación: sin World Bible ni capítulos. Reiniciando generación desde cero' — borra todo el run en marcha y arranca de cero". Diagnóstico: el Arquitecto persiste el World Bible solo al FINAL de Fase 2 (la `worldBibleData` viva durante 20-30 min está solo en memoria, en `this.worldBibleData`). Si por cualquier razón se invoca `resumeNovel` mientras hay un orquestador activo (timer del cliente, race en el botón de UI, queue-manager picking up the same project, heartbeat auto-recovery del queue-manager), el bloque de "sin World Bible ni capítulos" se dispara: pone status a `idle`, llama a `generateNovel(project)` desde cero, y todo el progreso de 20-30 min se pierde. **Implementación** (`server/orchestrator.ts` al inicio de `_resumeNovel`, antes del `updateProject({status:"generating"})`): nuevo guard que llama a `storage.getActivityLogsByProject(project.id, 5)` y, si el log más reciente tiene menos de 120s de antigüedad, asume que hay otro orquestador vivo trabajando sobre este proyecto (el orquestador emite logs constantes desde agentes/auditores) y aborta la reanudación con `return`. Loguea con `level: "warning"` un mensaje "[Fix103] Reanudación ignorada: hay actividad muy reciente (hace Ns). Se conserva el progreso en curso." + metadata `{ fix: "Fix103", ageMs, lastLogLevel }`. **Trade-off explícito**: si un orquestador realmente está muerto pero acaba de emitir un log hace <120s (caso raro, p.ej. crash justo después de loguear), el guard difiere la reanudación legítima por hasta 2 min. Cuando el siguiente intento llega después de 120s sin nuevos logs, el guard permite el reset. 120s es ventana segura porque el orquestador en marcha emite logs cada pocos segundos durante audits y cada 10-60s durante Phase 1/2 del Arquitecto. **Universal**: independiente del estado del proyecto, género, etc. Sin emojis.

- **[Fix102] Mapa de salud por dimensión inyectado al Arquitecto en cada retry estructural (PRESERVE/FIX explícito)**: Tras Fix101, el usuario reportó nuevos logs donde iter 1 dio 4.4/10 (Dosificación:1, Arco secreto:2, Escalada acto 2:4, Deus ex machina:1) y iter 2 cayó a 3/10 con desglose Dosificación:0✓, Escalada acto 2:2✓, Deus ex machina:0✓, **Arco secreto:8❌** — el Arquitecto **corrigió 3 de 4 dimensiones marcadas pero rompió una dimensión que estaba en zona aceptable** (arco secreto pasó de 2 a 8 problemas). Diagnóstico: el histórico de Fix101 listaba el top-10 de problemas y decía abstractamente "no rompas lo que funcionaba", pero no le decía al Arquitecto **qué dimensiones específicas estaban OK** ni le ordenaba preservarlas. El Arquitecto trataba `arco_secreto` como "tierra libre" para rediseñar porque ni siquiera aparecía con prioridad en `instrucciones_revision`. Causa estructural adicional: el Arquitecto reconstruye Fase 1+2 desde cero en cada retry — no edita en sitio. **Implementación** (`server/orchestrator.ts` solo en el bucle del Auditor Estructural Fix92): antes de construir el histórico de retry, se cuenta `sa.problemas` por `area` (campo ya existente en `StructuralAuditProblem` con 8 valores: forma_escena, ledger_info, dosificacion_revelacion, arco_secreto, falso_aliado, escalada_acto2, deus_ex_machina, trauma_protagonista). Cada dimensión se clasifica: **≤1 problema = ACEPTABLE (OK)**, **≥2 = KO**. Se construye un mapa textual con dos secciones explícitas: "**DIMENSIONES YA ACEPTABLES — NO LAS MODIFIQUES**" (lista con conteo) y "**DIMENSIONES QUE DEBES CORREGIR — CONCENTRA TU REDISEÑO AQUÍ**" (lista con objetivo: `→ REDUCIR A 0` si count<4, `→ REDUCIR A ≤1` si count≥4). El bloque añade además una "REGLA CRÍTICA (Fix102)" con la advertencia explícita: *"si rompes una dimensión OK en este rediseño, FALLARÁS la auditoría aunque corrijas las demás — el auditor cuenta problemas por dimensión de forma independiente, empeorar una dimensión OK borra el progreso en las KO"*. Mapa de etiquetas humanas (`dimensionLabels`) para que el Arquitecto entienda cada `area` por nombre legible. El histórico de Fix101 (top-10 de problemas) se mantiene COMO COMPLEMENTO al mapa de Fix102 — el mapa es el contrato de alto nivel ("estas no, estas sí"), el top-10 es el detalle ("estas son las violaciones concretas"). **Scope**: solo Auditor Estructural (es el único con 8 dimensiones deterministas claras); Integridad y Beta son holísticos del LLM y no tienen ese desglose granular. **Backwards-compat**: ningún cambio en `scene-shape-auditor.ts` (el campo `area` ya estaba); ningún cambio de schema del Arquitecto; solo composición del feedback string. Sin emojis.

- **[Fix101] 3 iteraciones + histórico anti-regresión + visibilidad en los 3 bucles de auditoría del Arquitecto (Integridad/Estructural/Beta)**: Queja del usuario: "Auditor Estructural pasó de 6.5/10 → 5.1/10 tras retry — empeoró y siguió adelante" + "debería repetir hasta que aprobara con buena nota". Diagnóstico: los 3 bucles (`MAX_PI_ITERATIONS=2`, `MAX_SA_ITERATIONS=2`, `MAX_BETA_ITERATIONS=2` en `server/orchestrator.ts`) hacían 1 audit + 1 reintento como máximo. Aunque mantenían un "best seen tracker" y restauraban el mejor outline al final del bucle, esa restauración solo se loguea por `console.log` (invisible en activity log del usuario). Además, el Arquitecto en cada retry recibía solo `instrucciones_revision` del auditor SIN saber qué score sacó antes ni qué problemas tenía — retry ciego al historial, fuente de la oscilación 6.5 → 5.1 (corrige una cosa, rompe dos). **Implementación**: **(A)** Subido `MAX_*_ITERATIONS` de 2 a 3 en los tres bucles (1 audit inicial + 2 reintentos). Coste worst-case sube de ~24 min a ~36 min de Fase 1+2 SOLO cuando el auditor sigue rechazando; casos `apto` salen al primer audit sin coste extra. **(B)** Nuevo **bloque de histórico anti-regresión** prepended al campo de feedback existente (`plotIntegrityFeedback` / `structuralAuditFeedback` / `betaReaderFeedback`) antes de pasarlo al Arquitecto: contiene el score anterior, el top-10 de problemas detectados (con severidad y descripción) y una "REGLA CRÍTICA" que ordena al Arquitecto conservar las decisiones que NO estaban marcadas como problemáticas, modificar solo lo que el feedback nuevo indica, y perseguir progreso monotónico (no rediseñar desde cero). El schema del Arquitecto NO cambia — el histórico se concatena al string existente, manteniendo backwards-compat total. **(C)** 3 nuevos `createActivityLog` por bucle (visibles para el usuario): (1) `level: "warn"` cuando `puntuacion_global < bestSeen.score` ("[Fix101] El reintento del Arquitecto empeoró la valoración: X/10 < Y/10 anterior"), (2) `level: "info"` cuando se restaura el mejor visto al final del bucle ("[Fix101] Se restaura la mejor escaleta vista por el Auditor X (Y/10) sobre la última (Z/10)"), (3) `level: "warn"` cuando se agotan las iteraciones sin pasar umbral ("[Fix101] Auditor X agotó N iteraciones sin alcanzar el umbral M/10. Mejor score logrado: B/10. Se continúa con la mejor escaleta vista"). Cada log incluye `metadata` con `thisScore/bestScore/iteration` o `bestScore/lastScore` para análisis posterior. **(D)** `bestSA/bestPlotIntegrity` ahora guardan también `problemsSummary` (top-10 problemas formateados) para reutilizarlo en el histórico del siguiente retry. **(E)** Bug pre-existente arreglado en la restauración del bucle Beta: usaba `bestBetaResult?.puntuacion_global` como "score actual" para comparar contra `bestBetaScore`, pero `bestBetaResult` solo se actualiza cuando el score mejora, por lo que `bestBetaResult.puntuacion_global === bestBetaScore` siempre y la condición `bestBetaScore > currentBetaScore` nunca se cumplía → la restauración del Beta **nunca disparaba** tras una regresión. Añadida variable `lastBetaScore` que se asigna en cada iter (independiente del best) y la comparación pasa a `bestBetaScore > lastBetaScore`. Detectado por code-review architect. **Universal**: aplica a todos los géneros/idiomas/longitudes; los criterios de los 3 auditores ya eran semánticos. **Backwards-compat**: ningún cambio de schema; los runs en curso terminan con la lógica anterior; los runs nuevos heredan Fix101 automáticamente. Sin emojis nuevos (los emojis 🧩/📖/✅ ya existían en mensajes pre-existentes).



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