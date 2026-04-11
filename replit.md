# LitAgents v6.4 - Autonomous Literary Agent Orchestration System

## Overview

LitAgents is a Node.js application that orchestrates autonomous AI literary agents using Google's Gemini models to manage the entire novel-writing workflow. It provides a comprehensive solution for authoring, re-editing, translating, and managing literary works through AI-driven processes. Key capabilities include orchestrating 12+ specialized AI agents, maintaining a persistent World Bible for consistency, logging AI reasoning, providing a real-time monitoring dashboard, automating refinement loops, auto-recovery from stalled generations, and advanced features for manuscript import, expansion, reordering, translation, approval, prequels, and spin-offs. The system ensures high-quality manuscript completion through robust approval logic and automatic pausing for user intervention.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript (Vite).
- **Routing**: Wouter.
- **State Management**: TanStack Query.
- **UI Components**: shadcn/ui (leveraging Radix UI).
- **Styling**: Tailwind CSS (custom theme, light/dark modes).
- **Design System**: Microsoft Fluent Design principles (Inter, JetBrains Mono, Merriweather fonts).

### Backend
- **Runtime**: Node.js with Express.
- **Language**: TypeScript (ES modules).
- **API Pattern**: RESTful endpoints with Server-Sent Events (SSE).
- **Agent System**: Modular agent classes (inheriting from `BaseAgent`) with specialized system prompts for Gemini 3. An orchestrator manages the pipeline, including refinement loops triggered by the Editor agent.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts`, including tables for projects, chapters, world Bibles, thought logs, agent statuses, series, continuity snapshots, arc verifications, imported manuscripts, reedit projects, and translations.

### AI Integration
- **Models**: Gemini 2.5 Flash (all agents — Architect, Ghostwriter, Editor, CopyEditor, FinalReviewer, Translator, validators, Chapter Expander, Restructurer, Reedit agents), Gemini 2.0 Flash (ManuscriptAnalyzer).
- **Thinking Support**: Gemini 2.5 Flash (budget: 1024) for agents that need it (Ghostwriter, Architect, Restructurer, Chapter Expander). Thinking is OFF by default; agents must opt-in with `useThinking: true`.
- **Token Optimization**: System prompts sent via `systemInstruction` (not as user messages). Per-agent `maxOutputTokens` limits: 65536 for writers/translators, 16384 for reviewers, 8192 for editors/analyzers, 4096 for validators/auditors. Default model is `gemini-2.5-flash` (not Pro).
- **Ghostwriter Quality System**: System prompt includes "Estándar de Excelencia Editorial" section targeting 9/10 on first draft, with 6 quality pillars (human-like prose, concrete sensory immersion, dialogue subtexto, emotional arc progression, hook opening/memorable close, beats as full scenes). Also includes a mandatory pre-delivery self-audit checklist (10 checkpoints matching Editor criteria).
- **Character Name Originality System**: The Architect's system prompt includes a strict anti-name-repetition directive with a blacklist of commonly repeated AI names. The Orchestrator dynamically extracts all character names from existing World Bibles AND reedit World Bibles (excluding projects in the same series) AND all entries from the `name_blacklist` table (user-managed via UI), passing them as `forbiddenNames` to the Architect. The Ghostwriter is instructed to faithfully use only the names defined in the World Bible. The **Style Guide Generator** also receives `forbiddenNames` to avoid suggesting already-used names when generating new guides. The extraction logic lives in `extractForbiddenNames()` (exported from `server/orchestrator.ts`) and is reused in `routes.ts` for all 3 guide-generation call sites.
- **Configuration**: `temperature: 1.0`, `topP: 0.95`.
- **Client Setup**: `@google/genai` SDK using `GEMINI_API_KEY`.

### Build System
- **Development**: `tsx` for hot reload.
- **Production**: `esbuild` for server, Vite for client.

### Feature Specifications

#### Manuscript Import Pipeline (v6.0)
- Imported manuscripts can be sent directly to the **Re-editor** (creates reedit project with all chapters in pending state) or to the **Translator** (creates completed reedit project visible in export page).
- Both routes filter empty chapters, use `editedContent || originalContent` fallback, and sort properly (prologue first, epilogue/author note last).
- Supports `.docx`, `.doc`, `.txt`, and `.md` file formats with intelligent chapter detection (multilingual regex patterns).
- Server-side file picker for processing files already on the server.

#### Optimized Re-edit Pipeline (v6.0)
- Publication-quality manuscript re-editing with 12 specialized agents.
- Fixed critical bug where final review corrections were silently dropped (`capituloReescrito` vs `rewrittenContent` mismatch) — now all 5 code paths use dual-key fallback.
- All agents use detected language instead of hardcoded Spanish.
- **Editor**: Deep 7-category analysis (continuity, plot, pacing, style, dialogue, characters, setting) with thinking enabled on Gemini 2.5 Flash.
- **CopyEditor**: Upgraded to Gemini Pro with thinking, World Bible context, adjacent chapter awareness, and period-appropriate language enforcement.
- **StructuralFixer**: Upgraded to Gemini Pro with thinking.
- **NarrativeRewriter**: Fixed `reglasDelMundo` field access (was reading empty `reglas`).
- **Architect Analyzer**: 3000 chars per chapter context (was 500).
- **QA Context Windows**: Continuity 15K, Voice 10K, WorldBible 12K per chapter.

#### Translation & Literary Adaptation (v6.0)
- Literary adaptation into 7 languages (ES, EN, FR, DE, IT, PT, CA) focusing on publication-ready prose.
- Full support for translating re-edited books via `/api/reedit-projects/:id/translate-stream`.
- Proper ID collision handling with `source` + `reeditProjectId` tracking across frontend and backend.
- Resume support for interrupted reedit translations (branching by source type in resume endpoint).
- "Re-editado" badge in translation repository.
- **Editorial Critique-Driven Reedit**: `editorialCritique` column on `reedit_projects` accepts external editor/beta-reader feedback. Injected into NarrativeRewriter (as high-priority corrections) and FinalReviewer (as verification checklist). Available on upload, resume, and restart. UI shows critique in progress tab and restart dialog.
- **System Project Reedit Optimization**: When cloning a system project to reedit (`sourceProjectId` set), the clone route copies the World Bible, maps `worldRules`→`loreRules`, `plotDecisions`+`persistentInjuries`→loreRules, and sets `editedContent` = chapter content. The orchestrator detects system projects and skips Stages 1-3 (structure analysis, editor review, World Bible extraction) — jumping directly to architect analysis, QA, and narrative rewriting. Saves significant time and API costs.
- **Proofreading Agent (Corrector Ortotipográfico Senior)**: New `ProofreaderAgent` for post-production orthotypographic correction. Adapts to genre and author style. Detects AI glitches (cloned paragraphs, broken dialogues, action loops), corrects spelling/typography/punctuation/style, preserves author voice. Works on all 4 source types (projects, reedit, imported, translations). Schema: `proofreading_projects` + `proofreading_chapters`. Routes: GET/POST/DELETE `/api/proofreading`, POST `/api/proofreading/:id/start`, POST `/api/proofreading/:id/apply`. The "apply" route writes corrected content back to the original source. Frontend: `client/src/pages/proofreading.tsx`. Migration: `migrations/0006_add_proofreading.sql`.
- **Ghostwriter on Gemini 3 Flash (v6.1)**: The Ghostwriter agent now uses `gemini-3-flash-preview` for significantly better creative writing quality — outperforms 2.5 Pro while being 3x faster at lower cost ($0.50/$3.00/$3.50 per million tokens). Tested: `gemini-3.1-flash-lite-preview` was too weak for creative writing (scores 3-6/10). All other agents remain on 2.5 Flash. Thinking budget: 16384 tokens. Temperature: 1.0 (new chapters), 0.85 (rewrites) — Gemini 3.x recommends not going below 1.0. Cost calculator and AGENT_MODEL_MAPPING updated in `server/cost-calculator.ts`. Pricing also added to `orchestrator.ts` calculateTokenCosts.  Base-agent supports both `thinkingBudget` (2.5 series, 3 Flash) and `thinkingLevel` (3.1 series) configs.
- **Thinking Budget Optimization (v6.1)**: All critical agents now have per-agent configurable thinking budgets via `thinkingBudget` in `AgentConfig`. Ghostwriter: 16384 (Gemini 3 Flash), Architect: 8192, Copyeditor: 8192, Editor: 4096, Final Reviewer: 4096, Proofreader: default 4096. Default base: 4096 for 2.5 flash, 16384 for Gemini 3 Flash, 8192 for pro.
- **Editor Holistic Scoring (v6.1)**: Editor rubric changed from penalty-only system (15+ categories subtracting points) to holistic quality evaluation. Only 3 automatic rejection reasons: continuity grave, knowledge leaks, truncated text. Everything else (clichés, repetitions, purple prose, epithets) are reported as weaknesses but don't cause auto-reject. Scoring guide: 9-10 excellent, 7-8 good, 5-6 mediocre, 3-4 bad.
- **Prequel Support (v6.1)**: Projects can now be created as prequels of existing series. Schema: `projectSubtype` field ("standard" | "prequel") on projects table. Migration: `migrations/add_project_subtype.sql`. Route: `POST /api/series/:id/create-prequel`. Prequels get `seriesOrder: 0` and load ALL volumes from the series as future context (not just previous ones). The orchestrator injects special prequel rules: plant seeds for future events, don't contradict established facts, show character origins, don't reveal future secrets. Only one prequel per series allowed. Inherits author's style guide and pseudonym automatically. Frontend: "Precuela" button on series page with creation dialog.
- Anti-AI filter with per-language crutch word lists.
- Extensive cleanup of AI-generated contamination (style guides, checklists, JSON artifacts).
- Shared `sanitizeContentForTranslation()` function cleans source content before translation (all 3 paths).
- `splitLongParagraphs()` function applied across all output paths (format-ebook, export-markdown, DOCX, chapter viewer) — splits narrative blocks >600 chars at sentence boundaries (~3-4 sentences per paragraph), separates dialogue lines (—, «, ") into their own paragraphs.

#### Taller de Guías (Guide Workshop) (v6.0)
- AI-powered style and writing guide generation module at `/guides`.
- 4 guide types: author_style (emulate known authors), idea_writing (develop story premises + auto-create project), pseudonym_style (define pseudonym identity), series_writing (maintain series coherence).
- `generated_guides` table with fields: id, title, content, guideType, sourceAuthor, sourceIdea, sourceGenre, pseudonymId, seriesId, inputTokens, outputTokens, createdAt.
- Agent: `server/agents/style-guide-generator.ts` using Gemini 2.5 Flash with thinking (budget: 2048).
- API: `GET /api/guides`, `GET /api/guides/:id`, `DELETE /api/guides/:id`, `POST /api/guides/generate`, `POST /api/guides/:id/apply-to-pseudonym`.
- Frontend: `client/src/pages/guides.tsx` with 5 tabs (library + 4 guide types), guide viewer dialog, apply-to-pseudonym dialog.
- **idea_writing flow**: Collects full project data (title, chapters, prologue/epilogue/author note, words per chapter, Kindle optimization, pseudonym, style guide). On generation: saves as `extendedGuide` (not styleGuide) and auto-creates a project with `extendedGuideId` set. Genre and tone use dropdown selectors matching the config panel options.
- **series_writing flow**: Extended to also create an `extendedGuide` + project (like idea_writing). Selects a series, pseudonym (existing or new), genre, tone, and full project config. Backend enriches the guide with real chapter content from all books in the series (projects, reedit projects, imported manuscripts). Auto-calculates `seriesOrder` from existing books and links the new project to the series with `workType: "series"`. Updates the series' `seriesGuide` field.
- **apply-to-pseudonym**: Only available for `author_style` and `pseudonym_style` guides. Creates a styleGuide linked to the selected pseudonym. Server validates guide type before allowing application.

#### Convert Reedit Projects to Series (v6.0)
- Converts multiple imported/re-edited books into a unified series.
- `reeditProjects` table has `seriesId` and `seriesOrder` columns for series linkage.
- API: `POST /api/reedit-projects/convert-to-series` — accepts `{ books: [{projectId, order}], seriesTitle, totalPlannedBooks, pseudonymId }`.
- Validates: no duplicate project IDs, books not already in a series, bounds on totalPlannedBooks.
- Creates series record, links each reedit project via `seriesId`/`seriesOrder` update.
- Auto-generates a `series_writing` guide using AI (feeds book summaries/excerpts to the style-guide-generator agent).
- Merges World Bible data from all selected books using Gemini 2.5 Flash to deduplicate characters/locations/timeline across books, then updates each book's World Bible with the unified data.
- Series registry (`GET /api/series/registry`) includes reedit projects as volumes alongside regular projects and imported manuscripts.
- Frontend: "Crear Serie" button in the reedit page projects card opens a dialog to select books, reorder them, name the series, and trigger conversion.

#### Spin-off Series Creation (v6.0)
- Create new series derived from existing ones with a character from the original as protagonist.
- Schema: `series` table has `parentSeriesId`, `spinoffProtagonist`, `spinoffContext` columns.
- API: `GET /api/series/:id/characters` extracts unique characters from all world bibles and continuity snapshots in a series. `POST /api/series/:id/generate-spinoff-guide` analyzes parent series novels with Gemini 2.5 Flash to auto-generate a complete series guide.
- Generated guide includes: protagonist profile, inherited world rules, recurring characters, inherited/new plot threads, continuity bible, tone/style directives.
- Orchestrator injects spin-off context (parent series name, protagonist, concept) into chapter generation pipeline alongside the generated guide.
- Frontend: Series creation form has "Serie Origen" selector. When selected, loads characters from parent series for protagonist selection. On creation, auto-generates the writing guide by analyzing all novels.
- Spin-off badge shown in series listing with protagonist name.

#### Word Count Validation & Expansion
- 10% flexible tolerance: `FLEXIBLE_MIN = TARGET_MIN × 0.90`, `FLEXIBLE_MAX = TARGET_MAX × 1.10`.
- `MAX_WORD_COUNT_RETRIES = 5` dedicated retries using separate `wordCountRetries` counter (independent from editor's `refinementAttempts`). After 5 retries, continues forward. Empty responses (0 words) get special handling: longer wait (20s vs 10s), cleared refinement instructions (fresh retry), and detailed error logging including API error reason.
- **`extractContinuityState` robustness**: Uses `lastIndexOf` to find the final `---CONTINUITY_STATE---` separator, ensuring chapter text isn't lost when the model places extra separators. Guards against empty content input, strips stray separators from chapter text, and falls back to treating full content as chapter text if no parseable chapter body is found before the separator.
- **Expansion mode**: When a chapter is short, the system passes existing content as `previousChapterContent` with expansion-specific instructions (not rewrite-from-scratch). The ghostwriter receives the short draft as "BORRADOR ANTERIOR" and is instructed to expand with sensory details, dialogue, internal monologue, and transitions — never deleting what works.
- Applied to all code paths (generate, resume, QA rewrite).
- **Surgical editing philosophy**: All refinement instructions emphasize modifying only problematic passages while preserving working content. `buildRefinementInstructions()` now includes `plan_quirurgico.preservar` and `palabras_objetivo`. QA rewrites set `isRewrite: true`. Continuity violation corrections are explicitly surgical.

#### Novel Generation & Editing
- **Manuscript Expansion/Reordering**: Agents for expanding chapters, inserting new ones, and reordering chapters for narrative flow. Includes automatic internal header syncing.
- **Automatic Pause & Approval**: System pauses for user input after 5 non-perfect evaluations (applies to both `processProject` and `runFinalReviewOnly`). Requires two consecutive 9+/10 scores with no issues for approval. Editor approval threshold: 9/10 (chapters scoring below 9 are sent back for rewriting). Final Reviewer auto-approval on plateau/cycle-limit also requires 9+. All pause/exit paths persist complete state (revisionCycle, consecutiveHighScores, nonPerfectCount, previousScores, tokens) for reliable resume.
- **Score Regression Detection**: Before applying corrections, chapter content is snapshotted. If the score drops by 2+ points after corrections (e.g. from 9 to 6), the system auto-reverts the chapters to pre-correction state and pauses for user instructions, preventing quality degradation.
- **Chapter Number Extraction**: `server/utils/extract-chapters.ts` provides `ensureChapterNumbers()` which extracts chapter numbers from issue descriptions when the AI omits `capitulos_afectados`. Applied in all 3 orchestrator correction paths (main, reedit, FRO). Final Reviewer prompt reinforced to always include `capitulos_afectados`.
- **JSON Repair**: All AI agents use `server/utils/json-repair.ts` to parse JSON responses from Gemini, handling truncated JSON, missing commas, unclosed strings/brackets automatically.
- **Reedit Assessment**: Before starting a re-edit, users can run `/api/projects/:id/assess-reedit` to get an AI-powered quality assessment (samples 5 chapters, evaluates prose/structure/characters/dialogue/pacing/coherence). Returns "reedit" or "rewrite" recommendation with per-category scores. Has 60s per-project cooldown. Frontend shows results in the auto-reedit dialog with a warning gate when "rewrite" is recommended.
- **Issue Tracking**: Issue hash tracking prevents re-reporting of resolved issues.
- **Enhanced Cancellation & Resume**: Immediate process cancellation and optimized project resumption from `awaiting_instructions`. All three orchestrator methods (`processProject`, `runFinalReviewOnly`, `applyReviewerCorrections`) have full try/catch error handling with status/token persistence on failure.
- **Continuity Validation & Constraints**: Four-layer continuity system: (1) Immediate pre-Editor validation for dead characters, ignored injuries, and location inconsistencies. (2) Editor acts as primary continuity sentinel with full 6-category analysis (physical, temporal, spatial, character state, objects, knowledge leaks) — continuity errors auto-reject the chapter. Editor now receives the FULL style guide (not just genre/tone). (3) Continuity Sentinel runs every 3 chapters checking multi-chapter panoramic patterns (accumulated timeline drift, abandoned threads, cross-chapter contradictions) — triggers rewrites for both CRITICAL and MAJOR severity issues. JSON parse failures now mark checkpoint as NOT approved (fail-safe). (4) **Final Continuity Audit** runs before project completion: scans the full manuscript in overlapping batches of 6 chapters (2-chapter overlap), reloading fresh chapter data per batch. Tracks failed/timeout batches separately and verifies chapter status after rewrites. All QA rewrites (Sentinel, Voice, Semantic) now run CopyEditor polish before saving.
- **World Bible Enrichment**: Automatic update and enrichment of the World Bible with character states and narrative threads after each chapter. Includes full-text sliding context window for Ghostwriter.
- **Author Notes System**: Users can add prioritized author instructions to the World Bible, injected into Ghostwriter and Editor prompts.
- **Cross-Chapter Anti-Repetition**: Multi-layer scene repetition prevention system:
  - `extractScenePatternSummary()` analyzes chapter text for opening/closing/mechanism patterns (regex-based) + AI-reported `scenePatterns` from continuity state
  - Scene patterns from last 6 chapters injected into Ghostwriter as "PATRONES NARRATIVOS YA USADOS" mandatory constraints
  - Editor receives 5 previous chapters (up from 3) with larger excerpts (5000 chars for 2 nearest, 3000 for farther) showing beginning+end for pattern detection
  - Editor has explicit 8-point cross-chapter comparison checklist (scene structure, revelation mechanism, opening/closing type, emotional reactions, resolution patterns, contradictions)
  - `enforceApprovalLogic` treats 2+ `repeticiones_trama` as hard rejection (overrides even 9+/10 score)
  - Ghostwriter continuity state now includes `scenePatterns` (openingType, closingType, revelationMechanism, mainSceneStructures) and `keyDecisions` for tracking
  - `keyDecisions` from continuity state injected into mandatory constraints as "[DECISIÓN]" entries
  - Summary chapter extracts expanded to 1500 chars (800 start + 700 end) instead of 500 chars
  - Local `chapters` array updated in-memory after completion to ensure `buildSlidingContextWindow` has access to completed chapter content during generation
- **PWA Support**: Progressive Web App capabilities including `manifest.json`, service worker, and install-to-home-screen.

### Series Management (Complete Inter-Book Continuity System)
- **Centralized Completion Logic**: `finalizeCompletedProject()` helper ensures continuity snapshot generation and arc verification run on every completion path (8 total).
- **Automatic Continuity Snapshots**: Extracts synopsis, character states, unresolved threads, and key events from completed chapters.
- **Automatic Arc Verification**: Runs ArcValidatorAgent after each book completes to verify milestone fulfillment and plot thread progress. Supports all volume types (project, imported, reedit) via `volumeType` parameter. Schema uses polymorphic volume references (`volumeType` + `projectId`) instead of FK constraints to `projects.id`.
- **Series-Aware Context Loading**: Loads unresolved threads and key events from previous volumes only, filtering by `seriesOrder < currentVolume` to prevent future-book context leakage.
- **Final Reviewer Series Context**: Receives series milestones, plot threads, unresolved threads from prior books, and last-volume flag for thread closure enforcement.
- **Ghostwriter Series Constraints**: Series unresolved threads injected into enriched World Bible across all Ghostwriter paths.
- **Enriched World Bible Resilience**: `getEnrichedWorldBible()` includes series fields in early-return and error fallback paths.
- **Volume Ordering**: Architect series context sorts volumes by `seriesOrder` using `?? 999` for null values.

## Key Orchestrator Methods

| Method | Purpose |
|---|---|
| `finalizeCompletedProject()` | Sets status "completed", generates continuity snapshot, runs arc verification |
| `loadSeriesThreadsAndEvents()` | Loads prior-volume threads/events with seriesOrder filtering |
| `getEnrichedWorldBible()` | Enriches base World Bible with DB character states, narrative threads, author notes, series context |
| `generateSeriesContinuitySnapshot()` | Extracts and saves book completion data for series continuity |
| `runSeriesArcVerification()` | Runs ArcValidatorAgent and stores verification results |
| `runFinalReview()` | Multi-cycle final review with series context, QA rewrites, and approval logic |

## External Dependencies

### AI Services
- **Google Gemini API**: `GEMINI_API_KEY` — primary model `gemini-2.5-flash` (all agents), `gemini-2.0-flash` (manuscript analyzer), `gemini-2.5-flash-image` (image generation).

### Deployment & Database
- **PostgreSQL**: Database accessed via `DATABASE_URL`.
- **Drizzle Kit**: Used for database migrations.

### TTS / Audiobook Services
- **Fish Audio API**: `FISH_AUDIO_API_KEY` — TTS model `speech-1.6` for audiobook generation. Supports MP3/WAV/Opus output, voice cloning via `reference_id`, prosody control (speed/volume), and expressiveness params (`top_p: 0.7`, `temperature: 0.9`, `repetition_penalty: 1.0`).

#### Audiobook Generation (v6.0)
- Converts completed books (projects, reedit projects, imported manuscripts, translations) into audiobooks chapter by chapter using Fish Audio TTS API.
- **Schema**: `audiobook_projects` (title, sourceType, sourceId, voiceId, voiceName, coverImage, format, bitrate, speed, status) + `audiobook_chapters` (chapterNumber, textContent, audioFileName, audioSizeBytes, status). Status values: `pending | processing | completed | error | paused`.
- **Pause/Cancel**: Uses `AbortController` map (`activeAudiobookGenerations`) to track active generation processes. Pause route (`POST /api/audiobooks/:id/pause`) aborts the controller and sets status to "paused", immediately stopping Fish Audio API calls. Resume via standard generate route (skips already-completed chapters). Delete route aborts any active generation before cleanup. All three actions (pause, delete, complete) stop consuming Fish Audio credits.
- **Parallel generation**: Generates up to 3 chapters concurrently (`CONCURRENCY = 3`) using `Promise.all` batches. Skips already-completed chapters. Abort/pause propagates to all active requests in the batch.
- **Text chunking**: Splits chapters >9500 chars at sentence boundaries for API limits; concatenates audio buffers.
- **API Routes**: `GET /api/audiobooks`, `GET /api/audiobooks/:id`, `GET /api/audiobooks/sources/available`, `GET /api/audiobooks/voices/list`, `POST /api/audiobooks` (with cover upload), `POST /api/audiobooks/:id/generate`, `POST /api/audiobooks/:id/pause`, `POST /api/audiobooks/:id/generate-chapter/:chapterId`, `GET /api/audiobooks/:id/download` (ZIP), `GET /api/audiobooks/:id/chapter/:chapterId/audio`, `PATCH /api/audiobooks/:id`, `DELETE /api/audiobooks/:id`.
- **ZIP download**: Includes all completed audio files, cover image (if uploaded), and `metadata.json` with chapter listing.
- **Frontend**: `client/src/pages/audiobooks.tsx` — list/create/detail views. Create form includes source selection, Fish Audio voice picker, format/bitrate/speed sliders, cover upload. Detail view shows per-chapter progress, inline audio players, pause/resume controls, generate-all or per-chapter generation, delete (works even during active generation), and ZIP download.
- Audio files stored in `./audiobooks/project_{id}/` directory.

#### Cover Prompt Generator (v6.2)
- Generates optimized AI prompts for book cover creation, compatible with Midjourney, DALL-E, Stable Diffusion, Ideogram, Leonardo AI.
- **Scopes**: Project (individual book), Series (coherent visual identity), Pseudonym (author branding), Independent (custom).
- **KDP Specs**: 2560x1600px, 300 DPI, RGB, JPEG/TIFF, portrait orientation.
- **Chain Generation (v6.2)**: When generating a project cover, the system automatically checks if the pseudonym has existing author branding and if the series has an existing design system. If either is missing, it generates them first in chain order: Author Branding → Series Design → Project Cover. This ensures visual coherence across all covers. Same logic applies when generating a series cover — if the pseudonym branding is missing, it's created first. The frontend shows an amber warning when chain generation will occur.
- **Author Branding**: Pseudonym-level visual identity stored in `authorBranding` jsonb field. Defines: visualIdentity, colorScheme, typographyStyle, moodAndTone, brandingNotes. All covers for the same pseudonym inherit this branding.
- **Series Design System**: When generating for a series, creates a shared design system (common elements, color scheme, typography, layout pattern, branding notes) that subsequent covers in the series will follow. Inherits from author branding when available.
- **Agent**: `server/agents/cover-prompt-designer.ts` — extends BaseAgent, uses Gemini 2.5 Flash with thinking. Generates prompts in English (better AI image gen results), includes negative prompts, style, color palette, mood, typography suggestions, composition details. Supports hierarchical context: authorBranding → seriesDesignSystem → project-specific.
- **Image Generation (v6.2)**: Each cover prompt can generate an actual AI image using Gemini's image model (`gemini-2.5-flash-image`). Images are saved to `./covers/` directory and served via `/api/cover-images/:filename`. Cards show the generated image with hover overlay for download/regenerate. View dialog shows the image with download button. Status updates to "generated" after image creation.
- **Schema**: `cover_prompts` table (projectId?, seriesId?, pseudonymId?, title, prompt, negativePrompt, style, colorPalette, mood, typography, composition, seriesDesignSystem, authorBranding, generatedImageUrl, coverSpecs, status, notes).
- **API Routes**: `GET /api/cover-prompts`, `GET /api/cover-prompts/:id`, `POST /api/cover-prompts/generate` (supports chain generation, returns `chainGenerated` array when multiple prompts created), `POST /api/cover-prompts/:id/generate-image` (generates AI image from prompt), `GET /api/cover-images/:filename` (serves generated images), `PATCH /api/cover-prompts/:id`, `DELETE /api/cover-prompts/:id`.
- **Frontend**: `client/src/pages/covers.tsx` — scope selector (tabs), prompt generation with chain warnings, image generation per prompt, full prompt viewer dialog with image preview, author branding, and series design display, copy to clipboard, edit prompt, download image, regenerate image, delete. Badges show "Branding" (purple) and "Diseño Serie" (blue) on prompt cards.
- **Migrations**: `migrations/add_author_branding.sql`, `migrations/add_cover_generated_image.sql`.

#### KDP Metadata Generator (v6.0)
- Generates Amazon KDP publishing metadata: subtitle, HTML description (max 4000 chars), 7 search keywords (50 chars each), 2 BISAC categories, series info, AI disclosure.
- **Sources**: Regular projects and reedit projects.
- **KDP Compliance**: HTML description uses only allowed tags (b, i, em, strong, br, p, h4-h6, ul, ol, li). No contact info, reviews, time-sensitive info, or quality claims in description. Keywords avoid trademark terms, "kindle", "ebook". Series name without volume numbers.
- **AI Disclosure**: Defaults to "ai-assisted" (correct for AI-assisted writing tools per Amazon 2025 policy). Confidential to Amazon, not shown to readers.
- **Agent**: `server/agents/kdp-metadata-generator.ts` — extends BaseAgent, uses Gemini 2.5 Flash with thinking. Generates metadata in the target language matching the marketplace.
- **Schema**: `kdp_metadata` table (projectId?, reeditProjectId?, title, subtitle, description, keywords[], bisacCategories[], seriesName, seriesNumber, seriesDescription, language, targetMarketplace, aiDisclosure, contentWarnings, status, notes).
- **API Routes**: `GET /api/kdp-metadata`, `GET /api/kdp-metadata/:id`, `POST /api/kdp-metadata/generate`, `PATCH /api/kdp-metadata/:id`, `DELETE /api/kdp-metadata/:id`.
- **Frontend**: `client/src/pages/kdp-metadata.tsx` — project/reedit selector, language/marketplace picker, metadata generation, full detail viewer with HTML preview, edit all fields, copy individual fields or all metadata, character count warnings for description and keywords.

#### Series Guide Generator Improvements
- **Series creation** (`series.tsx`): Includes optional description/idea field when creating a new series.
- **Series writing form** (`guides.tsx`): Added "Idea / Concepto de la Serie" textarea for the user to describe the series concept (used by the AI to generate the guide). Added "Crear proyectos para todos los volúmenes" checkbox that auto-creates remaining volume projects (not all planned, only the unfilled ones).
- **Multi-volume creation** (`routes.ts`): When `createAllVolumes` is enabled, calculates how many volumes already exist and only creates the remaining ones. Extracts AI-suggested titles from the guide's "PLANIFICACIÓN DE VOLÚMENES" section. Falls back to "Serie — Vol. N" naming.
- **Style guide generator** (`style-guide-generator.ts`): Accepts `seriesIdea` parameter. Includes volume planning section in the prompt when multiple books are planned.
- **Series description auto-save**: If the series has no description and the user provides an idea, it's saved as the series description.

### Back Matter System
- **Book Catalog** (`book_catalog` table): Stores published book entries (title, author, Amazon URL, Goodreads URL, ASIN, synopsis, genre, KU status). Managed via `/book-catalog` page.
- **Project Back Matter** (`project_back_matter` table): Per-project configuration for pages added after the manuscript in exports. Supports:
  - **Review Request Page**: Amazon ToS-compliant review solicitation in 6 languages (ES, EN, FR, DE, IT, PT). Requests reviews on both Amazon and Goodreads. No incentives, just honest request.
  - **Also By Page**: Lists selected books from the catalog with synopses and KU status. Instead of individual Amazon links per book, directs readers to the author's website URL (from pseudonym profile) for all books.
  - **Author Page** ("Sobre el Autor" / "About the Author"): Toggle `enableAuthorPage` + `authorPageBio` text field. Generates a dedicated author biography section at the end of the book in both Markdown and DOCX. Pre-populates from pseudonym bio when creating new config. Multilingual titles in 6 languages.
- **Pseudonym Name Editing (v6.2)**: Pseudonym names can be edited inline from the sidebar list (pencil icon) or from the detail panel. Supports Enter to save, Escape to cancel. Backend validates non-empty names.
- **Pseudonym Website URL**: `pseudonyms.website_url` field stores the author's website. Used in back matter "Also By" and "Author Page" sections. Multilingual CTA texts in 6 languages.
- **Export Integration**: Back matter is automatically appended to DOCX and Markdown exports (all pipelines: project export-markdown, reedit export-markdown, reedit export-md, project DOCX, reedit DOCX) after the author note.
- **Unified Manuscript Download**: Both the "Manuscrito" page and the "Descargar y Traducir" (Export) page use the same backend route (`/api/projects/:id/export-markdown`) ensuring consistent cleaning, formatting, and back matter inclusion.
- **Back Matter Generator**: `server/services/back-matter-generator.ts` — generates both Markdown and DOCX paragraph formats. Accepts `authorWebsiteUrl` parameter.
- **Frontend**: Catalog page at `/book-catalog`, back matter config embedded in the Export page when a project is selected.

### Series Project Editing
- **Series page** (`client/src/pages/series.tsx`): Each project volume has a settings icon (Settings2) that opens the full ConfigPanel dialog for editing chapterCount, minWordsPerChapter, maxWordsPerChapter, and all other project fields. Changes are saved via PATCH `/api/projects/:id`.
- **Config page** (`client/src/pages/config.tsx`): Edit dialog now passes `minWordsPerChapter`, `maxWordsPerChapter`, and `kindleUnlimitedOptimized` in defaultValues so they don't reset to defaults on save.

#### Enhanced Project Selector (v6.4)
- Replaced flat project dropdown with a Popover-based combobox supporting text search and multi-filter capabilities.
- **Text Search**: Filters projects by title, author name, or series name as you type. Search resets on popover close.
- **Filter by Author**: Dropdown showing only pseudonyms that have projects, plus "Sin autor" option.
- **Filter by Series**: Dropdown showing only series that have projects, plus "Sin serie" option.
- **Filter by Status**: Dropdown with all active statuses (Pendiente, Generando, Completado, Archivado, Pausado, Error, Esperando, Planificando, Revisando, Exportando).
- **Active Filter Indicator**: Shows "X de Y proyectos" count when filters are active. Clear-all button resets everything.
- **Rich Project Items**: Each item shows title, status badge (color-coded), author name, and series name with volume number.
- **Component**: `client/src/components/project-selector.tsx`.

#### Series from Project with AI Guide (v6.4)
- **Convert any project to series**: The convert-to-series button now appears on all projects without a series (not just standalone). Available from the Config page.
- **AI Series Guide Generation**: Checkbox "Generar guía de serie con IA" (enabled by default) in the convert dialog. When active, generates a series writing guide using the project's World Bible, characters, timeline, world rules, and chapter excerpts. The guide is saved to the series for maintaining coherence in subsequent volumes.
- **Backend**: `POST /api/projects/:id/convert-to-series` accepts `generateGuide` boolean parameter. Uses `generateStyleGuide` with `series_writing` type.
- **Duplicate route cleanup**: Removed duplicate `POST /api/projects/:id/create-series` route that was redundant with `convert-to-series`.

#### Link Projects to Series (v6.4)
- **Link existing generated projects to series**: `POST /api/series/:id/link-project` route allows linking a generated project to an existing series with a specified volume number.
- **Frontend**: Series dialog "Vincular Existente" now includes "Proyecto Generado" as a third link type alongside "Manuscrito Importado" and "Libro Re-editado".
- Validates volume order conflicts and inherits pseudonym from the series.

### Key NPM Packages
- `@google/genai`: Google Gemini AI SDK.
- `drizzle-orm` / `drizzle-zod`: ORM and schema validation.
- `express`: Node.js web framework.
- `@tanstack/react-query`: React asynchronous state management.
- `wouter`: React routing library.
- `mammoth`: .docx file parsing.
- `archiver`: ZIP file creation for audiobook downloads.
- Radix UI primitives: Accessible UI components.
