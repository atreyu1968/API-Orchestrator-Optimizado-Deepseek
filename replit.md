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

- **[Fix215] Ejecutor automático para "Dividir capítulo"**: el usuario señaló que la tarjeta de acción admin `split_chapter` no tenía sentido — solo mostraba el aviso y la papelera, sin botón Ejecutar (solo Fusionar/Eliminar lo tenían desde [Fix100]). **Implementación**: `server/utils/split-chapter-anchor.ts` extrae las citas entrecomilladas del `reason` de la acción (el traductor estructural siempre incluye el texto ancla, p.ej. "dividir justo antes de 'La luz del atardecer...'") y localiza el punto de corte con anclaje tolerante de 2 niveles ([Fix212]): literal único, o normalizado único (tildes/comillas/guiones/espacios) con mapa de índices al texto real. La rama `split_chapter` del endpoint execute corre TODA la mutación en una transacción con `FOR UPDATE` sobre la fila del proyecto (guard de concurrencia: petición duplicada → 409; fallo a mitad → rollback completo, exigencia del architect): renumera +1 los caps posteriores (UPDATE masivo), deja la 1ª parte en el cap original, crea cap nuevo `N+1` con la 2ª parte (título "(continuación)") y consume la acción. Ambas partes deben tener ≥200 chars o no toca nada. Frontend: botón Ejecutar habilitado para dividir, confirm específico y texto del panel actualizado. Footer `v10.0.46`→`v10.0.47`. Sin migración. tsc PASS + smoke PASS.

- **[Fix214] La Cura de Serie funcionaba en Replit pero fallaba con 401 en instalaciones Ubuntu con contraseña**: el runner de la cura (`series-cure.ts`) invoca sus propios endpoints via `selfFetch` (loopback HTTP) SIN sesion; con `LITAGENTS_PASSWORD` activo (auth solo fuera de Replit), `authMiddleware` devolvia 401 ("HTTP 401 en /api/series/N/verify-project: No autorizado") y la cura moria en el primer paso. **Arreglo**: token interno por proceso en `server/auth.ts` (`INTERNAL_AUTH_TOKEN`, crypto random de 32 bytes generado al arrancar, nunca sale del proceso) + cabecera `x-litagents-internal`; `authMiddleware` la acepta como equivalente a sesion; `selfFetch` la envia. Sin cambios de BD. Footer `v10.0.45`→`v10.0.46`. tsc PASS + smoke PASS.

- **[Fix196–Fix213] Tanda de 16 mejoras aplicadas tras terminar la cura de la serie 27** (detalle por fix en `.local/tasks` de la sesion; lo esencial): **[Fix196]** aplicar notas editoriales con pulido activo devuelve 409 + boton "Detener pulido" en el dashboard. **[Fix197]** canon historico-factual verificable: las guias (idea/seudonimo/serie) generan una subseccion de datos canonicos INVIOLABLES que viaja guia → `world_bible.canon_historico` (Arquitecto) → ghostwriter (bloque "CANON HISTORICO INVIOLABLE") → lectores Beta/Holistico (senalan violaciones como hallazgos corregibles). **[Fix198]** `server/utils/prose-markdown-cleaner.ts` + paso determinista en la cura: quita `**`/`__`/`*` de la prosa sin tocar separadores `***`. **[Fix199]** desenlace obligatorio para personajes EMERGENTES (nacidos durante la escritura): puerta determinista pre-recta-final (`buildEmergentClosureGuidance`) inyecta al ghostwriter el cierre en pagina; `registerEmergentFinalStates` persiste `estado_final` en la WB; red de seguridad en arc-validator (regla 10). **[Fix200]** variedad de esqueleto de capitulo en acto 2: regla 22 del Arquitecto (escenario+oposicion+tactica+coste, prohibido repetir combinacion en ventana ~3) + pregunta explicita en lecturas mid-novela (`focoEsqueletoCapitulo`). **[Fix201]** ritmo del acto 2: liston del gate de generacion sube a >=8 (`MIN_ACT2_SCORE`), y brazo de RITMO nuevo en el pulido (`runAct2PacingPolishArm`): si el Beta se queja de ritmo/meseta/tramo central, el Act2PacingEditor relee el tramo central (25–75%) y traduce la queja en directivas por capitulo ejecutadas via `rewriteChapterForQA` (tope 3 caps, one-shot por bucle, revert por bestSnapshot; si dispara en la ultima iteracion se concede una relectura-rescate — hallazgo del architect corregido). **[Fix203]** progresion del pulido visible en el panel de cura (polishProgress en cure-status + ticker frontend). **[Fix204]** pulido DIFERIDO a la Cura de Serie: columna nueva `projects.defer_polish_to_cure` (ALTER TABLE directo, sin drizzle-kit) — con el flag activo, al finalizar la novela NO se lanza el bucle advisory ni la ortotipografica (gate ANTES de marcar `autoPolishPending` → el auto-resume no lo reanuda); el paso polish de la cura lo lanza luego con `forcePolishResume` (que ignora el flag a proposito). Checkbox en config-panel + badge ambar "Pulido aplazado a la Cura" en dashboard + campo en PATCH allowedFields. **[Fix205]** cura resistente a reinicios (persistencia + auto-resume). **[Fix206]** purga de instrucciones fantasma ANTES del cirujano con log resumen unico. **[Fix207]** acciones admin indecisas (veredictos oscilantes tipo la fusion cap5/cap10 de la manana): contador `evalRounds` por accion; a la 3.ª ronda keep_pending se ARCHIVA como sugerencia (patron [Fix185]) y deja de reevaluarse; el contador se propaga en el merge final con la lista fresca de BD para persistir entre pasadas. **[Fix208]** Lector de Saga al final de la cura (lectura de la serie del tiron + veredicto de saga). **[Fix209]** revision de costuras entre volumenes (final tomo N vs arranque N+1). **[Fix210]** localizacion de hallazgos estructurales difusos (juez que los ancla a capitulos concretos → reescritura dirigida). **[Fix211]** lectura Holistico+Beta puntual para volumenes IMPORTADOS en la cura. **[Fix212]** anclaje tolerante de 2 niveles en la cirugia (normalizacion de tildes/comillas/espacios con coincidencia UNICA). **[Fix213]** la cura resuelve los issues documentados del Revisor Final antes del veredicto. Footer `v10.0.44`→`v10.0.45`. Una sola columna nueva (defer_polish_to_cure), sin migracion drizzle. tsc PASS + smoke PASS + architect PASS (3 fixes finales revisados; salvedad menor de metricas Fix207 anotada como no funcional).

- **[Fix202] Más géneros y tonos, y listas CENTRALIZADAS**: el usuario pidió ampliar géneros/tonos porque había seudónimos sin reflejo claro en proyectos y guías. **Implementación**: nuevo `client/src/lib/genre-options.ts` (fuente única: 31 géneros — añade romantasy, fantasía oscura/urbana, distopía, postapocalíptico, thriller psicológico/legal, espionaje, novela negra, policíaca, cozy mystery, romance histórico/paranormal, comedia romántica, gótica, contemporánea, saga familiar, realismo mágico, western, humor, juvenil — y 22 tonos — añade crudo, macabro, humorístico, irónico, melancólico, nostálgico, contemplativo, cálido, esperanzador, romántico, trepidante, inquietante, cínico, costumbrista). Antes las listas estaban DUPLICADAS en 4 archivos (config-panel, guides, reedit-series, book-catalog) con riesgo de divergencia; ahora config-panel/guides/reedit-series importan la lista central y book-catalog (valores legacy propios como `sci-fi`) se amplió alineado sin tocar sus valores existentes. Solo frontend (los agentes reciben el valor como texto libre) → se aplicó con la cura de la serie 27 ACTIVA sin riesgo (HMR, el server no se reinicia). Footer `v10.0.42`→`v10.0.43`. Sin migración. tsc PASS.

- **[Fix203-parcial] Actividad en vivo del pulido dentro del panel de cura (solo frontend)**: el usuario señaló que el detalle del pulido no se ve "en vivo" en el panel de cura (el paso "Pulido" dura horas y solo mostraba el spinner). **Implementación**: `PolishActivityTicker` en `client/src/components/series-cure-panel.tsx` — cuando el paso polish de un volumen nativo está `running`, muestra las 3 últimas entradas de los activity-logs del proyecto (endpoint GET ya existente `/api/projects/:id/activity-logs?limit=5`, polling 10s), con hora y agente. Solo cliente (HMR, no reinicia el server → aplicado con la cura de la serie 27 ACTIVA sin riesgo). La parte servidor del [Fix203] (progresión estructurada del pulido en el estado de la cura) sigue pendiente en la tanda. Footer `v10.0.43`→`v10.0.44`. Sin migración. tsc PASS.

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