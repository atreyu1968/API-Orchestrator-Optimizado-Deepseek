# LitAgents v5.0 - Autonomous Literary Agent Orchestration System

## Overview

LitAgents is a Node.js application that orchestrates autonomous AI literary agents using Google's Gemini 2.5 Flash to manage the entire novel-writing workflow. It provides a comprehensive solution for authoring, re-editing, translating, and managing literary works through AI-driven processes. Key capabilities include orchestrating 12+ specialized AI agents, maintaining a persistent World Bible for consistency, logging AI reasoning, providing a real-time monitoring dashboard, automating refinement loops, auto-recovery from stalled generations, and advanced features for manuscript import, expansion, reordering, translation, and approval. The system ensures high-quality manuscript completion through robust approval logic and automatic pausing for user intervention.

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
- **Configuration**: `temperature: 1.0`, `topP: 0.95`.
- **Client Setup**: `@google/genai` SDK using `GEMINI_API_KEY`.

### Build System
- **Development**: `tsx` for hot reload.
- **Production**: `esbuild` for server, Vite for client.

### Feature Specifications

#### Manuscript Import Pipeline (v5.0)
- Imported manuscripts can be sent directly to the **Re-editor** (creates reedit project with all chapters in pending state) or to the **Translator** (creates completed reedit project visible in export page).
- Both routes filter empty chapters, use `editedContent || originalContent` fallback, and sort properly (prologue first, epilogue/author note last).
- Supports `.docx`, `.doc`, `.txt`, and `.md` file formats with intelligent chapter detection (multilingual regex patterns).
- Server-side file picker for processing files already on the server.

#### Optimized Re-edit Pipeline (v5.0)
- Publication-quality manuscript re-editing with 12 specialized agents.
- Fixed critical bug where final review corrections were silently dropped (`capituloReescrito` vs `rewrittenContent` mismatch) — now all 5 code paths use dual-key fallback.
- All agents use detected language instead of hardcoded Spanish.
- **Editor**: Deep 7-category analysis (continuity, plot, pacing, style, dialogue, characters, setting) with thinking enabled on Gemini 2.5 Flash.
- **CopyEditor**: Upgraded to Gemini Pro with thinking, World Bible context, adjacent chapter awareness, and period-appropriate language enforcement.
- **StructuralFixer**: Upgraded to Gemini Pro with thinking.
- **NarrativeRewriter**: Fixed `reglasDelMundo` field access (was reading empty `reglas`).
- **Architect Analyzer**: 3000 chars per chapter context (was 500).
- **QA Context Windows**: Continuity 15K, Voice 10K, WorldBible 12K per chapter.

#### Translation & Literary Adaptation (v5.0)
- Literary adaptation into 7 languages (ES, EN, FR, DE, IT, PT, CA) focusing on publication-ready prose.
- Full support for translating re-edited books via `/api/reedit-projects/:id/translate-stream`.
- Proper ID collision handling with `source` + `reeditProjectId` tracking across frontend and backend.
- Resume support for interrupted reedit translations (branching by source type in resume endpoint).
- "Re-editado" badge in translation repository.
- Anti-AI filter with per-language crutch word lists.
- Extensive cleanup of AI-generated contamination (style guides, checklists, JSON artifacts).
- Shared `sanitizeContentForTranslation()` function cleans source content before translation (all 3 paths).
- `splitLongParagraphs()` function applied across all output paths (format-ebook, export-markdown, DOCX, chapter viewer) — splits narrative blocks >600 chars at sentence boundaries (~3-4 sentences per paragraph), separates dialogue lines (—, «, ") into their own paragraphs.

#### Taller de Guías (Guide Workshop) (v5.0)
- AI-powered style and writing guide generation module at `/guides`.
- 4 guide types: author_style (emulate known authors), idea_writing (develop story premises + auto-create project), pseudonym_style (define pseudonym identity), series_writing (maintain series coherence).
- `generated_guides` table with fields: id, title, content, guideType, sourceAuthor, sourceIdea, sourceGenre, pseudonymId, seriesId, inputTokens, outputTokens, createdAt.
- Agent: `server/agents/style-guide-generator.ts` using Gemini 2.5 Flash with thinking (budget: 2048).
- API: `GET /api/guides`, `GET /api/guides/:id`, `DELETE /api/guides/:id`, `POST /api/guides/generate`, `POST /api/guides/:id/apply-to-pseudonym`.
- Frontend: `client/src/pages/guides.tsx` with 5 tabs (library + 4 guide types), guide viewer dialog, apply-to-pseudonym dialog.
- **idea_writing flow**: Collects full project data (title, chapters, prologue/epilogue/author note, words per chapter, Kindle optimization, pseudonym, style guide). On generation: saves as `extendedGuide` (not styleGuide) and auto-creates a project with `extendedGuideId` set. Genre and tone use dropdown selectors matching the config panel options.
- **series_writing flow**: Extended to also create an `extendedGuide` + project (like idea_writing). Selects a series, pseudonym (existing or new), genre, tone, and full project config. Backend enriches the guide with real chapter content from all books in the series (projects, reedit projects, imported manuscripts). Auto-calculates `seriesOrder` from existing books and links the new project to the series with `workType: "series"`. Updates the series' `seriesGuide` field.
- **apply-to-pseudonym**: Only available for `author_style` and `pseudonym_style` guides. Creates a styleGuide linked to the selected pseudonym. Server validates guide type before allowing application.

#### Convert Reedit Projects to Series (v5.0)
- Converts multiple imported/re-edited books into a unified series.
- `reeditProjects` table has `seriesId` and `seriesOrder` columns for series linkage.
- API: `POST /api/reedit-projects/convert-to-series` — accepts `{ books: [{projectId, order}], seriesTitle, totalPlannedBooks, pseudonymId }`.
- Validates: no duplicate project IDs, books not already in a series, bounds on totalPlannedBooks.
- Creates series record, links each reedit project via `seriesId`/`seriesOrder` update.
- Auto-generates a `series_writing` guide using AI (feeds book summaries/excerpts to the style-guide-generator agent).
- Merges World Bible data from all selected books using Gemini 2.5 Flash to deduplicate characters/locations/timeline across books, then updates each book's World Bible with the unified data.
- Series registry (`GET /api/series/registry`) includes reedit projects as volumes alongside regular projects and imported manuscripts.
- Frontend: "Crear Serie" button in the reedit page projects card opens a dialog to select books, reorder them, name the series, and trigger conversion.

#### Word Count Validation & Expansion
- 10% flexible tolerance: `FLEXIBLE_MIN = TARGET_MIN × 0.90`, `FLEXIBLE_MAX = TARGET_MAX × 1.10`.
- `MAX_WORD_COUNT_RETRIES = 5` dedicated retries using separate `wordCountRetries` counter (independent from editor's `refinementAttempts`). After 5 retries, continues forward.
- **Expansion mode**: When a chapter is short, the system passes existing content as `previousChapterContent` with expansion-specific instructions (not rewrite-from-scratch). The ghostwriter receives the short draft as "BORRADOR ANTERIOR" and is instructed to expand with sensory details, dialogue, internal monologue, and transitions — never deleting what works.
- Applied to all code paths (generate, resume, QA rewrite).
- **Surgical editing philosophy**: All refinement instructions emphasize modifying only problematic passages while preserving working content. `buildRefinementInstructions()` now includes `plan_quirurgico.preservar` and `palabras_objetivo`. QA rewrites set `isRewrite: true`. Continuity violation corrections are explicitly surgical.

#### Novel Generation & Editing
- **Manuscript Expansion/Reordering**: Agents for expanding chapters, inserting new ones, and reordering chapters for narrative flow. Includes automatic internal header syncing.
- **Automatic Pause & Approval**: System pauses for user input after 15 non-perfect evaluations (applies to both `processProject` and `runFinalReviewOnly`). Requires two consecutive 9+/10 scores with no issues for approval. All pause/exit paths persist complete state (revisionCycle, consecutiveHighScores, nonPerfectCount, previousScores, tokens) for reliable resume.
- **Issue Tracking**: Issue hash tracking prevents re-reporting of resolved issues.
- **Enhanced Cancellation & Resume**: Immediate process cancellation and optimized project resumption from `awaiting_instructions`. All three orchestrator methods (`processProject`, `runFinalReviewOnly`, `applyReviewerCorrections`) have full try/catch error handling with status/token persistence on failure.
- **Continuity Validation & Constraints**: Three-layer continuity system: (1) Immediate pre-Editor validation for dead characters, ignored injuries, and location inconsistencies. (2) Editor acts as primary continuity sentinel with full 6-category analysis (physical, temporal, spatial, character state, objects, knowledge leaks) — continuity errors auto-reject the chapter. (3) Continuity Sentinel runs every 5 chapters but only checks multi-chapter panoramic patterns (accumulated timeline drift, abandoned threads, cross-chapter contradictions) — only triggers rewrites for CRITICAL severity issues, not MAJOR.
- **World Bible Enrichment**: Automatic update and enrichment of the World Bible with character states and narrative threads after each chapter. Includes full-text sliding context window for Ghostwriter.
- **Author Notes System**: Users can add prioritized author instructions to the World Bible, injected into Ghostwriter and Editor prompts.
- **Cross-Chapter Anti-Repetition**: Explicit rules and context (up to 3 previous chapters) for Ghostwriter and Editor to prevent thematic and narrative repetition.
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
- **Fish Audio API**: `FISH_AUDIO_API_KEY` — TTS model `speech-1.6` for audiobook generation. Supports MP3/WAV/Opus output, voice cloning via `reference_id`, prosody control (speed/volume), and expressiveness params (`top_p: 0.8`, `temperature: 0.8`, `repetition_penalty: 1.3`).

#### Audiobook Generation (v5.0)
- Converts completed books (projects, reedit projects, imported manuscripts, translations) into audiobooks chapter by chapter using Fish Audio TTS API.
- **Schema**: `audiobook_projects` (title, sourceType, sourceId, voiceId, voiceName, coverImage, format, bitrate, speed, status) + `audiobook_chapters` (chapterNumber, textContent, audioFileName, audioSizeBytes, status). Status values: `pending | processing | completed | error | paused`.
- **Pause/Cancel**: Uses `AbortController` map (`activeAudiobookGenerations`) to track active generation processes. Pause route (`POST /api/audiobooks/:id/pause`) aborts the controller and sets status to "paused", immediately stopping Fish Audio API calls. Resume via standard generate route (skips already-completed chapters). Delete route aborts any active generation before cleanup. All three actions (pause, delete, complete) stop consuming Fish Audio credits.
- **Parallel generation**: Generates up to 3 chapters concurrently (`CONCURRENCY = 3`) using `Promise.all` batches. Skips already-completed chapters. Abort/pause propagates to all active requests in the batch.
- **Text chunking**: Splits chapters >9500 chars at sentence boundaries for API limits; concatenates audio buffers.
- **API Routes**: `GET /api/audiobooks`, `GET /api/audiobooks/:id`, `GET /api/audiobooks/sources/available`, `GET /api/audiobooks/voices/list`, `POST /api/audiobooks` (with cover upload), `POST /api/audiobooks/:id/generate`, `POST /api/audiobooks/:id/pause`, `POST /api/audiobooks/:id/generate-chapter/:chapterId`, `GET /api/audiobooks/:id/download` (ZIP), `GET /api/audiobooks/:id/chapter/:chapterId/audio`, `PATCH /api/audiobooks/:id`, `DELETE /api/audiobooks/:id`.
- **ZIP download**: Includes all completed audio files, cover image (if uploaded), and `metadata.json` with chapter listing.
- **Frontend**: `client/src/pages/audiobooks.tsx` — list/create/detail views. Create form includes source selection, Fish Audio voice picker, format/bitrate/speed sliders, cover upload. Detail view shows per-chapter progress, inline audio players, pause/resume controls, generate-all or per-chapter generation, delete (works even during active generation), and ZIP download.
- Audio files stored in `./audiobooks/project_{id}/` directory.

### Key NPM Packages
- `@google/genai`: Google Gemini AI SDK.
- `drizzle-orm` / `drizzle-zod`: ORM and schema validation.
- `express`: Node.js web framework.
- `@tanstack/react-query`: React asynchronous state management.
- `wouter`: React routing library.
- `mammoth`: .docx file parsing.
- `archiver`: ZIP file creation for audiobook downloads.
- Radix UI primitives: Accessible UI components.
