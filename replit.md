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

- **[Fix156][Puerta Acto 2] Puerta SEMÁNTICA del ritmo del acto 2 a MITAD de novela: detecta y REESCRIBE el bajón del tramo central EN CUANTO se escribe, en vez de esperar al rescate final**: el usuario aprobó esta opción. **Diagnóstico**: las "lecturas adelantadas" mid-novela (`runMidNovelBetaPass`/`runMidNovelHolisticPass`) son **guía-only**: solo inyectan `editorialCritique` a capítulos FUTUROS, NO reescriben lo ya escrito; y la única reescritura de prosa del acto 2 (`runStructuralSecondHalfRescue`) corre **al final** y por keywords deterministas. Resultado: el bajón crónico del acto 2 (meseta, apuestas que no suben, avance sin coste) llegaba intacto al Revisor Holístico final, que lo veía tarde. **Arreglo**: nuevo agente `server/agents/act2-pacing-editor.ts` (`Act2PacingEditorAgent`, espejo en PROSA de las Puertas 4/5 pero ADELANTADO; `useThinking`+`thinkingBudget 8192`+`maxOutputTokens 16384` como Fix155). Lee la PROSA REAL del tramo central y juzga la SEMÁNTICA del ritmo (no tokens): `puntuacion_acto2`/`veredicto`/`escala_correctamente(bool)`/`resumen`/`capitulos_problematicos[{numero,tipo,severidad,descripcion,directiva_de_reescritura}]`; tipos `meseta_sin_escalada|apuesta_no_sube|avance_sin_coste|repeticion_estructural|tension_plana|subtrama_estancada`; saneamiento defensivo espejo Fix148. Exportado en `index.ts`. **Puerta AUTÓNOMA** `runAct2ProseGate` (`server/orchestrator.ts`): ventana = caps `completed` con número en `[25%, 75%]` del total planificado; apto si `score>=7` Y `escala_correctamente` Y sin crítica/alta; si no, reescribe cada cap flojo vía `rewriteChapterForQA(..., "editorial", directiva)` (Cirujano→Narrador; los problemas estructurales caen a reescritura completa automáticamente) con la filosofía Fix132 (escalada monótona + coste irreversible + anti deus ex machina + conserva canon); `MAX_PASSES=2` y tope `MAX_ACT2_REWRITES=4` (más ligero que la puerta final, porque corre a mitad de obra); auto-escala intensidad ante estancamiento; conserva la mejor versión; **fail-safe** revert-by-default (snapshot/restore: solo conserva la reescritura forzada si es apta o estrictamente mejor). **Enganche** en el bucle de `_generateNovel`, junto a las pasadas Beta/Holístico mid-novela: flag one-shot `act2GateAttempted` (reseteado al inicio de `_generateNovel`); dispara cuando `completedSoFar >= floor(total*0.75)` Y `remainingAfter>=1` (aún queda acto 3) Y `total>=8` Y `!aborted`. NO corre en `_resumeNovel` (las pasadas mid-novela tampoco). Todo best-effort en `try/catch`: jamás bloquea, NUNCA `awaiting_structural_guidance`. Footer `v10.0.2`→`v10.0.3`. Coste: ≤2 lecturas LLM del tramo central + ≤4 reescrituras acotadas, una sola vez por novela. Sin migración. tsc PASS.

- **[Fix155] CAUSA RAÍZ del `null` de las Puertas 4 y 5: el techo de salida (8192) lo agotaba el razonamiento, dejando el JSON vacío/cortado**: Fix154 hizo el log honesto; el usuario pidió ir a por la causa del `null`. **Diagnóstico**: ambos jueces son los que MÁS texto leen (Puerta 5 = novela completa; Puerta 4 = capítulos del clímax ~9k chars c/u) y tenían `useThinking: true` + `thinkingBudget: 8192` (activa `reasoning_effort: "max"`) pero `maxOutputTokens: 8192`. En DeepSeek V4 ese techo es COMPARTIDO entre razonamiento y contenido: con esfuerzo máximo sobre una entrada enorme, el modelo gastaba casi todo el presupuesto pensando y devolvía el JSON vacío (→ null "Error o respuesta vacia") o cortado a la mitad (`repairJson` sin score válido → null "JSON invalido"). Por eso afecta a P4/P5 y casi nunca a las demás (la Puerta 1 lee solo la escaleta; el Holístico ya usa 16384; el Forjador de Concepto lee poquísimo): P4/P5 combinan la MAYOR entrada con el MENOR techo de salida. **Arreglo** (`server/agents/prose-agency-editor.ts`, `server/agents/final-axis-reader.ts`): `maxOutputTokens` 8192→16384 en ambos (como el Revisor Holístico) para que quepan razonamiento Y veredicto. No cambia el juicio ni el comportamiento advisory; solo se factura lo realmente usado. Sin migración. tsc PASS. Footer `v10.0.1`→`v10.0.2`.

- **[Fix154] Puertas 4 (agencia de prosa) y 5 (lectura por ejes): log HONESTO cuando el juez no devuelve veredicto (fin del engañoso "mejor ?/10")**: el usuario aportó el log del run COMPLETO de "EL GRABADO DE LA LUNA NEGRA". **Lo bueno**: esta vez la novela terminó 100% autónoma — Revisor Final 9/10 y 10/10 ("calidad bestseller confirmada"), arcos 4/4 e hilos 3/3 cerrados — confirmando que Fix151 (advisory) + las puertas semánticas funcionan de extremo a extremo. **El defecto detectado**: tanto el Editor de Prosa de Agencia (Puerta 4, Fix148) como el Lector Final por Ejes (Puerta 5, Fix149) registraron `mejor ?/10`. **Causa**: en ambos bucles, si el juez (LLM) devuelve `null` en la PRIMERA pasada (respuesta vacía/timeout del modelo tras los reintentos internos de `generateContent`, o JSON sin score válido), el bucle hace `break` con `best === null`; el aviso final estaba hardcodeado a `no convergió a apta en ${MAX_PASSES} pasadas (mejor ${best?.score ?? "?"}/10)`, sugiriendo falsamente que la puerta corrió 3 pasadas cuando en realidad NO emitió ningún veredicto y se omitió. **Arreglo** (`server/orchestrator.ts`, solo OBSERVABILIDAD): ambas puertas ramifican el mensaje final en `best === null` → texto honesto ("no devolvió un veredicto usable... la puerta se OMITE este run sin bloquear ni modificar la prosa/novela; la calidad ya quedó cubierta por la Puerta 1 / Revisor Final / Holístico / verificador de arcos"); el camino con `best` real conserva el mensaje numérico correcto. **No cambia comportamiento**: ambas siguen advisory/best-effort (nunca bloquean). Coste 0 LLM. Sin migración. tsc PASS. Footer `v10.0.0`→`v10.0.1`.

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