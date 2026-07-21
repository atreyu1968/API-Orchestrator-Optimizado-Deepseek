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

- **[Fix241] El retry enriquecido ya no se pierde cuando el auditor de World Bible falla técnicamente (+ techo de tokens del WBA)**: log real de la 2ª pasada (ya con v10.0.72, EL ARCHIVO DE LOS HOMBRES MUERTOS): [Fix240] funcionó (retry con 8 personajes/5 subtramas, sin degenerar), pero el WBA devolvió "respuesta vacía del LLM" en la iter 2 y, pese a que el log prometía "se reutilizará sin auditar", el código (`if (phase1LookValid && !bestWBA)`) descartaba la Fase 1 nueva porque ya existía bestWBA — se reusó la vieja de 6 personajes (5/10). **Dos arreglos**: (1) `orchestrator.ts` — rama nueva: si la Fase 1 del retry es válida y NO pierde material (personajes ≥ y subtramas ≥ que la mejor), SUSTITUYE el `phase1Json` de bestWBA (conserva su score; es la misma base + el enriquecimiento pedido), con activity log `[Fix241]`; el mensaje de fallo del WBA ahora distingue "se reutilizará" vs "sustituirá si no pierde material". (2) `world-bible-auditor.ts` — `maxOutputTokens` 10240→20480: el techo es COMBINADO razonamiento+contenido (thinkingBudget 8192 dejaba ~2K para el JSON), causa probable de la respuesta vacía con Fases 1 grandes. Footer `v10.0.72`→`v10.0.73`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix240] El bucle del Auditor de World Bible ya no degenera ni muere en silencio**: log real de la generación en curso (EL ARCHIVO DE LOS HOMBRES MUERTOS) — la iter 1 dio 6/10 (6 personajes, 5 arcos), la iter 2 regeneró una Fase 1 esquelética (4 personajes, 0 arcos → 2/10 "reescribir") y el bucle terminó en la iter 2/5 pese al presupuesto ampliado de [Fix238]. **Dos causas, tres capas**: (1) causa A — el retry regeneraba la Fase 1 DESDE CERO con solo el texto del feedback: input nuevo `previousPhase1Json` en `architect.ts` — el prompt de Fase 1 en retries incluye la MEJOR Fase 1 previa como "BASE DE ENRIQUECIMIENTO OBLIGATORIA" (prohibido devolver menos personajes/subtramas/giros; solo añadir, profundizar o corregir); el orquestador la pasa con `wbaIter>0 && bestWBA`. (2) Guardia DETERMINISTA de degeneración en el bucle: si la Fase 1 regenerada tiene menos personajes o subtramas que la mejor vista, se descarta SIN gastar auditoría (ahorra la llamada al WBA), warning en activity log, refuerzo del feedback y `continue`. (3) causa B — un veredicto no-apto sin `feedback_para_arquitecto` rompía el bucle en silencio ("reescribir" 2/10 sin feedback → fin en iter 2/5): ahora se sintetiza feedback desde los problemas alta/media + resumen del propio auditor; solo se rompe si tampoco hay problemas accionables. Footer `v10.0.71`→`v10.0.72`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix239] Las quejas RECURRENTES de los informes (hilos sueltos, heridas que desaparecen, motivación por carta, muletillas de imagen) ganan defensa propia**: el usuario aportó los informes Holístico+Beta de la novela nueva y señaló que las quejas se repiten entre novelas. Mapeo: acto 2 repetitivo ya cubierto (Fix200/223/232/238); lo que NO tenía guardia se ataca en 3 capas. **(1) Arquitecto (`architect.ts`)**: regla dura 7 "REGLA DE PAGO (Chéjov inverso)" — todo objeto/documento/herida con peso dramático declara DESTINO en la escaleta (pago o cierre explícito en página; caso real: pasaporte falso nunca usado, sobre lacrado sin resolver); heridas con TRAYECTORIA continua (limitan la acción hasta curación/estabilización declarada; caso real: herida en la nuca desaparece caps 10-21); regla dura 8 "MOTIVACIÓN DE ANTAGONISTAS ESCENIFICADA" — prohibido que la motivación del villano/topo llegue SOLO por documento (caso real: Ochoa revelado por nota, nunca escenificado), y el antagonista principal proyecta sombra sobre el acto 2 (caso real: Arredondo aparece en el cap 24 de 35); self-check nuevo ítem 25 verifica las tres. **(2) Ghostwriter**: regla B1 anti-imagen-firma repetida ENTRE capítulos (máx 2 usos por libro de una imagen atmosférica o tic fisiológico; casos reales: "la luz del candil temblaba" ×9 caps, "manos temblorosas" ×15) + regla 4 de continuidad física "HERIDAS ACTIVAS" (una herida sin curar limita la acción en CADA cap hasta cierre declarado). **(3) Detector DETERMINISTA `detectCrossChapterCatchphrases`** (`server/utils/cross-chapter-catchphrases.ts`) — n-gramas (4-6 palabras, ≥2 de contenido, sin acentos) que aparecen en 4+ capítulos DISTINTOS, dedupe por solape de secuencia; cableado en el pase ortotipográfico del orquestador: se calcula UNA vez sobre el manuscrito completo y cada capítulo recibe SOLO las muletillas que le afectan como instrucción de variación al Corrector (los correctores por-capítulo no pueden ver repetición inter-capítulo); best-effort + log resumen. Probado con tsx (5 casos PASS, incluidos negativos de umbral y stopwords). Footer `v10.0.70`→`v10.0.71`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix238] La novela ya no puede nacer corta de material narrativo (puerta dura de densidad)**: caso real (EL ARCHIVO DE LOS HOMBRES MUERTOS, 35 caps) — el WB Auditor escribió "la densidad de secretos toca el límite inferior" y aun así dio apto 7/10; además, si tras las iteraciones no había apto, el orquestador "reusaba la mejor Fase 1" sin más; resultado: acto 2 estancado (caps 10-16 repitiendo refugio/pasividad) que los lectores solo supieron arreglar borrando capítulos. **Arreglo en 5 capas**: (1) prompt Fase 1 del Arquitecto (`architect.ts`) — PRESUPUESTO DE MATERIAL obligatorio escalado a N: secretos ≥ ceil(N/3), palancas del antagonista 4 si N≥30 (3 si no), reversales ≥3, subtramas 3/4/5 según N, giros ≥ ceil(N/4) con setup real, con autocomprobación por conteo; (2) prompt del WBA (`world-bible-auditor.ts`) — PROHIBIDO el "apto al límite": densidad justa = severidad ALTA + necesita_revision con feedback de qué unidades añadir; (3) validador DETERMINISTA `enforceDensityFloors` (exportado en `agents/index.ts`) — cuenta subtramas y giros (campos estructurados) y DEGRADA un apto del LLM si no llegan al suelo (probado: 4 casos); secretos/palancas son texto libre y quedan al juicio del LLM; (4) orquestador — si se reusa una Fase 1 no-apta, los problemas residuales + feedback del WBA se inyectan como instrucción dura en architectInstructions para la Fase 2 (`wbaResidualFeedbackForPhase2`); la rama fallback_classic también inyecta el feedback al regenerar desde cero (antes ninguna de las dos pasaba nada); (5) presupuesto ampliado `MAX_WBA_ITERATIONS` 3→5 (iteraciones baratas: solo Fase 1 + audit, sin escaleta) — petición del usuario: mejor gastar en fortificación que dejar nacer una novela muerta. Footer `v10.0.69`→`v10.0.70`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix237] Las tarjetas admin encadenadas ya no fusionan/borran capítulos EQUIVOCADOS tras una renumeración**: bug real que descartó una novela — el usuario ejecutó delete cap 10 y después las fusiones archivadas "15 absorbe 10" y "11 absorbe 12"; las tarjetas apuntan por NÚMERO y tras el primer borrado+renumeración las siguientes operaron sobre capítulos equivocados (fusionó los antiguos 11 y 13-14). **Arreglo**: helper `remapPendingAdminActionsForRenumber` en `server/utils/renumber-chapters.ts` — remapea `targetChapter`/`secondaryChapter`/`sourceChapters` tras borrados (o inserción con `insertedAfter`), INVALIDA las acciones que referencian un cap borrado (dropped, con aviso en el activity log pidiendo nota editorial nueva si la intención sigue), conserva los especiales 0/-1/-2, borra `targetLabel` obsoleto y anota `[Fix237]` en el reason. Cableado en TODOS los puntos que renumeran/desplazan con tarjetas vivas: `routes.ts` execute (rama fusión archivada, rama delete, transacción split), `routes.ts` insert-chapter de la Cura (desplaza +1), y `orchestrator.ts` `applyConfirmedAdminActions` (recolecta los borrados del lote y remapea la lista final tras el merge anti-TOCTOU, con logs de dropped/changed). Probado con tsx: 5 casos del helper PASS (incluido el caso real). Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix236] Las sugerencias admin archivadas por el pulido ya no desaparecen: quedan en la tarjeta del manuscrito**: el usuario reportó que las acciones "ARCHIVADAS COMO SUGERENCIA" ([Fix207], 3 rondas sin acuerdo) no aparecían en ningún sitio de la UI — se borraban de `pendingAdminActions` dejando solo una línea de log; lo mismo pasaba en [Fix185] (delete/merge aprobados por UNANIMIDAD que el pulido no ejecuta por ser cirugía irreversible). **Arreglo** en `orchestrator.ts` (`applyConfirmedAdminActions`): ambas ramas conservan la acción con `source:"archived-suggestion"` + `archived:true` + `archiveReason` — así el GET del flujo manual la expone (el filtro [Fix178] solo oculta `auto-review-loop`) y `discardLeftoverAutoLoopAdminActions` no la borra al cerrar el bucle; skip al inicio del bucle (las archivadas no se reevalúan) y filtro `archived` en lo que se pasa a Holístico/Beta. Bloqueante del architect corregido: el merge anti-TOCTOU final propagaba solo `evalRounds` y perdía las mutaciones de archivado — ahora propaga el superviviente COMPLETO por id. En `routes.ts` (POST execute): las fusiones archivadas NO tienen la prosa pre-integrada (el bucle integra al ejecutar), rama nueva que integra el contenido de TODAS las fuentes (`sourceChapters` o `secondaryChapter`) al destino con separador de escena, borra fuentes y renumera. UI (`manuscript.tsx`): badge "Sugerencia del pulido" + motivo del archivado en la tarjeta ámbar. Footer `v10.0.68`→`v10.0.69`. Sin migración. tsc PASS + smoke PASS + architect PASS (2ª ronda).

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
