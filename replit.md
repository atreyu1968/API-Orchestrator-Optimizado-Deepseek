# LitAgents - Autonomous Literary Agent Orchestration System

## Overview

LitAgents is a Node.js application that orchestrates autonomous AI literary agents using Google's Gemini 3 Pro to manage the entire novel-writing workflow. It aims to provide a comprehensive solution for authoring and refining literary works, enhancing efficiency and quality through AI-driven processes. Key capabilities include orchestrating 9 specialized AI agents, maintaining a persistent World Bible for consistency, logging AI reasoning, providing a real-time monitoring dashboard, automating refinement loops, auto-recovery from stalled generations, and advanced features for manuscript import, expansion, reordering, and approval. The system ensures high-quality manuscript completion through robust approval logic and automatic pausing for user intervention.

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
- **Schema**: Defined in `shared/schema.ts`, including tables for projects, chapters, world Bibles, thought logs, agent statuses, series, continuity snapshots, arc verifications, and imported manuscripts.

### AI Integration
- **Model**: Gemini 3 Pro Preview, accessed directly via Google's Gemini API.
- **Configuration**: `thinkingBudget: 2048`, `temperature: 1.0`, `topP: 0.95`.
- **Client Setup**: `@google/genai` SDK using `GEMINI_API_KEY`.

### Build System
- **Development**: `tsx` for hot reload.
- **Production**: `esbuild` for server, Vite for client.

### Feature Specifications
- **Optimized Pipeline**: Streamlined re-edit process, reduced token consumption.
- **Manuscript Expansion/Reordering**: Agents for expanding chapters, inserting new ones, and reordering chapters for narrative flow. Includes automatic internal header syncing.
- **Automatic Pause & Approval**: System pauses for user input on non-perfect evaluations. Requires a single score of 9+ with no critical issues for project approval.
- **Issue Tracking**: Issue hash tracking prevents re-reporting of resolved issues.
- **Enhanced Cancellation & Resume**: Immediate process cancellation and optimized project resumption from `awaiting_instructions`.
- **Translation & Literary Adaptation**: Reframed Translator agent for literary adaptation into 7 languages, focusing on publication-ready prose. Uses `editedContent` and consistent markdown utilities.
- **Continuity Validation & Constraints**: Immediate, pre-Editor validation for dead characters, ignored injuries, and location inconsistencies. Mandatory continuity constraints for the Ghostwriter and enhanced detection (e.g., pronoun checks for dead characters).
- **World Bible Enrichment**: Automatic update and enrichment of the World Bible with character states and narrative threads after each chapter, provided to Ghostwriter and Editor. Includes full-text sliding context window for Ghostwriter.
- **Author Notes System**: Users can add prioritized author instructions to the World Bible, injected into Ghostwriter and Editor prompts.
- **Cross-Chapter Anti-Repetition**: Explicit rules and context (up to 3 previous chapters) for Ghostwriter and Editor to prevent thematic and narrative repetition.
- **PWA Support**: Progressive Web App capabilities including `manifest.json`, service worker, and install-to-home-screen.

### Series Management (Complete Inter-Book Continuity System)
- **Centralized Completion Logic**: `finalizeCompletedProject()` helper ensures continuity snapshot generation and arc verification run on every completion path (8 total: generateNovel, resumeNovel zero-pending, resumeNovel with-pending, runFinalReviewOnly, extendNovel, regenerateTruncatedChapters, runContinuitySentinelForce passed, runContinuitySentinelForce with rewrites).
- **Automatic Continuity Snapshots**: `generateSeriesContinuitySnapshot()` extracts synopsis, character states, unresolved threads, and key events from completed chapters and saves them via `storage.createContinuitySnapshot`.
- **Automatic Arc Verification**: `runSeriesArcVerification()` runs ArcValidatorAgent after each book completes to verify milestone fulfillment and plot thread progress. Results stored in `arc_verifications` table.
- **Series-Aware Context Loading**: `loadSeriesThreadsAndEvents()` loads unresolved threads and key events from previous volumes only, filtering by `seriesOrder < currentVolume` to prevent future-book context leakage.
- **Final Reviewer Series Context**: Receives series milestones, plot threads, unresolved threads from prior books, and last-volume flag for thread closure enforcement.
- **Ghostwriter Series Constraints**: Series unresolved threads injected into enriched World Bible across all Ghostwriter paths: initial generation, resume, QA rewrites, extension, regeneration, and specific chapter rewrites.
- **Enriched World Bible Resilience**: `getEnrichedWorldBible()` includes series fields in early-return (empty characters) and error fallback paths, ensuring series context is never silently dropped.
- **Volume Ordering**: Architect series context sorts volumes by `seriesOrder` using `?? 999` for null values (unknown order sorts last, not first).
- **Manuscript Snapshot Filtering**: Imported manuscript snapshots also filtered by `seriesOrder < currentVolume`.

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
- **Google Gemini API**: `GEMINI_API_KEY` for `gemini-3-pro-preview` (text) and `gemini-2.5-flash-image` (image).

### Deployment & Database
- **PostgreSQL**: Database accessed via `DATABASE_URL`.
- **Drizzle Kit**: Used for database migrations.

### Key NPM Packages
- `@google/genai`: Google Gemini AI SDK.
- `drizzle-orm` / `drizzle-zod`: ORM and schema validation.
- `express`: Node.js web framework.
- `@tanstack/react-query`: React asynchronous state management.
- `wouter`: React routing library.
- Radix UI primitives: Accessible UI components.
