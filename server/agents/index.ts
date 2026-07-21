export { BaseAgent, type AgentResponse, type AgentConfig, type TokenUsage } from "./base-agent";
export { registerProjectAbortController, cancelProject, isProjectCancelled, isProjectCancelledFromDb, clearProjectAbortController } from "./base-agent";
export { ArchitectAgent } from "./architect";
export { GhostwriterAgent } from "./ghostwriter";
export { EditorAgent, type EditorResult } from "./editor";
export { CopyEditorAgent, type CopyEditorResult } from "./copyeditor";
export { FinalReviewerAgent, type FinalReviewerResult, type FinalReviewIssue } from "./final-reviewer";
export { ContinuitySentinelAgent, type ContinuitySentinelResult, type ContinuityIssue } from "./continuity-sentinel";
export { VoiceRhythmAuditorAgent, type VoiceRhythmAuditorResult, type VoiceRhythmIssue } from "./voice-rhythm-auditor";
export { SemanticRepetitionDetectorAgent, type SemanticRepetitionResult, type RepetitionCluster } from "./semantic-repetition-detector";
export { ArcValidatorAgent, type ArcValidatorResult, type MilestoneVerification, type ThreadProgression } from "./arc-validator";
export { SeriesThreadFixerAgent, type ThreadFixerResult, type ThreadFix } from "./series-thread-fixer";
export { ItalianReviewerAgent, type ItalianReviewResult } from "./italian-reviewer";
export { ProofreaderAgent, type ProofreaderResult, type ProofreaderChange } from "./proofreader";
export { EditorialNotesParser, type EditorialInstruction, type EditorialNotesParseResult } from "./editorial-notes-parser";
export { SurgicalPatcherAgent, type PatchOperation, type SurgicalPatchResult, type AppliedPatchReport } from "./surgical-patcher";
export { WorldBibleArbiterAgent, type WorldBiblePatch, type WorldBibleArbiterResult, type WorldBibleSection } from "./world-bible-arbiter";
export { OriginalityCriticAgent, type OriginalityCriticResult, type OriginalityCluster, type OriginalityClusterType } from "./originality-critic";
// [Fix147][Puerta 1] Editor de Desarrollo / Regla de Agencia (juez del PLAN).
export { AgencyCriticAgent, getProtagonistName, detectExternalRescueSmell, stampAgencyMandate, type AgencyCriticResult, type AgencyProblem, type AgencyProblemType } from "./agency-critic";
// [Fix148][Puerta 4] Editor de Prosa de Agencia (juez de la PROSA escrita).
export { ProseAgencyEditorAgent, type ProseAgencyEditorResult, type ProseAgencyProblem, type ProseAgencyProblemType } from "./prose-agency-editor";
export { FinalAxisReaderAgent, type FinalAxisReaderResult, type FinalAxisProblem, type FinalAxisEje, type FinalAxisEjes } from "./final-axis-reader";
// [Fix156][Puerta Acto 2] Editor de Ritmo del Acto 2 (juez de la PROSA del tramo central, mid-novela).
export { Act2PacingEditorAgent, type Act2PacingEditorResult, type Act2Problem, type Act2ProblemType } from "./act2-pacing-editor";
export { TenseConsistencyJudgeAgent, type TenseConsistencyResult, type TenseChapterVerdict, type DeviatedChapter, type DetectedTense } from "./tense-consistency-judge";
// [Fix150][Puerta 0] Director Creativo: forja el concepto rector antes de generar.
export { ConceptForgeAgent, type ConceptForgeResult, type ConceptForgeInput } from "./concept-forge";
// [Fix161] Director de Doblaje: anota expresividad en linea (Fish Audio S2) para audiolibros.
export { TtsExpressionTaggerAgent, type ExpressionTagEntry, type ExpressionTaggerInput, type ExpressionTaggerOutput } from "./tts-expression-tagger";
export { HolisticReviewerAgent, type HolisticReviewerResult } from "./holistic-reviewer";
export { BetaReaderAgent, type BetaReaderResult } from "./beta-reader";
export { OutlineBetaReaderAgent, type OutlineBetaReaderResult, type OutlineBetaProblem, type OutlineBetaProblemType } from "./outline-beta-reader";
export { PlotIntegrityAuditorAgent, computePlotIntegrityMetrics, type PlotIntegrityResult, type PlotIntegrityIssue, type PlotIntegrityInput, type PlotIntegrityComputedMetrics } from "./plot-integrity-auditor";
// [Fix110] Auditor de World Bible entre Fase 1 y Fase 2 del Arquitecto.
export { WorldBibleAuditorAgent, enforceDensityFloors, type WorldBibleAuditResult, type WorldBibleAuditProblem, type WorldBibleAuditArea, type WorldBibleAuditInput } from "./world-bible-auditor";
// [Fix92] Auditor estructural determinista (forma/ledger/dosificación).
export { runArchitectStructuralAudits, autopatchDecorativeSetupCapitulos, FORMA_ESCENA_VALORES, CATEGORIA_INFO_VALORES, MODO_EXTRACCION_VALORES, type StructuralAuditResult, type StructuralAuditProblem, type StructuralAuditCoverage, type SeriesAuditContext, type FormaEscena, type CategoriaInfoNueva, type ModoExtraccion } from "./scene-shape-auditor";
export { MidNovelRepairPlannerAgent, type MidNovelRepairPlannerResult, type MidNovelOpenFinding } from "./mid-novel-repair-planner";
