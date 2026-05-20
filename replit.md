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

- **[Fix96] Calibración del auditor `arco_secreto` (Fix93) para reducir falsos positivos por tokenización demasiado estricta**: Petición del usuario tras ver el log "Score 1/10 (reescribir). 5 altos, 7 medios. Arco secreto: 9 problemas". Diagnóstico: la función `auditArcoSecreto` en `server/agents/scene-shape-auditor.ts` exigía (a) tokens de longitud ≥5 chars en el `hecho_revelado`, excluyendo palabras narrativamente críticas y cortas como "topo" (4), "robo" (4), "arma" (4), "caso" (4), "dato" (4), "amor" (4), "odio" (4), "celos" (5 pero plural "celo"=4); (b) ≥2 hits de token por cap anterior para considerar siembra válida, lo que ignoraba la siembra alusiva real (un solo token distintivo por cap, p.ej. solo el nombre del personaje + una pista vaga); (c) severidad "alta" automática para toda revelación de dificultad "alto" con siembra insuficiente, lo que con el formula `10 - 2*altas - 0.7*medias` disparaba scores a 1/10 incluso cuando el Arquitecto SÍ declaraba `setup_capitulos` correctamente pero el vocabulario textual no coincidía verbatim. Implementación: **(1) Token length ≥4 chars** (`extractSiembraTokens` L557-562): bajamos de 5 a 4 para capturar palabras críticas cortas; las stopwords ya filtran ruido. **(2) Hits ≥1 por cap** (auditArcoSecreto L618-626): un solo token distintivo es suficiente para contar como siembra — refleja cómo se siembra realmente un secreto en prosa (alusión, no repetición literal). **(3) Confianza en `setup_capitulos`** (L634-647): si el Arquitecto declaró ≥`minSiembra` caps en `setup_capitulos` y al menos 1 de ellos tiene hit textual real (prueba de que no es array decorativo), confiamos en la declaración y contamos todos los declarados como sembrados. El check `setup_capitulos_decorativo` existente sigue avisando como severidad media de los caps declarados sin hit, así que la información no se pierde. **(4) Severidad "alta" reservada para vacío total** (L673-681): solo si `siembraCount === 0 && declarados.length === 0` (ni siembra textual ni declaración) la severidad sigue siendo "alta" para dificultad "alto"; en cualquier otro caso baja a "media". El razonamiento: el penalizador -2 por "alta" debe estar reservado a hechos REALMENTE sin construcción de suspense, no a discrepancias de vocabulario entre `hecho_revelado` y la prosa de siembra. **Backwards-compat**: el tipo de problema y `area` siguen siendo `siembra_textual_insuficiente_alto/medio` y `arco_secreto`. **Smoke test**: escaleta de 20 caps con revelación "Cifuentes es el topo que filtraba información a la mafia rusa" sembrada con un solo token ("topo") en caps 5, 8 y 12 y `setup_capitulos: [5, 8, 12]` declarado, pasa con score 10/10 apto (antes daba 1/10 reescribir por hits<2 y token "topo" filtrado). Sin emojis.

- **[Fix95] Generalización universal de Fix92/Fix93/Fix94 a cualquier género literario (thriller, romance, fantasía, histórica, literaria, ciencia ficción, drama familiar, aventura)**: Petición del usuario: los auditores estructurales del Arquitecto se diseñaron pensando en thriller/policíaco ("Cifuentes era el topo", "Zubiri va y vuelve sin novedad") y aunque las reglas son genéricas, los catálogos de `FORMA_ESCENA_VALORES`, `CATEGORIA_INFO_VALORES` y los patrones de detección de "falso aliado" tenían sesgo de género: no cubrían explícitamente el amante manipulador del romance, el mentor que sirve a la oscuridad de la fantasía, ni el padre biológico oculto del drama familiar. Implementación en `server/agents/scene-shape-auditor.ts`: **(1) Catálogo FORMA_ESCENA extendido** de 8 a 14 valores añadiendo `escena_romantica` (romance/drama), `recuerdo_flashback` (literaria/familiar), `ceremonia_ritual` (fantasía/histórica), `dialogo_filosofico` (literaria), `humor_alivio` (cualquier género), `montaje_temporal` (universal). **(2) Catálogo CATEGORIA_INFO_NUEVA extendido** de 10 a 17 valores añadiendo `confesion_emocional`, `regla_del_mundo` (fantasía/sci-fi), `profecia_o_simbolo`, `memoria_revelada`, `declaracion_amorosa`, `ruptura_relacional`, `transformacion_personal`. **(3) TRAITOR_ROLE_PATTERNS multiplicado por 5** con bloques etiquetados: thriller (existente), genérico universal (identidad_oculta, doble_identidad, pasado_oculto, secreto_familiar, mascara, antagonista_enmascarado), romance (amante_secreto, pretendiente_falso, rival_oculto), fantasía (mentor_falso, falso_elegido, villano_enmascarado, profeta_falso), drama familiar (hijo_secreto, padre_biologico_oculto, heredero_oculto). **(4) REVEAL_PATTERN_TEMPLATES** ampliado de 9 a 22 regex en cinco bloques: thriller, identidad oculta universal ("no es quien dice ser", "oculta su verdadera identidad", "miente sobre", "se descubre que"), romance ("nunca la amó", "fingía amor", "sigue casado con", "tiene otra familia"), fantasía ("es el verdadero villano", "sirve a la oscuridad", "rompe el juramento"), drama familiar ("es la verdadera madre/padre/hija", "padre biológico"). **(5) HECHO_REVEAL_KEYWORDS** ampliado de 22 a ~50 keywords con los mismos cinco bloques. **(6) Regla B de Fix94** (humanización previa) ampliada para aceptar formas adicionales `escena_romantica` y `recuerdo_flashback`, y categorías adicionales `confesion_emocional` y `memoria_revelada` — la "escena cálida con el personaje antes de que caiga la máscara" ya no requiere ser solo introspección de thriller. **(7) Texto de descripción y sugerencia** de Fix94 reescrito como genre-neutral con ejemplos explícitos por género (thriller foto/llamada, romance ternura/confesión, fantasía recuerdo de inocencia, drama flashback cálido). Implementación paralela en `server/agents/architect.ts`: **(8) REGLA F del prompt** extendida con los 14 valores agrupados por género (Núcleo / Romance / Literaria / Fantasía / Filosófica / Comedia / Universal) y nota explícita "la regla es universal: variedad sensorial obligatoria" con ejemplos por género. **(9) REGLA L del prompt** extendida con los 17 valores agrupados igual. **(10) REGLA T del prompt** reescrita completa con título "PERSONAJE DE DOBLE CARA — UNIVERSAL para cualquier género" enumerando explícitamente los 5 bloques de roles que activan la auditoría y ejemplos de reveal temprano para thriller/romance/fantasía. **(11) Ejemplo JSON** de salida del Arquitecto actualizado con los 14 valores en `forma_dominante` y los 17 en `categoria_info_nueva`. **(12) Auto-chequeo pasos 8, 10 y 13** extendidos con la guía genre-aware. **Backwards-compat**: el área del problema sigue siendo `"falso_aliado"` (string interno, no se renombra a "doble_cara") para no romper datos de proyectos ya generados; el `plotOutlineSchema` sigue siendo `passthrough()` así que escaletas viejas sin los campos nuevos siguen funcionando. **Smoke test**: tres fixtures (romance con amante secreto Lucas, fantasía con mentor falso Eldrin, drama familiar con padre biológico Alberto) pasan la auditoría con score 10/10 y veredicto "apto" — confirma que las reglas detectan correctamente la humanización previa en formas no-thriller. Sin emojis.

- **[Fix94] Falso aliado: reveal tardío (≥60% novela) + escena de humanización previa obligatoria**: Petición del usuario: el Beta reportaba que los traidores/topos (Cifuentes en "El eco del asfalto") se revelaban demasiado pronto o sin que el lector hubiera empatizado antes con el personaje, restando impacto al giro. Implementación en `server/agents/scene-shape-auditor.ts`: nueva función `auditFalsoAliado` que (1) lee `world_bible.personajes` y selecciona los que tienen rol que contiene topo / traidor / falso_aliado / antagonista_oculto / complice_oculto / infiltrado / doble_agente / mole; (2) detecta el cap de revelación buscando vecindad (≤40 chars) entre tokens del nombre del personaje y un REVEAL_KEYWORD específico (lista endurecida: "traici", "es el topo", "topo de", "infiltrado", "doble agente", "trabaja para", "vendido a", "comprado por", "encubre a", "filtra a", "es complice"; deliberadamente excluimos genéricos del thriller como "conspir" o "complic" sueltos porque producen falsos positivos), y como refuerzo escanea `revelaciones_dosificadas` cuando hecho_revelado contiene nombre + reveal keyword; (3) regla A "reveal_temprano" severidad alta si `revealCap < 0.6 * total`; (4) regla B "sin_humanizacion_previa" severidad media si ningún cap previo tiene `forma_dominante` ∈ {introspeccion, pivote_relacional} o `categoria_info_nueva` = "vinculo_emocional" donde el personaje aparezca en escena; (5) si no se detecta reveal en absoluto, severidad media "reveal_no_declarado" pidiendo cobertura explícita. Prompt del Arquitecto extendido (`server/agents/architect.ts`) con REGLA T y paso 13 del auto-chequeo describiendo ambos criterios literalmente. Catálogo de coverage añade `falso_aliado_pct`. Sin emojis.


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