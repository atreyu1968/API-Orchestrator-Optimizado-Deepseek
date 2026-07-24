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

- **[Fix258] Corrección individual por ficha en el verificador de datos**: petición del usuario ("permitir modificar una a una las fichas de datos dudosos mediante un botón independiente"). **`client/src/components/chapter-viewer.tsx`**: cada ficha `incorrecto`/`dudoso` con sugerencia gana su propio botón "Corregir esta ficha" (con `window.confirm` que muestra dato y corrección; el cambio se guarda directo); reutiliza el endpoint `fact-check/apply` de Fix255 enviando `findings: [f]` (el backend ya aceptaba lista arbitraria — sin cambios de servidor). Al corregir, se retira SOLO esa ficha de la caché del diálogo por IDENTIDAD (no por índice, evita retirar la equivocada si el resultado se reemplaza; las demás siguen disponibles sin re-verificar) y se invalida la query de capítulos; spinner por ficha (`applyingFindingIdx`) y TODOS los botones del diálogo (masivo, re-verificar y por-ficha) deshabilitados mientras hay cualquier corrección en curso (objeciones del architect aplicadas). El botón masivo "Corregir errores automáticamente" sigue igual. Footer `v10.0.91`→`v10.0.92`. Sin migración. tsc PASS + smoke PASS.

- **[Fix257] El Documentalista: investigación previa de la ambientación real antes de escribir**: petición del usuario (errores flagrantes históricos/geográficos al escribir; "debe investigar sobre la situación histórica, socioeconómica, geográfica, etnográfica, etc"). **`server/orchestrator.ts`**: nuevo agente Documentalista (`ensureResearchDossier`) — UNA llamada IA por proyecto (DeepSeek v4-flash thinking disabled temp 0.2, `recordRawAiUsage` agente "documentalist") que genera un dossier factual de la ambientación: contexto histórico, situación socioeconómica (moneda/precios), geografía (distancias/tiempos de viaje de la época), etnografía/cultura, vida cotidiana y errores/anacronismos típicos a evitar; decide él mismo si APLICA (mundo real ⇒ sí; fantasía de mundo secundario ⇒ `aplica=false`, persistido para no re-pagar). Se persiste como worldRule `__research_dossier` y se inyecta como `_dossier_documental` en `getEnrichedWorldBible` (ambas ramas), por lo que llega al Narrador en TODOS los caminos de escritura (generación, resume, regeneración) sin tocar los ~7 call sites; cache de promesa por proyecto evita dobles llamadas; fallo ⇒ reintento en el siguiente capítulo, nunca bloquea. **`server/agents/ghostwriter.ts`**: sección "DOSSIER DOCUMENTAL" en el prompt con reglas de uso (datos reales tal cual; dato no cubierto ⇒ vaguedad verosímil, NUNCA precisión inventada; nada posterior a la época); sin dossier, regla general de RIGOR FACTUAL igualmente activa. Probado en vivo (proyecto 247, 44 s): dossier de 64 datos (Danakil/Etiopía-Eritrea) persistido; segunda llamada 0 s desde BD. Footer `v10.0.90`→`v10.0.91`. Sin migración. tsc PASS + smoke PASS.

- **[Fix256] El verificador de datos también comprueba la lógica y la coherencia con los capítulos anteriores**: petición del usuario ("se deben comprobar los datos para que resulten lógicos y concuerden con los capítulos anteriores"). **`server/routes.ts`** (endpoint fact-check de Fix252): (1) inyecta como contexto los capítulos ANTERIORES en orden narrativo (Prólogo 0 → 1..N → Epílogo -1 → Nota -2, vía `narrativeIndex`), prosa pre-marker, presupuesto 400k chars conservando ENTEROS los más recientes (pesan más para continuidad) y descartando los más antiguos con aviso de omitidos en el prompt. (2) Prompt ampliado con la sección (B): CONTINUIDAD (contradicciones con lo establecido — edades, fechas internas, distancias/tiempos de viaje, nombres ficticios que varían, objetos destruidos que reaparecen, heridas que desaparecen) y LÓGICA interna (cronología imposible, personajes en dos sitios, causas tras efectos); regla de prudencia: posible retcon/revelación deliberada ⇒ "dudoso"; nuevas categorías `continuidad|logica`; en continuidad la explicación cita el capítulo que establece el dato. El botón "Corregir errores automáticamente" (Fix255) sirve igual para estos hallazgos (filtra por veredicto, no por categoría). Probado en vivo (Epílogo del proyecto de prueba, 25 caps previos ~330k chars, 16 s): detectó una contradicción de continuidad REAL (la muerte de Whitaker contradice capítulos previos) además de errores de mundo real. Footer `v10.0.89`→`v10.0.90`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix255] El verificador de datos gana scroll y corrección automática con un botón**: petición del usuario. **UI** (`chapter-viewer.tsx`): el diálogo de resultados usaba `ScrollArea` con `flex-1 min-h-0` dentro de un `DialogContent` en columna y NO scrolleaba (ScrollArea de Radix no recibe altura acotada ahí); reemplazado por `div` con `overflow-y-auto` — ahora todas las fichas son alcanzables. Botón "Corregir errores automáticamente" en el footer (solo si hay hallazgos `incorrecto`/`dudoso` con sugerencia), con `window.confirm` previo (objeción del architect: el cambio se guarda directo), invalidación de la query de capítulos y descarte de la caché del fact-check al aplicar. **Backend** (`server/routes.ts`): `POST /api/projects/:id/chapters/:chapterId/fact-check/apply` — 404 cap ajeno, 409 si `writing`/`editing` (no pisar agentes), filtra hallazgos corregibles (máx. 20, campos truncados), 413 si la prosa >60k chars (el output se truncaría), prompt de corrector QUIRÚRGICO (aplicar SOLO las correcciones listadas, conservar todo lo demás; ignorar datos que no aparezcan), DeepSeek v4-flash thinking disabled temp 0.3 max_tokens 32768, `recordRawAiUsage` agente "fact-corrector", defensa anti-fences, guarda anti-truncado (corregido <70% del original ⇒ 502 SIN guardar), preserva `---CONTINUITY_STATE---` y recalcula `wordCount` (reglas Fix250). Probado en vivo: 400/404, y corrección real quirúrgica (solo cambió la palabra pedida, 1 char de diff total; restaurada después). Footer `v10.0.88`→`v10.0.89`. Sin migración. tsc PASS + smoke PASS + architect PASS.

- **[Fix254] El bucle del Auditor Estructural deja de quemar horas persiguiendo el falso negativo crónico de "falso aliado"**: pregunta del usuario ("¿esto es viable?") + log real (EL ARCHIVO DE LOS HOMBRES MUERTOS, 23/7 22:01-24/7 00:03): 13 regeneraciones de Fase 2 (~2 h) con `aliado=0%` en TODAS las iteraciones, WBA on-demand dictaminando "WB apto 9/10, problema de implementación" — el patrón de falso negativo del detector ya documentado. Fix145-B ya omitía el GATE final en este caso, pero el bucle interno (8 iters) y el retry exterior Fix118 (8 más) seguían gastando. **`orchestrator.ts`**: (1) corte temprano `faLoopConverged` dentro del bucle SA — solo si TODOS los problemas de `falso_aliado` son `reveal_no_declarado`, cobertura ≤1% en ≥3 iters consecutivas (historial + actual), sin esa penalización el score alcanza el umbral, 0 altas en otras dims y ninguna dim crítica de segunda mitad KO (mismas condiciones que Fix145-B; control negativo intacto); break con activity log visible. (2) `faConvergedThisPass` también salta el retry exterior Fix118, guardado por `!bestCriticalKOLoop` (objeción del architect: si el BEST global mantiene KO crítica, Fix118/143-B SÍ corre). La restauración de mejor escaleta (Fix101) sigue aplicando tras el corte. Footer `v10.0.87`→`v10.0.88`. Sin migración. tsc PASS + smoke PASS + architect (2ª con la guarda aplicada).

- **[Fix253] Reescritura de pasajes con IA sobre una selección de texto (cierra la fase 2)**: petición del usuario (captura estilo "Rewrite with AI": Improve/Expand/Shorten/Simplify + instrucción libre). **Backend** (`server/routes.ts`): `POST /api/projects/:id/chapters/:chapterId/rewrite-passage` — body `{passage, action, instructions?}`, acciones `improve|expand|shorten|simplify|custom` (custom exige instrucción), techo 20k chars; localiza el pasaje en la prosa pre-marker para inyectar contexto anterior/posterior (±1200 chars; si no se encuentra —p. ej. texto recién escrito sin guardar— se reescribe sin contexto, deliberado); prompt con reglas duras (conservar hechos, voz, tiempo verbal, empalme; raya SOLO en diálogos, sin convertir narración en diálogo — ajustado tras prueba en vivo); DeepSeek v4-flash thinking disabled temp 0.8, defensa contra fences/comillas envolventes, `recordRawAiUsage` agente "passage-rewriter", 502 si vacío. **Frontend** (`chapter-viewer.tsx`, dentro del modo edición de Fix250): el `Textarea` captura la selección (`onSelect`); panel "Reescribir con IA" bajo el editor con Mejorar/Expandir/Acortar/Simplificar + instrucción personalizada; diálogo de vista previa original-vs-reescrito con "Aplicar al borrador" (guardar sigue siendo manual) o "Descartar". Tras objeción del architect: guarda de integridad en `applyRewrite` (si `draft.slice(start,end) !== original` se aborta con aviso, nunca se reemplaza a ciegas) y `readOnly` en el textarea mientras la IA trabaja. Probado en vivo: 400s de validación, 404 cap ajeno y reescritura real coherente del Epílogo. Footer `v10.0.86`→`v10.0.87`. Sin migración. tsc PASS + smoke PASS + architect (2ª ronda con las guardas aplicadas).



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
