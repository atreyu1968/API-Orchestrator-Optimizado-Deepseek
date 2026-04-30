import { storage } from "./storage";
import { 
  ArchitectAgent, 
  GhostwriterAgent, 
  EditorAgent, 
  CopyEditorAgent, 
  FinalReviewerAgent, 
  ContinuitySentinelAgent,
  VoiceRhythmAuditorAgent,
  SemanticRepetitionDetectorAgent,
  ProofreaderAgent,
  EditorialNotesParser,
  SurgicalPatcherAgent,
  WorldBibleArbiterAgent,
  OriginalityCriticAgent,
  HolisticReviewerAgent,
  type HolisticReviewerResult,
  type EditorialInstruction,
  type EditorialNotesParseResult,
  type WorldBiblePatch,
  isProjectCancelledFromDb,
  registerProjectAbortController,
  clearProjectAbortController,
  type EditorResult, 
  type FinalReviewerResult,
  type ContinuitySentinelResult,
  type VoiceRhythmAuditorResult,
  type SemanticRepetitionResult
} from "./agents";
import type { TokenUsage } from "./agents/base-agent";
import type { FinalReviewIssue } from "./agents/final-reviewer";
import type { Project, WorldBible, Chapter, PlotOutline, Character, WorldRule, TimelineEvent } from "@shared/schema";
import { ensureChapterNumbers } from "./utils/extract-chapters";
import { extractStyleDirectives } from "./utils/style-directives";
import { calculateRealCost } from "./cost-calculator";

interface OrchestratorCallbacks {
  onAgentStatus: (role: string, status: string, message?: string) => void;
  onChapterComplete: (chapterNumber: number, wordCount: number, chapterTitle: string) => void;
  onChapterRewrite: (chapterNumber: number, chapterTitle: string, currentIndex: number, totalToRewrite: number, reason: string) => void;
  onChapterStatusChange: (chapterNumber: number, status: string) => void;
  onProjectComplete: () => void;
  onError: (error: string) => void;
}

interface ParsedWorldBible {
  world_bible: {
    personajes: any[];
    lugares: any[];
    reglas_lore: any[];
    lexico_historico?: {
      epoca?: string;
      registro_linguistico?: string;
      vocabulario_epoca_autorizado?: string[];
      terminos_anacronicos_prohibidos?: string[];
      notas_voz_historica?: string;
    } | null;
    [key: string]: any;
  };
  escaleta_capitulos: any[];
  premisa?: string;
  estructura_tres_actos?: any;
}

interface SectionData {
  numero: number;
  titulo: string;
  cronologia: string;
  ubicacion: string;
  elenco_presente: string[];
  objetivo_narrativo: string;
  beats: string[];
  continuidad_salida?: string;
  continuidad_entrada?: string;
  tipo?: "prologue" | "chapter" | "epilogue" | "author_note" | "book_prologue" | "book_epilogue";
  funcion_estructural?: string;
  informacion_nueva?: string;
  pregunta_dramatica?: string;
  conflicto_central?: {
    tipo?: string;
    descripcion?: string;
    stakes?: string;
  };
  giro_emocional?: {
    emocion_inicio?: string;
    emocion_final?: string;
  };
  recursos_literarios_sugeridos?: string[];
  tono_especifico?: string;
  prohibiciones_este_capitulo?: string[];
  arcos_que_avanza?: Array<{
    arco?: string;
    de?: string;
    a?: string;
  }>;
  // Bookbox-specific fields
  bookNumber?: number;
  bookTitle?: string;
  riesgos_de_verosimilitud?: {
    posibles_deus_ex_machina?: string[];
    setup_requerido?: string[];
    justificacion_causal?: string;
  };
}

function narrativeSortOrder(chapterNumber: number): number {
  if (chapterNumber === 0) return -1000;
  if (chapterNumber === -1) return 9000;
  if (chapterNumber === -2) return 9001;
  return chapterNumber;
}

function sortChaptersNarrative<T extends { chapterNumber: number }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => narrativeSortOrder(a.chapterNumber) - narrativeSortOrder(b.chapterNumber));
}

export class Orchestrator {
  private architect = new ArchitectAgent();
  private originalityCritic = new OriginalityCriticAgent();
  private ghostwriter = new GhostwriterAgent();
  private editor = new EditorAgent();
  private copyeditor = new CopyEditorAgent();
  private finalReviewer = new FinalReviewerAgent();
  private continuitySentinel = new ContinuitySentinelAgent();
  private proofreader = new ProofreaderAgent();
  private voiceRhythmAuditor = new VoiceRhythmAuditorAgent();
  private semanticRepetitionDetector = new SemanticRepetitionDetectorAgent();
  private editorialNotesParser = new EditorialNotesParser();
  private surgicalPatcher = new SurgicalPatcherAgent();
  private wbArbiter = new WorldBibleArbiterAgent();
  private holisticReviewer = new HolisticReviewerAgent();
  private callbacks: OrchestratorCallbacks;
  private maxRefinementLoops = 4;
  private maxFinalReviewCycles = 10;
  private minAcceptableScore = 9; // Minimum score required for final manuscript approval
  private requiredConsecutiveHighScores = 2; // Must achieve 9+ this many times in a row
  private continuityCheckpointInterval = 5;
  private currentProjectGenre = "";
  private chaptersRewrittenInCurrentCycle = 0;
  
  private cumulativeTokens = {
    inputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
  };

  // Cancellation flag set by the queue manager when this orchestrator instance is
  // being abandoned (e.g. heartbeat auto-recovery is starting a fresh one).
  // Long-running loops (architect retries, section iteration) check this flag at
  // safe checkpoints so the orphan instance unwinds quietly instead of writing
  // log entries to the same project as the new live orchestrator.
  private aborted = false;

  public abort(reason?: string): void {
    if (this.aborted) return;
    this.aborted = true;
    if (reason) {
      console.log(`[Orchestrator] abort() called: ${reason}`);
    } else {
      console.log(`[Orchestrator] abort() called`);
    }
  }

  public isAborted(): boolean {
    return this.aborted;
  }

  private hasHardRejectViolations(editorResultObj: any): boolean {
    if (!editorResultObj) return false;
    const r = editorResultObj;
    const continuityErrors = Array.isArray(r.errores_continuidad) ? r.errores_continuidad.length : 0;
    const knowledgeLeaks = Array.isArray(r.filtracion_conocimiento) ? r.filtracion_conocimiento.length : 0;
    const hasCriticalContinuityError = continuityErrors > 0 || knowledgeLeaks > 0;
    const hasPlotRepetition = Array.isArray(r.repeticiones_trama) && r.repeticiones_trama.length >= 3;
    const hasObjectInconsistency = Array.isArray(r.inconsistencias_objetos) && r.inconsistencias_objetos.length >= 2;
    return hasCriticalContinuityError || hasPlotRepetition || hasObjectInconsistency;
  }

  private enforceApprovalLogic(editorResult: any): void {
    if (!editorResult?.result) return;
    const r = editorResult.result;
    const score = r.puntuacion || 0;
    const continuityErrors = Array.isArray(r.errores_continuidad) ? r.errores_continuidad.length : 0;
    const knowledgeLeaks = Array.isArray(r.filtracion_conocimiento) ? r.filtracion_conocimiento.length : 0;
    const hasCriticalContinuityError = continuityErrors > 0 || knowledgeLeaks > 0;
    
    const hasPlotRepetition = Array.isArray(r.repeticiones_trama) && r.repeticiones_trama.length >= 3;
    const hasObjectInconsistency = Array.isArray(r.inconsistencias_objetos) && r.inconsistencias_objetos.length >= 2;
    const hasHardRejectCondition = hasCriticalContinuityError || hasPlotRepetition || hasObjectInconsistency;

    if (score >= 9) {
      if (hasHardRejectCondition) {
        const reasons: string[] = [];
        if (hasCriticalContinuityError) reasons.push(`${continuityErrors} errores de continuidad, ${knowledgeLeaks} filtraciones`);
        if (hasPlotRepetition) reasons.push(`${r.repeticiones_trama.length} repeticiones de trama`);
        if (hasObjectInconsistency) reasons.push(`${r.inconsistencias_objetos.length} inconsistencias de objetos`);
        console.log(`[Orchestrator] OVERRIDE: Score ${score}/10 ≥ 9 — aprobado=true a pesar de violaciones (${reasons.join(", ")}). Confianza alta en puntuación; los issues quedan anotados para auditoría/Centinela posterior.`);
      }
      r.aprobado = true;
      return;
    }

    if (hasHardRejectCondition && r.aprobado) {
      const reasons: string[] = [];
      if (hasCriticalContinuityError) reasons.push(`${continuityErrors} errores de continuidad, ${knowledgeLeaks} filtraciones`);
      if (hasPlotRepetition) reasons.push(`${r.repeticiones_trama.length} repeticiones de trama`);
      if (hasObjectInconsistency) reasons.push(`${r.inconsistencias_objetos.length} inconsistencias de objetos`);
      console.log(`[Orchestrator] OVERRIDE: Forcing aprobado=false despite score ${score}/10 due to: ${reasons.join(", ")}`);
      r.aprobado = false;
      return;
    }

    if (score >= 8 && !hasHardRejectCondition && !r.aprobado) {
      console.log(`[Orchestrator] OVERRIDE: Editor gave ${score}/10 but aprobado=false with no critical issues. Forcing aprobado=true.`);
      r.aprobado = true;
    }
    if (score < 8 && r.aprobado) {
      console.log(`[Orchestrator] OVERRIDE: Editor gave ${score}/10 but aprobado=true. Forcing aprobado=false (threshold is 8).`);
      r.aprobado = false;
    }
  }

  /**
   * Calculate per-chapter word count target from total novel target
   * @param totalNovelTarget - Total word count for the entire novel (e.g., 90000)
   * @param totalChapters - Number of chapters in the novel
   * @param defaultPerChapter - Default per-chapter minimum if no total is set (default: 2500)
   * @returns Per-chapter word count target
   */
  private calculatePerChapterTarget(totalNovelTarget: number | null | undefined, totalChapters: number, defaultPerChapter: number = 2500): number {
    if (!totalNovelTarget || totalNovelTarget <= 0) {
      return defaultPerChapter; // Use default if no target set
    }
    if (totalChapters <= 0) {
      return defaultPerChapter;
    }
    // Calculate per-chapter target from total / chapters
    const calculated = Math.round(totalNovelTarget / totalChapters);
    // Ensure minimum reasonable chapter length (at least 1500 words)
    return Math.max(calculated, 1500);
  }

  // NOTA: La antigua tabla HISTORICAL_VOCABULARY (hardcoded por género) se
  // eliminó en v6.6 porque generaba falsos positivos masivos: marcaba como
  // anacrónicas palabras universales como "reloj", "minuto", "segundo",
  // "carbono", "metrónomo", "estrés", etc., independientemente de la época
  // real del proyecto. La fuente única de verdad ahora es
  // worldBibleData.world_bible.lexico_historico, que el arquitecto define
  // explícitamente al inicio de cada novela y se propaga a todos los agentes
  // (editor, copyeditor, ghostwriter, surgeon, final reviewer).

  constructor(callbacks: OrchestratorCallbacks) {
    this.callbacks = callbacks;
  }
  
  private async extractForbiddenNames(currentSeriesId: number | null | undefined): Promise<string[]> {
    return extractForbiddenNames(currentSeriesId);
  }

  private async trackTokenUsage(
    projectId: number, 
    tokenUsage?: TokenUsage,
    agentName?: string,
    model?: string,
    chapterNumber?: number,
    operation?: string
  ): Promise<void> {
    if (!tokenUsage) return;
    
    this.cumulativeTokens.inputTokens += tokenUsage.inputTokens;
    this.cumulativeTokens.outputTokens += tokenUsage.outputTokens;
    this.cumulativeTokens.thinkingTokens += tokenUsage.thinkingTokens;
    
    await storage.updateProject(projectId, {
      totalInputTokens: this.cumulativeTokens.inputTokens,
      totalOutputTokens: this.cumulativeTokens.outputTokens,
      totalThinkingTokens: this.cumulativeTokens.thinkingTokens,
    });
    
    // Register detailed AI usage event for cost tracking
    if (agentName && model) {
      const costs = this.calculateTokenCosts(model, tokenUsage);
      await storage.createAiUsageEvent({
        projectId,
        agentName,
        model,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        thinkingTokens: tokenUsage.thinkingTokens,
        inputCostUsd: costs.inputCost.toFixed(6),
        outputCostUsd: costs.outputCost.toFixed(6),
        totalCostUsd: costs.totalCost.toFixed(6),
        chapterNumber: chapterNumber || null,
        operation: operation || null,
      });
    }
  }
  
  private calculateTokenCosts(model: string, tokenUsage: TokenUsage): { inputCost: number; outputCost: number; totalCost: number } {
    // Delegate to centralized cost calculator (single source of truth).
    // Keep legacy behavior of bundling thinking cost into outputCost so the
    // ai_usage_events.outputCostUsd column matches totalCost - inputCost.
    const c = calculateRealCost(
      model,
      tokenUsage.inputTokens,
      tokenUsage.outputTokens,
      tokenUsage.thinkingTokens,
    );
    return {
      inputCost: c.inputCost,
      outputCost: c.outputCost + c.thinkingCost,
      totalCost: c.totalCost,
    };
  }
  
  private resetTokenTracking(): void {
    this.cumulativeTokens = {
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
    };
  }

  private validateImmediateContinuity(
    chapterContent: string,
    characterStates: Map<string, { alive: boolean; location: string; injuries: string[]; lastSeen: number }>,
    worldBible: any
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const contentLower = chapterContent.toLowerCase();

    characterStates.forEach((state, name) => {
      if (!name || typeof name !== 'string' || name.trim().length === 0) return;
      
      const nameLower = name.toLowerCase();
      const nameInContent = contentLower.includes(nameLower);

      if (!state.alive && nameInContent) {
        const actionVerbs = [
          "dijo", "habló", "respondió", "caminó", "corrió", "miró",
          "sonrió", "asintió", "se levantó", "susurró", "gritó",
          "preguntó", "ordenó", "murmuró", "rió", "lloró",
          "agarró", "tomó", "lanzó", "empujó", "tiró",
          "entró", "salió", "subió", "bajó", "se sentó",
          "negó", "afirmó", "pensó", "sintió", "observó",
        ];

        const actionPatterns = [
          ...actionVerbs.map(v => `${nameLower} ${v}`),
          ...actionVerbs.map(v => `${nameLower} se ${v}`),
          `—dijo ${nameLower}`, `—respondió ${nameLower}`, `—exclamó ${nameLower}`,
          `—murmuró ${nameLower}`, `—gritó ${nameLower}`, `—susurró ${nameLower}`,
          `—preguntó ${nameLower}`, `—ordenó ${nameLower}`,
        ];
        
        const deadButFlashbackPatterns = [
          "recordó a " + nameLower, "recuerdo de " + nameLower,
          "memoria de " + nameLower, "fantasma de " + nameLower,
          "espíritu de " + nameLower, "sueño con " + nameLower,
          "la voz de " + nameLower + " resonó", "imagen de " + nameLower,
        ];
        
        const isFlashbackContext = deadButFlashbackPatterns.some(p => contentLower.includes(p));
        
        if (!isFlashbackContext) {
          for (const pattern of actionPatterns) {
            if (contentLower.includes(pattern)) {
              violations.push(
                `PERSONAJE MUERTO ACTUANDO: "${name}" murió en el Capítulo ${state.lastSeen} pero aparece realizando acciones en este capítulo. Buscar y eliminar: "${pattern}"`
              );
              break;
            }
          }
        }
      }

      if (state.alive && state.injuries.length > 0 && nameInContent) {
        let injuryMentioned = false;
        for (const injury of state.injuries) {
          if (contentLower.includes(injury.toLowerCase())) {
            injuryMentioned = true;
            break;
          }
        }
        
        const physicalVerbs = [
          "corrió", "luchó", "saltó", "golpeó", "trepó",
          "escaló", "nadó", "peleó", "atacó", "esquivó",
          "cargó", "levantó", "arrastró", "empujó",
        ];
        
        const hasPhysicalAction = physicalVerbs.some(v => 
          contentLower.includes(`${nameLower} ${v}`) || contentLower.includes(`${nameLower} se ${v}`)
        );
        
        if (hasPhysicalAction && !injuryMentioned) {
          violations.push(
            `HERIDA IGNORADA: "${name}" tiene heridas [${state.injuries.join(", ")}] que deberían afectar sus acciones físicas pero no se mencionan.`
          );
        }
      }
    });

    return {
      valid: violations.length === 0,
      violations
    };
  }

  private extractScenePatternSummary(chapter: Chapter, state: any): string | null {
    const content = ((chapter as any).editedContent || chapter.originalContent || (chapter as any).content || "") as string;
    if (!content || content.length < 200) return null;
    
    const patterns: string[] = [];
    
    const first300 = content.substring(0, 300).toLowerCase();
    if (first300.match(/despert[óo]|abri[óo] los ojos|amaneció|la luz del/)) patterns.push("apertura:despertar");
    else if (first300.match(/corr[ií]a|huy[óo]|escapab|persegu/)) patterns.push("apertura:acción/persecución");
    else if (first300.match(/recordab|memori|soñ[óo]|flashback/)) patterns.push("apertura:recuerdo/flashback");
    else if (first300.match(/silencio|oscuridad|noche|sombra/)) patterns.push("apertura:atmosférica");
    else if (first300.match(/—[^—]+—|dij[oe]|pregunt[óo]/)) patterns.push("apertura:diálogo");
    
    const last500 = content.substring(content.length - 500).toLowerCase();
    if (last500.match(/pero entonces|de repente|sin embargo.*final|y entonces/)) patterns.push("cierre:cliffhanger");
    else if (last500.match(/cerr[óo] los ojos|durmi[óo]|descansar/)) patterns.push("cierre:descanso");
    else if (last500.match(/decisi[óo]n|decid[ií]|jurament|prometi/)) patterns.push("cierre:decisión");
    else if (last500.match(/revel[óo]|descubri[óo]|secret[oa]|verdad/)) patterns.push("cierre:revelación");
    
    if (content.match(/carta|nota|mensaje|documento|pergamino/gi)) {
      const matches = content.match(/carta|nota|mensaje|documento|pergamino/gi);
      if (matches && matches.length >= 2) patterns.push("mecanismo:descubrimiento-por-documento");
    }
    if (content.match(/escuch[óo].*conversaci[óo]n|espiar|escondid[oa].*o[iyí]/i)) patterns.push("mecanismo:espionaje/escuchar-conversación");
    if (content.match(/justo a tiempo|en el último momento|apareci[óo].*salvar/i)) patterns.push("mecanismo:rescate-último-momento");
    if (content.match(/traicion[óo]|traici[óo]n|lo engañ[óo]/i)) patterns.push("mecanismo:traición");
    if (content.match(/confes[óo]|contar.*verdad|revel[óo].*secret/i)) patterns.push("mecanismo:confesión/revelación");
    
    if (state?.scenePatterns) {
      const sp = state.scenePatterns;
      if (sp.openingType) patterns.push(`apertura:${sp.openingType}`);
      if (sp.closingType) patterns.push(`cierre:${sp.closingType}`);
      if (sp.revelationMechanism) patterns.push(`mecanismo:${sp.revelationMechanism}`);
    }
    
    if (patterns.length === 0) return null;
    
    const uniquePatterns = [...new Set(patterns)];
    return `Cap ${chapter.chapterNumber}: [${uniquePatterns.join(", ")}]`;
  }

  private buildSlidingContextWindow(
    completedChapters: Chapter[],
    currentChapterIndex: number,
    allSections: SectionData[]
  ): { context: string; characterStates: Map<string, { alive: boolean; location: string; injuries: string[]; lastSeen: number }> } {
    const emptyResult = { context: "", characterStates: new Map() };
    if (completedChapters.length === 0) return emptyResult;

    const sortedChapters = [...completedChapters]
      .filter(c => c.status === "completed" && c.content)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    if (sortedChapters.length === 0) return emptyResult;

    const contextParts: string[] = [];
    const FULL_CONTEXT_CHAPTERS = 1;
    const SUMMARY_CONTEXT_CHAPTERS = 4;

    const characterStates: Map<string, { alive: boolean; location: string; injuries: string[]; lastSeen: number }> = new Map();
    const characterItems: Map<string, string[]> = new Map();
    const characterKnowledge: Map<string, string[]> = new Map();
    const keyEvents: string[] = [];

    for (const chapter of sortedChapters) {
      const state = chapter.continuityState as any;
      if (state?.character_states || state?.characterStates) {
        const chars = state.character_states || Object.entries(state.characterStates || {}).map(([name, data]: [string, any]) => ({ name, ...data }));
        for (const char of chars) {
          const charName = char.name || char.personaje;
          if (!charName) continue;
          characterStates.set(charName, {
            alive: char.alive !== false && char.status !== "dead" && char.estado !== "muerto",
            location: char.location || char.ubicacion || "desconocida",
            injuries: char.injuries || char.heridas || [],
            lastSeen: chapter.chapterNumber,
          });
          const items = char.hasItems || char.objetos || char.items || [];
          if (items.length > 0) {
            characterItems.set(charName, items);
          }
          const knowledge = char.knowledgeGained || char.conocimiento || [];
          if (knowledge.length > 0) {
            const existing = characterKnowledge.get(charName) || [];
            characterKnowledge.set(charName, [...existing, ...knowledge]);
          }
        }
      }
      if (state?.key_events || state?.keyReveals) {
        const events = state.key_events || state.keyReveals || [];
        keyEvents.push(...events.slice(-2));
      }
      if (state?.keyDecisions) {
        const decisions = state.keyDecisions || [];
        for (const decision of decisions) {
          if (decision && typeof decision === 'string') {
            keyEvents.push(`[DECISIÓN Cap ${chapter.chapterNumber}] ${decision}`);
          }
        }
      }
    }

    const mandatoryConstraints: string[] = [];
    characterStates.forEach((state, name) => {
      if (!state.alive) {
        mandatoryConstraints.push(`⛔ ${name}: MUERTO (Cap ${state.lastSeen}) - NO puede aparecer activo ni hablar`);
      } else {
        if (state.injuries.length > 0) {
          mandatoryConstraints.push(`⚠️ ${name}: Heridas activas [${state.injuries.join(", ")}] - DEBEN afectar sus acciones`);
        }
        if (state.location) {
          mandatoryConstraints.push(`📍 ${name}: Última ubicación = ${state.location}`);
        }
        const items = characterItems.get(name);
        if (items && items.length > 0) {
          mandatoryConstraints.push(`🎒 ${name}: Posee [${items.join(", ")}] - NO usar objetos que no tiene`);
        }
      }
    });

    const knowledgeConstraints: string[] = [];
    characterKnowledge.forEach((knowledge, name) => {
      if (characterStates.get(name)?.alive && knowledge.length > 0) {
        const uniqueKnowledge = Array.from(new Set(knowledge)).slice(-5);
        knowledgeConstraints.push(`🧠 ${name} SABE: [${uniqueKnowledge.join("; ")}] - SOLO puede actuar/hablar basándose en lo que sabe`);
      }
    });
    
    if (knowledgeConstraints.length > 0) {
      mandatoryConstraints.push(`\n🔒 CONOCIMIENTO DE PERSONAJES (NO filtrar información entre personajes):`);
      mandatoryConstraints.push(...knowledgeConstraints);
      mandatoryConstraints.push(`⛔ Un personaje NO PUEDE saber/decir algo que solo otro personaje descubrió`);
    }

    if (keyEvents.length > 0) {
      mandatoryConstraints.push(`\n📜 EVENTOS RECIENTES QUE DEBEN RESPETARSE:`);
      const recentEvents = keyEvents.slice(-8);
      recentEvents.forEach(event => {
        mandatoryConstraints.push(`  → ${event}`);
      });
      mandatoryConstraints.push(`\n🚫 ANTI-REPETICIÓN DE TRAMA: Los eventos listados arriba YA OCURRIERON.`);
      mandatoryConstraints.push(`  NO repitas escenas similares. NO reutilices los mismos patrones narrativos:`);
      mandatoryConstraints.push(`  - NO repitas descubrimientos del mismo tipo`);
      mandatoryConstraints.push(`  - NO repitas confrontaciones con la misma estructura`);
      mandatoryConstraints.push(`  - NO repitas revelaciones con el mismo mecanismo`);
      mandatoryConstraints.push(`  - Cada capítulo debe avanzar la trama con NUEVOS elementos`);
    }

    const recentScenePatterns: string[] = [];
    
    for (let i = sortedChapters.length - 1; i >= 0; i--) {
      const chapter = sortedChapters[i];
      const distanceFromCurrent = sortedChapters.length - 1 - i;
      const state = chapter.continuityState as any;

      if (distanceFromCurrent < 6) {
        const sceneInfo = this.extractScenePatternSummary(chapter, state);
        if (sceneInfo) recentScenePatterns.push(sceneInfo);
      }

      if (distanceFromCurrent < FULL_CONTEXT_CHAPTERS) {
        const content = (chapter as any).editedContent || chapter.originalContent || chapter.content || "";
        const continuityState = chapter.continuityState 
          ? JSON.stringify(chapter.continuityState)
          : "";
        const truncatedContent = typeof content === 'string' && content.length > 5000
          ? content.substring(content.length - 5000)
          : content;
        contextParts.unshift(`
[CAPÍTULO ${chapter.chapterNumber} - ${chapter.title}] (TEXTO COMPLETO DEL CAPÍTULO ANTERIOR)
${truncatedContent || "(sin contenido)"}
Estado de continuidad: ${continuityState || "No disponible"}
`);
      } else if (distanceFromCurrent < FULL_CONTEXT_CHAPTERS + SUMMARY_CONTEXT_CHAPTERS) {
        const section = allSections.find(s => s.numero === chapter.chapterNumber);
        const chapterContent = (chapter as any).editedContent || chapter.originalContent || chapter.content || "";
        const contentExtract = typeof chapterContent === 'string' && chapterContent.length > 1500
          ? chapterContent.substring(0, 800) + "\n[...]\n" + chapterContent.substring(chapterContent.length - 700)
          : chapterContent;
        const planInfo = section 
          ? `Objetivo: ${section.objetivo_narrativo || "N/A"}. Ubicación: ${section.ubicacion || "N/A"}. Elenco: ${section.elenco_presente?.join(", ") || "N/A"}.`
          : "";
        
        contextParts.unshift(`[Cap ${chapter.chapterNumber}: ${chapter.title}] ${planInfo}\nExtracto: ${contentExtract || "N/A"}`);
      } else {
        contextParts.unshift(`[Cap ${chapter.chapterNumber}: ${chapter.title}]`);
      }
    }
    
    if (recentScenePatterns.length > 0) {
      mandatoryConstraints.push(`\n🔄 PATRONES NARRATIVOS YA USADOS (NO REPETIR):`);
      recentScenePatterns.forEach(pattern => {
        mandatoryConstraints.push(`  ${pattern}`);
      });
      mandatoryConstraints.push(`  ⛔ Usa ESTRUCTURAS DIFERENTES para las escenas de este capítulo`);
    }

    // Build the context with mandatory constraints at the top
    let context = `
═══════════════════════════════════════════════════════════════════
🚨🚨🚨 RESTRICCIONES DE CONTINUIDAD OBLIGATORIAS 🚨🚨🚨
═══════════════════════════════════════════════════════════════════
${mandatoryConstraints.length > 0 ? mandatoryConstraints.join("\n") : "Sin restricciones especiales"}

VIOLACIONES DE ESTAS RESTRICCIONES = RECHAZO AUTOMÁTICO DEL CAPÍTULO
═══════════════════════════════════════════════════════════════════

CONTEXTO DE CAPÍTULOS ANTERIORES:
${contextParts.join("\n")}
═══════════════════════════════════════════════════════════════════`;

    return { context, characterStates };
  }

  private buildPreviousChaptersContextForEditor(
    completedChapters: Chapter[],
    currentChapterNumber: number,
    maxChapters: number = 5
  ): string {
    const sorted = [...completedChapters]
      .filter(c => c.status === "completed" && c.chapterNumber < currentChapterNumber)
      .sort((a, b) => b.chapterNumber - a.chapterNumber)
      .slice(0, maxChapters);

    if (sorted.length === 0) return "";

    const parts: string[] = [];
    for (const ch of sorted.reverse()) {
      const content = ((ch as any).editedContent || ch.originalContent || ch.content || "") as string;
      const distanceFromCurrent = currentChapterNumber - ch.chapterNumber;
      const excerptSize = distanceFromCurrent <= 2 ? 5000 : 3000;
      const excerpt = content.length > excerptSize
        ? content.substring(0, Math.floor(excerptSize * 0.4)) + "\n[...]\n" + content.substring(content.length - Math.floor(excerptSize * 0.6))
        : content;
      parts.push(`--- Capítulo ${ch.chapterNumber}: ${ch.title} (${excerpt.length} caracteres) ---\n${excerpt}`);
    }
    return parts.join("\n\n");
  }

  async generateNovel(project: Project): Promise<void> {
    try {
      // Check if chapters already exist (recovery after crash)
      const existingChapters = await storage.getChaptersByProject(project.id);
      if (existingChapters.length > 0) {
        console.log(`[Orchestrator] Found ${existingChapters.length} existing chapters for project ${project.id}. Delegating to resumeNovel instead.`);
        return this.resumeNovel(project);
      }

      this.resetTokenTracking();
      this.currentProjectGenre = project.genre;
      await storage.updateProject(project.id, { status: "generating" });

      let styleGuideContent = "";
      let authorName = "";
      let extendedGuideContent = "";
      
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) {
          styleGuideContent = styleGuide.content;
        }
      }
      
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) {
          authorName = pseudonym.name;
        }
      }

      if ((project as any).extendedGuideId) {
        const extendedGuide = await storage.getExtendedGuide((project as any).extendedGuideId);
        if (extendedGuide) {
          extendedGuideContent = extendedGuide.content;
          console.log(`[Orchestrator] Using extended guide: "${extendedGuide.title}" (${extendedGuide.wordCount} words)`);
        }
      }

      let seriesContextContent = "";
      if (project.seriesId) {
        const seriesData = await storage.getSeries(project.seriesId);
        if (seriesData) {
          if (seriesData.parentSeriesId) {
            const parentSeries = await storage.getSeries(seriesData.parentSeriesId);
            if (parentSeries) {
              seriesContextContent += `\n\n═══════════════════════════════════════════════════════════════════
SPIN-OFF DE: "${parentSeries.title}"
PROTAGONISTA: ${seriesData.spinoffProtagonist || "No especificado"}
═══════════════════════════════════════════════════════════════════
Esta serie es un spin-off. El protagonista proviene de la serie "${parentSeries.title}".
${seriesData.spinoffContext ? `CONCEPTO: ${seriesData.spinoffContext}` : ""}
Los eventos de la serie original son canónicos y no pueden contradecirse.
═══════════════════════════════════════════════════════════════════\n`;
              console.log(`[Orchestrator] Spin-off of "${parentSeries.title}", protagonist: ${seriesData.spinoffProtagonist}`);
            }
          }
          
          if (seriesData.seriesGuide) {
            seriesContextContent += `\n\n═══════════════════════════════════════════════════════════════════
GUÍA DE LA SERIE: "${seriesData.title}"
═══════════════════════════════════════════════════════════════════
${seriesData.seriesGuide}
═══════════════════════════════════════════════════════════════════\n`;
            console.log(`[Orchestrator] Using series guide for "${seriesData.title}" (${seriesData.seriesGuide.split(/\s+/).length} words)`);
          }

          const currentOrder = project.seriesOrder || 1;
          const isPrequel = (project as any).projectSubtype === "prequel";
          const fullContinuity = await storage.getSeriesFullContinuity(project.seriesId);
          const seriesProjectsForCtx = await storage.getProjectsBySeries(project.seriesId);
          const previousVolumes = fullContinuity.projectSnapshots.filter(s => {
            if (s.projectId === project.id) return false;
            const matchingProject = seriesProjectsForCtx.find(p => p.id === s.projectId);
            if (isPrequel) return true;
            return (matchingProject?.seriesOrder || 999) < currentOrder;
          });
          const manuscriptSnapshots = fullContinuity.manuscriptSnapshots.filter(
            ms => {
              if (isPrequel) return true;
              return (ms.seriesOrder || 999) < currentOrder;
            }
          );
          
          const allSeriesManuscripts = await storage.getImportedManuscriptsBySeries(project.seriesId);
          const manuscriptsWithoutAnalysis = allSeriesManuscripts.filter(m => !m.continuitySnapshot);
          
          if (manuscriptsWithoutAnalysis.length > 0) {
            console.log(`[Orchestrator] WARNING: ${manuscriptsWithoutAnalysis.length} imported manuscript(s) in series without continuity analysis: ${manuscriptsWithoutAnalysis.map(m => `"${m.title}"`).join(", ")}`);
          }

          if (isPrequel) {
            seriesContextContent += `\n═══════════════════════════════════════════════════════════════════
⚠️ ESTE PROYECTO ES UNA PRECUELA DE LA SERIE
═══════════════════════════════════════════════════════════════════
Esta novela ocurre ANTES cronológicamente de todos los volúmenes existentes.

REGLAS PARA LA PRECUELA:
1. CONOCES EL FUTURO: Los volúmenes siguientes ya existen. Debes plantar semillas y orígenes de los eventos futuros.
2. NO CONTRADIGAS: Nada de lo que escribas puede contradecir los hechos establecidos en los volúmenes posteriores.
3. SIEMBRA: Introduce elementos, relaciones y conflictos que el lector reconocerá cuando lea los volúmenes siguientes.
4. AUTONOMÍA: La precuela debe funcionar como novela independiente — el lector no necesita haber leído los otros libros para disfrutarla.
5. PERSONAJES: Los personajes que aparecen en volúmenes posteriores deben ser más jóvenes/inexpertos. Respeta su evolución futura.
6. REVELACIONES: NO reveles secretos que se descubren en volúmenes posteriores. Puedes insinuarlos pero no exponerlos.
7. CONSISTENCIA: Lugares, reglas del mundo, tecnología, magia — todo debe ser coherente con lo establecido después.
═══════════════════════════════════════════════════════════════════\n`;
            console.log(`[Orchestrator] PREQUEL MODE: Loading ALL volumes as future context`);
          }

          const totalPreviousVolumes = previousVolumes.length + manuscriptSnapshots.length + manuscriptsWithoutAnalysis.length;
          
          if (totalPreviousVolumes > 0) {
            const volumeLabel = isPrequel ? "VOLÚMENES POSTERIORES (FUTURO)" : "VOLÚMENES ANTERIORES";
            seriesContextContent += `\n═══════════════════════════════════════════════════════════════════
${volumeLabel} DE LA SERIE (${totalPreviousVolumes} libros)
═══════════════════════════════════════════════════════════════════\n`;
            
            const allVolumes: Array<{ order: number | null; content: string }> = [];
            
            const seriesProjects = await storage.getProjectsBySeries(project.seriesId);
            for (const snapshot of previousVolumes) {
              const matchingProject = seriesProjects.find(p => p.id === snapshot.projectId);
              allVolumes.push({
                order: matchingProject?.seriesOrder ?? null,
                content: `
--- VOLUMEN ${matchingProject?.seriesOrder || "?"}: "${matchingProject?.title || `Project ${snapshot.projectId}`}" (AI) ---
Sinopsis: ${snapshot.synopsis || "No disponible"}
Estado de personajes: ${JSON.stringify(snapshot.characterStates)}
Hilos no resueltos: ${JSON.stringify(snapshot.unresolvedThreads)}
Eventos clave: ${JSON.stringify(snapshot.keyEvents)}
───────────────────────────────────────────────────────────────────\n`
              });
            }
            
            for (const ms of manuscriptSnapshots) {
              const snapshot = ms.snapshot;
              allVolumes.push({
                order: ms.seriesOrder,
                content: `
--- VOLUMEN ${ms.seriesOrder || "?"}: "${ms.title}" (Manuscrito Importado - Análisis Completo) ---
Sinopsis: ${snapshot?.synopsis || "No disponible"}
Estado de personajes: ${JSON.stringify(snapshot?.characterStates || [])}
Hilos no resueltos: ${JSON.stringify(snapshot?.unresolvedThreads || [])}
Ganchos de serie: ${JSON.stringify(snapshot?.seriesHooks || [])}
Eventos clave: ${JSON.stringify(snapshot?.keyEvents || [])}
───────────────────────────────────────────────────────────────────\n`
              });
            }
            
            for (const unanalyzedMs of manuscriptsWithoutAnalysis) {
              const chapters = await storage.getImportedChaptersByManuscript(unanalyzedMs.id);
              const chapterSummaries = chapters.slice(0, 5).map(ch => {
                const content = ch.editedContent || ch.originalContent;
                const preview = content.length > 500 ? content.substring(0, 500) + "..." : content;
                return `Cap ${ch.chapterNumber}: ${preview}`;
              }).join("\n\n");
              
              allVolumes.push({
                order: unanalyzedMs.seriesOrder,
                content: `
--- VOLUMEN ${unanalyzedMs.seriesOrder || "?"}: "${unanalyzedMs.title}" (Manuscrito Importado - Sin Análisis Detallado) ---
NOTA: Este manuscrito no tiene análisis de continuidad completo. Extractos de los primeros capítulos:

${chapterSummaries || "Sin capítulos disponibles"}

(Se recomienda ejecutar el análisis de continuidad para obtener información detallada)
───────────────────────────────────────────────────────────────────\n`
              });
            }
            
            allVolumes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
            for (const vol of allVolumes) {
              seriesContextContent += vol.content;
            }
            
            console.log(`[Orchestrator] Loaded ${previousVolumes.length} AI project snapshots, ${manuscriptSnapshots.length} analyzed manuscripts, and ${manuscriptsWithoutAnalysis.length} unanalyzed manuscripts for series continuity`);
          }
        }
      }

      const forbiddenNames = await this.extractForbiddenNames(project.seriesId);
      if (forbiddenNames.length > 0) {
        console.log(`[Orchestrator] Nombres prohibidos (${forbiddenNames.length}): ${forbiddenNames.slice(0, 20).join(", ")}${forbiddenNames.length > 20 ? "..." : ""}`);
      }

      const effectivePremise = extendedGuideContent || seriesContextContent
        ? `${project.premise || ""}${extendedGuideContent ? `\n\n--- GUÍA DE ESCRITURA EXTENDIDA ---\n${extendedGuideContent}` : ""}${seriesContextContent}`
        : (project.premise || "");

      const MAX_ARCHITECT_RETRIES = 3;
      let architectAttempt = 0;
      let architectResult: any = null;
      let worldBibleData: ParsedWorldBible | null = null;
      let lastArchitectError = "";

      while (architectAttempt < MAX_ARCHITECT_RETRIES) {
        if (this.aborted) {
          console.log(`[Orchestrator] Architect retry loop aborted before attempt ${architectAttempt + 1} (project ${project.id})`);
          return;
        }
        architectAttempt++;
        
        this.callbacks.onAgentStatus("architect", "thinking", 
          architectAttempt > 1 
            ? `El Arquitecto está reintentando (intento ${architectAttempt}/${MAX_ARCHITECT_RETRIES})...` 
            : "El Arquitecto está diseñando la estructura narrativa..."
        );
        
        try {
          architectResult = await this.architect.execute({
            title: project.title,
            premise: effectivePremise,
            genre: project.genre,
            tone: project.tone,
            chapterCount: project.chapterCount,
            hasPrologue: project.hasPrologue,
            hasEpilogue: project.hasEpilogue,
            hasAuthorNote: project.hasAuthorNote,
            architectInstructions: project.architectInstructions || undefined,
            kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
            forbiddenNames,
            projectId: project.id,
          });

          // Architect call may take up to 5 minutes; if a heartbeat watchdog
          // aborted us in the meantime, exit silently before logging any
          // failure or retry message that would corrupt the new orchestrator's
          // log stream for the same project.
          if (this.aborted) {
            console.log(`[Orchestrator] Aborted right after architect.execute returned (project ${project.id}, attempt ${architectAttempt}). Exiting silently.`);
            return;
          }

          await this.trackTokenUsage(project.id, architectResult.tokenUsage, "El Arquitecto", "deepseek-v4-flash", undefined, "world_bible");

          if (architectResult.error || architectResult.timedOut) {
            lastArchitectError = architectResult.error || "Timeout durante la generación del World Bible";
            console.error(`[Orchestrator] Architect attempt ${architectAttempt} failed: ${lastArchitectError}`);
            
            if (architectAttempt < MAX_ARCHITECT_RETRIES) {
              await storage.createActivityLog({
                projectId: project.id,
                level: "warn",
                message: `Arquitecto falló (intento ${architectAttempt}): ${lastArchitectError}. Reintentando...`,
                agentRole: "architect",
              });
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
          } else if (!architectResult.content || architectResult.content.trim().length === 0) {
            lastArchitectError = "El Arquitecto no generó contenido válido";
            console.error(`[Orchestrator] Architect attempt ${architectAttempt} returned empty content`);
            
            if (architectAttempt < MAX_ARCHITECT_RETRIES) {
              await storage.createActivityLog({
                projectId: project.id,
                level: "warn",
                message: `Arquitecto devolvió contenido vacío (intento ${architectAttempt}). Reintentando...`,
                agentRole: "architect",
              });
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
          } else {
            if (architectResult.thoughtSignature) {
              await storage.createThoughtLog({
                projectId: project.id,
                agentName: "El Arquitecto",
                agentRole: "architect",
                thoughtContent: architectResult.thoughtSignature,
              });
            }

            worldBibleData = this.parseArchitectOutput(architectResult.content);
            
            const hasCharacters = (worldBibleData.world_bible?.personajes?.length || 0) > 0;
            const escaletaLength = worldBibleData.escaleta_capitulos?.length || 0;
            const hasChapters = escaletaLength > 0;
            
            const expectedChapters = project.chapterCount + 
              (project.hasPrologue ? 1 : 0) + 
              (project.hasEpilogue ? 1 : 0) + 
              (project.hasAuthorNote ? 1 : 0);
            const hasEnoughChapters = escaletaLength >= expectedChapters;
            
            if (!hasCharacters || !hasChapters) {
              lastArchitectError = `World Bible vacía o incompleta: ${hasCharacters ? '✓' : '✗'} personajes (${worldBibleData.world_bible?.personajes?.length || 0}), ${hasChapters ? '✓' : '✗'} capítulos (${escaletaLength})`;
              console.error(`[Orchestrator] Architect attempt ${architectAttempt}: ${lastArchitectError}`);
              console.error(`[Orchestrator] Architect raw content preview (first 2000 chars):\n${architectResult.content?.substring(0, 2000)}`);
              
              if (architectAttempt < MAX_ARCHITECT_RETRIES) {
                await storage.createActivityLog({
                  projectId: project.id,
                  level: "warn",
                  message: `World Bible incompleta (intento ${architectAttempt}): ${lastArchitectError}. Reintentando...`,
                  agentRole: "architect",
                });
                worldBibleData = null;
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
              }
            } else if (!hasEnoughChapters) {
              lastArchitectError = `Escaleta incompleta: generados ${escaletaLength} capítulos, esperados ${expectedChapters} (${project.chapterCount} capítulos + extras)`;
              console.error(`[Orchestrator] Architect attempt ${architectAttempt}: ${lastArchitectError}`);
              
              if (architectAttempt < MAX_ARCHITECT_RETRIES) {
                await storage.createActivityLog({
                  projectId: project.id,
                  level: "warn",
                  message: `Escaleta truncada (intento ${architectAttempt}): ${escaletaLength}/${expectedChapters} capítulos. Reintentando con más tokens...`,
                  agentRole: "architect",
                });
                worldBibleData = null;
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
              }
            } else {
              console.log(`[Orchestrator] World Bible parsed successfully on attempt ${architectAttempt}: ${worldBibleData.world_bible?.personajes?.length || 0} characters, ${escaletaLength}/${expectedChapters} chapters`);
              break;
            }
          }
        } catch (error) {
          lastArchitectError = String(error);
          console.error(`[Orchestrator] Architect attempt ${architectAttempt} exception: ${lastArchitectError}`);
          
          if (architectAttempt < MAX_ARCHITECT_RETRIES) {
            await storage.createActivityLog({
              projectId: project.id,
              level: "warn",
              message: `Arquitecto excepción (intento ${architectAttempt}): ${lastArchitectError}. Reintentando...`,
              agentRole: "architect",
            });
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
        }
        
        if (architectAttempt >= MAX_ARCHITECT_RETRIES) break;
      }

      if (!worldBibleData || !worldBibleData.world_bible?.personajes?.length || !worldBibleData.escaleta_capitulos?.length) {
        const errorMsg = `El Arquitecto falló después de ${MAX_ARCHITECT_RETRIES} intentos: ${lastArchitectError}. El proyecto se ha marcado como FALLIDO; reanúdalo manualmente desde el dashboard cuando quieras volver a intentarlo.`;
        console.error(`[Orchestrator] CRITICAL: ${errorMsg}`);
        this.callbacks.onAgentStatus("architect", "error", errorMsg);
        this.callbacks.onError(errorMsg);
        
        await storage.createActivityLog({
          projectId: project.id,
          level: "error",
          message: `Arquitecto falló tras ${MAX_ARCHITECT_RETRIES} intentos. Proyecto marcado como FALLIDO (no auto-recoverable). Reintento manual requerido.`,
          agentRole: "architect",
          metadata: { lastError: lastArchitectError, terminal: true },
        });
        
        // CRITICAL: use "failed" (not "paused") so the auto-recovery watchdog does NOT
        // wake this project up every 15 min and burn tokens forever. The user can
        // manually flip the status back to retry.
        await storage.updateProject(project.id, { status: "failed" });
        
        // Also mark the queue item as failed so processing advances to the next project.
        try {
          const queueItem = await storage.getQueueItemByProject(project.id);
          if (queueItem) {
            await storage.updateQueueItem(queueItem.id, {
              status: "failed",
              completedAt: new Date(),
              errorMessage: `Arquitecto falló tras ${MAX_ARCHITECT_RETRIES} intentos: ${lastArchitectError}`,
            });
          }
        } catch (e) {
          console.error(`[Orchestrator] Failed to mark queue item as failed:`, e);
        }
        
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // CRÍTICO DE ORIGINALIDAD — examina el outline antes de escribir.
      // Si detecta clichés graves, re-ejecuta al Arquitecto UNA vez con
      // las instrucciones de revisión inyectadas. Solo se ejecuta en
      // generación nueva (no en extender ni en reanudación).
      // ═══════════════════════════════════════════════════════════════
      try {
        if (!this.aborted) {
          this.callbacks.onAgentStatus("architect", "thinking", "El Crítico de Originalidad está revisando la trama antes de escribir...");
          const criticOutcome = await this.originalityCritic.execute({
            title: project.title,
            genre: project.genre,
            tone: project.tone,
            premise: effectivePremise,
            worldBible: worldBibleData.world_bible,
            escaletaCapitulos: worldBibleData.escaleta_capitulos as any[],
            projectId: project.id,
          });

          if (criticOutcome.raw?.tokenUsage) {
            await this.trackTokenUsage(project.id, criticOutcome.raw.tokenUsage, "El Crítico de Originalidad", "deepseek-v4-flash", undefined, "originality_check");
          }

          const critic = criticOutcome.result;
          if (critic) {
            const mayores = critic.clusters.filter(c => c.severidad === "mayor").length;
            const menores = critic.clusters.filter(c => c.severidad === "menor").length;
            console.log(`[Orchestrator] Crítico de Originalidad: score ${critic.score_originalidad}/10, veredicto "${critic.veredicto}", ${mayores} mayores + ${menores} menores. ${critic.resumen}`);

            await storage.createActivityLog({
              projectId: project.id,
              level: critic.veredicto === "rechazado" ? "warn" : "info",
              agentRole: "architect",
              message: `🎭 Crítico de Originalidad — Score ${critic.score_originalidad}/10 (${critic.veredicto}). ${mayores} clichés mayores, ${menores} menores. ${critic.resumen}`,
              metadata: { originalityScore: critic.score_originalidad, veredicto: critic.veredicto, clusters: critic.clusters as any },
            });

            if (critic.veredicto === "rechazado" && critic.instrucciones_revision?.trim()) {
              console.log(`[Orchestrator] Crítico de Originalidad RECHAZÓ el outline. Re-ejecutando Arquitecto con instrucciones de revisión...`);
              this.callbacks.onAgentStatus("architect", "thinking", `Outline con baja originalidad (${critic.score_originalidad}/10). El Arquitecto está rediseñando para evitar clichés...`);

              const baseInstructions = project.architectInstructions || "";
              const revisionInstructions = `${baseInstructions ? `${baseInstructions}\n\n` : ""}═══════════════════════════════════════════════════════════════════\n🚨 REVISIÓN OBLIGATORIA — CRÍTICO DE ORIGINALIDAD 🚨\n═══════════════════════════════════════════════════════════════════\nEl outline anterior obtuvo un score de originalidad de ${critic.score_originalidad}/10 con ${mayores} clichés mayores. DEBES rediseñar el outline aplicando estas correcciones específicas:\n\n${critic.instrucciones_revision}\n\nMantén la premisa esencial y los géneros pedidos, pero reemplaza los elementos clichés señalados por alternativas frescas. NO repitas los arquetipos ni los giros que el crítico marcó como predecibles.\n═══════════════════════════════════════════════════════════════════`;

              try {
                const retryResult = await this.architect.execute({
                  title: project.title,
                  premise: effectivePremise,
                  genre: project.genre,
                  tone: project.tone,
                  chapterCount: project.chapterCount,
                  hasPrologue: project.hasPrologue,
                  hasEpilogue: project.hasEpilogue,
                  hasAuthorNote: project.hasAuthorNote,
                  architectInstructions: revisionInstructions,
                  kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
                  forbiddenNames,
                  projectId: project.id,
                });

                if (retryResult.tokenUsage) {
                  await this.trackTokenUsage(project.id, retryResult.tokenUsage, "El Arquitecto (revisión originalidad)", "deepseek-v4-flash", undefined, "world_bible");
                }

                if (!retryResult.error && !retryResult.timedOut && retryResult.content?.trim()) {
                  const reviewedData = this.parseArchitectOutput(retryResult.content);
                  const expectedChapters = project.chapterCount + (project.hasPrologue ? 1 : 0) + (project.hasEpilogue ? 1 : 0) + (project.hasAuthorNote ? 1 : 0);
                  const reviewedLen = reviewedData?.escaleta_capitulos?.length || 0;
                  if (reviewedData && reviewedData.world_bible?.personajes?.length && reviewedLen >= expectedChapters - 2) {
                    console.log(`[Orchestrator] Arquitecto revisó el outline tras crítica de originalidad: ${reviewedData.world_bible.personajes.length} personajes, ${reviewedLen}/${expectedChapters} capítulos. Reemplazando outline anterior.`);
                    worldBibleData = reviewedData;
                    await storage.createActivityLog({
                      projectId: project.id,
                      level: "info",
                      agentRole: "architect",
                      message: `✅ El Arquitecto rediseñó el outline aplicando las correcciones del Crítico de Originalidad.`,
                    });
                  } else {
                    console.warn(`[Orchestrator] Revisión del Arquitecto produjo un outline inválido (${reviewedLen}/${expectedChapters} caps). Manteniendo outline original.`);
                  }
                } else {
                  console.warn(`[Orchestrator] Revisión del Arquitecto falló: ${retryResult.error || "vacío/timeout"}. Manteniendo outline original.`);
                }
              } catch (retryErr) {
                console.error(`[Orchestrator] Excepción en revisión del Arquitecto: ${(retryErr as Error).message}. Manteniendo outline original.`);
              }
            }
          } else {
            console.warn(`[Orchestrator] Crítico de Originalidad no devolvió resultado válido. Continuando con el outline original.`);
          }
        }
      } catch (criticErr) {
        console.error(`[Orchestrator] Crítico de Originalidad falló (no bloqueante): ${(criticErr as Error).message}`);
      }

      const worldBible = await storage.createWorldBible({
        projectId: project.id,
        timeline: this.convertTimeline(worldBibleData),
        characters: this.convertCharacters(worldBibleData),
        worldRules: this.convertWorldRules(worldBibleData),
        plotOutline: this.convertPlotOutline(worldBibleData),
      });

      // Verify World Bible was saved correctly before proceeding
      const MAX_VERIFY_ATTEMPTS = 5;
      let verifyAttempt = 0;
      let worldBibleVerified = false;
      
      while (verifyAttempt < MAX_VERIFY_ATTEMPTS) {
        const savedWorldBible = await storage.getWorldBibleByProject(project.id);
        const hasData = savedWorldBible && (
          ((savedWorldBible.timeline as any[]) || []).length > 0 ||
          ((savedWorldBible.characters as any[]) || []).length > 0 ||
          (savedWorldBible.plotOutline && Object.keys(savedWorldBible.plotOutline as object).length > 0)
        );
        
        if (hasData) {
          console.log(`[Orchestrator] World Bible verified: ${((savedWorldBible.characters as any[]) || []).length} characters, ${((savedWorldBible.timeline as any[]) || []).length} timeline events`);
          worldBibleVerified = true;
          break;
        }
        
        verifyAttempt++;
        console.warn(`[Orchestrator] World Bible verification attempt ${verifyAttempt}/${MAX_VERIFY_ATTEMPTS}: data not yet available`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!worldBibleVerified) {
        const errorMsg = "La biblia del mundo no se guardó correctamente. Intente de nuevo.";
        console.error(`[Orchestrator] CRITICAL: World Bible verification failed after ${MAX_VERIFY_ATTEMPTS} attempts`);
        this.callbacks.onError(errorMsg);
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      if (this.aborted) {
        console.log(`[Orchestrator] Aborted after architect completion (project ${project.id}). Skipping chapter generation.`);
        return;
      }

      this.callbacks.onAgentStatus("architect", "completed", "Estructura narrativa completada");

      const allSections = this.buildSectionsList(project, worldBibleData);
      const chapters: Chapter[] = [];
      
      // CRITICAL: Re-check for existing chapters right before creation to prevent race conditions
      const existingChaptersBeforeCreate = await storage.getChaptersByProject(project.id);
      if (existingChaptersBeforeCreate.length > 0) {
        console.log(`[Orchestrator] DUPLICATE PREVENTION: Found ${existingChaptersBeforeCreate.length} chapters created during architect phase. Using existing chapters.`);
        await storage.createActivityLog({
          projectId: project.id,
          level: "warn",
          message: `Detectados ${existingChaptersBeforeCreate.length} capítulos durante fase de arquitecto. Usando capítulos existentes para evitar duplicados.`,
          agentRole: "orchestrator",
        });
        // Sort by chapter number and use existing chapters
        const sortedExisting = existingChaptersBeforeCreate.sort((a, b) => a.chapterNumber - b.chapterNumber);
        chapters.push(...sortedExisting);
      } else {
        // Create chapters only if none exist
        for (let i = 0; i < allSections.length; i++) {
          const section = allSections[i];
          
          // Double-check this specific chapter doesn't exist (belt-and-suspenders approach)
          const existingForNumber = await storage.getChaptersByProject(project.id);
          const alreadyExists = existingForNumber.find(c => c.chapterNumber === section.numero);
          
          if (alreadyExists) {
            console.log(`[Orchestrator] DUPLICATE PREVENTION: Chapter ${section.numero} already exists (id=${alreadyExists.id}). Skipping creation.`);
            chapters.push(alreadyExists);
            continue;
          }
          
          const chapter = await storage.createChapter({
            projectId: project.id,
            chapterNumber: section.numero,
            title: section.titulo,
            status: "pending",
          });
          chapters.push(chapter);
        }
      }

      let previousContinuity = "";
      let previousContinuityStateForEditor: any = null;
      let accumulatedContinuityIssues: string[] = [];
      
      let seriesUnresolvedThreads: string[] = [];
      let seriesKeyEvents: string[] = [];
      if (project.seriesId) {
        const { threads, events } = await this.loadSeriesThreadsAndEvents(project);
        seriesUnresolvedThreads = threads;
        seriesKeyEvents = events;
      }
      
      const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
      const fullStyleGuide = styleGuideContent 
        ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
        : baseStyleGuide;

      for (let i = 0; i < chapters.length; i++) {
        if (this.aborted) {
          console.log(`[Orchestrator] Aborted at chapter loop iteration ${i + 1} (project ${project.id}). Exiting silently.`);
          return;
        }
        if (await isProjectCancelledFromDb(project.id)) {
          console.log(`[Orchestrator] Project ${project.id} cancelled before chapter ${i + 1}. Stopping.`);
          await storage.createActivityLog({
            projectId: project.id,
            level: "info",
            message: `Generación detenida por el usuario antes del capítulo ${i + 1}`,
            agentRole: "orchestrator",
          });
          return;
        }

        const chapter = chapters[i];
        const sectionData = allSections[i];

        await storage.updateChapter(chapter.id, { status: "writing" });
        await storage.updateProject(project.id, { currentChapter: i + 1 });

        const sectionLabel = this.getSectionLabel(sectionData);
        this.callbacks.onAgentStatus("ghostwriter", "writing", `El Narrador está escribiendo ${sectionLabel}...`);

        let chapterContent = "";
        let approved = false;
        let refinementAttempts = 0;
        let wordCountRetries = 0;
        let pendingContinuityViolations: string[] = [];
        let refinementInstructions = "";

        let extractedContinuityState: any = null;
        
        let bestVersion = { content: "", score: 0, continuityState: null as any };
        let attemptsSinceBestImprovement = 0;

        while (!approved && refinementAttempts < this.maxRefinementLoops) {
          if (this.aborted) {
            console.log(`[Orchestrator] Aborted inside refinement loop for chapter ${sectionData.numero} (project ${project.id}). Exiting silently.`);
            return;
          }
          const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
          const fullStyleGuide = styleGuideContent 
            ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
            : baseStyleGuide;

          const { context: slidingContext, characterStates } = this.buildSlidingContextWindow(chapters, i, allSections);
          const optimizedContinuity = slidingContext || previousContinuity;

          const isRewrite = refinementAttempts > 0 || wordCountRetries > 0;
          const projectMinPerChapter = (project as any).minWordsPerChapter;
          const projectMaxPerChapter = (project as any).maxWordsPerChapter;
          const totalNovelTarget = (project as any).minWordCount;
          const perChapterTarget = projectMinPerChapter || this.calculatePerChapterTarget(totalNovelTarget, allSections.length);
          const perChapterMax = projectMaxPerChapter || Math.round(perChapterTarget * 1.15);
          const enrichedWB = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesUnresolvedThreads, seriesKeyEvents);
          const previousContent = isRewrite ? (bestVersion.content || undefined) : undefined;

          const isStalled = refinementAttempts >= 2 && bestVersion.score === 7 && bestVersion.score <= 7;
          const stalledEscalation = isStalled
            ? `\n\n⚠️ PERSPECTIVA FRESCA REQUERIDA: Los intentos anteriores se estancaron en 7/10. El editor detecta los mismos problemas repetidamente. NO sigas la misma estructura — reimagina las escenas desde un ángulo completamente diferente. Cambia las aperturas de escena, los patrones de diálogo, la distribución sensorial. Sorpréndeme.`
            : "";

          const writerResult = await this.ghostwriter.execute({
            chapterNumber: sectionData.numero,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWB, this.resolveLexicoForChapter(worldBibleData, sectionData.numero)),
            guiaEstilo: fullStyleGuide,
            previousContinuity: optimizedContinuity,
            refinementInstructions: refinementInstructions + stalledEscalation,
            antiRepetitionGuidance: (project as any).antiRepetitionGuidance || undefined,
            authorName,
            isRewrite: isRewrite || isStalled,
            minWordCount: perChapterTarget,
            maxWordCount: perChapterMax,
            extendedGuideContent: extendedGuideContent || undefined,
            previousChapterContent: isStalled ? undefined : previousContent,
            kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
          });

          const { cleanContent, continuityState } = this.ghostwriter.extractContinuityState(writerResult.content);
          let currentContent = cleanContent;
          const currentContinuityState = continuityState;
          
          if (writerResult.error) {
            console.warn(`[Orchestrator] Ghostwriter returned error: ${writerResult.error}`);
          }
          
          const ABSOLUTE_MIN = 500;
          const TARGET_MIN = perChapterTarget;
          const TARGET_MAX = perChapterMax;
          const FLEXIBLE_MIN = Math.floor(TARGET_MIN * 0.90);
          const FLEXIBLE_MAX = Math.ceil(TARGET_MAX * 1.10);
          const MAX_WORD_COUNT_RETRIES = 5;
          const contentWordCount = currentContent.split(/\s+/).filter((w: string) => w.length > 0).length;
          
          if (contentWordCount < ABSOLUTE_MIN) {
            if (contentWordCount > bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length) {
              bestVersion.content = currentContent;
              bestVersion.continuityState = currentContinuityState;
            }
            if (wordCountRetries < MAX_WORD_COUNT_RETRIES) {
              wordCountRetries++;
              const isEmptyResponse = contentWordCount === 0;
              const waitTime = isEmptyResponse ? 20000 : 10000;
              
              if (isEmptyResponse) {
                console.warn(`[Orchestrator] ⚠️ Respuesta VACÍA (0 palabras) para ${sectionLabel}. Error API: ${writerResult.error || 'ninguno'}. Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES} tras ${waitTime/1000}s...`);
                this.callbacks.onAgentStatus("ghostwriter", "warning", 
                  `${sectionLabel}: respuesta vacía del modelo. Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
                );
                refinementInstructions = "";
              } else {
                console.warn(`[Orchestrator] Capítulo severamente truncado: ${contentWordCount} palabras < ${ABSOLUTE_MIN}. Reintentando (${wordCountRetries}/${MAX_WORD_COUNT_RETRIES})...`);
                this.callbacks.onAgentStatus("ghostwriter", "warning", 
                  `${sectionLabel} truncado (${contentWordCount} palabras). Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
                );
                refinementInstructions = `CRÍTICO: Tu respuesta fue TRUNCADA con solo ${contentWordCount} palabras. DEBES escribir el capítulo COMPLETO con ${TARGET_MIN}-${TARGET_MAX} palabras.`;
              }
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            } else {
              console.warn(`[Orchestrator] ⚠️ ${sectionLabel} severamente truncado (${contentWordCount} palabras) después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando con mejor resultado.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel}: ${contentWordCount} palabras tras ${MAX_WORD_COUNT_RETRIES} intentos truncados. Continuando...`
              );
              if (bestVersion.content && bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length > contentWordCount) {
                currentContent = bestVersion.content;
              }
            }
          }
          
          if (contentWordCount < FLEXIBLE_MIN && contentWordCount >= ABSOLUTE_MIN) {
            if (contentWordCount > bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length) {
              bestVersion.content = currentContent;
              bestVersion.continuityState = currentContinuityState;
            }
            if (wordCountRetries < MAX_WORD_COUNT_RETRIES) {
              wordCountRetries++;
              console.warn(`[Orchestrator] Capítulo corto: ${contentWordCount} palabras < ${FLEXIBLE_MIN} mínimo flexible (${TARGET_MIN} -10%). Intento ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}. Expandiendo...`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel} muy corto (${contentWordCount}/${TARGET_MIN}-${TARGET_MAX} palabras). Expandiendo ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
              );
              refinementInstructions = `EXPANSIÓN OBLIGATORIA — NO REESCRIBAS DESDE CERO:
Tu borrador anterior tiene ${contentWordCount} palabras pero necesita ${TARGET_MIN}-${TARGET_MAX} palabras.
ESTRATEGIA DE EXPANSIÓN (aplica TODAS):
1. CONSERVA TODO el texto existente — no elimines ni resumas nada
2. EXPANDE las escenas de diálogo: añade réplicas adicionales, reacciones corporales, silencios significativos
3. PROFUNDIZA el monólogo interno de los personajes: pensamientos, recuerdos, asociaciones
4. ENRIQUECE las descripciones sensoriales: olores, texturas, sonidos ambientales, temperatura
5. DESARROLLA las transiciones entre beats: no saltes de una acción a otra, narra el movimiento
6. AÑADE micro-escenas de tensión o distensión entre los beats principales
PROHIBIDO: Eliminar pasajes que funcionan, resumir lo que ya estaba narrado, reescribir desde cero.
Este es el intento #${wordCountRetries} de ${MAX_WORD_COUNT_RETRIES}.`;
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue;
            } else {
              console.warn(`[Orchestrator] ⚠️ ${sectionLabel} sigue corto (${contentWordCount}/${FLEXIBLE_MIN} mín) después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando con el mejor resultado.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel}: ${contentWordCount} palabras después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando...`
              );
            }
          }
          
          wordCountRetries = 0;
          
          if (contentWordCount > FLEXIBLE_MAX) {
            console.warn(`[Orchestrator] ⚠️ Capítulo largo: ${sectionLabel} tiene ${contentWordCount} palabras (máximo flexible: ${FLEXIBLE_MAX}). Pasando al Editor.`);
          }
          
          await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", sectionData.numero, "chapter_write");

          if (writerResult.thoughtSignature) {
            await storage.createThoughtLog({
              projectId: project.id,
              chapterId: chapter.id,
              agentName: "El Narrador",
              agentRole: "ghostwriter",
              thoughtContent: writerResult.thoughtSignature,
            });
          }

          if (characterStates.size > 0) {
            const continuityCheck = this.validateImmediateContinuity(currentContent, characterStates, worldBibleData.world_bible);
            
            if (!continuityCheck.valid) {
              const currentBestWords = bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length;
              if (contentWordCount > currentBestWords) {
                bestVersion.content = currentContent;
                bestVersion.continuityState = currentContinuityState;
              }

              console.warn(`[Orchestrator] ${sectionLabel}: ${continuityCheck.violations.length} violación(es) de continuidad detectadas. Escalando directamente al Editor con violaciones inyectadas para plan quirúrgico.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning",
                `${sectionLabel}: ${continuityCheck.violations.length} violación(es) de continuidad. Escalando al Editor para plan quirúrgico...`
              );
              pendingContinuityViolations = continuityCheck.violations;
            } else {
              pendingContinuityViolations = [];
            }
          }

          await storage.updateChapter(chapter.id, { status: "editing" });
          this.callbacks.onAgentStatus("editor", "editing", `El Editor está revisando ${sectionLabel}...`);

          const editorChaptersCtx = await storage.getChaptersByProject(project.id);
          const enrichedWBForEditor = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
          const resolvedLexicoForEditor = this.resolveLexicoForChapter(worldBibleData, sectionData.numero);
          const editorResult = await this.editor.execute({
            chapterNumber: sectionData.numero,
            chapterContent: currentContent,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBForEditor, resolvedLexicoForEditor),
            guiaEstilo: styleGuideContent
              ? `Género: ${project.genre}, Tono: ${project.tone}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
              : `Género: ${project.genre}, Tono: ${project.tone}`,
            previousContinuityState: previousContinuityStateForEditor,
            previousChaptersContext: this.buildPreviousChaptersContextForEditor(editorChaptersCtx, sectionData.numero),
            continuityViolations: pendingContinuityViolations.length > 0 ? pendingContinuityViolations : undefined,
          });

          await this.trackTokenUsage(project.id, editorResult.tokenUsage, "El Editor", "deepseek-v4-flash", sectionData.numero, "chapter_edit");

          if (editorResult.thoughtSignature) {
            await storage.createThoughtLog({
              projectId: project.id,
              chapterId: chapter.id,
              agentName: "El Editor",
              agentRole: "editor",
              thoughtContent: editorResult.thoughtSignature,
            });
          }

          this.enforceApprovalLogic(editorResult);
          const currentScore = editorResult.result?.puntuacion || 0;
          const currentHardReject = this.hasHardRejectViolations(editorResult.result);

          const cleanBeatsHard = !currentHardReject && (bestVersion as any).hardReject === true;
          const sameRejectStatusBetterScore = (currentHardReject === ((bestVersion as any).hardReject ?? false)) && currentScore > bestVersion.score;
          const firstPass = bestVersion.score === 0;
          if (cleanBeatsHard || sameRejectStatusBetterScore || firstPass) {
            bestVersion = {
              content: currentContent,
              score: currentScore,
              continuityState: currentContinuityState,
              hardReject: currentHardReject,
            } as any;
            attemptsSinceBestImprovement = 0;
            console.log(`[Orchestrator] New best version for ${sectionLabel}: ${currentScore}/10${currentHardReject ? " (con hard-reject)" : " (limpio)"}`);
          } else {
            attemptsSinceBestImprovement++;
            console.log(`[Orchestrator] Keeping previous best version (${bestVersion.score}/10) over current (${currentScore}/10) — sin mejora desde hace ${attemptsSinceBestImprovement} intento(s)`);
          }

          if (editorResult.result?.aprobado) {
            approved = true;
            this.callbacks.onAgentStatus("editor", "completed", `${sectionLabel} aprobado (${currentScore}/10)`);
          } else {
            refinementAttempts++;

            if (attemptsSinceBestImprovement >= 2) {
              console.log(`[Orchestrator] Anti-stagnation: ${sectionLabel} sin mejorar la mejor versión (${bestVersion.score}/10) tras ${attemptsSinceBestImprovement} intentos. Stopping rewrites.`);
              this.callbacks.onAgentStatus("editor", "editing",
                `${sectionLabel} sin mejora tras ${attemptsSinceBestImprovement} intentos (mejor: ${bestVersion.score}/10). Usando mejor versión.`
              );
              break;
            }
            
            refinementInstructions = this.buildRefinementInstructions(editorResult.result);
            
            if (refinementAttempts >= 2 && editorResult.result) {
              const diagnosis = editorResult.result.plan_quirurgico;
              console.log(`\n${'='.repeat(80)}`);
              console.log(`[REJECTION PATTERN DETECTED] ${sectionLabel} - Attempt ${refinementAttempts}/${this.maxRefinementLoops}`);
              console.log(`Project: ${project.title} (ID: ${project.id})`);
              console.log(`Genre: ${project.genre}`);
              console.log(`Score: ${currentScore}/10`);
              console.log(`Diagnosis: ${diagnosis?.diagnostico || 'N/A'}`);
              console.log(`Procedure: ${diagnosis?.procedimiento || 'N/A'}`);
              console.log(`Objective: ${diagnosis?.objetivo || 'N/A'}`);
              console.log(`${'='.repeat(80)}\n`);
            }
            
            this.callbacks.onAgentStatus("editor", "editing", 
              `${sectionLabel} rechazado (${currentScore}/10). Mejor: ${bestVersion.score}/10. Intento ${refinementAttempts}/${this.maxRefinementLoops}.`
            );

            if (refinementAttempts < this.maxRefinementLoops) {
              this.callbacks.onAgentStatus("ghostwriter", "writing", 
                `El Narrador está reescribiendo ${sectionLabel} siguiendo el Plan Quirúrgico...`
              );
            }
          }
        }
        
        chapterContent = bestVersion.content;
        extractedContinuityState = bestVersion.continuityState;
        console.log(`[Orchestrator] Using best version for ${sectionLabel}: ${bestVersion.score}/10`);

        this.callbacks.onAgentStatus("copyeditor", "polishing", `El Estilista está puliendo ${sectionLabel}...`);

        const polishResult = await this.copyeditor.execute({
          chapterContent,
          chapterNumber: sectionData.numero,
          chapterTitle: sectionData.titulo,
          guiaEstilo: styleGuideContent || undefined,
          lexicoHistorico: this.resolveLexicoForChapter(worldBibleData, sectionData.numero),
        });

        await this.trackTokenUsage(project.id, polishResult.tokenUsage, "El Estilista", "deepseek-v4-flash", sectionData.numero, "polish");

        if (polishResult.thoughtSignature) {
          await storage.createThoughtLog({
            projectId: project.id,
            chapterId: chapter.id,
            agentName: "El Estilista",
            agentRole: "copyeditor",
            thoughtContent: polishResult.thoughtSignature,
          });
        }

        const finalContent = polishResult.result?.texto_final || chapterContent;
        const wordCount = finalContent.split(/\s+/).length;

        await storage.updateChapter(chapter.id, {
          content: finalContent,
          wordCount,
          status: "completed",
          continuityState: extractedContinuityState,
        });

        (chapter as any).content = finalContent;
        (chapter as any).originalContent = finalContent;
        (chapter as any).editedContent = finalContent;
        chapter.wordCount = wordCount;
        chapter.status = "completed";
        chapter.continuityState = extractedContinuityState;

        if (extractedContinuityState) {
          previousContinuity = JSON.stringify(extractedContinuityState);
          previousContinuityStateForEditor = extractedContinuityState;
          console.log(`[Orchestrator] Passing continuity state to next chapter: ${Object.keys(extractedContinuityState.characterStates || {}).length} characters tracked`);
        } else {
          previousContinuity = sectionData.continuidad_salida || 
            `${sectionLabel} completado. Los personajes terminaron en: ${sectionData.ubicacion}`;
          previousContinuityStateForEditor = null;
        }

        this.callbacks.onChapterComplete(sectionData.numero, wordCount, sectionData.titulo);
        this.callbacks.onAgentStatus("copyeditor", "completed", `${sectionLabel} finalizado (${wordCount} palabras)`);

        await this.enrichWorldBibleFromChapter(project.id, sectionData.numero, extractedContinuityState, finalContent);
        await this.updateWorldBibleTimeline(project.id, worldBible.id, sectionData.numero, sectionData);

        // PREVENTIVO: cada 5 capítulos completados, escanear patrones repetidos para
        // alimentar al Ghostwriter en los próximos capítulos (evitar muletillas globales).
        await this.runProactiveSemanticScan(project, i + 1, allSections.length, worldBibleData);
        
        const completedChaptersCount = i + 1;
        if (completedChaptersCount > 0 && completedChaptersCount % this.continuityCheckpointInterval === 0) {
          const completedChaptersForCheckpoint = await storage.getChaptersByProject(project.id);
          const chaptersInScope = completedChaptersForCheckpoint
            .filter(c => c.status === "completed" && c.chapterNumber > 0)
            .sort((a, b) => a.chapterNumber - b.chapterNumber)
            .slice(-this.continuityCheckpointInterval);
          
          if (chaptersInScope.length >= this.continuityCheckpointInterval) {
            const checkpointNumber = Math.floor(completedChaptersCount / this.continuityCheckpointInterval);
            const checkpointResult = await this.runContinuityCheckpoint(
              project,
              checkpointNumber,
              chaptersInScope,
              worldBibleData,
              accumulatedContinuityIssues
            );
            
            if (!checkpointResult.passed) {
              accumulatedContinuityIssues = [...accumulatedContinuityIssues, ...checkpointResult.issues];
              
              const hasActionableIssues = checkpointResult.issues.some(issue => 
                issue.includes("[CRITICA]") || issue.includes("[CRÍTICA]") ||
                issue.includes("[MAYOR]") ||
                issue.toLowerCase().includes("critica") || issue.toLowerCase().includes("crítica") ||
                issue.toLowerCase().includes("mayor")
              );
              
              if (hasActionableIssues && checkpointResult.chaptersToRevise.length > 0) {
                this.callbacks.onAgentStatus("continuity-sentinel", "editing", 
                  `Disparando correcciones para ${checkpointResult.chaptersToRevise.length} capítulos con errores de continuidad detectados`
                );
                
                const allProjectChapters = await storage.getChaptersByProject(project.id);
                
                for (const chapterNum of checkpointResult.chaptersToRevise) {
                  const chapterToFix = allProjectChapters.find(c => c.chapterNumber === chapterNum && c.status === "completed");
                  const sectionForFix = allSections.find(s => s.numero === chapterNum);
                  
                  if (chapterToFix && sectionForFix) {
                    const chapterNumStr = String(chapterNum);
                    const issuesForChapter = checkpointResult.issues.filter(issue => {
                      const lower = issue.toLowerCase();
                      return lower.includes(`capítulo ${chapterNumStr}`) || 
                             lower.includes(`cap ${chapterNumStr}`) ||
                             lower.includes(`cap. ${chapterNumStr}`) ||
                             lower.includes(`capitulo ${chapterNumStr}`);
                    }).join("\n");
                    
                    await this.rewriteChapterForQA(
                      project,
                      chapterToFix,
                      sectionForFix,
                      worldBibleData,
                      fullStyleGuide,
                      "continuity",
                      issuesForChapter || checkpointResult.issues.join("\n")
                    );
                  }
                }
              } else if (hasActionableIssues && checkpointResult.chaptersToRevise.length === 0) {
                this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
                  `Issues de continuidad detectados pero sin capítulos específicos identificados. Se anotarán para la auditoría final.`
                );
              } else {
                this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
                  `Issues menores detectados. Se anotarán para la auditoría final.`
                );
              }
            }
          }
        }
      }

      const projectStateForVoice = await storage.getProject(project.id);
      const revisionCycleForVoice = projectStateForVoice?.revisionCycle || 0;
      const skipVoiceAudit = revisionCycleForVoice > 0 && this.chaptersRewrittenInCurrentCycle === 0;
      
      if (skipVoiceAudit) {
        this.callbacks.onAgentStatus("voice-auditor", "skipped", 
          `Auditor de voz omitido - sin capítulos modificados desde la última pasada`
        );
        console.log(`[Orchestrator] Skipping voice auditor for project ${project.id} - no chapters revised`);
      } else {
        const allCompletedChapters = await storage.getChaptersByProject(project.id);
        const completedForAnalysis = allCompletedChapters.filter(c => c.status === "completed" && c.content);
        
        if (completedForAnalysis.length >= 5) {
          const trancheSize = 10;
          const totalTranches = Math.ceil(completedForAnalysis.length / trancheSize);
          
          for (let t = 0; t < totalTranches; t++) {
            const trancheChapters = completedForAnalysis.slice(t * trancheSize, (t + 1) * trancheSize);
            if (trancheChapters.length > 0) {
              const voiceResult = await this.runVoiceRhythmAudit(project, t + 1, trancheChapters, styleGuideContent);
              
              if (!voiceResult.passed && voiceResult.chaptersToRevise.length > 0) {
                this.callbacks.onAgentStatus("voice-auditor", "editing", 
                  `Puliendo ${voiceResult.chaptersToRevise.length} capítulos con problemas de voz/ritmo`
                );
                
                for (const chapterNum of voiceResult.chaptersToRevise) {
                  const chapterToPolish = trancheChapters.find(c => c.chapterNumber === chapterNum);
                  if (chapterToPolish) {
                    const issuesForChapter = voiceResult.issues.filter(issue => 
                      issue.includes(`capítulo ${chapterNum}`) || issue.includes(`Cap ${chapterNum}`)
                    ).join("\n");
                    
                    await this.polishChapterForVoice(
                      project,
                      chapterToPolish,
                      styleGuideContent,
                      issuesForChapter || voiceResult.issues.join("\n")
                    );
                  }
                }
              }
            }
          }
        }
      }

      const currentProjectState = await storage.getProject(project.id);
      const revisionCycleForSemantic = currentProjectState?.revisionCycle || 0;
      const skipSemanticDetector = revisionCycleForSemantic > 0 && this.chaptersRewrittenInCurrentCycle === 0;
      const MAX_SEMANTIC_ATTEMPTS = 4;
      
      if (skipSemanticDetector) {
        this.callbacks.onAgentStatus("semantic-detector", "skipped", 
          `Detector semántico omitido - sin capítulos modificados desde la última pasada`
        );
        console.log(`[Orchestrator] Skipping semantic detector for project ${project.id} - no chapters revised`);
      } else {
        let semanticAttempt = 0;
        let semanticPassed = false;
        
        while (semanticAttempt < MAX_SEMANTIC_ATTEMPTS && !semanticPassed) {
          semanticAttempt++;
          
          const refreshedChaptersForSemantic = await storage.getChaptersByProject(project.id);
          const completedForSemanticAnalysis = refreshedChaptersForSemantic.filter(c => c.status === "completed" && c.content);

          if (completedForSemanticAnalysis.length === 0) break;
          
          this.callbacks.onAgentStatus("semantic-detector", "analyzing", 
            `Análisis semántico (intento ${semanticAttempt}/${MAX_SEMANTIC_ATTEMPTS})...`
          );
          
          const semanticResult = await this.runSemanticRepetitionAnalysis(project, completedForSemanticAnalysis, worldBibleData);
          
          if (semanticResult.passed) {
            semanticPassed = true;
            this.callbacks.onAgentStatus("semantic-detector", "complete", 
              `Análisis semántico aprobado`
            );
            break;
          }
          
          if (semanticAttempt >= MAX_SEMANTIC_ATTEMPTS) {
            this.callbacks.onAgentStatus("semantic-detector", "warning", 
              `Máximo de intentos alcanzado. Continuando con observaciones menores.`
            );
            console.log(`[Orchestrator] Semantic detector: max attempts reached, accepting with warnings`);
            break;
          }
          
          if (semanticResult.chaptersToRevise.length > 0) {
            this.callbacks.onAgentStatus("semantic-detector", "editing", 
              `Corrigiendo ${semanticResult.chaptersToRevise.length} capítulos (intento ${semanticAttempt})`
            );
            
            for (const chapterNum of semanticResult.chaptersToRevise) {
              const chapterToFix = completedForSemanticAnalysis.find(c => c.chapterNumber === chapterNum);
              const sectionForFix = allSections.find((s: any) => s.numero === chapterNum);
              
              if (chapterToFix && sectionForFix) {
                const freshChapter = await storage.getChaptersByProject(project.id)
                  .then(chs => chs.find(c => c.chapterNumber === chapterNum));
                if (!freshChapter) continue;
                
                const clusterIssues = semanticResult.clusters
                  .filter(c => c.capitulos_afectados?.includes(chapterNum))
                  .map(c => `Repetición de idea: "${c.descripcion}"\n⚠️ PRESERVAR: ${c.elementos_a_preservar || "El resto del capítulo"}\n✏️ CORRECCIÓN: ${c.fix_sugerido}`)
                  .join("\n\n");
                
                const foreshadowingIssues = semanticResult.foreshadowingStatus
                  .filter(f => f.estado === "sin_payoff")
                  .map(f => `Foreshadowing sin resolver: "${f.setup}" (plantado en cap ${f.capitulo_setup}) - DEBES resolverlo en este capítulo o eliminarlo`)
                  .join("\n");
                
                const allIssues = [clusterIssues, foreshadowingIssues].filter(Boolean).join("\n\n");
                
                if (allIssues) {
                  await this.rewriteChapterForQA(
                    project,
                    freshChapter,
                    sectionForFix,
                    worldBibleData,
                    fullStyleGuide,
                    "semantic",
                    allIssues
                  );
                }
              }
            }
          }
        }
      }

      const finalReviewApproved = await this.runFinalReview(
        project, 
        chapters, 
        worldBibleData, 
        fullStyleGuide, 
        allSections,
        styleGuideContent,
        authorName
      );

      if (finalReviewApproved) {
        await this.finalizeCompletedProject(project);
      } else {
        await storage.updateProject(project.id, { status: "failed_final_review" });
        this.callbacks.onError("El manuscrito no pasó la revisión final después de múltiples intentos.");
      }

    } catch (error) {
      console.error("[Orchestrator] Error:", error);
      await storage.updateProject(project.id, { status: "error" });
      this.callbacks.onError(error instanceof Error ? error.message : "Error desconocido");
    }
  }

  async resumeNovel(project: Project): Promise<void> {
    try {
      const existingTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };
      this.cumulativeTokens = existingTokens;
      
      await storage.updateProject(project.id, { status: "generating" });

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        const existingChapters = await storage.getChaptersByProject(project.id);
        if (existingChapters.length === 0) {
          console.log(`[Orchestrator] Resume: No World Bible or chapters found for project ${project.id}. Restarting generation from scratch...`);
          await storage.createActivityLog({
            projectId: project.id,
            level: "info",
            message: "Reanudación: sin World Bible ni capítulos. Reiniciando generación desde cero...",
            agentRole: "orchestrator",
          });
          await storage.updateProject(project.id, { status: "idle" });
          await this.generateNovel(project);
          return;
        }
        this.callbacks.onError("No se encontró el World Bible del proyecto. Debe iniciar una nueva generación.");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      const existingChapters = await storage.getChaptersByProject(project.id);
      if (existingChapters.length === 0) {
        this.callbacks.onError("No se encontraron capítulos. Debe iniciar una nueva generación.");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      let styleGuideContent = "";
      let authorName = "";
      let extendedGuideContent = "";
      
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) styleGuideContent = styleGuide.content;
      }
      
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) authorName = pseudonym.name;
      }

      if ((project as any).extendedGuideId) {
        const extendedGuide = await storage.getExtendedGuide((project as any).extendedGuideId);
        if (extendedGuide) {
          extendedGuideContent = extendedGuide.content;
          console.log(`[Orchestrator:Resume] Using extended guide: "${extendedGuide.title}"`);
        }
      }

      const pendingChapters = existingChapters
        .filter(c => c.status !== "completed")
        .sort((a, b) => {
          const orderA = a.chapterNumber === 0 ? -1000 : a.chapterNumber === -1 ? 1000 : a.chapterNumber === -2 ? 1001 : a.chapterNumber;
          const orderB = b.chapterNumber === 0 ? -1000 : b.chapterNumber === -1 ? 1000 : b.chapterNumber === -2 ? 1001 : b.chapterNumber;
          return orderA - orderB;
        });

      if (pendingChapters.length === 0) {
        this.callbacks.onAgentStatus("orchestrator", "completed", "Todos los capítulos ya están completados.");
        await this.finalizeCompletedProject(project);
        return;
      }

      const completedChapters = existingChapters.filter(c => c.status === "completed");
      const lastCompleted = completedChapters.length > 0 
        ? completedChapters.sort((a, b) => b.chapterNumber - a.chapterNumber)[0]
        : null;
      
      let previousContinuity = lastCompleted?.continuityState 
        ? JSON.stringify(lastCompleted.continuityState)
        : lastCompleted?.content 
          ? `Capítulo anterior completado. Contenido termina con: ${lastCompleted.content.slice(-500)}`
          : "";
      
      let previousContinuityStateForEditor: any = lastCompleted?.continuityState || null;

      this.callbacks.onAgentStatus("architect", "completed", "Estructura narrativa completada");
      this.callbacks.onAgentStatus("orchestrator", "resuming", 
        `Retomando generación. ${pendingChapters.length} capítulos pendientes de ${existingChapters.length} totales.`
      );

      const worldBibleData = this.reconstructWorldBibleData(worldBible, project);
      
      let seriesUnresolvedThreadsResume: string[] = [];
      let seriesKeyEventsResume: string[] = [];
      if (project.seriesId) {
        const { threads, events } = await this.loadSeriesThreadsAndEvents(project);
        seriesUnresolvedThreadsResume = threads;
        seriesKeyEventsResume = events;
      }
      
      const characterStates: Map<string, { alive: boolean; location: string; injuries: string[]; lastSeen: number }> = new Map();

      for (const chapter of pendingChapters) {
        if (this.aborted) {
          console.log(`[Orchestrator] Aborted in resume loop before chapter ${chapter.chapterNumber} (project ${project.id}). Exiting silently.`);
          return;
        }
        const sectionData = this.buildSectionDataFromChapter(chapter, worldBibleData);
        
        await storage.updateChapter(chapter.id, { status: "writing" });

        const sectionLabel = this.getSectionLabel(sectionData);
        this.callbacks.onAgentStatus("ghostwriter", "writing", `El Narrador está escribiendo ${sectionLabel}...`);

        let chapterContent = "";
        let approved = false;
        let refinementAttempts = 0;
        let wordCountRetries = 0;
        let pendingContinuityViolations: string[] = [];
        let refinementInstructions = "";
        let extractedContinuityState: any = null;
        
        let bestVersion = { content: "", score: 0, continuityState: null as any };
        let attemptsSinceBestImprovement = 0;

        while (!approved && refinementAttempts < this.maxRefinementLoops) {
          if (this.aborted) {
            console.log(`[Orchestrator:Resume] Aborted inside refinement loop for chapter ${sectionData.numero} (project ${project.id}). Exiting silently.`);
            return;
          }
          const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
          const fullStyleGuide = styleGuideContent 
            ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
            : baseStyleGuide;

          const isRewrite = refinementAttempts > 0 || wordCountRetries > 0;
          const totalChaptersResume = existingChapters.length || project.chapterCount || 1;
          const calculatedTarget = this.calculatePerChapterTarget((project as any).minWordCount, totalChaptersResume);
          const perChapterMinResume = (project as any).minWordsPerChapter || calculatedTarget;
          const perChapterMaxResume = (project as any).maxWordsPerChapter || Math.round(perChapterMinResume * 1.15);
          const enrichedWBResume = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesUnresolvedThreadsResume, seriesKeyEventsResume);
          const previousContent = isRewrite ? (bestVersion.content || undefined) : undefined;

          const isStalledResume = refinementAttempts >= 2 && bestVersion.score === 7 && bestVersion.score <= 7;
          const stalledEscalationResume = isStalledResume
            ? `\n\n⚠️ PERSPECTIVA FRESCA REQUERIDA: Los intentos anteriores se estancaron en 7/10. El editor detecta los mismos problemas repetidamente. NO sigas la misma estructura — reimagina las escenas desde un ángulo completamente diferente. Cambia las aperturas de escena, los patrones de diálogo, la distribución sensorial. Sorpréndeme.`
            : "";

          const writerResult = await this.ghostwriter.execute({
            chapterNumber: sectionData.numero,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBResume, this.resolveLexicoForChapter(worldBibleData, sectionData.numero)),
            guiaEstilo: fullStyleGuide,
            previousContinuity,
            refinementInstructions: refinementInstructions + stalledEscalationResume,
            antiRepetitionGuidance: (project as any).antiRepetitionGuidance || undefined,
            authorName,
            isRewrite: isRewrite || isStalledResume,
            minWordCount: perChapterMinResume,
            maxWordCount: perChapterMaxResume,
            extendedGuideContent: extendedGuideContent || undefined,
            previousChapterContent: isStalledResume ? undefined : previousContent,
            kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
          });

          const { cleanContent, continuityState } = this.ghostwriter.extractContinuityState(writerResult.content);
          let currentContent = cleanContent;
          const currentContinuityState = continuityState;
          
          if (writerResult.error) {
            console.warn(`[Orchestrator] Ghostwriter returned error: ${writerResult.error}`);
          }
          
          const ABSOLUTE_MIN = 500;
          const TARGET_MIN = perChapterMinResume;
          const TARGET_MAX = perChapterMaxResume;
          const FLEXIBLE_MIN = Math.floor(TARGET_MIN * 0.90);
          const FLEXIBLE_MAX = Math.ceil(TARGET_MAX * 1.10);
          const MAX_WORD_COUNT_RETRIES = 5;
          const contentWordCount = currentContent.split(/\s+/).filter((w: string) => w.length > 0).length;
          
          if (contentWordCount < ABSOLUTE_MIN) {
            if (contentWordCount > bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length) {
              bestVersion.content = currentContent;
              bestVersion.continuityState = currentContinuityState;
            }
            if (wordCountRetries < MAX_WORD_COUNT_RETRIES) {
              wordCountRetries++;
              const isEmptyResponse = contentWordCount === 0;
              const waitTime = isEmptyResponse ? 20000 : 10000;
              
              if (isEmptyResponse) {
                console.warn(`[Orchestrator] ⚠️ Respuesta VACÍA (0 palabras) para ${sectionLabel}. Error API: ${writerResult.error || 'ninguno'}. Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES} tras ${waitTime/1000}s...`);
                this.callbacks.onAgentStatus("ghostwriter", "warning", 
                  `${sectionLabel}: respuesta vacía del modelo. Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
                );
                refinementInstructions = "";
              } else {
                console.warn(`[Orchestrator] Capítulo severamente truncado: ${contentWordCount} palabras < ${ABSOLUTE_MIN}. Reintentando (${wordCountRetries}/${MAX_WORD_COUNT_RETRIES})...`);
                this.callbacks.onAgentStatus("ghostwriter", "warning", 
                  `${sectionLabel} truncado (${contentWordCount} palabras). Reintentando ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
                );
                refinementInstructions = `CRÍTICO: Tu respuesta fue TRUNCADA con solo ${contentWordCount} palabras. DEBES escribir el capítulo COMPLETO con ${TARGET_MIN}-${TARGET_MAX} palabras.`;
              }
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            } else {
              console.warn(`[Orchestrator] ⚠️ ${sectionLabel} severamente truncado (${contentWordCount} palabras) después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando con mejor resultado.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel}: ${contentWordCount} palabras tras ${MAX_WORD_COUNT_RETRIES} intentos truncados. Continuando...`
              );
              if (bestVersion.content && bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length > contentWordCount) {
                currentContent = bestVersion.content;
              }
            }
          }
          
          if (contentWordCount < FLEXIBLE_MIN && contentWordCount >= ABSOLUTE_MIN) {
            if (contentWordCount > bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length) {
              bestVersion.content = currentContent;
              bestVersion.continuityState = currentContinuityState;
            }
            if (wordCountRetries < MAX_WORD_COUNT_RETRIES) {
              wordCountRetries++;
              console.warn(`[Orchestrator] Capítulo corto: ${contentWordCount} palabras < ${FLEXIBLE_MIN} mínimo flexible (${TARGET_MIN} -10%). Intento ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}. Expandiendo...`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel} muy corto (${contentWordCount}/${TARGET_MIN}-${TARGET_MAX} palabras). Expandiendo ${wordCountRetries}/${MAX_WORD_COUNT_RETRIES}...`
              );
              refinementInstructions = `EXPANSIÓN OBLIGATORIA — NO REESCRIBAS DESDE CERO:
Tu borrador anterior tiene ${contentWordCount} palabras pero necesita ${TARGET_MIN}-${TARGET_MAX} palabras.
ESTRATEGIA DE EXPANSIÓN (aplica TODAS):
1. CONSERVA TODO el texto existente — no elimines ni resumas nada
2. EXPANDE las escenas de diálogo: añade réplicas adicionales, reacciones corporales, silencios significativos
3. PROFUNDIZA el monólogo interno de los personajes: pensamientos, recuerdos, asociaciones
4. ENRIQUECE las descripciones sensoriales: olores, texturas, sonidos ambientales, temperatura
5. DESARROLLA las transiciones entre beats: no saltes de una acción a otra, narra el movimiento
6. AÑADE micro-escenas de tensión o distensión entre los beats principales
PROHIBIDO: Eliminar pasajes que funcionan, resumir lo que ya estaba narrado, reescribir desde cero.
Este es el intento #${wordCountRetries} de ${MAX_WORD_COUNT_RETRIES}.`;
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue;
            } else {
              console.warn(`[Orchestrator] ⚠️ ${sectionLabel} sigue corto (${contentWordCount}/${FLEXIBLE_MIN} mín) después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando con el mejor resultado.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning", 
                `${sectionLabel}: ${contentWordCount} palabras después de ${MAX_WORD_COUNT_RETRIES} intentos. Continuando...`
              );
            }
          }
          
          wordCountRetries = 0;
          
          if (contentWordCount > FLEXIBLE_MAX) {
            console.warn(`[Orchestrator] ⚠️ Capítulo largo: ${sectionLabel} tiene ${contentWordCount} palabras (máximo flexible: ${FLEXIBLE_MAX}). Pasando al Editor.`);
          }
          
          await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", sectionData.numero, "chapter_write");

          if (writerResult.thoughtSignature) {
            await storage.createThoughtLog({
              projectId: project.id,
              chapterId: chapter.id,
              agentName: "El Narrador",
              agentRole: "ghostwriter",
              thoughtContent: writerResult.thoughtSignature,
            });
          }

          if (characterStates.size > 0) {
            const continuityCheck = this.validateImmediateContinuity(currentContent, characterStates, worldBibleData.world_bible);
            
            if (!continuityCheck.valid) {
              const currentBestWords = bestVersion.content.split(/\s+/).filter((w: string) => w.length > 0).length;
              if (contentWordCount > currentBestWords) {
                bestVersion.content = currentContent;
                bestVersion.continuityState = currentContinuityState;
              }

              console.warn(`[Orchestrator] ${sectionLabel}: ${continuityCheck.violations.length} violación(es) de continuidad detectadas. Escalando directamente al Editor con violaciones inyectadas para plan quirúrgico.`);
              this.callbacks.onAgentStatus("ghostwriter", "warning",
                `${sectionLabel}: ${continuityCheck.violations.length} violación(es) de continuidad. Escalando al Editor para plan quirúrgico...`
              );
              pendingContinuityViolations = continuityCheck.violations;
            } else {
              pendingContinuityViolations = [];
            }
          }

          await storage.updateChapter(chapter.id, { status: "editing" });
          this.callbacks.onAgentStatus("editor", "editing", `El Editor está revisando ${sectionLabel}...`);

          const editorChaptersCtx = await storage.getChaptersByProject(project.id);
          const enrichedWBForEditor = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
          const resolvedLexicoForEditor = this.resolveLexicoForChapter(worldBibleData, sectionData.numero);
          const editorResult = await this.editor.execute({
            chapterNumber: sectionData.numero,
            chapterContent: currentContent,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBForEditor, resolvedLexicoForEditor),
            guiaEstilo: styleGuideContent
              ? `Género: ${project.genre}, Tono: ${project.tone}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
              : `Género: ${project.genre}, Tono: ${project.tone}`,
            previousContinuityState: previousContinuityStateForEditor,
            previousChaptersContext: this.buildPreviousChaptersContextForEditor(editorChaptersCtx, sectionData.numero),
            continuityViolations: pendingContinuityViolations.length > 0 ? pendingContinuityViolations : undefined,
          });

          await this.trackTokenUsage(project.id, editorResult.tokenUsage, "El Editor", "deepseek-v4-flash", sectionData.numero, "chapter_edit");

          if (editorResult.thoughtSignature) {
            await storage.createThoughtLog({
              projectId: project.id,
              chapterId: chapter.id,
              agentName: "El Editor",
              agentRole: "editor",
              thoughtContent: editorResult.thoughtSignature,
            });
          }

          this.enforceApprovalLogic(editorResult);
          const currentScore = editorResult.result?.puntuacion || 0;
          const currentHardReject = this.hasHardRejectViolations(editorResult.result);

          const cleanBeatsHard = !currentHardReject && (bestVersion as any).hardReject === true;
          const sameRejectStatusBetterScore = (currentHardReject === ((bestVersion as any).hardReject ?? false)) && currentScore > bestVersion.score;
          const firstPass = bestVersion.score === 0;
          if (cleanBeatsHard || sameRejectStatusBetterScore || firstPass) {
            bestVersion = {
              content: currentContent,
              score: currentScore,
              continuityState: currentContinuityState,
              hardReject: currentHardReject,
            } as any;
            attemptsSinceBestImprovement = 0;
            console.log(`[Orchestrator Resume] New best version for ${sectionLabel}: ${currentScore}/10${currentHardReject ? " (con hard-reject)" : " (limpio)"}`);
          } else {
            attemptsSinceBestImprovement++;
            console.log(`[Orchestrator Resume] Keeping previous best version (${bestVersion.score}/10) over current (${currentScore}/10) — sin mejora desde hace ${attemptsSinceBestImprovement} intento(s)`);
          }

          if (editorResult.result?.aprobado) {
            approved = true;
            this.callbacks.onAgentStatus("editor", "completed", `${sectionLabel} aprobado (${currentScore}/10)`);
          } else {
            refinementAttempts++;

            if (attemptsSinceBestImprovement >= 2) {
              console.log(`[Orchestrator Resume] Anti-stagnation: ${sectionLabel} sin mejorar la mejor versión (${bestVersion.score}/10) tras ${attemptsSinceBestImprovement} intentos. Stopping rewrites.`);
              this.callbacks.onAgentStatus("editor", "editing",
                `${sectionLabel} sin mejora tras ${attemptsSinceBestImprovement} intentos (mejor: ${bestVersion.score}/10). Usando mejor versión.`
              );
              break;
            }

            refinementInstructions = this.buildRefinementInstructions(editorResult.result);
            this.callbacks.onAgentStatus("editor", "editing", 
              `${sectionLabel} rechazado (${currentScore}/10). Mejor: ${bestVersion.score}/10. Intento ${refinementAttempts}/${this.maxRefinementLoops}.`
            );
          }
        }
        
        chapterContent = bestVersion.content;
        extractedContinuityState = bestVersion.continuityState;
        console.log(`[Orchestrator Resume] Using best version for ${sectionLabel}: ${bestVersion.score}/10`);

        this.callbacks.onAgentStatus("copyeditor", "polishing", `El Estilista está puliendo ${sectionLabel}...`);

        const polishResult = await this.copyeditor.execute({
          chapterContent,
          chapterNumber: sectionData.numero,
          chapterTitle: sectionData.titulo,
          guiaEstilo: styleGuideContent || undefined,
          lexicoHistorico: this.resolveLexicoForChapter(worldBibleData, sectionData.numero),
        });

        await this.trackTokenUsage(project.id, polishResult.tokenUsage, "El Estilista", "deepseek-v4-flash", sectionData.numero, "polish");

        if (polishResult.thoughtSignature) {
          await storage.createThoughtLog({
            projectId: project.id,
            chapterId: chapter.id,
            agentName: "El Estilista",
            agentRole: "copyeditor",
            thoughtContent: polishResult.thoughtSignature,
          });
        }

        const finalContent = polishResult.result?.texto_final || chapterContent;
        const wordCount = finalContent.split(/\s+/).length;

        await storage.updateChapter(chapter.id, {
          content: finalContent,
          wordCount,
          status: "completed",
          continuityState: extractedContinuityState,
        });

        if (extractedContinuityState) {
          previousContinuity = JSON.stringify(extractedContinuityState);
          previousContinuityStateForEditor = extractedContinuityState;
          console.log(`[Orchestrator Resume] Passing continuity state to next chapter`);
        } else {
          previousContinuity = `${sectionLabel} completado.`;
          previousContinuityStateForEditor = null;
        }

        const freshChapters = await storage.getChaptersByProject(project.id);
        const completedCount = freshChapters.filter(c => c.status === "completed").length;
        this.callbacks.onChapterComplete(sectionData.numero, wordCount, sectionData.titulo);
        this.callbacks.onAgentStatus("copyeditor", "completed", `${sectionLabel} finalizado (${wordCount} palabras)`);

        await this.enrichWorldBibleFromChapter(project.id, sectionData.numero, extractedContinuityState, finalContent);

        // PREVENTIVO: cada 5 capítulos completados, alimentar al Ghostwriter con patrones a evitar.
        await this.runProactiveSemanticScan(project, completedCount, existingChapters.length || project.chapterCount || 0, worldBibleData);

        // QA: Continuity Sentinel checkpoint every 5 chapters
        if (completedCount > 0 && completedCount % this.continuityCheckpointInterval === 0) {
          const chaptersForCheckpoint = freshChapters
            .filter(c => c.status === "completed" && c.chapterNumber > 0)
            .sort((a, b) => a.chapterNumber - b.chapterNumber)
            .slice(-this.continuityCheckpointInterval);
          
          if (chaptersForCheckpoint.length >= this.continuityCheckpointInterval) {
            const checkpointNumber = Math.floor(completedCount / this.continuityCheckpointInterval);
            const checkpointResult = await this.runContinuityCheckpoint(
              project,
              checkpointNumber,
              chaptersForCheckpoint,
              worldBibleData,
              []
            );
            
            if (!checkpointResult.passed) {
              const hasActionableIssues = checkpointResult.issues.some(issue => 
                issue.includes("[CRITICA]") || issue.includes("[CRÍTICA]") ||
                issue.includes("[MAYOR]") ||
                issue.toLowerCase().includes("critica") || issue.toLowerCase().includes("crítica") ||
                issue.toLowerCase().includes("mayor")
              );
              
              if (hasActionableIssues && checkpointResult.chaptersToRevise.length > 0) {
                this.callbacks.onAgentStatus("continuity-sentinel", "editing", 
                  `Disparando correcciones para ${checkpointResult.chaptersToRevise.length} capítulos con errores de continuidad detectados`
                );
                
                const allProjectChaptersResume = await storage.getChaptersByProject(project.id);
                
                for (const chapterNum of checkpointResult.chaptersToRevise) {
                  const chapterToFix = allProjectChaptersResume.find(c => c.chapterNumber === chapterNum && c.status === "completed");
                  
                  if (chapterToFix) {
                    const sectionForFix = this.buildSectionDataFromChapter(chapterToFix, worldBibleData);
                    const chapterNumStr = String(chapterNum);
                    const issuesForChapter = checkpointResult.issues.filter(issue => {
                      const lower = issue.toLowerCase();
                      return lower.includes(`capítulo ${chapterNumStr}`) || 
                             lower.includes(`cap ${chapterNumStr}`) ||
                             lower.includes(`cap. ${chapterNumStr}`) ||
                             lower.includes(`capitulo ${chapterNumStr}`);
                    }).join("\n");
                    
                    const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
                    const fullStyleGuide = styleGuideContent 
                      ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
                      : baseStyleGuide;
                    
                    await this.rewriteChapterForQA(
                      project,
                      chapterToFix,
                      sectionForFix,
                      worldBibleData,
                      fullStyleGuide,
                      "continuity",
                      issuesForChapter || checkpointResult.issues.join("\n")
                    );
                  }
                }
              } else if (hasActionableIssues) {
                this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
                  `Issues de continuidad detectados pero sin capítulos específicos identificados. Se anotarán para la auditoría final.`
                );
              } else {
                this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
                  `Issues menores detectados. Se anotarán para la auditoría final.`
                );
              }
            }
          }
        }
      }

      const projectForVoiceCheck = await storage.getProject(project.id);
      const revisionCycleForVoiceResume = projectForVoiceCheck?.revisionCycle || 0;
      const skipVoiceAuditor = revisionCycleForVoiceResume > 0 && this.chaptersRewrittenInCurrentCycle === 0;
      
      if (skipVoiceAuditor) {
        this.callbacks.onAgentStatus("voice-auditor", "skipped", 
          `Auditor de voz omitido - sin capítulos modificados desde la última pasada`
        );
        console.log(`[Orchestrator] Skipping voice auditor for project ${project.id} - no chapters revised`);
      } else {
        const allCompletedChapters = await storage.getChaptersByProject(project.id);
        const completedForAnalysis = allCompletedChapters.filter(c => c.status === "completed" && c.content);
        
        if (completedForAnalysis.length >= 5) {
          const trancheSize = 10;
          const totalTranches = Math.ceil(completedForAnalysis.length / trancheSize);
          
          for (let t = 0; t < totalTranches; t++) {
            const trancheChapters = completedForAnalysis.slice(t * trancheSize, (t + 1) * trancheSize);
            if (trancheChapters.length > 0) {
              const voiceResult = await this.runVoiceRhythmAudit(project, t + 1, trancheChapters, styleGuideContent);
              
              if (!voiceResult.passed && voiceResult.chaptersToRevise.length > 0) {
                this.callbacks.onAgentStatus("voice-auditor", "editing", 
                  `Puliendo ${voiceResult.chaptersToRevise.length} capítulos con problemas de voz/ritmo`
                );
                
                for (const chapterNum of voiceResult.chaptersToRevise) {
                  const chapterToPolish = trancheChapters.find(c => c.chapterNumber === chapterNum);
                  if (chapterToPolish) {
                    const issuesForChapter = voiceResult.issues.filter(issue => 
                      issue.includes(`capítulo ${chapterNum}`) || issue.includes(`Cap ${chapterNum}`)
                    ).join("\n");
                    
                    await this.polishChapterForVoice(
                      project,
                      chapterToPolish,
                      styleGuideContent,
                      issuesForChapter || voiceResult.issues.join("\n")
                    );
                  }
                }
              }
            }
          }
        }
      }

      const updatedProject = await storage.getProject(project.id);
      const revisionCycleForSemanticResume = updatedProject?.revisionCycle || 0;
      const skipSemanticResume = revisionCycleForSemanticResume > 0 && this.chaptersRewrittenInCurrentCycle === 0;
      const MAX_SEMANTIC_ATTEMPTS_RESUME = 4;
      
      if (skipSemanticResume) {
        this.callbacks.onAgentStatus("semantic-detector", "skipped", 
          `Detector semántico omitido - sin capítulos modificados desde la última pasada`
        );
        console.log(`[Orchestrator] Skipping semantic detector for project ${project.id} - no chapters revised`);
      } else {
        let semanticAttemptResume = 0;
        let semanticPassedResume = false;
        
        while (semanticAttemptResume < MAX_SEMANTIC_ATTEMPTS_RESUME && !semanticPassedResume) {
          semanticAttemptResume++;
          
          const refreshedChaptersForSemantic = await storage.getChaptersByProject(project.id);
          const completedForSemanticAnalysis = refreshedChaptersForSemantic.filter(c => c.status === "completed" && c.content);

          if (completedForSemanticAnalysis.length === 0) break;
          
          this.callbacks.onAgentStatus("semantic-detector", "analyzing", 
            `Análisis semántico (intento ${semanticAttemptResume}/${MAX_SEMANTIC_ATTEMPTS_RESUME})...`
          );
          
          const semanticResult = await this.runSemanticRepetitionAnalysis(project, completedForSemanticAnalysis, worldBibleData);
          
          if (semanticResult.passed) {
            semanticPassedResume = true;
            this.callbacks.onAgentStatus("semantic-detector", "complete", 
              `Análisis semántico aprobado`
            );
            break;
          }
          
          if (semanticAttemptResume >= MAX_SEMANTIC_ATTEMPTS_RESUME) {
            this.callbacks.onAgentStatus("semantic-detector", "warning", 
              `Máximo de intentos alcanzado. Continuando con observaciones menores.`
            );
            console.log(`[Orchestrator] Semantic detector: max attempts reached, accepting with warnings`);
            break;
          }
          
          if (semanticResult.chaptersToRevise.length > 0) {
            this.callbacks.onAgentStatus("semantic-detector", "editing", 
              `Corrigiendo ${semanticResult.chaptersToRevise.length} capítulos (intento ${semanticAttemptResume})`
            );
            
            for (const chapterNum of semanticResult.chaptersToRevise) {
              const chapterToFix = completedForSemanticAnalysis.find(c => c.chapterNumber === chapterNum);
              
              if (chapterToFix) {
                const sectionForFix = this.buildSectionDataFromChapter(chapterToFix, worldBibleData);
                const freshChapter = await storage.getChaptersByProject(project.id)
                  .then(chs => chs.find(c => c.chapterNumber === chapterNum));
                if (!freshChapter) continue;
                
                const clusterIssues = semanticResult.clusters
                  .filter(c => c.capitulos_afectados?.includes(chapterNum))
                  .map(c => `Repetición de idea: "${c.descripcion}"\n⚠️ PRESERVAR: ${c.elementos_a_preservar || "El resto del capítulo"}\n✏️ CORRECCIÓN: ${c.fix_sugerido}`)
                  .join("\n\n");
                
                const foreshadowingIssues = semanticResult.foreshadowingStatus
                  .filter(f => f.estado === "sin_payoff")
                  .map(f => `Foreshadowing sin resolver: "${f.setup}" (plantado en cap ${f.capitulo_setup}) - DEBES resolverlo o eliminarlo`)
                  .join("\n");
                
                const allIssues = [clusterIssues, foreshadowingIssues].filter(Boolean).join("\n\n");
                
                if (allIssues) {
                  const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
                  const fullStyleGuideResume = styleGuideContent 
                    ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
                    : baseStyleGuide;
                  
                  await this.rewriteChapterForQA(
                    project,
                    freshChapter,
                    sectionForFix,
                    worldBibleData,
                    fullStyleGuideResume,
                    "semantic",
                    allIssues
                  );
                }
              }
            }
          }
        }
      }

      // Final Review
      const finalChapters = await storage.getChaptersByProject(project.id);
      const allSections = (worldBibleData.escaleta_capitulos as any[]) || [];
      const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
      const fullStyleGuide = styleGuideContent 
        ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
        : baseStyleGuide;
      
      const finalReviewApproved = await this.runFinalReview(
        project, 
        finalChapters, 
        worldBibleData, 
        fullStyleGuide, 
        allSections,
        styleGuideContent,
        authorName
      );

      if (finalReviewApproved) {
        await this.finalizeCompletedProject(project);
      } else {
        await storage.updateProject(project.id, { status: "failed_final_review" });
        this.callbacks.onError("El manuscrito no pasó la revisión final después de múltiples intentos.");
      }

    } catch (error) {
      console.error("[Orchestrator] Resume error:", error);
      await storage.updateProject(project.id, { status: "error" });
      this.callbacks.onError(error instanceof Error ? error.message : "Error al retomar la generación");
    }
  }

  /**
   * Resuelve el bloque de léxico histórico que aplica a un capítulo concreto.
   * - Si el capítulo declara `epoca_id` y la WB tiene `lexico_historico.epocas_paralelas`,
   *   devuelve el objeto de esa época paralela (con epoca/listas/registro/notas) más los
   *   campos auxiliares útiles para el prompt.
   * - Si no hay match o el capítulo no declara `epoca_id`, devuelve el bloque raíz.
   * - Si la WB no tiene `lexico_historico` en absoluto, devuelve null (sin restricciones).
   */
  private resolveLexicoForChapter(
    worldBibleData: ParsedWorldBible | null | undefined,
    chapterNumber: number,
  ): any {
    const root = worldBibleData?.world_bible?.lexico_historico;
    if (!root) return null;

    const cap = (worldBibleData?.escaleta_capitulos as any[])?.find(
      (c: any) => Number(c?.numero) === Number(chapterNumber),
    );
    const epocaId: string | null | undefined = cap?.epoca_id;
    const epocasParalelas: any[] = (root as any)?.epocas_paralelas || [];

    if (epocaId && Array.isArray(epocasParalelas) && epocasParalelas.length > 0) {
      const match = epocasParalelas.find((e: any) => e?.id === epocaId);
      if (match) {
        return {
          epoca: match.epoca || root.epoca || "",
          registro_linguistico: match.registro_linguistico || root.registro_linguistico || "",
          vocabulario_epoca_autorizado: match.vocabulario_epoca_autorizado || [],
          terminos_anacronicos_prohibidos: match.terminos_anacronicos_prohibidos || [],
          notas_voz_historica: match.notas_voz_historica || root.notas_voz_historica || "",
          _resolved_from: `epocas_paralelas[id=${epocaId}]`,
        };
      }
      console.warn(`[Orchestrator] Capítulo ${chapterNumber} declara epoca_id="${epocaId}" pero no existe en epocas_paralelas. Usando lexico raíz.`);
    }

    return root;
  }

  /**
   * Devuelve un clon superficial de la WB en el que `lexico_historico` queda
   * sustituido por el bloque resuelto para el capítulo. Esto permite que el
   * editor (que lee `worldBible.lexico_historico.epoca`) trabaje con la época
   * correcta sin cambiar su lógica interna.
   */
  private worldBibleWithResolvedLexico(worldBible: any, resolvedLexico: any): any {
    if (!worldBible) return worldBible;
    if (!resolvedLexico) return worldBible;
    return {
      ...worldBible,
      lexico_historico: resolvedLexico,
    };
  }

  private reconstructWorldBibleData(worldBible: WorldBible, project: Project): ParsedWorldBible {
    const plotOutlineData = worldBible.plotOutline as any;
    const timeline = (worldBible.timeline as TimelineEvent[]) || [];
    
    const lugares = timeline
      .map((t: any) => t.ubicacion || t.location)
      .filter((loc: any) => loc)
      .filter((loc: string, i: number, arr: string[]) => arr.indexOf(loc) === i);
    
    // Reconstruir escaleta_capitulos desde chapterOutlines con todos los campos adicionales
    const escaleta_capitulos = (plotOutlineData?.chapterOutlines || []).map((c: any) => ({
      numero: c.number,
      titulo: c.titulo || c.summary || `Capítulo ${c.number}`,
      epoca_id: c.epoca_id ?? null,
      cronologia: c.cronologia || "",
      ubicacion: c.ubicacion || "",
      elenco_presente: c.elenco_presente || [],
      objetivo_narrativo: c.summary || "",
      beats: c.keyEvents || [],
      funcion_estructural: c.funcion_estructural,
      informacion_nueva: c.informacion_nueva,
      pregunta_dramatica: c.pregunta_dramatica,
      conflicto_central: c.conflicto_central,
      giro_emocional: c.giro_emocional,
      recursos_literarios_sugeridos: c.recursos_literarios_sugeridos,
      tono_especifico: c.tono_especifico,
      prohibiciones_este_capitulo: c.prohibiciones_este_capitulo,
      arcos_que_avanza: c.arcos_que_avanza,
      continuidad_entrada: c.continuidad_entrada,
      continuidad_salida: c.continuidad_salida,
      riesgos_de_verosimilitud: c.riesgos_de_verosimilitud,
    }));
    
    return {
      world_bible: {
        personajes: (worldBible.characters as Character[]) || [],
        lugares: lugares,
        reglas_lore: (worldBible.worldRules as WorldRule[]) || [],
        lexico_historico: plotOutlineData?.lexico_historico || null,
      },
      escaleta_capitulos,
      premisa: plotOutlineData?.premise || project.premise || "",
    };
  }

  // helper: incluye epoca_id al mapear chapterOutlines en reconstrucción

  private buildSectionDataFromChapter(chapter: Chapter, worldBibleData: ParsedWorldBible): SectionData {
    const plotItem = (worldBibleData.escaleta_capitulos as any[])?.find(
      (p: any) => p.numero === chapter.chapterNumber
    );
    
    return {
      numero: chapter.chapterNumber,
      titulo: chapter.title || `Capítulo ${chapter.chapterNumber}`,
      cronologia: plotItem?.cronologia || "",
      ubicacion: plotItem?.ubicacion || "",
      elenco_presente: plotItem?.elenco_presente || [],
      objetivo_narrativo: plotItem?.objetivo_narrativo || "",
      beats: plotItem?.beats || [],
      continuidad_salida: plotItem?.continuidad_salida || "",
      tipo: chapter.chapterNumber === 0 ? "prologue" 
        : chapter.chapterNumber === -1 ? "epilogue" 
        : chapter.chapterNumber === -2 ? "author_note" 
        : "chapter",
      funcion_estructural: plotItem?.funcion_estructural,
      informacion_nueva: plotItem?.informacion_nueva,
      conflicto_central: plotItem?.conflicto_central,
      giro_emocional: plotItem?.giro_emocional,
      riesgos_de_verosimilitud: plotItem?.riesgos_de_verosimilitud,
    };
  }

  private async runFinalReview(
    project: Project,
    chapters: Chapter[],
    worldBibleData: ParsedWorldBible,
    guiaEstilo: string,
    allSections: SectionData[],
    styleGuideContent: string,
    authorName: string
  ): Promise<boolean> {
    let revisionCycle = 0;
    let issuesPreviosCorregidos: string[] = [];
    let consecutiveHighScores = 0;
    let previousScores: number[] = [];
    const chapterRewriteTracker: Map<number, Map<string, number>> = new Map();
    const MAX_REWRITES_PER_ERROR_TYPE = 3;
    const MAX_REWRITES_PER_CHAPTER = 3;
    
    let seriesUnresolvedThreadsQA: string[] = [];
    let seriesKeyEventsQA: string[] = [];
    let seriesContextForReview: any = undefined;
    if (project.seriesId) {
      try {
        const { threads: loadedThreads, events: loadedEvents } = await this.loadSeriesThreadsAndEvents(project);
        seriesUnresolvedThreadsQA = loadedThreads;
        seriesKeyEventsQA = loadedEvents;
        const seriesData = await storage.getSeries(project.seriesId);
        if (seriesData) {
          const milestones = await storage.getMilestonesBySeries(project.seriesId);
          const plotThreads = await storage.getPlotThreadsBySeries(project.seriesId);
          const unresolvedThreadsFromPrev = loadedThreads;
          const keyEventsFromPrev = loadedEvents;

          const volumeNumber = project.seriesOrder || 1;
          const totalVolumes = seriesData.totalPlannedBooks || 10;
          const volumeMilestones = milestones.filter(m => m.volumeNumber === volumeNumber);

          seriesContextForReview = {
            seriesTitle: seriesData.title,
            volumeNumber,
            totalVolumes,
            unresolvedThreadsFromPrevBooks: unresolvedThreadsFromPrev,
            keyEventsFromPrevBooks: keyEventsFromPrev,
            milestones: volumeMilestones.map(m => ({ description: m.description, isRequired: m.isRequired })),
            plotThreads: plotThreads.map(t => ({ threadName: t.threadName, status: t.status, importance: t.importance })),
            isLastVolume: volumeNumber >= totalVolumes,
          };
          console.log(`[Orchestrator] Series context for Final Reviewer: vol ${volumeNumber}/${totalVolumes}, ${unresolvedThreadsFromPrev.length} unresolved threads, ${volumeMilestones.length} milestones, ${plotThreads.length} plot threads, isLast=${volumeNumber >= totalVolumes}`);
        }
      } catch (err) {
        console.warn(`[Orchestrator] Failed to load series context for final review:`, err);
      }
    }
    
    while (revisionCycle < this.maxFinalReviewCycles) {
      this.chaptersRewrittenInCurrentCycle = 0;
      const consecutiveInfo = consecutiveHighScores > 0 
        ? ` [${consecutiveHighScores}/${this.requiredConsecutiveHighScores} puntuaciones 9+ consecutivas]`
        : "";
      this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
        `El Revisor Final está analizando el manuscrito completo... (Ciclo ${revisionCycle + 1}/${this.maxFinalReviewCycles})${consecutiveInfo}`
      );

      const updatedChapters = await storage.getChaptersByProject(project.id);
      const chaptersForReview = updatedChapters
        .filter(c => c.content)
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map(c => ({
          numero: c.chapterNumber,
          titulo: c.title || `Capítulo ${c.chapterNumber}`,
          contenido: c.content || "",
        }));

      const reviewResult = await this.finalReviewer.execute({
        projectTitle: project.title,
        chapters: chaptersForReview,
        worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
        guiaEstilo,
        pasadaNumero: revisionCycle + 1,
        issuesPreviosCorregidos,
        capitulosConLimitaciones: this.buildLimitationsFromTracker(chapterRewriteTracker, MAX_REWRITES_PER_CHAPTER),
        seriesContext: seriesContextForReview,
      });

      await this.trackTokenUsage(project.id, reviewResult.tokenUsage, "El Revisor Final", "deepseek-v4-flash", undefined, "final_review");

      if (reviewResult.thoughtSignature) {
        await storage.createThoughtLog({
          projectId: project.id,
          agentName: "El Revisor Final",
          agentRole: "final-reviewer",
          thoughtContent: reviewResult.thoughtSignature,
        });
      }

      const result = reviewResult.result;
      
      // Round score to integer for database storage (finalScore is integer type)
      const scoreForDb = result?.puntuacion_global != null 
        ? Math.round(result.puntuacion_global) 
        : null;
      
      await storage.updateProject(project.id, { 
        revisionCycle: revisionCycle + 1,
        finalReviewResult: result as any,
        finalScore: scoreForDb
      });
      
      // === NUEVO: Procesar decisiones de trama, lesiones persistentes y capítulos huérfanos ===
      if (result) {
        // Guardar plot_decisions y persistent_injuries en World Bible
        const worldBible = await storage.getWorldBibleByProject(project.id);
        if (worldBible) {
          let needsUpdate = false;
          const updates: any = {};
          
          if (result.plot_decisions && result.plot_decisions.length > 0) {
            updates.plotDecisions = result.plot_decisions;
            needsUpdate = true;
            await storage.createActivityLog({
              projectId: project.id,
              level: "info",
              message: `Final Reviewer detectó ${result.plot_decisions.length} decisiones de trama críticas`,
              agentRole: "final-reviewer",
            });
          }
          
          if (result.persistent_injuries && result.persistent_injuries.length > 0) {
            updates.persistentInjuries = result.persistent_injuries;
            needsUpdate = true;
            await storage.createActivityLog({
              projectId: project.id,
              level: "info", 
              message: `Final Reviewer detectó ${result.persistent_injuries.length} lesiones persistentes que verificar`,
              agentRole: "final-reviewer",
            });
          }

          if (result.appearance_drift && result.appearance_drift.length > 0) {
            await storage.createActivityLog({
              projectId: project.id,
              level: "warning",
              message: `Final Reviewer detectó ${result.appearance_drift.length} inconsistencias de apariencia física`,
              agentRole: "final-reviewer",
            });
          }

          if (result.knowledge_leaks && result.knowledge_leaks.length > 0) {
            const criticalCount = result.knowledge_leaks.filter(l => l.severity === "CRITICAL").length;
            await storage.createActivityLog({
              projectId: project.id,
              level: criticalCount > 0 ? "warning" : "info",
              message: `Final Reviewer detectó ${result.knowledge_leaks.length} filtraciones de conocimiento (${criticalCount} críticas)`,
              agentRole: "final-reviewer",
            });
          }
          
          if (needsUpdate) {
            await storage.updateWorldBible(worldBible.id, updates);
            console.log(`[FinalReviewer] World Bible actualizado con: plotDecisions=${updates.plotDecisions?.length || 0}, persistentInjuries=${updates.persistentInjuries?.length || 0}`);
            await storage.createActivityLog({
              projectId: project.id,
              level: "info",
              message: `World Bible actualizado: ${updates.plotDecisions?.length || 0} decisiones de trama, ${updates.persistentInjuries?.length || 0} lesiones persistentes guardadas`,
              agentRole: "final-reviewer",
            });
          }
        }
        
        const syntheticIssueScore = result?.puntuacion_global || 0;
        const shouldInjectSyntheticIssues = syntheticIssueScore < this.minAcceptableScore;
        
        if (!shouldInjectSyntheticIssues && (result.plot_decisions?.some(d => d.consistencia_actual === "inconsistente") || result.persistent_injuries?.some(i => i.consistencia === "ignorada"))) {
          console.log(`[Orchestrator] Score ${syntheticIssueScore}/10 >= ${this.minAcceptableScore}: suppressing synthetic issue injection from plot_decisions/persistent_injuries only (appearance_drift, knowledge_leaks, orphan_chapters still active)`);
        }
        
        if (shouldInjectSyntheticIssues && result.plot_decisions) {
          const inconsistentDecisions = result.plot_decisions.filter(d => d.consistencia_actual === "inconsistente");
          for (const decision of inconsistentDecisions) {
            const newIssue = {
              capitulos_afectados: decision.capitulos_afectados,
              categoria: "identidad_confusa" as const,
              descripcion: `DECISIÓN DE TRAMA INCONSISTENTE: ${decision.decision}. ${decision.problema || ""}`,
              severidad: "critica" as const,
              elementos_a_preservar: "Preservar toda la trama excepto las líneas que crean la confusión de identidad",
              instrucciones_correccion: `CLARIFICAR: En el capítulo ${decision.capitulo_establecido} establecer claramente que ${decision.decision}. En capítulos posteriores, asegurar que esta decisión sea coherente.`
            };
            result.issues = result.issues || [];
            result.issues.push(newIssue);
            if (!result.capitulos_para_reescribir?.includes(decision.capitulo_establecido)) {
              result.capitulos_para_reescribir = result.capitulos_para_reescribir || [];
              result.capitulos_para_reescribir.push(decision.capitulo_establecido);
            }
          }
        }
        
        if (shouldInjectSyntheticIssues && result.persistent_injuries) {
          const ignoredInjuries = result.persistent_injuries.filter(i => i.consistencia === "ignorada");
          for (const injury of ignoredInjuries) {
            const newIssue = {
              capitulos_afectados: injury.capitulos_verificados,
              categoria: "continuidad_fisica" as const,
              descripcion: `LESIÓN IGNORADA: ${injury.personaje} sufrió ${injury.tipo_lesion} en Cap ${injury.capitulo_ocurre} pero no se refleja después. ${injury.problema || ""}`,
              severidad: "critica" as const,
              elementos_a_preservar: "Preservar la trama y diálogos. Solo añadir referencias a la lesión.",
              instrucciones_correccion: `OPCIÓN A: Modificar Cap ${injury.capitulo_ocurre} para que la lesión sea superficial (roce, sin daño real). OPCIÓN B: En caps ${injury.capitulos_verificados.join(", ")}, añadir 1-2 referencias sutiles a ${injury.efecto_esperado}. Elegir la opción que requiera menos cambios.`
            };
            result.issues = result.issues || [];
            result.issues.push(newIssue);
            // Añadir el capítulo donde ocurre la lesión para posible corrección
            if (!result.capitulos_para_reescribir?.includes(injury.capitulo_ocurre)) {
              result.capitulos_para_reescribir = result.capitulos_para_reescribir || [];
              result.capitulos_para_reescribir.push(injury.capitulo_ocurre);
            }
          }
        }
        
        if (result.appearance_drift) {
          for (const drift of result.appearance_drift) {
            const newIssue = {
              capitulos_afectados: [drift.chapter_a, drift.chapter_b],
              categoria: "continuidad_fisica" as const,
              descripcion: `APARIENCIA INCONSISTENTE: ${drift.character} tiene ${drift.trait} descrito como "${drift.description_a}" en Cap ${drift.chapter_a} pero como "${drift.description_b}" en Cap ${drift.chapter_b}. ${drift.canonical_value ? `Valor canónico: ${drift.canonical_value}` : ""}`,
              severidad: "critica" as const,
              elementos_a_preservar: "Preservar toda la trama y diálogos. Solo corregir la descripción física.",
              instrucciones_correccion: `Corregir la descripción en Cap ${drift.chapter_b} para que coincida con ${drift.canonical_value || `la descripción de Cap ${drift.chapter_a}: "${drift.description_a}"`}. Buscar y corregir TODAS las menciones del rasgo en ese capítulo.`
            };
            result.issues = result.issues || [];
            result.issues.push(newIssue);
            if (!result.capitulos_para_reescribir?.includes(drift.chapter_b)) {
              result.capitulos_para_reescribir = result.capitulos_para_reescribir || [];
              result.capitulos_para_reescribir.push(drift.chapter_b);
            }
          }
        }

        if (result.knowledge_leaks) {
          const criticalLeaks = result.knowledge_leaks.filter(l => l.severity === "CRITICAL" || l.severity === "MAJOR");
          for (const leak of criticalLeaks) {
            const newIssue = {
              capitulos_afectados: [leak.chapter_where_used],
              categoria: "continuidad_fisica" as const,
              descripcion: `FILTRACIÓN DE CONOCIMIENTO: ${leak.character} sabe "${leak.information}" en Cap ${leak.chapter_where_used}, pero esta información solo se reveló a ${leak.who_actually_knows} en Cap ${leak.chapter_where_revealed}.`,
              severidad: leak.severity === "CRITICAL" ? "critica" as const : "mayor" as const,
              elementos_a_preservar: "Preservar la trama general. Modificar solo los diálogos/pensamientos donde el personaje usa información que no debería tener.",
              instrucciones_correccion: `OPCIÓN A: Añadir una escena breve antes donde ${leak.who_actually_knows} transmite la información a ${leak.character}. OPCIÓN B: Eliminar/reemplazar el diálogo donde ${leak.character} usa la información por algo que sí podría saber. Elegir la opción que requiera menos cambios.`
            };
            result.issues = result.issues || [];
            result.issues.push(newIssue);
            if (!result.capitulos_para_reescribir?.includes(leak.chapter_where_used)) {
              result.capitulos_para_reescribir = result.capitulos_para_reescribir || [];
              result.capitulos_para_reescribir.push(leak.chapter_where_used);
            }
          }
        }

        // Crear issues para capítulos huérfanos
        if (result.orphan_chapters) {
          for (const orphan of result.orphan_chapters) {
            const newIssue = {
              capitulos_afectados: [orphan.capitulo],
              categoria: "capitulo_huerfano" as const,
              descripcion: `CAPÍTULO HUÉRFANO: ${orphan.razon}`,
              severidad: "mayor" as const,
              elementos_a_preservar: orphan.recomendacion === "eliminar" ? "N/A - capítulo a eliminar" : "El contenido emocional si se reubica",
              instrucciones_correccion: orphan.recomendacion === "eliminar" 
                ? `ELIMINAR este capítulo completo. No aporta a la trama.`
                : orphan.recomendacion === "reubicar_como_flashback"
                  ? `Convertir en flashback breve (máx 500 palabras) e integrar en otro capítulo relevante.`
                  : `Integrar el contenido esencial en el capítulo anterior o siguiente.`
            };
            result.issues = result.issues || [];
            result.issues.push(newIssue);
            if (!result.capitulos_para_reescribir?.includes(orphan.capitulo)) {
              result.capitulos_para_reescribir = result.capitulos_para_reescribir || [];
              result.capitulos_para_reescribir.push(orphan.capitulo);
            }
          }
        }
      }
      // === FIN NUEVO ===

      let currentScore = result?.puntuacion_global || 0;
      
      if (currentScore === 0 && previousScores.length > 0) {
        console.warn(`[Orchestrator] Anomalous 0/10 score detected in cycle ${revisionCycle + 1} — likely parsing error. Discarding and re-evaluating.`);
        await storage.createActivityLog({
          projectId: project.id,
          level: "warning",
          message: `Puntuación anómala 0/10 descartada (probable error de parseo). Re-evaluando...`,
          agentRole: "final-reviewer",
        });
        this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
          `Puntuación 0/10 anómala descartada. Re-evaluando manuscrito...`
        );
        revisionCycle++;
        continue;
      }
      
      previousScores.push(currentScore);
      
      if (previousScores.length >= 4) {
        const lastFour = previousScores.slice(-4);
        const maxRecent = Math.max(...lastFour);
        const minRecent = Math.min(...lastFour);
        if (maxRecent - minRecent <= 0.5 && maxRecent < this.minAcceptableScore) {
          const avgScore = (lastFour.reduce((a, b) => a + b, 0) / lastFour.length).toFixed(1);
          const bestOverall = Math.max(...previousScores);
          
          if (maxRecent >= 9) {
            this.callbacks.onAgentStatus("final-reviewer", "completed", 
              `Puntuación estabilizada en ~${avgScore}/10 tras ${previousScores.length} ciclos de corrección. Manuscrito aprobado — calidad consistente demostrada.`
            );
            console.log(`[Orchestrator] Score plateaued at ${lastFour.join(', ')} (maxRecent ${maxRecent} >= 9) — auto-approving after ${previousScores.length} cycles`);
            return true;
          }
          
          this.callbacks.onAgentStatus("final-reviewer", "error", 
            `Puntuación estancada en ~${avgScore}/10 tras ${previousScores.length} ciclos. Umbral mínimo: 9. NO APROBADO — calidad insuficiente.`
          );
          console.log(`[Orchestrator] Early exit: scores plateaued at ${lastFour.join(', ')} - maxRecent ${maxRecent} below 9, rejecting`);
          return false;
        }
      }
      
      if (currentScore >= this.minAcceptableScore) {
        consecutiveHighScores++;
      } else {
        // Oscilación entre 8 y 9 (sin issues graves): NO aprobamos pronto.
        // Damos al sistema oportunidades reales de estabilizar la puntuación
        // procesando los issues del ciclo actual (incluso si son menores).
        // Sólo después de varios ciclos de oscilación persistente concedemos
        // el voto de "calidad confirmada por el mejor ciclo".
        if (consecutiveHighScores > 0 && currentScore >= 8) {
          const hasCurrentCritical = result?.issues?.some(i => i.severidad === "critica" || i.severidad === "mayor");
          const bestOverall = Math.max(...previousScores);
          const cyclesElapsed = previousScores.length;
          // Sólo nos rendimos a la oscilación si:
          //  • llevamos al menos 5 ciclos
          //  • el mejor ciclo fue >= 9
          //  • no hay issues graves en el ciclo actual
          //  • la diferencia entre máximo y mínimo reciente es ≤ 1 (oscilación 8↔9)
          if (!hasCurrentCritical && cyclesElapsed >= 5 && bestOverall >= 9) {
            const recent = previousScores.slice(-4);
            const recentSpread = Math.max(...recent) - Math.min(...recent);
            if (recentSpread <= 1) {
              console.log(`[Orchestrator] Persistent 8↔9 oscillation over ${cyclesElapsed} cycles (best ${bestOverall}). Approving via best-score rule.`);
              const scoreForDb = Math.round(bestOverall);
              await storage.updateProject(project.id, { finalScore: scoreForDb });
              this.callbacks.onAgentStatus("final-reviewer", "completed",
                `Oscilación persistente (${recent.join(", ")}/10) tras ${cyclesElapsed} ciclos. Mejor puntuación ${bestOverall}/10 confirmó calidad. Sin defectos graves. APROBADO.`
              );
              return true;
            }
          }
          console.log(`[Orchestrator] Score dropped to ${currentScore} after ${consecutiveHighScores} × 9+ (cycle ${cyclesElapsed}, best ${bestOverall}, hasCritical=${hasCurrentCritical}). Continuing revision to stabilise.`);
          // Si el revisor marcó APROBADO pero bajó, lo reclasificamos para que
          // entre por la rama de refinamiento (línea ~2802) en vez de aprobar.
          if (result && (result.veredicto === "APROBADO" || result.veredicto === "APROBADO_CON_RESERVAS")) {
            result.veredicto = "REQUIERE_REVISION";
          }
        }
        consecutiveHighScores = 0;
      }
      
      // APROBADO: Puntuación >= 9 por N veces consecutivas
      if (consecutiveHighScores >= this.requiredConsecutiveHighScores) {
        const recentScores = previousScores.slice(-this.requiredConsecutiveHighScores).join(", ");
        const mensaje = result?.veredicto === "APROBADO_CON_RESERVAS"
          ? `Manuscrito APROBADO CON RESERVAS. Puntuaciones consecutivas: ${recentScores}/10.`
          : `Manuscrito APROBADO. Puntuaciones consecutivas: ${recentScores}/10. Calidad bestseller confirmada.`;
        this.callbacks.onAgentStatus("final-reviewer", "completed", mensaje);
        return true;
      }
      
      // Puntuación >= 9 pero aún no suficientes consecutivas
      if (currentScore >= this.minAcceptableScore && consecutiveHighScores < this.requiredConsecutiveHighScores) {
        this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
          `Puntuación ${currentScore}/10. Necesita ${this.requiredConsecutiveHighScores - consecutiveHighScores} evaluación(es) más con 9+ para confirmar.`
        );
        revisionCycle++;
        continue; // Re-evaluate without rewriting
      }
      
      // Si el revisor aprobó pero la puntuación es < 9, decidir si seguir refinando
      if ((result?.veredicto === "APROBADO" || result?.veredicto === "APROBADO_CON_RESERVAS") && currentScore < this.minAcceptableScore) {
        const hasSerious = result?.issues?.some(i => i.severidad === "critica" || i.severidad === "mayor");
        if (revisionCycle >= 3 && currentScore >= 8 && !hasSerious) {
          this.callbacks.onAgentStatus("final-reviewer", "completed", 
            `Manuscrito APROBADO tras ${revisionCycle + 1} ciclos de refinamiento. Puntuación: ${currentScore}/10. Sin defectos objetivos adicionales.`
          );
          return true;
        }
        
        this.callbacks.onAgentStatus("final-reviewer", "editing", 
          `Puntuación ${currentScore}/10 insuficiente. Objetivo: ${this.minAcceptableScore}+ (${this.requiredConsecutiveHighScores}x consecutivas). Refinando...`
        );
        // Create generic issues based on the bestseller analysis if available
        const genericIssues = result?.analisis_bestseller?.como_subir_a_9 
          ? [{ 
              capitulos_afectados: [1],
              categoria: "enganche" as const,
              descripcion: result.analisis_bestseller.como_subir_a_9,
              severidad: "mayor" as const,
              elementos_a_preservar: "Mantener la estructura general y personajes tal como están",
              instrucciones_correccion: result.analisis_bestseller.como_subir_a_9
            }]
          : result?.issues || [];
        
        if (result) {
          result.veredicto = "REQUIERE_REVISION";
          if (!result.issues?.length && genericIssues.length) {
            result.issues = genericIssues;
          }
        }
      }
      
      // In cycles 3+, if score is 9+ and all remaining issues are "menor", approve
      if (revisionCycle >= 2 && currentScore >= 9 && result?.issues?.length) {
        const hasSeriousIssues = result.issues.some(i => i.severidad === "critica" || i.severidad === "mayor");
        if (!hasSeriousIssues) {
          this.callbacks.onAgentStatus("final-reviewer", "completed", 
            `Manuscrito APROBADO tras ${revisionCycle + 1} ciclos. Puntuación: ${currentScore}/10. Solo quedan ${result.issues.length} observación(es) menor(es) — calidad suficiente demostrada.`
          );
          return true;
        }
      }
      
      // LÍMITE MÁXIMO DE CICLOS alcanzado
      if (revisionCycle === this.maxFinalReviewCycles - 1) {
        const avgScore = previousScores.length > 0 
          ? (previousScores.reduce((a, b) => a + b, 0) / previousScores.length).toFixed(1)
          : currentScore;
        const bestOverall = Math.max(...previousScores);
        
        if (currentScore >= 9) {
          this.callbacks.onAgentStatus("final-reviewer", "completed", 
            `Límite de ${this.maxFinalReviewCycles} ciclos alcanzado. Puntuación final: ${currentScore}/10 (promedio: ${avgScore}). APROBADO.`
          );
          return true;
        } else {
          this.callbacks.onAgentStatus("final-reviewer", "error", 
            `Límite de ${this.maxFinalReviewCycles} ciclos alcanzado. Puntuación final: ${currentScore}/10 NO alcanza el mínimo de 9. Proyecto NO APROBADO.`
          );
          return false;
        }
      }

      // ──────────────────────────────────────────────────────────────
      // FILTRO ANTI-POV: descartar issues que pidan conversión total
      // de la voz narrativa (3ª↔1ª persona) sobre el capítulo entero.
      // Estas peticiones siempre fallan en cirugía por estructurales y
      // las reescrituras posteriores suelen introducir errores nuevos.
      // ──────────────────────────────────────────────────────────────
      // Detecta la voz canónica del proyecto desde la guía: nos sirve
      // para enriquecer el log y pistar al usuario sobre desajustes reales
      // entre lo escrito y lo que pide la guía (que requerirían regenerar
      // el capítulo manualmente, no cirugía).
      const canonicalDirective = extractStyleDirectives(`${styleGuideContent || ""}\n${guiaEstilo || ""}`);
      const canonicalLabel = canonicalDirective.detected && canonicalDirective.humanText
        ? canonicalDirective.humanText
        : "no detectada en la guía (la guía no especifica POV con claridad)";

      if (result?.issues && result.issues.length > 0) {
        const povBefore = result.issues.length;
        const povDropped: Array<{ caps: number[]; cat: string; reason: string }> = [];
        result.issues = result.issues.filter(issue => {
          const corr = (issue.instrucciones_correccion || "").toLowerCase();
          const desc = (issue.descripcion || "").toLowerCase();
          const blob = `${corr} ${desc}`;
          // Patrones explícitos que indican conversión total de POV (no localizada).
          const povPatterns: RegExp[] = [
            /(reescribir|convertir|cambiar|narrar|pasar)[^.]{0,80}(de\s+)?(tercera|primera)\s*persona[^.]{0,60}(a|al)\s+(primera|tercera)\s*persona/,
            /(reescribir|convertir|narrar)[^.]{0,40}todo[^.]{0,40}(en\s+)?(primera|tercera)\s+persona/,
            /(cambiar|modificar)\s+(la\s+)?voz\s+narrativa/,
            /(cambiar|modificar)\s+(el\s+)?(pov|punto\s+de\s+vista)\s+(de|del)\s+(todo\s+el\s+)?cap/,
            /reescribir\s+(todo\s+)?el\s+cap[íi]tulo[^.]{0,40}(en\s+)?(primera|tercera)\s+persona/,
          ];
          const isGlobalPOV = povPatterns.some(p => p.test(blob));
          if (isGlobalPOV) {
            povDropped.push({
              caps: issue.capitulos_afectados || [],
              cat: issue.categoria,
              reason: (issue.instrucciones_correccion || "").slice(0, 120),
            });
            return false;
          }
          return true;
        });
        const povFiltered = povBefore - result.issues.length;
        if (povFiltered > 0) {
          const detail = povDropped.map(d => `cap(s) ${d.caps.join(",") || "?"} [${d.cat}]: "${d.reason}..."`).join(" | ");
          console.log(`[Orchestrator] Filtered ${povFiltered} global-POV-conversion issue(s) (no son cirugía localizada). Voz canónica: ${canonicalLabel}. Detalle: ${detail}`);
          const guidanceMsg = canonicalDirective.detected
            ? `Voz canónica del proyecto según la guía: ${canonicalLabel}. Si los capítulos NO están en esta voz, deberás regenerarlos manualmente — la cirugía no puede convertir capítulos enteros.`
            : `La guía no especifica una voz narrativa con claridad, así que la queja del reviewer es probablemente espuria.`;
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `${povFiltered} issue(s) descartado(s) por pedir conversión total de voz narrativa (cirugía no aplicable). ${guidanceMsg}`,
            agentRole: "final-reviewer",
          });
        }
      }

      // ──────────────────────────────────────────────────────────────
      // FILTRO ANTI-ALUCINACIÓN: descartar issues cuyo fragmento entre
      // comillas dobles NO aparezca literalmente en ninguno de los
      // capítulos afectados. El prompt obliga a citar texto real; si la
      // cita no existe, el issue está alucinado o es obsoleto.
      // Excepciones: arco_incompleto y capitulo_huerfano (problema de
      // ausencia, no de cita).
      // ──────────────────────────────────────────────────────────────
      if (result?.issues && result.issues.length > 0) {
        const halBefore = result.issues.length;
        const halDropped: Array<{ caps: number[]; cat: string; quote: string }> = [];
        const QUOTE_EXEMPT_CATS = new Set(["arco_incompleto", "capitulo_huerfano", "tension_insuficiente", "hook_debil"]);
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

        const chapterContentByNum = new Map<number, string>();
        for (const c of chaptersForReview) {
          chapterContentByNum.set(c.numero, norm(c.contenido));
        }

        result.issues = result.issues.filter(issue => {
          if (QUOTE_EXEMPT_CATS.has(issue.categoria)) return true;

          const blob = `${issue.descripcion || ""} ${issue.instrucciones_correccion || ""}`;
          // Extraer fragmentos entre comillas dobles (rectas o tipográficas).
          const quoteMatches = Array.from(blob.matchAll(/[""]([^""]{12,200})[""]/g)).map(m => m[1]);
          // Si no hay ninguna cita, no podemos auditar — pasamos.
          if (quoteMatches.length === 0) return true;

          const affected = (issue.capitulos_afectados || []).filter(n => chapterContentByNum.has(n));
          // Si no hay capítulos afectados con contenido cargado, no podemos auditar — pasamos.
          if (affected.length === 0) return true;

          const targetTexts = affected.map(n => chapterContentByNum.get(n)!);

          // Separamos citas en "auditables" (≥30 chars / ~6 palabras) e "inauditables" (cortas).
          // Las cortas pasan auto (no podemos verificarlas con confianza). Las auditables
          // deben TODAS aparecer literalmente en al menos uno de los capítulos afectados.
          // Estricto: con UNA sola cita auditable inventada se descarta el issue.
          // Esto evita el truco de "una cita real + una alucinada en el mismo issue".
          const auditableQuotes = quoteMatches.map(q => norm(q)).filter(nq => nq.length >= 30);

          // Si todas las citas eran cortas → no podemos auditar, pasamos.
          if (auditableQuotes.length === 0) return true;

          const allAuditableFound = auditableQuotes.every(nq =>
            targetTexts.some(t => t.includes(nq))
          );

          if (!allAuditableFound) {
            const failingQuote = auditableQuotes.find(nq => !targetTexts.some(t => t.includes(nq))) || auditableQuotes[0];
            halDropped.push({
              caps: issue.capitulos_afectados || [],
              cat: issue.categoria,
              quote: failingQuote.slice(0, 80),
            });
            return false;
          }
          return true;
        });

        const halFiltered = halBefore - result.issues.length;
        if (halFiltered > 0) {
          const detail = halDropped.map(d => `cap(s) ${d.caps.join(",") || "?"} [${d.cat}]: cita "${d.quote}..." no aparece`).join(" | ");
          console.log(`[Orchestrator] Filtered ${halFiltered} hallucinated issue(s): ${detail}`);
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `${halFiltered} issue(s) descartado(s) por alucinación: citaban texto que no aparece en los capítulos afectados (instrucción obsoleta o inventada).`,
            agentRole: "final-reviewer",
          });
        }
      }

      const HIGH_FP_CATEGORIES = new Set(["trama", "repeticion_lexica", "identidad_confusa"]);
      if (result?.issues && result.issues.length > 0) {
        const beforeCount = result.issues.length;
        result.issues = result.issues.filter(issue => {
          if (!HIGH_FP_CATEGORIES.has(issue.categoria)) return true;
          
          const hasTextualEvidence = issue.descripcion.length > 40 && 
            (issue.descripcion.includes("Cap") || issue.descripcion.includes("cap") || 
             issue.descripcion.includes("Capítulo") || issue.descripcion.includes("capítulo"));
          const hasSpecificCorrection = issue.instrucciones_correccion && 
            issue.instrucciones_correccion.length > 30;
          const hasPreservation = issue.elementos_a_preservar && 
            issue.elementos_a_preservar.length > 10;
          
          if (!hasTextualEvidence || !hasSpecificCorrection || !hasPreservation) {
            console.log(`[Orchestrator] Filtered vague ${issue.categoria} issue: "${issue.descripcion.slice(0, 80)}..." (evidence=${hasTextualEvidence}, correction=${hasSpecificCorrection}, preservation=${hasPreservation})`);
            return false;
          }

          if (issue.categoria === "repeticion_lexica" && issue.severidad !== "critica") {
            console.log(`[Orchestrator] Downgrading non-critical repeticion_lexica to ignored: "${issue.descripcion.slice(0, 60)}..."`);
            return false;
          }
          
          return true;
        });
        const filteredCount = beforeCount - result.issues.length;
        if (filteredCount > 0) {
          console.log(`[Orchestrator] Filtered ${filteredCount}/${beforeCount} vague issues in high-FP categories (trama/repeticion_lexica/identidad_confusa)`);
          await storage.createActivityLog({
            projectId: project.id,
            level: "info",
            message: `${filteredCount} issues vagos filtrados (categorías trama/repetición/identidad). ${result.issues.length} issues válidos restantes.`,
            agentRole: "final-reviewer",
          });
        }
      }

      const issueCount = result?.issues?.length || 0;
      const chaptersToRewrite = result?.capitulos_para_reescribir || [];
      
      if (result?.issues && chaptersToRewrite.length > 0) {
        const chaptersWithValidIssues = new Set<number>();
        result.issues.forEach(issue => {
          (issue.capitulos_afectados || []).forEach(ch => chaptersWithValidIssues.add(ch));
        });
        const beforeRewriteCount = chaptersToRewrite.length;
        const validRewrites = chaptersToRewrite.filter(ch => chaptersWithValidIssues.has(ch));
        if (validRewrites.length < beforeRewriteCount) {
          console.log(`[Orchestrator] Synced rewrite list after issue filtering: ${beforeRewriteCount} → ${validRewrites.length}`);
          chaptersToRewrite.length = 0;
          chaptersToRewrite.push(...validRewrites);
        }
      }

      if (issueCount > 0) {
        this.callbacks.onAgentStatus("final-reviewer", "editing", 
          `Manuscrito REQUIERE REVISIÓN. ${issueCount} problemas detectados en ${chaptersToRewrite.length || "varios"} capítulos.`
        );
      } else {
        this.callbacks.onAgentStatus("final-reviewer", "editing", 
          `Puntuación ${currentScore}/10 insuficiente (objetivo: ${this.minAcceptableScore}+). Refinando sin problemas específicos...`
        );
      }
      
      if (chaptersToRewrite.length === 0) {
        if (result?.issues && result.issues.length > 0) {
          const affectedChapters = new Set<number>();
          result.issues.forEach(issue => {
            const resolved = ensureChapterNumbers(issue);
            issue.capitulos_afectados = resolved;
            resolved.forEach(ch => affectedChapters.add(ch));
          });
          
          if (affectedChapters.size > 0) {
            chaptersToRewrite.push(...Array.from(affectedChapters));
          } else {
            this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
              `Problemas detectados pero sin capítulos específicos. Reintentando evaluación...`
            );
            revisionCycle++;
            continue;
          }
        } else {
          this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
            `Sin problemas específicos. Puntuación ${currentScore}/10 (objetivo: ${this.minAcceptableScore}+). Reintentando evaluación...`
          );
          revisionCycle++;
          continue;
        }
      }

      if (result?.issues) {
        const filteredChapters: number[] = [];
        for (const chNum of chaptersToRewrite) {
          const issuesForCh = result.issues.filter(
            i => (i.capitulos_afectados || []).includes(chNum)
          );
          const typeCounts = chapterRewriteTracker.get(chNum);
          if (typeCounts) {
            const exhaustedTypes = issuesForCh.filter(i => (typeCounts.get(i.categoria) || 0) >= MAX_REWRITES_PER_ERROR_TYPE);
            const actionableTypes = issuesForCh.filter(i => (typeCounts.get(i.categoria) || 0) < MAX_REWRITES_PER_ERROR_TYPE);
            if (exhaustedTypes.length > 0 && actionableTypes.length === 0) {
              const exhaustedSummary = exhaustedTypes.map(i => `${i.categoria}(${typeCounts.get(i.categoria)}x)`).join(", ");
              console.log(`[Orchestrator] Chapter ${chNum} skipped: all issues exhausted — ${exhaustedSummary}`);
              await storage.createActivityLog({
                projectId: project.id,
                level: "warning",
                message: `Capítulo ${chNum} omitido: errores [${exhaustedSummary}] agotados — limitación aceptada`,
                agentRole: "final-reviewer",
              });
              continue;
            }
            if (exhaustedTypes.length > 0 && actionableTypes.length > 0) {
              result.issues = result.issues.filter(i => {
                if (!(i.capitulos_afectados || []).includes(chNum)) return true;
                return (typeCounts.get(i.categoria) || 0) < MAX_REWRITES_PER_ERROR_TYPE;
              });
              console.log(`[Orchestrator] Chapter ${chNum}: filtered ${exhaustedTypes.length} exhausted types, keeping ${actionableTypes.length} actionable`);
            }
          }
          filteredChapters.push(chNum);
        }
        chaptersToRewrite.length = 0;
        chaptersToRewrite.push(...filteredChapters);
      }

      if (chaptersToRewrite.length === 0) {
        console.log(`[Orchestrator] All chapters in rewrite list were exhausted. Accepting current quality.`);
        const bestScore = Math.max(...previousScores);
        if (bestScore >= 8) {
          this.callbacks.onAgentStatus("final-reviewer", "completed", 
            `Todos los problemas restantes son limitaciones aceptadas. Puntuación: ${currentScore}/10. APROBADO.`
          );
          return true;
        }
        this.callbacks.onAgentStatus("final-reviewer", "reviewing", 
          `Todos los capítulos con problemas ya fueron corregidos al máximo. Re-evaluando...`
        );
        revisionCycle++;
        continue;
      }

      const MAX_REWRITES_PER_CYCLE = 6;
      if (chaptersToRewrite.length > MAX_REWRITES_PER_CYCLE) {
        const criticalChapters = chaptersToRewrite.filter(chNum => {
          const issuesForCh = result?.issues?.filter(i => (i.capitulos_afectados || []).includes(chNum)) || [];
          return issuesForCh.some(i => i.severidad === "critica");
        });
        const majorChapters = chaptersToRewrite.filter(chNum => {
          if (criticalChapters.includes(chNum)) return false;
          const issuesForCh = result?.issues?.filter(i => (i.capitulos_afectados || []).includes(chNum)) || [];
          return issuesForCh.some(i => i.severidad === "mayor");
        });
        const prioritized = [...criticalChapters, ...majorChapters].slice(0, MAX_REWRITES_PER_CYCLE);
        if (prioritized.length < MAX_REWRITES_PER_CYCLE) {
          const remaining = chaptersToRewrite.filter(ch => !prioritized.includes(ch));
          prioritized.push(...remaining.slice(0, MAX_REWRITES_PER_CYCLE - prioritized.length));
        }
        const skippedCount = chaptersToRewrite.length - prioritized.length;
        console.log(`[Orchestrator] Capping rewrites: ${chaptersToRewrite.length} → ${prioritized.length} (skipped ${skippedCount} lower-priority). Prioritized critical/mayor issues.`);
        await storage.createActivityLog({
          projectId: project.id,
          level: "warning",
          message: `Reescrituras limitadas: ${chaptersToRewrite.length} solicitadas → ${prioritized.length} ejecutadas (máx ${MAX_REWRITES_PER_CYCLE}/ciclo). ${skippedCount} capítulos de menor prioridad se evaluarán en el siguiente ciclo.`,
          agentRole: "final-reviewer",
        });
        chaptersToRewrite.length = 0;
        chaptersToRewrite.push(...prioritized);
      }

      for (let rewriteIndex = 0; rewriteIndex < chaptersToRewrite.length; rewriteIndex++) {
        if (await isProjectCancelledFromDb(project.id)) {
          console.log(`[Orchestrator] Project ${project.id} cancelled during revision. Stopping.`);
          await storage.createActivityLog({
            projectId: project.id,
            level: "info",
            message: `Revisión detenida por el usuario`,
            agentRole: "orchestrator",
          });
          return false;
        }

        const chapterNum = chaptersToRewrite[rewriteIndex];
        const chapter = updatedChapters.find(c => c.chapterNumber === chapterNum);
        const sectionData = allSections.find(s => s.numero === chapterNum);
        
        if (!chapter || !sectionData) continue;

        const issuesForChapter = result?.issues?.filter(
          i => (i.capitulos_afectados || []).includes(chapterNum)
        ) || [];
        
        const revisionInstructions = issuesForChapter.map(issue => {
          const preservar = (issue as any).elementos_a_preservar 
            ? `\n⚠️ PRESERVAR (NO MODIFICAR): ${(issue as any).elementos_a_preservar}` 
            : "";
          return `[${issue.categoria.toUpperCase()}] ${issue.descripcion}${preservar}\n✏️ CORRECCIÓN QUIRÚRGICA: ${issue.instrucciones_correccion}`;
        }).join("\n\n");

        const issuesSummary = issuesForChapter.map(i => i.categoria).join(", ") || "correcciones generales";

        if (!chapterRewriteTracker.has(chapterNum)) {
          chapterRewriteTracker.set(chapterNum, new Map());
        }
        const typeCounts = chapterRewriteTracker.get(chapterNum)!;
        for (const issue of issuesForChapter) {
          typeCounts.set(issue.categoria, (typeCounts.get(issue.categoria) || 0) + 1);
        }

        await storage.updateChapter(chapter.id, { 
          status: "revision",
          needsRevision: true,
          revisionReason: revisionInstructions 
        });

        this.callbacks.onChapterStatusChange(chapterNum, "revision");

        const sectionLabel = this.getSectionLabel(sectionData);
        
        this.callbacks.onChapterRewrite(
          chapterNum, 
          sectionData.titulo, 
          rewriteIndex + 1, 
          chaptersToRewrite.length,
          issuesSummary
        );
        
        // ──────────────────────────────────────────────────────────────
        // Paso 0: ÁRBITRO DEL WORLD BIBLE
        // Antes de tocar el capítulo, comprobamos si alguno de estos issues se
        // resuelve mejor actualizando el WB (cuando la novela es coherente y
        // el WB tiene un dato puntual obsoleto). Esto preserva la prosa y
        // ahorra reescrituras innecesarias.
        // ──────────────────────────────────────────────────────────────
        const arbitration = await this.arbitrateWorldBibleForIssues(
          project, chapter, sectionData, issuesForChapter, worldBibleData, updatedChapters
        );

        let activeIssues = issuesForChapter;
        if (arbitration.appliedPatches.length > 0) {
          activeIssues = issuesForChapter.filter((_, idx) => !arbitration.handledIssueIndices.has(idx));
          this.callbacks.onAgentStatus("wb-arbiter", "completed",
            `${sectionLabel}: ${arbitration.appliedPatches.length} dato(s) del World Bible actualizados; ${activeIssues.length} issue(s) restantes para reescritura.`
          );
        }

        if (activeIssues.length === 0) {
          await storage.updateChapter(chapter.id, { status: "completed", needsRevision: false, revisionReason: null });
          this.callbacks.onChapterStatusChange(chapterNum, "completed");
          this.callbacks.onChapterComplete(chapterNum, chapter.wordCount || 0, sectionData.titulo);
          continue;
        }

        const activeRevisionInstructions = activeIssues.map(issue => {
          const preservar = (issue as any).elementos_a_preservar
            ? `\n⚠️ PRESERVAR (NO MODIFICAR): ${(issue as any).elementos_a_preservar}`
            : "";
          return `[${issue.categoria.toUpperCase()}] ${issue.descripcion}${preservar}\n✏️ CORRECCIÓN QUIRÚRGICA: ${issue.instrucciones_correccion}`;
        }).join("\n\n");

        // ──────────────────────────────────────────────────────────────
        // Pipeline quirúrgico unificado: SurgicalPatcher determinista primero
        // (find/replace exacto, World-Bible-aware, sin tocar nada más); si la
        // instrucción no es puntual, fallback a Narrador con red de seguridad
        // de longitud + verificación del Editor + revert si introduce regresiones.
        // Además, deja `preEditContent` poblado para el diff "Ver cambios" en el dashboard.
        // ──────────────────────────────────────────────────────────────
        await this.rewriteChapterForQA(
          project,
          chapter,
          sectionData,
          worldBibleData,
          guiaEstilo,
          "editorial",
          `CORRECCIONES DEL REVISOR FINAL:\n${activeRevisionInstructions}`
        );

        const refreshedChapter = (await storage.getChaptersByProject(project.id))
          .find(c => c.chapterNumber === chapterNum);
        const finalWc = refreshedChapter?.wordCount || 0;
        this.callbacks.onChapterComplete(chapterNum, finalWc, sectionData.titulo);
      }
      // Mantener referencia (vars usadas dentro de rewriteChapterForQA via instancia/storage).
      void seriesUnresolvedThreadsQA; void seriesKeyEventsQA; void styleGuideContent; void authorName;

      // Acumular los issues corregidos para informar al revisor en la siguiente pasada
      if (result?.issues) {
        const issuesDeEsteCiclo = result.issues.map(i => 
          `[${i.categoria}] ${i.descripcion} (Caps ${(i.capitulos_afectados || []).join(", ") || "sin especificar"})`
        );
        issuesPreviosCorregidos = [...issuesPreviosCorregidos, ...issuesDeEsteCiclo];
      }

      revisionCycle++;
    }

    return false;
  }

  async runFinalReviewOnly(project: Project): Promise<void> {
    try {
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };
      
      let styleGuideContent = "";
      let authorName = "";
      
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) {
          styleGuideContent = styleGuide.content;
        }
      }
      
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) {
          authorName = pseudonym.name;
        }
      }

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto");
        return;
      }

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      const chapters = await storage.getChaptersByProject(project.id);
      const allSections = this.buildSectionsListFromChapters(chapters, worldBibleData);
      const guiaEstilo = `Género: ${project.genre}, Tono: ${project.tone}`;

      const approved = await this.runFinalReview(
        project,
        chapters,
        worldBibleData,
        guiaEstilo,
        allSections,
        styleGuideContent,
        authorName
      );

      if (approved) {
        await storage.updateProject(project.id, { finalReviewResult: { approved } });
        this.callbacks.onAgentStatus("final-reviewer", "completed", "Revisión final aprobada");
        await this.finalizeCompletedProject(project);
      } else {
        await storage.updateProject(project.id, { 
          status: "failed_final_review",
          finalReviewResult: { approved }
        });
        this.callbacks.onAgentStatus("final-reviewer", "error", "Revisión final NO aprobada - puntuación insuficiente");
        this.callbacks.onError("El manuscrito no alcanzó la puntuación mínima de 9 después de múltiples intentos.");
      }
    } catch (error) {
      console.error("Final review error:", error);
      this.callbacks.onError(`Error en revisión final: ${error instanceof Error ? error.message : "Error desconocido"}`);
      await storage.updateProject(project.id, { status: "error" });
    }
  }

  async resolveDocumentedIssues(project: Project): Promise<void> {
    try {
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };

      const finalReviewResult = project.finalReviewResult as any;
      if (!finalReviewResult?.issues || finalReviewResult.issues.length === 0) {
        this.callbacks.onError("No hay issues documentados para resolver.");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      const rawIssues = finalReviewResult.issues as any[];
      const normalizedIssues: FinalReviewIssue[] = rawIssues.map((issue: any) => {
        let caps = issue.capitulos_afectados;
        if (!caps || !Array.isArray(caps) || caps.length === 0) {
          if (issue.capitulo != null && typeof issue.capitulo === "number") {
            caps = [issue.capitulo];
          } else if (issue.capitulos_para_revision && Array.isArray(issue.capitulos_para_revision)) {
            caps = issue.capitulos_para_revision;
          } else {
            caps = [];
          }
        }
        return {
          ...issue,
          capitulos_afectados: caps,
          descripcion: issue.descripcion || issue.problema || "",
          instrucciones_correccion: issue.instrucciones_correccion || "",
          categoria: issue.categoria || issue.severidad || "otro",
        } as FinalReviewIssue;
      });

      // ════════════════════════════════════════════════════════════════
      // DEFENSA ANTI-VAGUEDAD (espejo exacto del filtro de runFinalReview)
      // Solo descartamos issues VAGOS (sin evidencia, sin instrucción concreta,
      // sin elementos a preservar). NO se descartan por número de capítulos:
      // el Revisor Final es precisamente el agente diseñado para captar
      // patrones globales (muletillas distribuidas, tics narrativos cross-capítulo)
      // que el Editor por-capítulo NO PUEDE ver. Cap. amplios son legítimos.
      // ════════════════════════════════════════════════════════════════
      const HIGH_FP_CATEGORIES = new Set(["trama", "repeticion_lexica", "identidad_confusa"]);
      const beforeFilterCount = normalizedIssues.length;
      const filterReasons: string[] = [];
      const wideScopeWarnings: string[] = [];

      const issues: FinalReviewIssue[] = normalizedIssues.filter((issue) => {
        if (HIGH_FP_CATEGORIES.has(issue.categoria as string)) {
          const desc = issue.descripcion || "";
          const hasTextualEvidence =
            desc.length > 40 &&
            (desc.includes("Cap") || desc.includes("cap") ||
             desc.includes("Capítulo") || desc.includes("capítulo"));
          const hasSpecificCorrection =
            (issue.instrucciones_correccion || "").length > 30;
          const hasPreservation =
            ((issue as any).elementos_a_preservar || "").length > 10;

          if (!hasTextualEvidence || !hasSpecificCorrection || !hasPreservation) {
            filterReasons.push(`${issue.categoria} vago: "${desc.slice(0, 60)}..."`);
            return false;
          }
        }

        // Aviso (NO filtro) cuando un issue cubre muchos capítulos: legítimo
        // pero conviene avisar al usuario del alcance/coste antes de lanzar.
        const capsCount = (issue.capitulos_afectados || []).filter(
          (c: number) => typeof c === "number" && c > 0
        ).length;
        if (capsCount >= 10) {
          wideScopeWarnings.push(
            `[${(issue.categoria || "otro").toUpperCase()}] cubre ${capsCount} capítulos: "${(issue.descripcion || "").slice(0, 80)}..."`
          );
        }

        return true;
      });

      if (filterReasons.length > 0) {
        const filteredCount = beforeFilterCount - issues.length;
        console.log(`[ResolveIssues] Filtered ${filteredCount}/${beforeFilterCount} vague issues:`);
        filterReasons.forEach(r => console.log(`  - ${r}`));
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `${filteredCount} issues vagos descartados (sin evidencia textual, instrucción específica o elementos a preservar). ${issues.length} issues válidos restantes.`,
          agentRole: "final-reviewer",
        });
      }

      if (wideScopeWarnings.length > 0) {
        console.log(`[ResolveIssues] Issues de alcance amplio (≥10 capítulos):`);
        wideScopeWarnings.forEach(w => console.log(`  - ${w}`));
        await storage.createActivityLog({
          projectId: project.id,
          level: "warning",
          message: `${wideScopeWarnings.length} issue(s) de alcance amplio detectados (≥10 capítulos). Son legítimos para patrones globales (muletillas, tics narrativos), pero implican muchas reescrituras. Detalles: ${wideScopeWarnings.join(" | ")}`,
          agentRole: "final-reviewer",
        });
      }

      if (issues.length === 0) {
        this.callbacks.onError(
          beforeFilterCount > 0
            ? "Todos los issues documentados fueron descartados por ser vagos. Considera regenerar la revisión final."
            : "No hay issues documentados para resolver."
        );
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }
      
      let styleGuideContent = "";
      let authorName = "";
      if (project.styleGuideId) {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg) styleGuideContent = sg.content;
      }
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) authorName = pseudonym.name;
      }

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      const allChapters = await storage.getChaptersByProject(project.id);
      const allSections = this.buildSectionsListFromChapters(allChapters, worldBibleData);
      const guiaEstilo = styleGuideContent
        ? `Género: ${project.genre}, Tono: ${project.tone}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
        : `Género: ${project.genre}, Tono: ${project.tone}`;

      const chaptersToFix = new Set<number>();
      issues.forEach(issue => {
        const affected = issue.capitulos_afectados || [];
        affected.forEach(ch => chaptersToFix.add(ch));
      });

      if (chaptersToFix.size === 0) {
        this.callbacks.onError("Los issues documentados no especifican capítulos afectados.");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      const sortedChapters = Array.from(chaptersToFix).sort((a, b) => {
        const orderA = a === 0 ? -1000 : a === -1 ? 1000 : a === -2 ? 1001 : a;
        const orderB = b === 0 ? -1000 : b === -1 ? 1000 : b === -2 ? 1001 : b;
        return orderA - orderB;
      });

      this.callbacks.onAgentStatus("final-reviewer", "editing",
        `Resolviendo ${issues.length} issues documentados en ${sortedChapters.length} capítulos...`
      );

      await storage.createActivityLog({
        projectId: project.id,
        level: "info",
        message: `Iniciando resolución de ${issues.length} issues documentados en capítulos: ${sortedChapters.join(", ")}`,
        agentRole: "final-reviewer",
      });

      let resolvedCount = 0;

      for (let i = 0; i < sortedChapters.length; i++) {
        if (this.aborted) {
          console.log(`[ResolveIssues] Aborted before chapter ${sortedChapters[i]} (project ${project.id}). Exiting silently.`);
          return { resolvedCount: 0, totalChanges: 0 } as any;
        }
        const chapterNum = sortedChapters[i];
        const chapter = allChapters.find(c => c.chapterNumber === chapterNum);
        const sectionData = allSections.find(s => s.numero === chapterNum);

        if (!chapter || !sectionData || !chapter.content) {
          console.warn(`[ResolveIssues] Chapter ${chapterNum} not found or empty, skipping`);
          continue;
        }

        this.callbacks.onChapterStatusChange(chapterNum, "revision");

        const issuesForChapter = issues.filter(
          issue => (issue.capitulos_afectados || []).includes(chapterNum)
        );

        if (issuesForChapter.length === 0) continue;

        const revisionInstructions = issuesForChapter.map(issue => {
          const preservar = issue.elementos_a_preservar
            ? `\n⚠️ PRESERVAR (NO MODIFICAR): ${issue.elementos_a_preservar}`
            : "";
          return `[${(issue.categoria || "otro").toUpperCase()}] ${issue.descripcion}${preservar}\n✏️ CORRECCIÓN QUIRÚRGICA: ${issue.instrucciones_correccion}`;
        }).join("\n\n");

        const issuesSummary = issuesForChapter.map(i => i.categoria).join(", ");
        const sectionLabel = this.getSectionLabel(sectionData);

        this.callbacks.onChapterRewrite(
          chapterNum, sectionData.titulo, i + 1, sortedChapters.length,
          `Corrección de issues: ${issuesSummary}`
        );

        // ──────────────────────────────────────────────────────────────
        // Paso 0: Árbitro del World Bible (preserva prosa cuando el WB está obsoleto).
        // ──────────────────────────────────────────────────────────────
        const arbitration = await this.arbitrateWorldBibleForIssues(
          project, chapter, sectionData, issuesForChapter, worldBibleData, allChapters
        );

        let activeIssues = issuesForChapter;
        if (arbitration.appliedPatches.length > 0) {
          activeIssues = issuesForChapter.filter((_, idx) => !arbitration.handledIssueIndices.has(idx));
          this.callbacks.onAgentStatus("wb-arbiter", "completed",
            `${sectionLabel}: ${arbitration.appliedPatches.length} dato(s) del World Bible actualizados; ${activeIssues.length} issue(s) restantes.`
          );
        }

        if (activeIssues.length === 0) {
          await storage.updateChapter(chapter.id, { status: "completed", needsRevision: false, revisionReason: null });
          this.callbacks.onChapterStatusChange(chapterNum, "completed");
          this.callbacks.onChapterComplete(chapterNum, chapter.wordCount || 0, sectionData.titulo);
          resolvedCount++;
          continue;
        }

        const activeRevisionInstructions = activeIssues.map(issue => {
          const preservar = (issue as any).elementos_a_preservar
            ? `\n⚠️ PRESERVAR (NO MODIFICAR): ${(issue as any).elementos_a_preservar}`
            : "";
          return `[${(issue.categoria || "otro").toUpperCase()}] ${issue.descripcion}${preservar}\n✏️ CORRECCIÓN QUIRÚRGICA: ${issue.instrucciones_correccion}`;
        }).join("\n\n");

        // ──────────────────────────────────────────────────────────────
        // Pipeline quirúrgico unificado: cirugía determinista (find/replace
        // World-Bible-aware) → fallback a Narrador con red de seguridad de
        // longitud + verificación del Editor + revert si introduce regresiones.
        // Snapshot `preEditContent` se persiste automáticamente para el diff.
        // ──────────────────────────────────────────────────────────────
        await this.rewriteChapterForQA(
          project,
          chapter,
          sectionData,
          worldBibleData,
          guiaEstilo,
          "editorial",
          `CORRECCIONES DE ISSUES DOCUMENTADOS:\n${activeRevisionInstructions}`
        );

        const refreshedChapter = (await storage.getChaptersByProject(project.id))
          .find(c => c.chapterNumber === chapterNum);
        const finalWc = refreshedChapter?.wordCount || 0;
        resolvedCount++;
        this.callbacks.onChapterComplete(chapterNum, finalWc, sectionData.titulo);
      }
      void styleGuideContent; void authorName;

      if (resolvedCount === 0) {
        this.callbacks.onError("No se pudo corregir ningún capítulo — los issues no apuntan a capítulos válidos.");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      this.callbacks.onAgentStatus("final-reviewer", "reviewing",
        `Re-evaluando manuscrito tras corrección de ${resolvedCount} capítulos...`
      );

      const updatedChapters = await storage.getChaptersByProject(project.id);
      const chaptersForReview = sortChaptersNarrative(
        updatedChapters.filter(c => c.content && c.status === "completed")
      ).map(c => ({
        numero: c.chapterNumber,
        titulo: c.title || `Capítulo ${c.chapterNumber}`,
        contenido: c.content || "",
      }));

      const reviewResult = await this.finalReviewer.execute({
        projectTitle: project.title,
        chapters: chaptersForReview,
        worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
        guiaEstilo,
        pasadaNumero: 1,
        issuesPreviosCorregidos: issues.map(i => `[${i.categoria}] ${i.descripcion}`),
        capitulosConLimitaciones: [],
      });

      await this.trackTokenUsage(project.id, reviewResult.tokenUsage, "El Revisor Final", "deepseek-v4-flash", undefined, "resolve_issues_verify");

      const newScore = reviewResult.result?.puntuacion_global || 0;
      const scoreForDb = newScore != null ? Math.round(newScore) : null;

      await storage.updateProject(project.id, {
        status: "completed",
        finalScore: scoreForDb,
        finalReviewResult: reviewResult.result as any,
      });

      const newIssueCount = reviewResult.result?.issues?.length || 0;

      this.callbacks.onAgentStatus("final-reviewer", "completed",
        `Issues resueltos. ${resolvedCount} capítulos corregidos. Nueva puntuación: ${newScore}/10${newIssueCount > 0 ? ` (${newIssueCount} issues restantes)` : " — sin issues pendientes"}.`
      );

      await storage.createActivityLog({
        projectId: project.id,
        level: "success",
        message: `Resolución completada: ${resolvedCount}/${sortedChapters.length} capítulos corregidos. Puntuación: ${newScore}/10. Issues restantes: ${newIssueCount}.`,
        agentRole: "final-reviewer",
      });

      this.callbacks.onProjectComplete();
    } catch (error) {
      console.error("[Orchestrator] resolveDocumentedIssues error:", error);
      await storage.updateProject(project.id, { status: "completed" });
      this.callbacks.onError(`Error resolviendo issues: ${error instanceof Error ? error.message : "Error desconocido"}`);
    }
  }

  /**
   * PARSE-ONLY: extract structured editorial instructions from free-form notes WITHOUT applying anything.
   * Returns the parsed result so the user can preview / filter before triggering the rewrite phase.
   * Does NOT change project status. Token usage IS tracked.
   */
  async parseEditorialNotesOnly(
    project: Project,
    notesText: string
  ): Promise<EditorialNotesParseResult & { instructions: EditorialInstruction[] }> {
    if (!notesText || !notesText.trim()) {
      throw new Error("Las notas editoriales están vacías.");
    }

    this.cumulativeTokens = {
      inputTokens: project.totalInputTokens || 0,
      outputTokens: project.totalOutputTokens || 0,
      thinkingTokens: project.totalThinkingTokens || 0,
    };

    const worldBible = await storage.getWorldBibleByProject(project.id);
    if (!worldBible) {
      throw new Error("No se encontró la biblia del mundo para este proyecto.");
    }

    const worldBibleData: ParsedWorldBible = {
      world_bible: {
        personajes: worldBible.characters as any[] || [],
        lugares: [],
        reglas_lore: worldBible.worldRules as any[] || [],
      },
      escaleta_capitulos: worldBible.plotOutline as any[] || [],
    };

    const allChapters = await storage.getChaptersByProject(project.id);
    const allSections = this.buildSectionsListFromChapters(allChapters, worldBibleData);
    const chapterIndex = allSections.map(s => ({ numero: s.numero, titulo: s.titulo || "" }));

    await storage.createActivityLog({
      projectId: project.id,
      level: "info",
      message: `Analizando notas editoriales para vista previa (${notesText.length} caracteres).`,
      agentRole: "editor",
    });

    const parseResult = await this.editorialNotesParser.execute({
      notas: notesText,
      chapterIndex,
      projectTitle: project.title,
    });

    await this.trackTokenUsage(project.id, parseResult.tokenUsage, "Analista de Notas Editoriales", "deepseek-v4-flash", undefined, "editorial_parse");

    const draftInstructions: EditorialInstruction[] = parseResult.result?.instrucciones || [];
    const summary = parseResult.result?.resumen_general;

    // ── SEGUNDA PASADA: anclaje contra contenido real + canon ───────
    const refinedInstructions = await this.groundEditorialInstructions(
      project,
      notesText,
      draftInstructions,
      worldBibleData,
      allChapters,
    );

    await storage.createActivityLog({
      projectId: project.id,
      level: "info",
      message: `Vista previa generada: ${refinedInstructions.length} instrucciones ancladas en el texto y la canon (de ${draftInstructions.length} borradores).`,
      agentRole: "editor",
    });

    return { resumen_general: summary, instrucciones: refinedInstructions, instructions: refinedInstructions };
  }

  /**
   * REVISIÓN HOLÍSTICA: lee la novela completa de una sentada (aprovechando el contexto
   * de 1M tokens de DeepSeek V4-Flash) y emite un informe editorial severo en prosa.
   * El informe se devuelve como texto listo para inyectarse en el textarea de
   * "Notas del Editor Humano" — el usuario puede luego editarlo y aplicarlo con el
   * flujo normal de parse-editorial-notes / apply-editorial-notes.
   * NO modifica el proyecto. Tracking de tokens activado.
   */
  async runHolisticReview(project: Project): Promise<HolisticReviewerResult> {
    this.cumulativeTokens = {
      inputTokens: project.totalInputTokens || 0,
      outputTokens: project.totalOutputTokens || 0,
      thinkingTokens: project.totalThinkingTokens || 0,
    };

    const allChapters = await storage.getChaptersByProject(project.id);
    if (!allChapters || allChapters.length === 0) {
      throw new Error("El proyecto no tiene capítulos generados todavía.");
    }

    // Load style guide content (project only stores the FK)
    let styleGuideContent: string | undefined;
    if (project.styleGuideId) {
      try {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg?.content) styleGuideContent = sg.content;
      } catch (e) {
        console.warn(`[HolisticReview] Could not load style guide ${project.styleGuideId}:`, e);
      }
    }

    const worldBible = await storage.getWorldBibleByProject(project.id);

    // Build a compact world bible summary (characters + key rules + outline beats)
    let worldBibleSummary = "";
    if (worldBible) {
      const characters = (worldBible.characters as any[]) || [];
      const rules = (worldBible.worldRules as any[]) || [];
      const outline = (worldBible.plotOutline as any[]) || [];

      const charLines = characters.slice(0, 20).map((c: any) =>
        `- ${c.nombre || c.name || "?"}: ${(c.descripcion || c.description || "").slice(0, 200)}`
      ).join("\n");
      const ruleLines = rules.slice(0, 15).map((r: any) =>
        `- ${(r.regla || r.rule || r.descripcion || "").slice(0, 200)}`
      ).join("\n");
      const outlineLines = outline.slice(0, 80).map((o: any) =>
        `Cap ${o.numero || o.chapter || "?"}: ${(o.resumen || o.summary || "").slice(0, 250)}`
      ).join("\n");

      worldBibleSummary = `### PERSONAJES PRINCIPALES\n${charLines || "(no hay personajes registrados)"}\n\n### REGLAS DEL MUNDO\n${ruleLines || "(no hay reglas registradas)"}\n\n### ESCALETA ORIGINAL\n${outlineLines || "(no hay escaleta registrada)"}`;
    }

    await storage.createActivityLog({
      projectId: project.id,
      level: "info",
      message: `Iniciando revisión holística de la novela completa (${allChapters.length} capítulos).`,
      agentRole: "editor",
    });

    const result = await this.holisticReviewer.runReview({
      projectTitle: project.title,
      chapters: allChapters.map(c => ({
        numero: c.chapterNumber || 0,
        titulo: c.title || "",
        contenido: c.content || "",
      })),
      guiaEstilo: styleGuideContent,
      worldBibleSummary: worldBibleSummary || undefined,
      generoObjetivo: project.genre || undefined,
      longitudObjetivo: project.minWordCount ? `${project.minWordCount.toLocaleString("es-ES")}+ palabras` : undefined,
    }, project.id);

    await this.trackTokenUsage(
      project.id,
      result.tokenUsage,
      "Lector Holístico",
      "deepseek-v4-flash",
      undefined,
      "holistic_review"
    );

    await storage.createActivityLog({
      projectId: project.id,
      level: "info",
      message: `Revisión holística completada: ${result.totalChaptersRead} capítulos / ${result.totalWordsRead.toLocaleString("es-ES")} palabras leídas. Informe de ${result.notesText.length.toLocaleString("es-ES")} caracteres generado.`,
      agentRole: "editor",
    });

    return result;
  }

  /**
   * Toma los borradores del primer parser (que solo vio título de capítulos) y los pasa
   * por una segunda pasada con: (1) contenido real de los capítulos afectados, (2) World
   * Bible. Devuelve solo las instrucciones que están ancladas en el texto y son
   * compatibles con la canon. Las descartadas se loguean con motivo.
   */
  private async groundEditorialInstructions(
    project: Project,
    originalNotes: string,
    draftInstructions: EditorialInstruction[],
    worldBibleData: ParsedWorldBible,
    allChapters: Chapter[],
  ): Promise<EditorialInstruction[]> {
    if (draftInstructions.length === 0) return [];

    // Recopilamos los números de capítulo afectados por al menos una instrucción del borrador.
    const affectedNumbers = new Set<number>();
    draftInstructions.forEach(ins => (ins.capitulos_afectados || []).forEach(n => affectedNumbers.add(n)));

    const chapterContents = Array.from(affectedNumbers).map(num => {
      const ch = allChapters.find(c => c.chapterNumber === num);
      if (!ch || !ch.content) return null;
      return {
        numero: num,
        titulo: ch.title || `Capítulo ${num}`,
        content: ch.content,
      };
    }).filter(Boolean) as Array<{ numero: number; titulo: string; content: string }>;

    if (chapterContents.length === 0) {
      // No tenemos contenido para anclar — devolvemos los borradores tal cual.
      return draftInstructions;
    }

    let worldBibleContext = "";
    try {
      const enrichedWB = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
      worldBibleContext = this.serializeWorldBibleForSurgery(enrichedWB);
    } catch {
      try {
        worldBibleContext = this.serializeWorldBibleForSurgery(worldBibleData.world_bible);
      } catch {
        worldBibleContext = "";
      }
    }

    try {
      const refineResp = await this.editorialNotesParser.refineWithContext({
        projectTitle: project.title,
        originalNotes,
        draftInstructions,
        chapterContents,
        worldBibleContext,
      });

      await this.trackTokenUsage(project.id, refineResp.tokenUsage, "Analista de Notas Editoriales", "deepseek-v4-flash", undefined, "editorial_refine");

      const refined = refineResp.result?.refined || [];
      const dropped = refineResp.result?.dropped || [];

      if (dropped.length > 0) {
        const droppedSummary = dropped.map(d => {
          const caps = (d.capitulos_afectados || []).join(", ");
          return `  • [caps ${caps}] ${d.descripcion} — Motivo: ${d.motivo}`;
        }).join("\n");
        await storage.createActivityLog({
          projectId: project.id,
          level: "warning",
          message: `Anclaje: ${dropped.length} instrucción(es) descartada(s) por no encontrar referencia real o contradecir la canon:\n${droppedSummary}`,
          agentRole: "editor",
        });
      }

      return refined.length > 0 ? refined : draftInstructions;
    } catch (e) {
      console.error("[Orchestrator] groundEditorialInstructions error:", e);
      // En caso de error de refinamiento, no bloqueamos: usamos los borradores.
      await storage.createActivityLog({
        projectId: project.id,
        level: "warning",
        message: `Anclaje editorial falló (${e instanceof Error ? e.message : "desconocido"}). Usando borradores sin anclar.`,
        agentRole: "editor",
      });
      return draftInstructions;
    }
  }

  async applyEditorialNotes(
    project: Project,
    notesText: string,
    preParsedInstructions?: EditorialInstruction[]
  ): Promise<void> {
    // Register cancellation controller so the user can abort mid-process.
    registerProjectAbortController(project.id);

    try {
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };

      const usingPreParsed = Array.isArray(preParsedInstructions) && preParsedInstructions.length > 0;

      if (!usingPreParsed && (!notesText || !notesText.trim())) {
        this.callbacks.onError("Las notas editoriales están vacías.");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      let styleGuideContent = "";
      let authorName = "";
      if (project.styleGuideId) {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg) styleGuideContent = sg.content;
      }
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) authorName = pseudonym.name;
      }
      void authorName;

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto");
        await storage.updateProject(project.id, { status: "completed" });
        return;
      }

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      const allChapters = await storage.getChaptersByProject(project.id);
      const allSections = this.buildSectionsListFromChapters(allChapters, worldBibleData);
      const guiaEstilo = styleGuideContent
        ? `Género: ${project.genre}, Tono: ${project.tone}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
        : `Género: ${project.genre}, Tono: ${project.tone}`;

      let instructions: EditorialInstruction[];

      if (usingPreParsed) {
        instructions = preParsedInstructions!;
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `Aplicando ${instructions.length} instrucciones editoriales pre-revisadas por el usuario.`,
          agentRole: "editor",
        });
      } else {
        this.callbacks.onAgentStatus("editor", "thinking",
          "Analizando notas del editor humano y extrayendo instrucciones quirúrgicas..."
        );

        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `Aplicando notas editoriales del editor humano (${notesText.length} caracteres).`,
          agentRole: "editor",
        });

        const chapterIndex = allSections.map(s => ({ numero: s.numero, titulo: s.titulo || "" }));

        const parseResult = await this.editorialNotesParser.execute({
          notas: notesText,
          chapterIndex,
          projectTitle: project.title,
        });

        await this.trackTokenUsage(project.id, parseResult.tokenUsage, "Analista de Notas Editoriales", "deepseek-v4-flash", undefined, "editorial_parse");

        const draftInstructions = parseResult.result?.instrucciones || [];

        // ── SEGUNDA PASADA: anclaje contra contenido real + canon ───────
        instructions = await this.groundEditorialInstructions(
          project,
          notesText,
          draftInstructions,
          worldBibleData,
          allChapters,
        );

        if (instructions.length === 0) {
          const summary = parseResult.result?.resumen_general || "El sistema no encontró instrucciones procesables en las notas.";
          this.callbacks.onError(`No se extrajeron instrucciones aplicables tras anclar contra el texto y la canon. ${summary}`);
          await storage.updateProject(project.id, { status: "completed" });
          return;
        }
      }

      // Group instructions by chapter so we make one surgical pass per chapter with all its issues combined.
      // Multi-chapter (arc) instructions: each chapter receives the same instruction but with its own role
      // from plan_por_capitulo plus the roles of the sibling chapters as coordination context.
      const byChapter = new Map<number, EditorialInstruction[]>();
      const arcInstructions: EditorialInstruction[] = [];

      instructions.forEach(ins => {
        const chapters = ins.capitulos_afectados || [];
        chapters.forEach(num => {
          if (!byChapter.has(num)) byChapter.set(num, []);
          byChapter.get(num)!.push(ins);
        });
        if (chapters.length > 1) {
          arcInstructions.push(ins);
        }
      });

      if (arcInstructions.length > 0) {
        const arcSummaries = arcInstructions.map(ins => {
          const hasPlan = ins.plan_por_capitulo && Object.keys(ins.plan_por_capitulo).length > 0;
          const planMark = hasPlan ? "✓ con plan distributivo" : "⚠️ SIN plan distributivo (coordinación limitada)";
          return `  - [${(ins.categoria || "otro").toUpperCase()}] caps ${ins.capitulos_afectados.join(", ")}: ${planMark}`;
        }).join("\n");
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `Detectadas ${arcInstructions.length} instrucciones multi-capítulo (arcos). Se coordinarán las reescrituras de los capítulos hermanos:\n${arcSummaries}`,
          agentRole: "editor",
        });
      }

      const sortedChapters = Array.from(byChapter.keys()).sort((a, b) => {
        const orderA = a === 0 ? -1000 : a === -1 ? 1000 : a === -2 ? 1001 : a;
        const orderB = b === 0 ? -1000 : b === -1 ? 1000 : b === -2 ? 1001 : b;
        return orderA - orderB;
      });

      this.callbacks.onAgentStatus("editor", "completed",
        `Notas editoriales analizadas: ${instructions.length} instrucciones para ${sortedChapters.length} capítulos.`
      );

      await storage.createActivityLog({
        projectId: project.id,
        level: "success",
        message: `Notas editoriales convertidas en ${instructions.length} instrucciones quirúrgicas para los capítulos: ${sortedChapters.join(", ")}.`,
        agentRole: "editor",
      });

      let appliedCount = 0;
      let revertedCount = 0;
      let skippedCount = 0;
      let cancelled = false;

      // Snapshot the global score BEFORE applying so we can compare later.
      const previousFinalScore = project.finalScore ?? null;

      for (let i = 0; i < sortedChapters.length; i++) {
        if (this.aborted) {
          console.log(`[ApplyEditorialNotes] Aborted after processing ${i}/${sortedChapters.length} chapters (project ${project.id}). Exiting silently.`);
          return;
        }
        // Cancellation check between chapters — allows the user to abort mid-process.
        if (await isProjectCancelledFromDb(project.id)) {
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `Aplicación de notas editoriales CANCELADA por el usuario tras procesar ${i}/${sortedChapters.length} capítulos.`,
            agentRole: "editor",
          });
          cancelled = true;
          break;
        }

        const chapterNum = sortedChapters[i];
        const chapter = allChapters.find(c => c.chapterNumber === chapterNum);
        const sectionData = allSections.find(s => s.numero === chapterNum);

        if (!chapter || !sectionData || !chapter.content) {
          console.warn(`[ApplyEditorialNotes] Chapter ${chapterNum} not found or empty, skipping.`);
          skippedCount++;
          continue;
        }

        const chapterInstructions = byChapter.get(chapterNum) || [];
        const formatted = chapterInstructions.map((ins, idx) => {
          const preserve = ins.elementos_a_preservar
            ? `\n   ⚠️ PRESERVAR (NO MODIFICAR): ${ins.elementos_a_preservar}`
            : "";
          const priority = ins.prioridad ? ` [${ins.prioridad.toUpperCase()}]` : "";
          const isArc = (ins.capitulos_afectados || []).length > 1;

          let arcBlock = "";
          if (isArc) {
            const siblings = (ins.capitulos_afectados || []).filter(n => n !== chapterNum);
            const sectionLabelFor = (n: number) => {
              if (n === 0) return "Prólogo";
              if (n === -1) return "Epílogo";
              if (n === -2) return "Nota del autor";
              return `Capítulo ${n}`;
            };
            const myLabel = sectionLabelFor(chapterNum);
            const myRole = ins.plan_por_capitulo?.[String(chapterNum)] || null;
            const siblingRoles = siblings
              .map(n => {
                const role = ins.plan_por_capitulo?.[String(n)] || "(sin plan específico)";
                return `      • ${sectionLabelFor(n)}: ${role}`;
              })
              .join("\n");

            arcBlock = `\n   🔗 ARCO MULTI-CAPÍTULO (${ins.capitulos_afectados.join(", ")}): esta corrección se desarrolla a lo largo de varios capítulos.`;
            if (myRole) {
              arcBlock += `\n   🎯 TU ROL EN ${myLabel}: ${myRole}`;
            } else {
              arcBlock += `\n   🎯 TU ROL EN ${myLabel}: el plan distributivo no especifica este capítulo. Aplica la instrucción de forma proporcional (este capítulo es uno de ${ins.capitulos_afectados.length} del arco).`;
            }
            if (siblings.length > 0 && siblingRoles) {
              arcBlock += `\n   📍 ROLES DE LOS CAPÍTULOS HERMANOS (NO los reescribes tú, pero coordina con ellos):\n${siblingRoles}`;
              arcBlock += `\n   ⚙️ COORDINACIÓN: ejecuta SOLO tu rol. NO dupliques lo que hacen los hermanos. NO contradigas lo que se sembrará/cerrará en ellos. El lector debe percibir el arco como un todo coherente.`;
            }
          }

          return `${idx + 1}. [${(ins.categoria || "otro").toUpperCase()}]${priority} ${ins.descripcion}\n   ✏️ INSTRUCCIÓN: ${ins.instrucciones_correccion}${preserve}${arcBlock}`;
        }).join("\n\n");

        const sectionLabel = this.getSectionLabel(sectionData);

        this.callbacks.onChapterRewrite(
          chapterNum, sectionData.titulo, i + 1, sortedChapters.length,
          `Aplicando notas del editor (${chapterInstructions.length} instrucciones)`
        );

        const beforeContent = chapter.content;

        // Separa instrucciones puntuales (cirugía determinista find/replace)
        // de las estructurales (reescritura completa del capítulo).
        const puntuales = chapterInstructions.filter(ins => (ins.tipo || "estructural") === "puntual");
        const estructurales = chapterInstructions.filter(ins => (ins.tipo || "estructural") === "estructural");

        let chapterModified = false;
        let workingContent = beforeContent;

        // ─── FLUJO 1: CIRUGÍA DETERMINISTA PARA INSTRUCCIONES PUNTUALES ───
        if (puntuales.length > 0) {
          const puntualesFormatted = puntuales.map((ins, idx) => {
            const preserve = ins.elementos_a_preservar
              ? `\n   PRESERVAR (NO TOCAR): ${ins.elementos_a_preservar}`
              : "";
            return `${idx + 1}. [${(ins.categoria || "otro").toUpperCase()}] ${ins.descripcion}\n   INSTRUCCIÓN: ${ins.instrucciones_correccion}${preserve}`;
          }).join("\n\n");

          this.callbacks.onAgentStatus("ghostwriter", "writing",
            `Cirugía de texto en ${sectionLabel}: aplicando ${puntuales.length} corrección(es) puntual(es) sin tocar el resto...`
          );

          try {
            const patchResult = await this.surgicalPatcher.execute({
              chapterNumber: sectionData.numero,
              chapterTitle: sectionData.titulo || `Capítulo ${sectionData.numero}`,
              originalContent: workingContent,
              instructions: puntualesFormatted,
            });

            await this.trackTokenUsage(project.id, patchResult.tokenUsage, "Cirujano de Texto", "deepseek-v4-flash", sectionData.numero, "surgical_patch");

            const operations = patchResult.result?.operations || [];

            if (operations.length === 0) {
              // El cirujano declaró las puntuales como no aplicables → reclasificar como estructurales.
              const reason = patchResult.result?.not_applicable_reason || "El cirujano no encontró operaciones puntuales aplicables.";
              await storage.createActivityLog({
                projectId: project.id,
                level: "info",
                message: `${sectionLabel}: cirugía no aplicable (${reason}). Las ${puntuales.length} instrucciones puntuales se reclasifican como estructurales.`,
                agentRole: "surgical-patcher",
              });
              estructurales.push(...puntuales);
            } else {
              const report = this.surgicalPatcher.applyOperations(workingContent, operations);

              if (report.applied.length > 0) {
                workingContent = report.finalContent;
                chapterModified = true;
                const newWc = workingContent.split(/\s+/).filter(w => w.length > 0).length;

                await storage.updateChapter(chapter.id, {
                  content: workingContent,
                  wordCount: newWc,
                });

                const failedNote = report.failed.length > 0
                  ? ` ${report.failed.length} operación(es) descartada(s) por no encontrar el texto literal.`
                  : "";
                await storage.createActivityLog({
                  projectId: project.id,
                  level: "success",
                  message: `${sectionLabel}: cirugía aplicada — ${report.applied.length}/${operations.length} operaciones puntuales (${report.originalLength}→${report.finalLength} caracteres, ${((Math.abs(report.finalLength - report.originalLength) / report.originalLength) * 100).toFixed(1)}% de cambio).${failedNote}`,
                  agentRole: "surgical-patcher",
                });

                if (report.failed.length > 0) {
                  for (const f of report.failed.slice(0, 3)) {
                    await storage.createActivityLog({
                      projectId: project.id,
                      level: "warning",
                      message: `${sectionLabel}: operación descartada — "${f.op.find_exact.slice(0, 80)}..." → ${f.reason}`,
                      agentRole: "surgical-patcher",
                    });
                  }
                }
              } else {
                await storage.createActivityLog({
                  projectId: project.id,
                  level: "warning",
                  message: `${sectionLabel}: cirugía falló — ninguna de las ${operations.length} operaciones encontró el texto literal. Reclasificando puntuales como estructurales.`,
                  agentRole: "surgical-patcher",
                });
                estructurales.push(...puntuales);
              }
            }
          } catch (patchErr) {
            console.error(`[ApplyEditorialNotes] SurgicalPatcher error on ${sectionLabel}:`, patchErr);
            await storage.createActivityLog({
              projectId: project.id,
              level: "warning",
              message: `${sectionLabel}: error en cirugía (${patchErr instanceof Error ? patchErr.message : "desconocido"}). Reclasificando puntuales como estructurales.`,
              agentRole: "surgical-patcher",
            });
            estructurales.push(...puntuales);
          }
        }

        // ─── FLUJO 2: REESCRITURA COMPLETA PARA INSTRUCCIONES ESTRUCTURALES ───
        if (estructurales.length > 0) {
          const estructuralesFormatted = estructurales.map((ins, idx) => {
            const preserve = ins.elementos_a_preservar
              ? `\n   ⚠️ PRESERVAR (NO MODIFICAR): ${ins.elementos_a_preservar}`
              : "";
            const priority = ins.prioridad ? ` [${ins.prioridad.toUpperCase()}]` : "";
            const isArc = (ins.capitulos_afectados || []).length > 1;

            let arcBlock = "";
            if (isArc) {
              const siblings = (ins.capitulos_afectados || []).filter(n => n !== chapterNum);
              const sectionLabelFor = (n: number) => {
                if (n === 0) return "Prólogo";
                if (n === -1) return "Epílogo";
                if (n === -2) return "Nota del autor";
                return `Capítulo ${n}`;
              };
              const myLabel = sectionLabelFor(chapterNum);
              const myRole = ins.plan_por_capitulo?.[String(chapterNum)] || null;
              const siblingRoles = siblings
                .map(n => {
                  const role = ins.plan_por_capitulo?.[String(n)] || "(sin plan específico)";
                  return `      • ${sectionLabelFor(n)}: ${role}`;
                })
                .join("\n");

              arcBlock = `\n   🔗 ARCO MULTI-CAPÍTULO (${ins.capitulos_afectados.join(", ")}): esta corrección se desarrolla a lo largo de varios capítulos.`;
              if (myRole) {
                arcBlock += `\n   🎯 TU ROL EN ${myLabel}: ${myRole}`;
              } else {
                arcBlock += `\n   🎯 TU ROL EN ${myLabel}: el plan distributivo no especifica este capítulo. Aplica la instrucción de forma proporcional (este capítulo es uno de ${ins.capitulos_afectados.length} del arco).`;
              }
              if (siblings.length > 0 && siblingRoles) {
                arcBlock += `\n   📍 ROLES DE LOS CAPÍTULOS HERMANOS (NO los reescribes tú, pero coordina con ellos):\n${siblingRoles}`;
                arcBlock += `\n   ⚙️ COORDINACIÓN: ejecuta SOLO tu rol. NO dupliques lo que hacen los hermanos. NO contradigas lo que se sembrará/cerrará en ellos. El lector debe percibir el arco como un todo coherente.`;
              }
            }

            return `${idx + 1}. [${(ins.categoria || "otro").toUpperCase()}]${priority} ${ins.descripcion}\n   ✏️ INSTRUCCIÓN: ${ins.instrucciones_correccion}${preserve}${arcBlock}`;
          }).join("\n\n");

          // Si la cirugía ya modificó el capítulo, el rewrite debe partir del contenido actualizado.
          if (chapterModified) {
            chapter.content = workingContent;
            chapter.wordCount = workingContent.split(/\s+/).filter(w => w.length > 0).length;
          }

          await this.rewriteChapterForQA(
            project,
            chapter,
            sectionData,
            worldBibleData,
            guiaEstilo,
            "editorial",
            estructuralesFormatted
          );

          const refreshedChapters = await storage.getChaptersByProject(project.id);
          const refreshedChapter = refreshedChapters.find(c => c.id === chapter.id);
          if (refreshedChapter && refreshedChapter.content && refreshedChapter.content !== workingContent) {
            chapterModified = true;
            workingContent = refreshedChapter.content;
          }
        }

        // Contabilidad y snapshot final del capítulo
        if (chapterModified) {
          appliedCount++;
          await storage.updateChapter(chapter.id, {
            preEditContent: beforeContent,
            preEditAt: new Date() as any,
          });
          const tipoMsg = puntuales.length > 0 && estructurales.length > 0
            ? `${puntuales.length} puntual(es) + ${estructurales.length} estructural(es)`
            : puntuales.length > 0
              ? `${puntuales.length} puntual(es) por cirugía`
              : `${estructurales.length} estructural(es) por reescritura`;
          await storage.createActivityLog({
            projectId: project.id,
            level: "success",
            message: `${sectionLabel}: notas editoriales aplicadas (${tipoMsg}). Snapshot anterior guardado para comparación.`,
            agentRole: "ghostwriter",
          });
        } else {
          revertedCount++;
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `${sectionLabel}: ningún cambio se aplicó (cirugía sin operaciones válidas y/o reescritura revertida por la red de seguridad).`,
            agentRole: "ghostwriter",
          });
        }
      }

      await storage.createActivityLog({
        projectId: project.id,
        level: cancelled ? "warning" : "success",
        message: `Notas editoriales ${cancelled ? "interrumpidas" : "completadas"}: ${appliedCount} aplicadas, ${revertedCount} revertidas (red de seguridad), ${skippedCount} omitidas.`,
        agentRole: "ghostwriter",
      });

      // ════════════════════════════════════════════════════════════════
      // REVISIÓN FINAL POST-EDITORIAL: relanzar el Revisor Final para recalcular
      // la puntuación global y permitir al usuario ver el impacto neto.
      // Solo se ejecuta si: (1) hubo al menos un capítulo modificado y (2) el proceso no fue cancelado.
      // ════════════════════════════════════════════════════════════════
      // Re-check cancellation in case user cancelled between the loop ending and the final review starting.
      if (await isProjectCancelledFromDb(project.id)) {
        cancelled = true;
      }

      if (appliedCount > 0 && !cancelled) {
        try {
          this.callbacks.onAgentStatus("final-reviewer", "reviewing",
            "Recalculando puntuación global tras aplicar las notas editoriales..."
          );

          const updatedChaptersForReview = await storage.getChaptersByProject(project.id);
          const chaptersForReview = updatedChaptersForReview
            .filter(c => c.content)
            .sort((a, b) => a.chapterNumber - b.chapterNumber)
            .map(c => ({
              numero: c.chapterNumber,
              titulo: c.title || `Capítulo ${c.chapterNumber}`,
              contenido: c.content || "",
            }));

          const reviewResult = await this.finalReviewer.execute({
            projectTitle: project.title,
            chapters: chaptersForReview,
            worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
            guiaEstilo,
            pasadaNumero: (project.revisionCycle || 0) + 1,
            issuesPreviosCorregidos: [],
            capitulosConLimitaciones: [],
            seriesContext: undefined,
          });

          await this.trackTokenUsage(project.id, reviewResult.tokenUsage, "El Revisor Final", "deepseek-v4-flash", undefined, "final_review");

          const newResult = reviewResult.result;
          const newScoreRaw = newResult?.puntuacion_global ?? null;
          const newScoreForDb = newScoreRaw != null ? Math.round(newScoreRaw) : null;

          await storage.updateProject(project.id, {
            finalReviewResult: newResult as any,
            finalScore: newScoreForDb,
          });

          if (newScoreRaw != null) {
            const delta = previousFinalScore != null ? (newScoreRaw - previousFinalScore) : null;
            const arrow = delta == null ? "" : delta > 0 ? " ⬆️" : delta < 0 ? " ⬇️" : " =";
            const beforeLabel = previousFinalScore != null ? `${previousFinalScore}/10` : "sin puntuación previa";
            const summaryMsg = `Puntuación global tras notas editoriales: ${beforeLabel} → ${newScoreRaw}/10${arrow}${delta != null ? ` (${delta > 0 ? "+" : ""}${delta.toFixed(1)})` : ""}`;

            const level = delta != null && delta < -0.5
              ? "warning"
              : (delta != null && delta > 0 ? "success" : "info");

            await storage.createActivityLog({
              projectId: project.id,
              level,
              message: summaryMsg + (delta != null && delta < -0.5
                ? " ⚠️ La puntuación ha bajado tras las correcciones. Revisa los cambios y considera revertir capítulos sensibles desde el botón 'Ver cambios'."
                : ""),
              agentRole: "final-reviewer",
            });

            this.callbacks.onAgentStatus("final-reviewer", "completed", summaryMsg);
          } else {
            this.callbacks.onAgentStatus("final-reviewer", "completed",
              "Revisión final completada (sin puntuación)."
            );
          }
        } catch (reviewErr) {
          console.error("[ApplyEditorialNotes] Error en revisión final post-editorial:", reviewErr);
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `No se pudo recalcular la puntuación global: ${reviewErr instanceof Error ? reviewErr.message : "Error desconocido"}. Las correcciones SÍ se aplicaron.`,
            agentRole: "final-reviewer",
          });
        }
      } else if (appliedCount === 0 && !cancelled) {
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: "No se ejecuta la revisión final post-editorial porque ningún capítulo fue modificado.",
          agentRole: "final-reviewer",
        });
      }

      await storage.updateProject(project.id, { status: cancelled ? "cancelled" : "completed" });

      this.callbacks.onAgentStatus("ghostwriter", "completed",
        `Notas editoriales ${cancelled ? "canceladas" : "procesadas"}: ${appliedCount} capítulos modificados, ${revertedCount} preservados, ${skippedCount} omitidos.`
      );

      this.callbacks.onProjectComplete();
    } catch (error) {
      console.error("[Orchestrator] applyEditorialNotes error:", error);
      await storage.updateProject(project.id, { status: "completed" });
      this.callbacks.onError(`Error aplicando notas editoriales: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      clearProjectAbortController(project.id);
    }
  }

  async extendNovel(project: Project, fromChapter: number, toChapter: number): Promise<void> {
    try {
      console.log(`[Orchestrator:Extend] Extending project ${project.id} from chapter ${fromChapter + 1} to ${toChapter}`);
      
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto. Necesita generar primero.");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      let styleGuideContent = "";
      let authorName = "";
      let extendedGuideContent = "";
      
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) styleGuideContent = styleGuide.content;
      }
      
      if (project.pseudonymId) {
        const pseudonym = await storage.getPseudonym(project.pseudonymId);
        if (pseudonym) authorName = pseudonym.name;
      }

      if ((project as any).extendedGuideId) {
        const extendedGuide = await storage.getExtendedGuide((project as any).extendedGuideId);
        if (extendedGuide) extendedGuideContent = extendedGuide.content;
      }

      // Get existing chapters to understand the story so far
      const existingChapters = await storage.getChaptersByProject(project.id);
      const completedChapters = existingChapters
        .filter(c => c.status === "completed" && c.chapterNumber > 0)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      const lastCompletedChapter = completedChapters.length > 0 
        ? completedChapters[completedChapters.length - 1] 
        : null;

      // Build summary of story so far for the Architect
      const storySoFar = completedChapters.map(c => 
        `Capítulo ${c.chapterNumber}: ${c.title || "Sin título"}`
      ).join("\n");

      this.callbacks.onAgentStatus("architect", "planning", 
        `El Arquitecto está planificando los capítulos ${fromChapter + 1} a ${toChapter}...`
      );

      // Call the Architect to generate outline for new chapters
      const chaptersToGenerate = toChapter - fromChapter;
      const architectPrompt = `
EXTENSIÓN DE NOVELA EN PROGRESO

La novela ya tiene ${fromChapter} capítulos escritos. Necesitas planificar los capítulos ${fromChapter + 1} hasta ${toChapter} (${chaptersToGenerate} capítulos adicionales).

INFORMACIÓN DEL PROYECTO:
- Título: ${project.title}
- Género: ${project.genre}
- Tono: ${project.tone}
- Premisa: ${project.premise || "No especificada"}

CAPÍTULOS EXISTENTES:
${storySoFar}

ÚLTIMO CAPÍTULO COMPLETADO:
${lastCompletedChapter ? `
Capítulo ${lastCompletedChapter.chapterNumber}: ${lastCompletedChapter.title || "Sin título"}
Contenido (últimas 1000 palabras):
${lastCompletedChapter.content?.slice(-4000) || "Sin contenido disponible"}
` : "No hay capítulos previos"}

PERSONAJES EXISTENTES:
${JSON.stringify(worldBible.characters, null, 2)}

REGLAS DEL MUNDO:
${JSON.stringify(worldBible.worldRules, null, 2)}

INSTRUCCIONES:
1. Genera una escaleta detallada SOLO para los capítulos ${fromChapter + 1} hasta ${toChapter}
2. Mantén la continuidad con la historia existente
3. Cada capítulo debe tener: numero, titulo, resumen, puntos_clave, personajes_involucrados
4. Los números de capítulo deben ser consecutivos desde ${fromChapter + 1}

Responde SOLO con un JSON válido con la estructura:
{
  "escaleta_capitulos": [
    {
      "numero": ${fromChapter + 1},
      "titulo": "...",
      "resumen": "...",
      "puntos_clave": ["..."],
      "personajes_involucrados": ["..."]
    }
  ]
}
`;

      if (this.aborted) {
        console.log(`[Orchestrator:Extend] Aborted before architect call (project ${project.id}). Exiting silently.`);
        return;
      }

      const architectResult = await this.architect.execute({
        title: project.title,
        premise: architectPrompt,
        genre: project.genre,
        chapterCount: chaptersToGenerate,
        hasPrologue: false,
        hasEpilogue: false,
        hasAuthorNote: false,
        tone: project.tone,
        projectId: project.id,
      });

      if (this.aborted) {
        console.log(`[Orchestrator:Extend] Aborted after architect.execute returned (project ${project.id}). Exiting silently.`);
        return;
      }

      if (!architectResult.content) {
        this.callbacks.onError("El Arquitecto no generó una escaleta válida para la extensión");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      await this.trackTokenUsage(project.id, architectResult.tokenUsage, "El Arquitecto", "deepseek-v4-flash", undefined, "extend_outline");

      // Parse the new chapter outlines
      let newChapterOutlines: any[] = [];
      try {
        const jsonMatch = architectResult.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          newChapterOutlines = parsed.escaleta_capitulos || [];
        }
      } catch (e) {
        console.error("[Orchestrator:Extend] Failed to parse architect response:", e);
        this.callbacks.onError("Error al parsear la escaleta de extensión");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      if (newChapterOutlines.length === 0) {
        this.callbacks.onError("El Arquitecto no generó capítulos para la extensión");
        await storage.updateProject(project.id, { status: "error" });
        return;
      }

      this.callbacks.onAgentStatus("architect", "completed", 
        `Escaleta generada: ${newChapterOutlines.length} capítulos planificados`
      );

      // Create chapter records for the new chapters
      for (const outline of newChapterOutlines) {
        await storage.createChapter({
          projectId: project.id,
          chapterNumber: outline.numero,
          title: outline.titulo,
          content: "",
          wordCount: 0,
          status: "pending",
        });
      }

      console.log(`[Orchestrator:Extend] Created ${newChapterOutlines.length} new chapter records`);

      // Build world bible data for ghostwriter
      const worldBibleData = this.reconstructWorldBibleData(worldBible, project);
      
      // Add the new outlines to the world bible data
      worldBibleData.escaleta_capitulos = [
        ...(worldBibleData.escaleta_capitulos || []),
        ...newChapterOutlines
      ];

      // Initialize character states from existing chapters
      const characterStates: Map<string, { alive: boolean; location: string; injuries: string[]; lastSeen: number }> = new Map();

      // Get continuity from last completed chapter
      let previousContinuity = lastCompletedChapter?.continuityState 
        ? JSON.stringify(lastCompletedChapter.continuityState)
        : lastCompletedChapter?.content 
          ? `Capítulo anterior completado. Contenido termina con: ${lastCompletedChapter.content.slice(-500)}`
          : "";

      let previousContinuityStateForEditor: any = lastCompletedChapter?.continuityState || null;

      let seriesUnresolvedThreadsExt: string[] = [];
      let seriesKeyEventsExt: string[] = [];
      if (project.seriesId) {
        const { threads, events } = await this.loadSeriesThreadsAndEvents(project);
        seriesUnresolvedThreadsExt = threads;
        seriesKeyEventsExt = events;
      }

      const allChapters = await storage.getChaptersByProject(project.id);
      const pendingChapters = allChapters
        .filter(c => c.status === "pending" && c.chapterNumber > fromChapter)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      this.callbacks.onAgentStatus("ghostwriter", "writing", 
        `Iniciando escritura de ${pendingChapters.length} capítulos nuevos...`
      );

      // Generate content for each new chapter (similar to resumeNovel logic)
      for (const chapter of pendingChapters) {
        if (await isProjectCancelledFromDb(project.id)) {
          this.callbacks.onAgentStatus("orchestrator", "cancelled", "Extensión cancelada por el usuario");
          await storage.updateProject(project.id, { status: "cancelled" });
          return;
        }

        const sectionData = this.buildSectionDataFromChapter(chapter, worldBibleData);
        
        await storage.updateChapter(chapter.id, { status: "writing" });

        const sectionLabel = this.getSectionLabel(sectionData);
        this.callbacks.onAgentStatus("ghostwriter", "writing", `El Narrador está escribiendo ${sectionLabel}...`);

        let chapterContent = "";
        let approved = false;
        let refinementAttempts = 0;
        let refinementInstructions = "";
        let extractedContinuityState: any = null;
        
        let bestVersion = { content: "", score: 0, continuityState: null as any };
        let attemptsSinceBestImprovement = 0;

        while (!approved && refinementAttempts < this.maxRefinementLoops) {
          if (this.aborted) {
            console.log(`[Orchestrator:Extend] Aborted inside refinement loop for chapter ${sectionData.numero} (project ${project.id}). Exiting silently.`);
            return;
          }
          const baseStyleGuide = `Género: ${project.genre}, Tono: ${project.tone}`;
          const fullStyleGuide = styleGuideContent 
            ? `${baseStyleGuide}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
            : baseStyleGuide;

          const isRewrite = refinementAttempts > 0;
          const perChapterMin = (project as any).minWordsPerChapter || 2500;
          const perChapterMax = (project as any).maxWordsPerChapter || Math.round(perChapterMin * 1.15);
          
          const isStalledExt = refinementAttempts >= 2 && bestVersion.score === 7 && bestVersion.score <= 7;
          const stalledEscalationExt = isStalledExt
            ? `\n\n⚠️ PERSPECTIVA FRESCA REQUERIDA: Los intentos anteriores se estancaron en 7/10. El editor detecta los mismos problemas repetidamente. NO sigas la misma estructura — reimagina las escenas desde un ángulo completamente diferente. Cambia las aperturas de escena, los patrones de diálogo, la distribución sensorial. Sorpréndeme.`
            : "";

          const enrichedWBExt = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesUnresolvedThreadsExt, seriesKeyEventsExt);
          const writerResult = await this.ghostwriter.execute({
            chapterNumber: sectionData.numero,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBExt, this.resolveLexicoForChapter(worldBibleData, sectionData.numero)),
            guiaEstilo: fullStyleGuide,
            previousContinuity,
            refinementInstructions: refinementInstructions + stalledEscalationExt,
            authorName,
            isRewrite: isRewrite || isStalledExt,
            minWordCount: perChapterMin,
            maxWordCount: perChapterMax,
            extendedGuideContent: extendedGuideContent || undefined,
            previousChapterContent: isStalledExt ? undefined : (isRewrite ? bestVersion.content : undefined),
            kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
          });

          const { cleanContent, continuityState } = this.ghostwriter.extractContinuityState(writerResult.content);
          let currentContent = cleanContent;
          const currentContinuityState = continuityState;
          
          const contentWordCount = currentContent.split(/\s+/).filter((w: string) => w.length > 0).length;
          
          await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", sectionData.numero, "extend_write");

          // Editor review
          this.callbacks.onAgentStatus("editor", "reviewing", `El Editor está revisando ${sectionLabel}...`);
          
          const extEditorChaptersCtx = await storage.getChaptersByProject(project.id);
          const enrichedWBForExtEditor = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
          const resolvedLexicoForExtEditor = this.resolveLexicoForChapter(worldBibleData, sectionData.numero);
          const editorResult = await this.editor.execute({
            chapterNumber: sectionData.numero,
            chapterContent: currentContent,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBForExtEditor, resolvedLexicoForExtEditor),
            previousContinuityState: previousContinuityStateForEditor,
            guiaEstilo: fullStyleGuide,
            previousChaptersContext: this.buildPreviousChaptersContextForEditor(extEditorChaptersCtx, sectionData.numero),
          });

          await this.trackTokenUsage(project.id, editorResult.tokenUsage, "El Editor", "deepseek-v4-flash", sectionData.numero, "extend_edit");

          if (editorResult.result) {
            const score = editorResult.result.puntuacion || 0;
            
            if (score > bestVersion.score) {
              bestVersion = { content: currentContent, score, continuityState: currentContinuityState };
            }

            if (score >= 8 || refinementAttempts >= this.maxRefinementLoops - 1) {
              approved = true;
              chapterContent = bestVersion.content;
              extractedContinuityState = bestVersion.continuityState;
            } else {
              refinementInstructions = editorResult.result.plan_quirurgico?.procedimiento || "Mejorar la calidad general";
              refinementAttempts++;
              this.callbacks.onAgentStatus("editor", "refining", 
                `${sectionLabel}: Puntuación ${score}/10, refinando (intento ${refinementAttempts})...`
              );
            }
          } else {
            approved = true;
            chapterContent = currentContent;
            extractedContinuityState = currentContinuityState;
          }
        }

        // Save the chapter
        const wordCount = chapterContent.split(/\s+/).filter((w: string) => w.length > 0).length;
        await storage.updateChapter(chapter.id, {
          content: chapterContent,
          wordCount,
          status: "completed",
          continuityState: extractedContinuityState,
        });

        this.callbacks.onChapterComplete(chapter.chapterNumber, wordCount, chapter.title ?? "");

        // Update continuity for next chapter
        previousContinuity = extractedContinuityState 
          ? JSON.stringify(extractedContinuityState)
          : `Capítulo ${chapter.chapterNumber} completado. Termina con: ${chapterContent.slice(-500)}`;
        previousContinuityStateForEditor = extractedContinuityState;
      }

      this.callbacks.onAgentStatus("orchestrator", "completed", 
        `Extensión completada: ${pendingChapters.length} capítulos generados`
      );
      await this.finalizeCompletedProject(project);

    } catch (error) {
      console.error("[Orchestrator:Extend] Error:", error);
      this.callbacks.onError(`Error en extensión: ${error instanceof Error ? error.message : "Error desconocido"}`);
      await storage.updateProject(project.id, { status: "error" });
    }
  }

  async runContinuitySentinelForce(project: Project): Promise<void> {
    try {
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto");
        return;
      }

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      let styleGuideContent = "";
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) {
          styleGuideContent = styleGuide.content;
        }
      }

      const chapters = await storage.getChaptersByProject(project.id);
      const allSections = this.buildSectionsListFromChapters(chapters, worldBibleData);
      const guiaEstilo = `Género: ${project.genre}, Tono: ${project.tone}. ${styleGuideContent}`;

      this.callbacks.onAgentStatus("continuity-sentinel", "analyzing", 
        "Ejecutando análisis de continuidad forzado sobre todo el manuscrito..."
      );

      // Run Sentinel on all chapters
      const result = await this.runContinuityCheckpoint(
        project,
        99, // Special checkpoint number indicating forced run
        chapters,
        worldBibleData,
        []
      );

      if (result.passed) {
        this.callbacks.onAgentStatus("continuity-sentinel", "completed", 
          "No se encontraron issues de continuidad"
        );
        await this.finalizeCompletedProject(project);
        return;
      }

      const hasActionableIssues = result.issues.some(issue => 
        issue.includes("[CRITICA]") || issue.includes("[CRÍTICA]") ||
        issue.includes("[MAYOR]") ||
        issue.toLowerCase().includes("critica") || issue.toLowerCase().includes("crítica") ||
        issue.toLowerCase().includes("mayor")
      );

      if (hasActionableIssues && result.chaptersToRevise.length > 0) {
        this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
          `${result.issues.length} issues detectados. Forzando reescritura de capítulos: ${result.chaptersToRevise.join(", ")}`
        );

        const correctionInstructions = result.issues.join("\n");

        for (const chapterNum of result.chaptersToRevise) {
          const chapter = chapters.find(c => c.chapterNumber === chapterNum);
          const sectionData = allSections.find(s => s.numero === chapterNum);

          if (chapter && sectionData) {
            this.callbacks.onChapterRewrite(
              chapterNum,
              chapter.title || `Capítulo ${chapterNum}`,
              result.chaptersToRevise.indexOf(chapterNum) + 1,
              result.chaptersToRevise.length,
              "Corrección forzada por Centinela"
            );

            await this.rewriteChapterForQA(
              project,
              chapter,
              sectionData,
              worldBibleData,
              guiaEstilo,
              "continuity",
              correctionInstructions
            );
          }
        }

        this.callbacks.onAgentStatus("continuity-sentinel", "completed", 
          `Reescritura completada para ${result.chaptersToRevise.length} capítulos`
        );
      }

      await this.finalizeCompletedProject(project);
    } catch (error) {
      console.error("Force continuity sentinel error:", error);
      this.callbacks.onError(`Error en Centinela forzado: ${error instanceof Error ? error.message : "Error desconocido"}`);
      await storage.updateProject(project.id, { status: "error" });
    }
  }

  async regenerateTruncatedChapters(project: Project, minWordCount: number = 100): Promise<void> {
    try {
      this.cumulativeTokens = {
        inputTokens: project.totalInputTokens || 0,
        outputTokens: project.totalOutputTokens || 0,
        thinkingTokens: project.totalThinkingTokens || 0,
      };
      this.currentProjectGenre = project.genre;

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) {
        this.callbacks.onError("No se encontró la biblia del mundo para este proyecto");
        return;
      }

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      let styleGuideContent = "";
      if (project.styleGuideId) {
        const styleGuide = await storage.getStyleGuide(project.styleGuideId);
        if (styleGuide) {
          styleGuideContent = styleGuide.content;
        }
      }

      const chapters = await storage.getChaptersByProject(project.id);
      const allSections = this.buildSectionsListFromChapters(chapters, worldBibleData);
      const guiaEstilo = `Género: ${project.genre}, Tono: ${project.tone}. ${styleGuideContent}`;

      const truncatedChapters = chapters.filter(ch => {
        const wordCount = ch.content ? ch.content.split(/\s+/).length : 0;
        return wordCount < minWordCount;
      });

      if (truncatedChapters.length === 0) {
        this.callbacks.onAgentStatus("ghostwriter", "completed", 
          "No se encontraron capítulos truncados"
        );
        await this.finalizeCompletedProject(project);
        return;
      }

      let seriesUnresolvedThreadsRegen: string[] = [];
      let seriesKeyEventsRegen: string[] = [];
      if (project.seriesId) {
        const { threads, events } = await this.loadSeriesThreadsAndEvents(project);
        seriesUnresolvedThreadsRegen = threads;
        seriesKeyEventsRegen = events;
      }

      this.callbacks.onAgentStatus("ghostwriter", "writing", 
        `Regenerando ${truncatedChapters.length} capítulos truncados: ${truncatedChapters.map(c => c.chapterNumber).join(", ")}`
      );

      for (let i = 0; i < truncatedChapters.length; i++) {
        const chapter = truncatedChapters[i];
        const sectionData = allSections.find(s => s.numero === chapter.chapterNumber);

        if (!sectionData) {
          console.error(`No section data found for chapter ${chapter.chapterNumber}`);
          continue;
        }

        this.callbacks.onChapterRewrite(
          chapter.chapterNumber,
          chapter.title || `Capítulo ${chapter.chapterNumber}`,
          i + 1,
          truncatedChapters.length,
          "Regeneración de capítulo truncado"
        );

        const previousChapters = chapters
          .filter(c => c.chapterNumber < chapter.chapterNumber)
          .sort((a, b) => a.chapterNumber - b.chapterNumber);
        
        const lastThreeChapters = previousChapters.slice(-3).map(c => ({
          numero: c.chapterNumber,
          titulo: c.title,
          contenido: c.content
        }));

        this.callbacks.onAgentStatus("ghostwriter", "writing", 
          `Escribiendo Capítulo ${chapter.chapterNumber}: "${sectionData.titulo}"`
        );

        const previousContinuity = lastThreeChapters.length > 0 
          ? `Resumen de capítulos anteriores:\n${lastThreeChapters.map(c => `Cap ${c.numero} "${c.titulo}": ${c.contenido?.slice(0, 500)}...`).join("\n\n")}`
          : "";

        // Retry loop for truncated responses
        const MAX_REGENERATION_ATTEMPTS = 3;
        // Use project's per-chapter settings, fallback to calculated from total
        const calculatedTargetRegen = this.calculatePerChapterTarget((project as any).minWordCount, chapters.length);
        const perChapterMinRegen = (project as any).minWordsPerChapter || calculatedTargetRegen;
        const perChapterMaxRegen = (project as any).maxWordsPerChapter || Math.round(perChapterMinRegen * 1.15);
        const MARGIN_REGEN = 0.15; // 15% flexibility
        const TARGET_MIN_WORDS = Math.round(perChapterMinRegen * (1 - MARGIN_REGEN));
        const TARGET_MAX_WORDS = perChapterMaxRegen;
        const ABSOLUTE_MIN_WORDS = 500;
        const FLEXIBLE_MIN_WORDS = Math.floor(TARGET_MIN_WORDS * 0.90);
        const MAX_REGEN_WORD_RETRIES = 5;
        let regenerationAttempt = 0;
        let successfulContent = "";
        let successfulWordCount = 0;

        while (regenerationAttempt < MAX_REGEN_WORD_RETRIES) {
          regenerationAttempt++;
          
          const enrichedWBRegen = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesUnresolvedThreadsRegen, seriesKeyEventsRegen);
          const writerResult = await this.ghostwriter.execute({
            chapterNumber: chapter.chapterNumber,
            chapterData: sectionData,
            worldBible: this.worldBibleWithResolvedLexico(enrichedWBRegen, this.resolveLexicoForChapter(worldBibleData, chapter.chapterNumber)),
            guiaEstilo,
            previousContinuity,
            refinementInstructions: regenerationAttempt > 1 
              ? `CRÍTICO: Tu capítulo tiene muy pocas palabras. El rango aceptable es ${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} palabras (mínimo flexible: ${FLEXIBLE_MIN_WORDS}). DEBES expandir cada beat con más descripciones sensoriales, diálogos extensos y monólogo interno. Intento #${regenerationAttempt} de ${MAX_REGEN_WORD_RETRIES}.`
              : "",
            authorName: "",
            isRewrite: regenerationAttempt > 1,
            minWordCount: perChapterMinRegen,
            maxWordCount: perChapterMaxRegen,
            kindleUnlimitedOptimized: (project as any).kindleUnlimitedOptimized || false,
          });

          await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", chapter.chapterNumber, "chapter_regenerate");

          const { cleanContent } = this.ghostwriter.extractContinuityState(writerResult.content);
          const wordCount = cleanContent.split(/\s+/).filter((w: string) => w.length > 0).length;

          successfulContent = cleanContent;
          successfulWordCount = wordCount;

          if (wordCount >= FLEXIBLE_MIN_WORDS) {
            break;
          }

          console.warn(`[Orchestrator] Capítulo ${chapter.chapterNumber} corto (${wordCount}/${FLEXIBLE_MIN_WORDS} mínimo flexible). Intento ${regenerationAttempt}/${MAX_REGEN_WORD_RETRIES}. Reintentando...`);
          this.callbacks.onAgentStatus("ghostwriter", "warning", 
            `Capítulo ${chapter.chapterNumber} corto (${wordCount}/${TARGET_MIN_WORDS}-${TARGET_MAX_WORDS} palabras). Reintento ${regenerationAttempt}/${MAX_REGEN_WORD_RETRIES}...`
          );
          
          await new Promise(resolve => setTimeout(resolve, 15000));
        }

        if (successfulWordCount < FLEXIBLE_MIN_WORDS) {
          console.warn(`[Orchestrator] ⚠️ Capítulo ${chapter.chapterNumber} sigue corto (${successfulWordCount}/${FLEXIBLE_MIN_WORDS} mín) después de ${MAX_REGEN_WORD_RETRIES} intentos. Continuando con el mejor resultado.`);
        }

        await storage.updateChapter(chapter.id, {
          content: successfulContent,
          status: "completed"
        });

        this.callbacks.onChapterComplete(
          chapter.chapterNumber,
          successfulWordCount,
          sectionData.titulo
        );
      }

      this.callbacks.onAgentStatus("ghostwriter", "completed", 
        `Regeneración completada para ${truncatedChapters.length} capítulos`
      );

      await this.finalizeCompletedProject(project);
    } catch (error) {
      console.error("Regenerate truncated chapters error:", error);
      this.callbacks.onError(`Error regenerando capítulos: ${error instanceof Error ? error.message : "Error desconocido"}`);
      // Reset to paused instead of error so user can retry
      await storage.updateProject(project.id, { status: "paused" });
      this.callbacks.onAgentStatus("ghostwriter", "idle", "Error en regeneración. Proyecto pausado.");
    }
  }

  private buildSectionsListFromChapters(chapters: Chapter[], worldBibleData: ParsedWorldBible): SectionData[] {
    return chapters.map((chapter, index) => {
      const chapterData = worldBibleData.escaleta_capitulos?.[index] || {};
      let tipo: "prologue" | "chapter" | "epilogue" | "author_note" = "chapter";
      
      if (chapter.title === "Prólogo") tipo = "prologue";
      else if (chapter.title === "Epílogo") tipo = "epilogue";
      else if (chapter.title === "Nota del Autor") tipo = "author_note";

      return {
        numero: chapter.chapterNumber,
        titulo: chapter.title || `Capítulo ${chapter.chapterNumber}`,
        cronologia: chapterData.cronologia || "",
        ubicacion: chapterData.ubicacion || "",
        elenco_presente: chapterData.elenco_presente || [],
        objetivo_narrativo: chapterData.objetivo_narrativo || "",
        beats: chapterData.beats || [],
        continuidad_salida: chapterData.continuidad_salida,
        tipo,
        funcion_estructural: chapterData.funcion_estructural,
        informacion_nueva: chapterData.informacion_nueva,
        conflicto_central: chapterData.conflicto_central,
        giro_emocional: chapterData.giro_emocional,
        riesgos_de_verosimilitud: chapterData.riesgos_de_verosimilitud,
      };
    });
  }

  private buildSectionsList(project: Project, worldBibleData: ParsedWorldBible): SectionData[] {
    const sections: SectionData[] = [];
    const escaleta = worldBibleData.escaleta_capitulos || [];
    
    // Helper to find chapter data by numero instead of by array index
    const findChapterByNumero = (numero: number) => 
      escaleta.find((c: any) => c.numero === numero) || {};

    // Check if this is a bookbox project with structure defined
    const bookboxStructure = (project as any).bookboxStructure as {
      books: Array<{
        bookNumber: number;
        title: string;
        startChapter: number;
        endChapter: number;
        hasPrologue: boolean;
        hasEpilogue: boolean;
      }>;
    } | null;

    const isBookbox = (project as any).workType === "bookbox" && bookboxStructure?.books && bookboxStructure.books.length > 0;

    if (isBookbox) {
      // BOOKBOX MODE: Generate sections for each book in the structure
      let sectionCounter = 0;
      
      for (const book of bookboxStructure!.books) {
        // Add book prologue if it has one
        if (book.hasPrologue) {
          const prologueNumero = -(1000 + book.bookNumber * 10); // Unique negative number for book prologues
          const prologueData = findChapterByNumero(prologueNumero);
          sections.push({
            numero: prologueNumero,
            titulo: prologueData.titulo || `Prólogo - ${book.title}`,
            cronologia: prologueData.cronologia || `Antes del inicio de ${book.title}`,
            ubicacion: prologueData.ubicacion || "",
            elenco_presente: prologueData.elenco_presente || [],
            objetivo_narrativo: prologueData.objetivo_narrativo || `Establecer el tono para ${book.title}`,
            beats: prologueData.beats || ["Gancho inicial", "Presentación del contexto", "Sembrar intriga"],
            tipo: "book_prologue",
            bookNumber: book.bookNumber,
            bookTitle: book.title,
            continuidad_salida: prologueData.continuidad_salida,
            funcion_estructural: prologueData.funcion_estructural,
            riesgos_de_verosimilitud: prologueData.riesgos_de_verosimilitud,
          });
          sectionCounter++;
        }

        // Add chapters for this book
        for (let chapterNum = book.startChapter; chapterNum <= book.endChapter; chapterNum++) {
          const chapterData = findChapterByNumero(chapterNum);
          sections.push({
            numero: chapterNum,
            titulo: chapterData.titulo || `Capítulo ${chapterNum}`,
            cronologia: chapterData.cronologia || "",
            ubicacion: chapterData.ubicacion || "",
            elenco_presente: chapterData.elenco_presente || [],
            objetivo_narrativo: chapterData.objetivo_narrativo || "",
            beats: chapterData.beats || [],
            continuidad_salida: chapterData.continuidad_salida,
            continuidad_entrada: chapterData.continuidad_entrada,
            tipo: "chapter",
            bookNumber: book.bookNumber,
            bookTitle: book.title,
            funcion_estructural: chapterData.funcion_estructural,
            informacion_nueva: chapterData.informacion_nueva,
            pregunta_dramatica: chapterData.pregunta_dramatica,
            conflicto_central: chapterData.conflicto_central,
            giro_emocional: chapterData.giro_emocional,
            recursos_literarios_sugeridos: chapterData.recursos_literarios_sugeridos,
            tono_especifico: chapterData.tono_especifico,
            prohibiciones_este_capitulo: chapterData.prohibiciones_este_capitulo,
            arcos_que_avanza: chapterData.arcos_que_avanza,
            riesgos_de_verosimilitud: chapterData.riesgos_de_verosimilitud,
          });
          sectionCounter++;
        }

        // Add book epilogue if it has one
        if (book.hasEpilogue) {
          const epilogueNumero = -(2000 + book.bookNumber * 10); // Unique negative number for book epilogues
          const epilogueData = findChapterByNumero(epilogueNumero);
          sections.push({
            numero: epilogueNumero,
            titulo: epilogueData.titulo || `Epílogo - ${book.title}`,
            cronologia: epilogueData.cronologia || `Después del final de ${book.title}`,
            ubicacion: epilogueData.ubicacion || "",
            elenco_presente: epilogueData.elenco_presente || [],
            objetivo_narrativo: epilogueData.objetivo_narrativo || `Cerrar los arcos de ${book.title}`,
            beats: epilogueData.beats || ["Resolución", "Transición", "Cierre emocional"],
            tipo: "book_epilogue",
            bookNumber: book.bookNumber,
            bookTitle: book.title,
            continuidad_entrada: epilogueData.continuidad_entrada,
            funcion_estructural: epilogueData.funcion_estructural,
          });
          sectionCounter++;
        }
      }

      // Add author note at the end if project has one
      if (project.hasAuthorNote) {
        sections.push({
          numero: -2,
          titulo: "Nota del Autor",
          cronologia: "",
          ubicacion: "",
          elenco_presente: [],
          objetivo_narrativo: "Reflexiones del autor sobre el proceso creativo y la historia",
          beats: ["Agradecimientos", "Inspiración de la obra", "Mensaje personal"],
          tipo: "author_note",
        });
      }

      console.log(`[Orchestrator] Bookbox structure built: ${sections.length} sections across ${bookboxStructure!.books.length} books`);
      return sections;
    }

    // STANDARD MODE: Original behavior for non-bookbox projects
    if (project.hasPrologue) {
      // Look for prologue data from Architect (numero=0) instead of using synthetic defaults
      const prologueData = findChapterByNumero(0);
      sections.push({
        numero: 0,
        titulo: prologueData.titulo || "Prólogo",
        cronologia: prologueData.cronologia || "Antes del inicio de la historia",
        ubicacion: prologueData.ubicacion || "",
        elenco_presente: prologueData.elenco_presente || [],
        objetivo_narrativo: prologueData.objetivo_narrativo || "Establecer el tono y generar intriga para la historia que está por comenzar",
        beats: prologueData.beats || ["Gancho inicial", "Presentación del mundo", "Sembrar misterio"],
        tipo: "prologue",
        continuidad_salida: prologueData.continuidad_salida,
        funcion_estructural: prologueData.funcion_estructural,
        informacion_nueva: prologueData.informacion_nueva,
        conflicto_central: prologueData.conflicto_central,
        giro_emocional: prologueData.giro_emocional,
        riesgos_de_verosimilitud: prologueData.riesgos_de_verosimilitud,
      });
    }

    // Build chapters 1 through chapterCount by looking up by numero, not by array index
    for (let chapterNum = 1; chapterNum <= project.chapterCount; chapterNum++) {
      const chapterData = findChapterByNumero(chapterNum);
      sections.push({
        numero: chapterNum,
        titulo: chapterData.titulo || `Capítulo ${chapterNum}`,
        cronologia: chapterData.cronologia || "",
        ubicacion: chapterData.ubicacion || "",
        elenco_presente: chapterData.elenco_presente || [],
        objetivo_narrativo: chapterData.objetivo_narrativo || "",
        beats: chapterData.beats || [],
        continuidad_salida: chapterData.continuidad_salida,
        continuidad_entrada: chapterData.continuidad_entrada,
        tipo: "chapter",
        funcion_estructural: chapterData.funcion_estructural,
        informacion_nueva: chapterData.informacion_nueva,
        pregunta_dramatica: chapterData.pregunta_dramatica,
        conflicto_central: chapterData.conflicto_central,
        giro_emocional: chapterData.giro_emocional,
        recursos_literarios_sugeridos: chapterData.recursos_literarios_sugeridos,
        tono_especifico: chapterData.tono_especifico,
        prohibiciones_este_capitulo: chapterData.prohibiciones_este_capitulo,
        arcos_que_avanza: chapterData.arcos_que_avanza,
        riesgos_de_verosimilitud: chapterData.riesgos_de_verosimilitud,
      });
    }

    if (project.hasEpilogue) {
      const epilogueData = findChapterByNumero(-1);
      sections.push({
        numero: -1,
        titulo: epilogueData.titulo || "Epílogo",
        cronologia: epilogueData.cronologia || "Después del final de la historia",
        ubicacion: epilogueData.ubicacion || "",
        elenco_presente: epilogueData.elenco_presente || [],
        objetivo_narrativo: epilogueData.objetivo_narrativo || "Cerrar los arcos narrativos y ofrecer una conclusión satisfactoria",
        beats: epilogueData.beats || ["Resolución final", "Mirada al futuro", "Cierre emocional"],
        tipo: "epilogue",
        continuidad_entrada: epilogueData.continuidad_entrada,
        funcion_estructural: epilogueData.funcion_estructural,
        conflicto_central: epilogueData.conflicto_central,
        giro_emocional: epilogueData.giro_emocional,
      });
    }

    if (project.hasAuthorNote) {
      sections.push({
        numero: -2,
        titulo: "Nota del Autor",
        cronologia: "",
        ubicacion: "",
        elenco_presente: [],
        objetivo_narrativo: "Reflexiones del autor sobre el proceso creativo y la historia",
        beats: ["Agradecimientos", "Inspiración de la obra", "Mensaje personal"],
        tipo: "author_note",
      });
    }

    return sections;
  }

  /**
   * Serializa lo esencial del World Bible en un bloque de texto compacto que
   * el Cirujano de Texto puede consultar para no contradecir la canon al
   * generar operaciones find/replace. Mantiene solo personajes, reglas del
   * mundo, eventos clave y resumen de trama — sin metadatos pesados.
   */
  private serializeWorldBibleForSurgery(wb: any): string {
    if (!wb || typeof wb !== "object") return "";

    const sections: string[] = [];

    const personajes = wb.personajes || wb.characters;
    if (Array.isArray(personajes) && personajes.length > 0) {
      const lines = personajes.map((p: any) => {
        const nombre = p.nombre || p.name || "?";
        const rol = p.rol || p.role || "";
        const rasgos = p.rasgos || p.traits || p.descripcion || p.description || "";
        const arco = p.arco || p.arc || "";
        const relaciones = p.relaciones || p.relationships || "";
        const parts = [
          `- ${nombre}${rol ? ` (${rol})` : ""}`,
          rasgos ? `  rasgos: ${typeof rasgos === "string" ? rasgos : JSON.stringify(rasgos)}` : "",
          arco ? `  arco: ${typeof arco === "string" ? arco : JSON.stringify(arco)}` : "",
          relaciones ? `  relaciones: ${typeof relaciones === "string" ? relaciones : JSON.stringify(relaciones)}` : "",
        ].filter(Boolean);
        return parts.join("\n");
      });
      sections.push(`PERSONAJES (canon):\n${lines.join("\n")}`);
    }

    const reglas = wb.reglas_del_mundo || wb.world_rules || wb.worldRules;
    if (Array.isArray(reglas) && reglas.length > 0) {
      const lines = reglas.map((r: any) => {
        if (typeof r === "string") return `- ${r}`;
        const nombre = r.nombre || r.name || r.regla || "";
        const desc = r.descripcion || r.description || "";
        return `- ${nombre}${nombre && desc ? ": " : ""}${desc}`;
      });
      sections.push(`REGLAS DEL MUNDO (canon):\n${lines.join("\n")}`);
    }

    const ambientacion = wb.ambientacion || wb.setting;
    if (ambientacion) {
      const text = typeof ambientacion === "string" ? ambientacion : JSON.stringify(ambientacion);
      sections.push(`AMBIENTACIÓN: ${text}`);
    }

    const timeline = wb.timeline || wb.cronologia || wb.eventos_clave || wb.keyEvents;
    if (Array.isArray(timeline) && timeline.length > 0) {
      const lines = timeline.slice(0, 60).map((e: any) => {
        if (typeof e === "string") return `- ${e}`;
        const cap = e.capitulo || e.chapter || "?";
        const desc = e.evento || e.event || e.descripcion || e.description || JSON.stringify(e);
        return `- [cap ${cap}] ${desc}`;
      });
      sections.push(`EVENTOS CLAVE (canon cronológica):\n${lines.join("\n")}`);
    }

    const trama = wb.plotOutline || wb.trama || wb.plot;
    if (trama) {
      const text = typeof trama === "string" ? trama : JSON.stringify(trama);
      if (text.length < 4000) {
        sections.push(`SINOPSIS / ESTRUCTURA DE TRAMA:\n${text}`);
      }
    }

    const seriesContext = wb.seriesContext || wb.series_context;
    if (seriesContext) {
      const text = typeof seriesContext === "string" ? seriesContext : JSON.stringify(seriesContext);
      sections.push(`CONTEXTO DE SERIE:\n${text}`);
    }

    return sections.join("\n\n");
  }

  private getSectionLabel(section: SectionData): string {
    switch (section.tipo) {
      case "prologue":
        return "el Prólogo";
      case "epilogue":
        return "el Epílogo";
      case "author_note":
        return "la Nota del Autor";
      case "book_prologue":
        return section.bookTitle ? `el Prólogo de ${section.bookTitle}` : "el Prólogo del Libro";
      case "book_epilogue":
        return section.bookTitle ? `el Epílogo de ${section.bookTitle}` : "el Epílogo del Libro";
      default:
        return `el Capítulo ${section.numero}`;
    }
  }

  private buildLimitationsFromTracker(
    tracker: Map<number, Map<string, number>>,
    maxRewrites: number
  ): Array<{ capitulo: number; errorTypes: string[]; intentos: number }> {
    const limitations: Array<{ capitulo: number; errorTypes: string[]; intentos: number }> = [];
    for (const [chapterNum, typeCounts] of tracker) {
      const exhaustedTypes: string[] = [];
      let maxAttempts = 0;
      for (const [errorType, count] of typeCounts) {
        if (count >= maxRewrites) {
          exhaustedTypes.push(errorType);
          if (count > maxAttempts) maxAttempts = count;
        }
      }
      if (exhaustedTypes.length > 0) {
        limitations.push({
          capitulo: chapterNum,
          errorTypes: exhaustedTypes,
          intentos: maxAttempts,
        });
      }
    }
    return limitations;
  }

  private buildRefinementInstructions(editorResult: EditorResult | undefined): string {
    if (!editorResult) return "";

    const parts: string[] = [];
    
    parts.push(`═══════════════════════════════════════════════════════════════════`);
    parts.push(`FEEDBACK COMPLETO DEL EDITOR - PUNTUACIÓN: ${editorResult.puntuacion}/10`);
    parts.push(`═══════════════════════════════════════════════════════════════════`);
    
    if (editorResult.veredicto) {
      parts.push(`\nVEREDICTO: ${editorResult.veredicto}`);
    }
    
    if (editorResult.errores_continuidad && editorResult.errores_continuidad.length > 0) {
      parts.push(`\n🚨 ERRORES DE CONTINUIDAD (CRÍTICO - CORREGIR PRIMERO):\n${editorResult.errores_continuidad.map(e => `  ❌ ${e}`).join("\n")}`);
    }

    if (editorResult.filtracion_conocimiento && editorResult.filtracion_conocimiento.length > 0) {
      parts.push(`\n🚨 FILTRACIÓN DE CONOCIMIENTO (CRÍTICO - CORREGIR):\n${editorResult.filtracion_conocimiento.map(e => `  ❌ ${e}`).join("\n")}`);
    }

    if (editorResult.inconsistencias_objetos && editorResult.inconsistencias_objetos.length > 0) {
      parts.push(`\n🚨 INCONSISTENCIAS DE OBJETOS (CRÍTICO - CORREGIR):\n${editorResult.inconsistencias_objetos.map(e => `  ❌ ${e}`).join("\n")}`);
    }
    
    if (editorResult.problemas_verosimilitud && editorResult.problemas_verosimilitud.length > 0) {
      parts.push(`\n🚨 PROBLEMAS DE VEROSIMILITUD (CRÍTICO):\n${editorResult.problemas_verosimilitud.map(p => `  ❌ ${p}`).join("\n")}`);
    }
    
    // Beats faltantes del Arquitecto
    if (editorResult.beats_faltantes && editorResult.beats_faltantes.length > 0) {
      parts.push(`\n📋 BEATS FALTANTES (DEBEN INCLUIRSE):\n${editorResult.beats_faltantes.map(b => `  ⚠️ ${b}`).join("\n")}`);
    }
    
    if (editorResult.debilidades_criticas && editorResult.debilidades_criticas.length > 0) {
      parts.push(`\n⚠️ DEBILIDADES A CORREGIR:\n${editorResult.debilidades_criticas.map(d => `  - ${d}`).join("\n")}`);
    }
    
    if (editorResult.frases_repetidas && editorResult.frases_repetidas.length > 0) {
      parts.push(`\n🔄 FRASES/EXPRESIONES REPETIDAS (VARIAR):\n${editorResult.frases_repetidas.map(f => `  - "${f}"`).join("\n")}`);
    }

    if (editorResult.repeticiones_trama && editorResult.repeticiones_trama.length > 0) {
      parts.push(`\n🚫 REPETICIONES DE TRAMA ENTRE CAPÍTULOS (CRÍTICO - REESTRUCTURAR):\n${editorResult.repeticiones_trama.map(r => `  ❌ ${r}`).join("\n")}`);
      parts.push(`  → Usa un MECANISMO NARRATIVO DIFERENTE para lograr el mismo objetivo de la trama`);
    }
    
    // Problemas de ritmo
    if (editorResult.problemas_ritmo && editorResult.problemas_ritmo.length > 0) {
      parts.push(`\n⏱️ PROBLEMAS DE RITMO:\n${editorResult.problemas_ritmo.map(r => `  - ${r}`).join("\n")}`);
    }
    
    // Violaciones de estilo
    if (editorResult.violaciones_estilo && editorResult.violaciones_estilo.length > 0) {
      parts.push(`\n📝 VIOLACIONES DE ESTILO:\n${editorResult.violaciones_estilo.map(v => `  - ${v}`).join("\n")}`);
    }
    
    // Plan quirúrgico detallado
    if (editorResult.plan_quirurgico) {
      const plan = editorResult.plan_quirurgico;
      parts.push(`\n═══════════════════════════════════════════════════════════════════`);
      parts.push(`PLAN QUIRÚRGICO DE CORRECCIÓN (SEGUIR AL PIE DE LA LETRA)`);
      parts.push(`═══════════════════════════════════════════════════════════════════`);
      if (plan.preservar) {
        parts.push(`\n🛡️ PRESERVAR INTACTO (NO TOCAR ESTOS ELEMENTOS):\n${plan.preservar}`);
      }
      if (plan.diagnostico) {
        parts.push(`\n📌 DIAGNÓSTICO:\n${plan.diagnostico}`);
      }
      if (plan.procedimiento) {
        parts.push(`\n📌 PROCEDIMIENTO QUIRÚRGICO (solo modificar lo indicado):\n${plan.procedimiento}`);
      }
      if (plan.objetivo) {
        parts.push(`\n📌 OBJETIVO FINAL:\n${plan.objetivo}`);
      }
      if (plan.palabras_objetivo) {
        parts.push(`\n📌 PALABRAS OBJETIVO: ${plan.palabras_objetivo} (NUNCA reducir por debajo del original)`);
      }
    }
    
    // Fortalezas a mantener
    if (editorResult.fortalezas && editorResult.fortalezas.length > 0) {
      parts.push(`\n✅ FORTALEZAS A MANTENER:\n${editorResult.fortalezas.map(f => `  + ${f}`).join("\n")}`);
    }
    
    // El vocabulario de época viene ahora directamente del lexico_historico
    // de la World Bible y se pasa al editor/copyeditor/ghostwriter por sus
    // propios canales. No se inyecta aquí en el plan del cirujano para evitar
    // duplicación y falsos positivos por género hardcoded.

    parts.push(`\n═══════════════════════════════════════════════════════════════════`);
    parts.push(`INSTRUCCIÓN FINAL: CORRIGE los problemas listados arriba SIN reescribir desde cero.`);
    parts.push(`CONSERVA TODO el texto que funciona bien. Solo MODIFICA los pasajes con problemas.`);
    parts.push(`Prioriza errores de continuidad y verosimilitud.`);
    parts.push(`Si la World Bible declara una época histórica, respeta el léxico declarado allí. Si no, no apliques restricciones de vocabulario por época.`);
    parts.push(`NO reduzcas la extensión del capítulo — mantén o aumenta el número de palabras.`);
    parts.push(`═══════════════════════════════════════════════════════════════════`);

    return parts.join("\n");
  }

  private sanitizeChapterTitles(data: ParsedWorldBible): ParsedWorldBible {
    if (!data.escaleta_capitulos) return data;
    
    data.escaleta_capitulos = data.escaleta_capitulos.map((cap: any) => {
      const numero = cap.numero;
      let titulo = cap.titulo || "";
      
      if (numero > 0) {
        if (titulo.toLowerCase().startsWith("prólogo:") || titulo.toLowerCase().startsWith("prologo:")) {
          const newTitle = titulo.replace(/^pr[oó]logo:\s*/i, "").trim();
          console.log(`[Orchestrator] FIXED title for chapter ${numero}: "${titulo}" → "${newTitle}"`);
          titulo = newTitle;
        }
      }
      
      if (numero !== -1) {
        if (titulo.toLowerCase().startsWith("epílogo:") || titulo.toLowerCase().startsWith("epilogo:")) {
          const newTitle = titulo.replace(/^ep[ií]logo:\s*/i, "").trim();
          console.log(`[Orchestrator] FIXED title for chapter ${numero}: "${titulo}" → "${newTitle}"`);
          titulo = newTitle;
        }
      }
      
      return { ...cap, titulo };
    });
    
    return data;
  }

  private parseArchitectOutput(content: string): ParsedWorldBible {
    console.log(`[Orchestrator] Parsing architect output, length: ${content.length}`);
    
    // Pre-processing: Clean content
    let cleanContent = content
      .replace(/^\uFEFF/, '')  // Remove BOM
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Remove control chars
      .trim();
    
    // Remove markdown code blocks if present
    const jsonBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      console.log(`[Orchestrator] Found markdown code block, extracting JSON`);
      cleanContent = jsonBlockMatch[1].trim();
    }
    
    console.log(`[Orchestrator] Clean content length: ${cleanContent.length}, starts with: "${cleanContent.substring(0, 50)}"`);
    
    // Método 1: Parse directo
    try {
      const parsed = JSON.parse(cleanContent);
      console.log(`[Orchestrator] Direct JSON parse SUCCESS - Characters: ${parsed.world_bible?.personajes?.length || 0}, Chapters: ${parsed.escaleta_capitulos?.length || 0}`);
      return this.sanitizeChapterTitles(parsed);
    } catch (e1) {
      console.log(`[Orchestrator] Direct parse failed: ${(e1 as Error).message}`);
    }
    
    // Método 2: Extraer JSON del texto (buscar estructura con world_bible)
    try {
      const worldBibleMatch = cleanContent.match(/"world_bible"\s*:/);
      if (worldBibleMatch && worldBibleMatch.index !== undefined) {
        let braceStart = cleanContent.lastIndexOf('{', worldBibleMatch.index);
        if (braceStart !== -1) {
          let depth = 0;
          let jsonEnd = -1;
          for (let i = braceStart; i < cleanContent.length; i++) {
            if (cleanContent[i] === '{') depth++;
            if (cleanContent[i] === '}') {
              depth--;
              if (depth === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
          
          if (jsonEnd !== -1) {
            const jsonStr = cleanContent.substring(braceStart, jsonEnd);
            const parsed = JSON.parse(jsonStr);
            console.log(`[Orchestrator] Extracted JSON SUCCESS - Characters: ${parsed.world_bible?.personajes?.length || 0}, Chapters: ${parsed.escaleta_capitulos?.length || 0}`);
            return this.sanitizeChapterTitles(parsed);
          }
        }
      }
    } catch (e2) {
      console.log(`[Orchestrator] JSON extraction method 2 failed: ${(e2 as Error).message}`);
    }
    
    // Método 3: Buscar primer { y último } (fallback)
    try {
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = cleanContent.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        console.log(`[Orchestrator] Fallback JSON parse SUCCESS - Characters: ${parsed.world_bible?.personajes?.length || 0}, Chapters: ${parsed.escaleta_capitulos?.length || 0}`);
        return this.sanitizeChapterTitles(parsed);
      }
    } catch (e3) {
      console.log(`[Orchestrator] Fallback parse failed: ${(e3 as Error).message}`);
    }
    
    // Método 4: Try with repaired JSON (fix common issues)
    try {
      let repairedContent = cleanContent
        .replace(/,\s*}/g, '}')  // Remove trailing commas before }
        .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');  // Quote unquoted keys
      
      const firstBrace = repairedContent.indexOf('{');
      const lastBrace = repairedContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = repairedContent.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        console.log(`[Orchestrator] Repaired JSON parse SUCCESS - Characters: ${parsed.world_bible?.personajes?.length || 0}, Chapters: ${parsed.escaleta_capitulos?.length || 0}`);
        return this.sanitizeChapterTitles(parsed);
      }
    } catch (e4) {
      console.log(`[Orchestrator] Repaired JSON parse failed: ${(e4 as Error).message}`);
    }
    
    // CRITICAL: Log the first 3000 chars to see what architect returned
    console.error(`[Orchestrator] ALL PARSE METHODS FAILED. Content preview (first 3000 chars):\n${cleanContent.substring(0, 3000)}`);
    console.error(`[Orchestrator] Content ends with (last 500 chars):\n${cleanContent.substring(cleanContent.length - 500)}`);
    
    return {
      world_bible: { personajes: [], lugares: [], reglas_lore: [] },
      escaleta_capitulos: [],
    };
  }

  private convertCharacters(data: ParsedWorldBible): Character[] {
    // Try multiple possible locations for characters array (use any for flexible access)
    const d = data as any;
    const personajes = d.world_bible?.personajes 
      || d.world_bible?.characters 
      || d.personajes 
      || d.characters 
      || [];
    
    console.log(`[Orchestrator] Converting ${personajes.length} characters`);
    
    return personajes.map((p: any) => {
      // Extraer apariencia inmutable del formato del Architect
      const aparienciaRaw = p.apariencia_inmutable || p.aparienciaInmutable || p.appearance || {};
      return {
        name: p.nombre || p.name || "",
        role: p.rol || p.role || "",
        psychologicalProfile: p.perfil_psicologico || p.psychologicalProfile || p.psychology || "",
        arc: p.arco || p.arc || "",
        relationships: p.relaciones || p.relationships || [],
        isAlive: p.vivo !== false && p.isAlive !== false,
        // CRÍTICO: Preservar apariencia física para continuidad
        aparienciaInmutable: {
          ojos: aparienciaRaw.ojos || aparienciaRaw.color_ojos || aparienciaRaw.eyes || "",
          cabello: aparienciaRaw.cabello || aparienciaRaw.color_cabello || aparienciaRaw.hair || "",
          rasgosDistintivos: aparienciaRaw.rasgos_distintivos || aparienciaRaw.rasgosDistintivos || aparienciaRaw.features || [],
          altura: aparienciaRaw.altura || aparienciaRaw.estatura || aparienciaRaw.height || "",
          edad: aparienciaRaw.edad || aparienciaRaw.edad_aparente || aparienciaRaw.age || "",
        },
      };
    });
  }

  private convertWorldRules(data: ParsedWorldBible): WorldRule[] {
    // Try multiple possible locations for rules array (use any for flexible access)
    const d = data as any;
    const reglas = d.world_bible?.reglas_lore 
      || d.world_bible?.rules 
      || d.world_bible?.world_rules
      || d.reglas_lore 
      || d.rules 
      || [];
    
    console.log(`[Orchestrator] Converting ${reglas.length} world rules`);
    
    return reglas.map((r: any) => ({
      category: r.categoria || r.category || "General",
      rule: r.regla || r.rule || r.descripcion || r.description || "",
      constraints: r.restricciones || r.constraints || r.limitaciones || [],
    }));
  }

  private convertTimeline(data: ParsedWorldBible): TimelineEvent[] {
    return (data.escaleta_capitulos || []).map((c: any) => ({
      chapter: c.numero || 0,
      event: c.objetivo_narrativo || c.titulo || "",
      characters: c.elenco_presente || [],
      significance: c.continuidad_salida || "",
    }));
  }

  private convertPlotOutline(data: ParsedWorldBible): PlotOutline {
    // Try multiple possible locations for structure (use any for flexible access)
    const d = data as any;
    const acts = d.estructura_tres_actos || d.three_act_structure || d.estructura || {};
    const premise = d.premisa || d.premise || d.world_bible?.premisa || "";
    
    console.log(`[Orchestrator] Converting plot outline - Premise length: ${premise.length}, Chapters: ${(d.escaleta_capitulos || []).length}`);
    
    return {
      premise,
      threeActStructure: {
        act1: {
          setup: acts.acto1?.planteamiento || "",
          incitingIncident: acts.acto1?.incidente_incitador || "",
        },
        act2: {
          risingAction: acts.acto2?.accion_ascendente || "",
          midpoint: acts.acto2?.punto_medio || "",
          complications: acts.acto2?.complicaciones || "",
        },
        act3: {
          climax: acts.acto3?.climax || "",
          resolution: acts.acto3?.resolucion || "",
        },
      },
      lexico_historico: data.world_bible?.lexico_historico || null,
      chapterOutlines: (data.escaleta_capitulos || []).map((c: any) => ({
        number: c.numero,
        summary: c.objetivo_narrativo || "",
        keyEvents: c.beats || [],
        // Datos adicionales para propagación completa en reanudaciones
        titulo: c.titulo,
        epoca_id: c.epoca_id ?? null,
        cronologia: c.cronologia,
        ubicacion: c.ubicacion,
        elenco_presente: c.elenco_presente,
        funcion_estructural: c.funcion_estructural,
        informacion_nueva: c.informacion_nueva,
        pregunta_dramatica: c.pregunta_dramatica,
        conflicto_central: c.conflicto_central,
        giro_emocional: c.giro_emocional,
        recursos_literarios_sugeridos: c.recursos_literarios_sugeridos,
        tono_especifico: c.tono_especifico,
        prohibiciones_este_capitulo: c.prohibiciones_este_capitulo,
        arcos_que_avanza: c.arcos_que_avanza,
        continuidad_entrada: c.continuidad_entrada,
        continuidad_salida: c.continuidad_salida,
        riesgos_de_verosimilitud: c.riesgos_de_verosimilitud,
      })),
    };
  }

  private async enrichWorldBibleFromChapter(
    projectId: number,
    chapterNumber: number,
    continuityState: any,
    chapterContent: string
  ): Promise<void> {
    if (!continuityState) return;
    
    try {
      const worldBible = await storage.getWorldBibleByProject(projectId);
      if (!worldBible) return;

      const characters = ((worldBible.characters || []) as any[]).slice();
      const charStates = continuityState.characterStates || continuityState.character_states || {};
      
      const stateEntries = Array.isArray(charStates) 
        ? charStates.map((c: any) => [c.name || c.personaje || c.nombre, c] as [string, any])
        : Object.entries(charStates);

      let updated = false;

      for (const [charName, state] of stateEntries) {
        if (!charName) continue;
        
        const existing = characters.find(
          (c: any) => (c.name || "").toLowerCase() === charName.toLowerCase()
        );
        
        if (existing) {
          existing.lastLocation = state.location || state.ubicacion || existing.lastLocation;
          existing.isAlive = state.status !== "dead" && state.estado !== "muerto" && existing.isAlive !== false;
          existing.currentStatus = state.status || state.estado || existing.currentStatus || "alive";
          existing.lastSeenChapter = chapterNumber;
          
          const items = state.hasItems || state.objetos || state.items || [];
          if (items.length > 0) {
            existing.currentItems = items;
          }
          
          const injuries = state.injuries || state.heridas || [];
          if (injuries.length > 0) {
            existing.activeInjuries = Array.from(
              new Set([...(existing.activeInjuries || []), ...injuries])
            );
          }
          
          const knowledge = state.knowledgeGained || state.conocimiento || [];
          if (knowledge.length > 0) {
            existing.accumulatedKnowledge = Array.from(new Set([
              ...(existing.accumulatedKnowledge || []).slice(-10),
              ...knowledge
            ])).slice(-15);
          }
          
          if (state.emotionalState) {
            existing.currentEmotionalState = state.emotionalState;
          }
          
          updated = true;
        } else {
          characters.push({
            name: charName,
            role: "secondary",
            isAlive: state.status !== "dead" && state.estado !== "muerto",
            currentStatus: state.status || state.estado || "alive",
            lastLocation: state.location || state.ubicacion || "",
            lastSeenChapter: chapterNumber,
            currentItems: state.hasItems || state.objetos || [],
            activeInjuries: state.injuries || state.heridas || [],
            accumulatedKnowledge: state.knowledgeGained || state.conocimiento || [],
            currentEmotionalState: state.emotionalState || "",
            aparienciaInmutable: {},
          });
          updated = true;
        }
      }

      const pendingThreads = continuityState.pendingThreads || [];
      const resolvedThreads = continuityState.resolvedThreads || [];
      
      const worldRules = ((worldBible.worldRules || []) as any[]).slice();
      
      if (pendingThreads.length > 0 || resolvedThreads.length > 0) {
        const threadRule = worldRules.find((r: any) => r.category === "__narrative_threads");
        if (threadRule) {
          const existingPending = threadRule.pending || [];
          const newPending = Array.from(new Set([...existingPending, ...pendingThreads]))
            .filter((t: string) => !resolvedThreads.includes(t));
          threadRule.pending = newPending.slice(-20);
          threadRule.resolved = Array.from(
            new Set([...(threadRule.resolved || []), ...resolvedThreads])
          ).slice(-20);
          threadRule.lastUpdatedChapter = chapterNumber;
        } else {
          worldRules.push({
            category: "__narrative_threads",
            rule: "Hilos narrativos activos y resueltos (actualizado automáticamente)",
            pending: pendingThreads.slice(-20),
            resolved: resolvedThreads.slice(-20),
            lastUpdatedChapter: chapterNumber,
            constraints: [],
          });
        }
        updated = true;
      }

      if (updated) {
        await storage.updateWorldBible(worldBible.id, { 
          characters,
          worldRules,
        });
        console.log(`[WorldBible] Enriched after Cap ${chapterNumber}: ${characters.length} characters tracked`);
      }
    } catch (error) {
      console.warn(`[WorldBible] Failed to enrich after chapter ${chapterNumber}:`, error);
    }
  }

  private async getEnrichedWorldBible(projectId: number, baseWorldBible: any, seriesUnresolvedThreads?: string[], seriesKeyEvents?: string[]): Promise<any> {
    try {
      const dbWorldBible = await storage.getWorldBibleByProject(projectId);
      if (!dbWorldBible) return baseWorldBible;
      
      const enrichedCharacters = (dbWorldBible.characters || []) as any[];
      const enriched = JSON.parse(JSON.stringify(baseWorldBible));
      
      if (enrichedCharacters.length === 0) {
        const dbRulesEarly = (dbWorldBible.worldRules || []) as any[];
        const threadRuleEarly = dbRulesEarly.find((r: any) => r.category === "__narrative_threads");
        if (threadRuleEarly) {
          enriched._hilos_pendientes = threadRuleEarly.pending || [];
          enriched._hilos_resueltos = threadRuleEarly.resolved || [];
        }
        const plotDecisionsEarly = (dbWorldBible.plotDecisions || []) as any[];
        if (plotDecisionsEarly.length > 0) enriched._plot_decisions = plotDecisionsEarly;
        const persistentInjuriesEarly = (dbWorldBible.persistentInjuries || []) as any[];
        if (persistentInjuriesEarly.length > 0) enriched._persistent_injuries = persistentInjuriesEarly;
        const timelineEarly = (dbWorldBible.timeline || []) as any[];
        if (timelineEarly.length > 0) enriched._timeline = timelineEarly;
        const authorNotesEarly = ((dbWorldBible.authorNotes || []) as any[]).filter((n: any) => n.active !== false);
        if (authorNotesEarly.length > 0) enriched._author_notes = authorNotesEarly;
        if (seriesUnresolvedThreads?.length) enriched._series_hilos_no_resueltos = seriesUnresolvedThreads;
        if (seriesKeyEvents?.length) enriched._series_eventos_clave_previos = seriesKeyEvents;
        return enriched;
      }

      const personajes = enriched.personajes || enriched.characters || [];
      
      for (const dbChar of enrichedCharacters) {
        const existing = personajes.find(
          (p: any) => (p.nombre || p.name || "").toLowerCase() === (dbChar.name || "").toLowerCase()
        );
        
        if (existing) {
          if (dbChar.lastLocation) {
            existing.ubicacion_actual = dbChar.lastLocation;
          }
          if (dbChar.currentStatus) {
            existing.estado_actual = dbChar.currentStatus;
          }
          if (dbChar.isAlive === false) {
            existing.vivo = false;
            existing.estado_actual = "dead";
          }
          if (dbChar.currentItems?.length > 0) {
            existing.objetos_actuales = dbChar.currentItems;
          }
          if (dbChar.activeInjuries?.length > 0) {
            existing.heridas_activas = dbChar.activeInjuries;
          }
          if (dbChar.accumulatedKnowledge?.length > 0) {
            existing.conocimiento_acumulado = dbChar.accumulatedKnowledge;
          }
          if (dbChar.currentEmotionalState) {
            existing.estado_emocional = dbChar.currentEmotionalState;
          }
          if (dbChar.lastSeenChapter) {
            existing.ultimo_capitulo = dbChar.lastSeenChapter;
          }
        } else if (dbChar.lastSeenChapter) {
          personajes.push({
            nombre: dbChar.name,
            rol: dbChar.role || "secondary",
            vivo: dbChar.isAlive !== false,
            estado_actual: dbChar.currentStatus || "alive",
            ubicacion_actual: dbChar.lastLocation || "",
            objetos_actuales: dbChar.currentItems || [],
            heridas_activas: dbChar.activeInjuries || [],
            conocimiento_acumulado: dbChar.accumulatedKnowledge || [],
            estado_emocional: dbChar.currentEmotionalState || "",
            ultimo_capitulo: dbChar.lastSeenChapter,
            apariencia_inmutable: dbChar.aparienciaInmutable || {},
          });
        }
      }
      
      if (enriched.personajes) {
        enriched.personajes = personajes;
      } else {
        enriched.characters = personajes;
      }

      const dbRules = (dbWorldBible.worldRules || []) as any[];
      const threadRule = dbRules.find((r: any) => r.category === "__narrative_threads");
      if (threadRule) {
        enriched._hilos_pendientes = threadRule.pending || [];
        enriched._hilos_resueltos = threadRule.resolved || [];
      }

      const plotDecisions = (dbWorldBible.plotDecisions || []) as any[];
      if (plotDecisions.length > 0) {
        enriched._plot_decisions = plotDecisions;
      }

      const persistentInjuries = (dbWorldBible.persistentInjuries || []) as any[];
      if (persistentInjuries.length > 0) {
        enriched._persistent_injuries = persistentInjuries;
      }

      const timeline = (dbWorldBible.timeline || []) as any[];
      if (timeline.length > 0) {
        enriched._timeline = timeline;
      }

      const authorNotes = ((dbWorldBible.authorNotes || []) as any[]).filter((n: any) => n.active !== false);
      if (authorNotes.length > 0) {
        enriched._author_notes = authorNotes;
      }

      if (seriesUnresolvedThreads?.length) {
        enriched._series_hilos_no_resueltos = seriesUnresolvedThreads;
      }
      if (seriesKeyEvents?.length) {
        enriched._series_eventos_clave_previos = seriesKeyEvents;
      }
      
      return enriched;
    } catch (error) {
      console.warn(`[WorldBible] Failed to get enriched data:`, error);
      const fallback = JSON.parse(JSON.stringify(baseWorldBible));
      if (seriesUnresolvedThreads?.length) fallback._series_hilos_no_resueltos = seriesUnresolvedThreads;
      if (seriesKeyEvents?.length) fallback._series_eventos_clave_previos = seriesKeyEvents;
      return fallback;
    }
  }

  private async finalizeCompletedProject(project: Project): Promise<void> {
    const processChecklist: { step: string; status: "passed" | "corrected" | "skipped"; detail: string }[] = [];

    processChecklist.push({ step: "Revisión Final", status: "passed", detail: "Manuscrito aprobado con puntuación 9+/10" });

    // NOTA (v6.4): La auditoría final de continuidad y su re-verificación se han desactivado.
    // La continuidad ya se vigila chapter-by-chapter durante la generación con el Continuity Sentinel,
    // y una segunda pasada masiva al final introducía sobrecorrecciones que rompían escenas.
    // Si necesitas reactivarla, restaura `runFinalContinuityAudit` + `runPostAuditVerification` aquí.

    const orthoResult = await this.runOrthotypographicPass(project);
    processChecklist.push({
      step: "Corrección Ortotipográfica",
      status: orthoResult.totalChanges > 0 ? "corrected" : "passed",
      detail: orthoResult.totalChanges > 0
        ? `${orthoResult.totalChanges} correcciones en ${orthoResult.chaptersProcessed} capítulos`
        : `${orthoResult.chaptersProcessed} capítulos revisados sin correcciones`
    });

    const checklistSummary = processChecklist.map(p => {
      const icon = p.status === "passed" ? "✅" : p.status === "corrected" ? "🔧" : "⏭️";
      return `${icon} ${p.step}: ${p.detail}`;
    }).join("\n");

    this.callbacks.onAgentStatus("final-reviewer", "completed",
      `MANUSCRITO FINALIZADO — Checklist de procesos:\n${checklistSummary}`
    );

    await storage.createActivityLog({
      projectId: project.id,
      level: "success",
      message: `Manuscrito finalizado. Procesos completados: ${processChecklist.map(p => `[${p.step}: ${p.detail}]`).join(", ")}`,
      agentRole: "orchestrator",
    });

    await storage.updateProject(project.id, { status: "completed" });
    await this.generateSeriesContinuitySnapshot(project);
    await this.runSeriesArcVerification(project);
    this.callbacks.onProjectComplete();
  }

  private async runFinalContinuityAudit(project: Project): Promise<{ correctedCount: number; status: "clean" | "corrected" | "unresolved" | "error"; warnings: string[] }> {
    try {
      const chapters = await storage.getChaptersByProject(project.id);
      const completedChapters = sortChaptersNarrative(
        chapters.filter(c => c.status === "completed" && c.content)
      );
      const warnings: string[] = [];

      if (completedChapters.length < 4) return { correctedCount: 0, status: "clean", warnings };

      this.callbacks.onAgentStatus("continuity-sentinel", "analyzing",
        `Auditoría final de continuidad: verificando ${completedChapters.length} capítulos completos...`
      );

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) return { correctedCount: 0, status: "clean", warnings };

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      let styleGuideContent = "";
      if (project.styleGuideId) {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg) styleGuideContent = sg.content;
      }
      const guiaEstilo = `Género: ${project.genre}, Tono: ${project.tone}. ${styleGuideContent}`;
      const allSections = this.buildSectionsListFromChapters(chapters, worldBibleData);

      const BATCH_SIZE = 6;
      const OVERLAP = 2;
      const allIssues: string[] = [];
      const allChaptersToRevise: number[] = [];
      let batchNumber = 0;
      let failedBatches = 0;

      for (let start = 0; start < completedChapters.length; start += BATCH_SIZE - OVERLAP) {
        const freshChapters = await storage.getChaptersByProject(project.id);
        const freshCompleted = sortChaptersNarrative(
          freshChapters.filter(c => (c.status === "completed" || c.status === "revision") && c.content)
        );

        const batchChapterNums = completedChapters.slice(start, start + BATCH_SIZE).map(c => c.chapterNumber);
        const batch = freshCompleted.filter(c => batchChapterNums.includes(c.chapterNumber));
        if (batch.length < 2) break;
        batchNumber++;

        const chapterNums = batch.map(c => c.chapterNumber === 0 ? "Pról" : c.chapterNumber === -1 ? "Epíl" : `${c.chapterNumber}`);
        this.callbacks.onAgentStatus("continuity-sentinel", "analyzing",
          `Auditoría final lote ${batchNumber}: caps ${chapterNums.join(", ")}...`
        );

        const result = await this.runContinuityCheckpoint(
          project,
          900 + batchNumber,
          batch,
          worldBibleData,
          allIssues
        );

        if (!result.passed) {
          allIssues.push(...result.issues);
          for (const cn of result.chaptersToRevise) {
            if (!allChaptersToRevise.includes(cn)) allChaptersToRevise.push(cn);
          }
          if (result.chaptersToRevise.length === 0 && result.issues.length > 0) {
            failedBatches++;
          }
        }
      }

      if (allChaptersToRevise.length === 0 && failedBatches === 0 && allIssues.length === 0) {
        this.callbacks.onAgentStatus("continuity-sentinel", "completed",
          `Auditoría final APROBADA. No se encontraron errores de continuidad en el manuscrito completo.`
        );
        return { correctedCount: 0, status: "clean", warnings };
      }

      if (failedBatches > 0 && allChaptersToRevise.length === 0 && allIssues.length === 0) {
        warnings.push(`${failedBatches} lotes fallaron/timeout sin issues concretos`);
        this.callbacks.onAgentStatus("continuity-sentinel", "warning",
          `Auditoría final: ${failedBatches} lotes fallaron/timeout. Sin issues concretos detectados. Proyecto continuará pero requiere revisión manual.`
        );
        return { correctedCount: 0, status: "unresolved", warnings };
      }

      const hasActionable = allIssues.some(issue =>
        issue.includes("[CRITICA]") || issue.includes("[CRÍTICA]") ||
        issue.includes("[MAYOR]") ||
        issue.toLowerCase().includes("critica") || issue.toLowerCase().includes("crítica") ||
        issue.toLowerCase().includes("mayor")
      );

      if (hasActionable && allChaptersToRevise.length > 0) {
        const MAX_AUDIT_REWRITES = 8;
        if (allChaptersToRevise.length > MAX_AUDIT_REWRITES) {
          const originalCount = allChaptersToRevise.length;
          allChaptersToRevise.length = MAX_AUDIT_REWRITES;
          warnings.push(`Auditoría limitada: ${originalCount} capítulos → ${MAX_AUDIT_REWRITES} (máximo por auditoría)`);
          console.log(`[FinalAudit] Capping audit rewrites: ${originalCount} → ${MAX_AUDIT_REWRITES}`);
        }

        this.callbacks.onAgentStatus("continuity-sentinel", "editing",
          `Auditoría final: ${allIssues.length} errores detectados. Corrigiendo ${allChaptersToRevise.length} capítulos...`
        );

        const allFreshChapters = await storage.getChaptersByProject(project.id);

        for (const chapterNum of allChaptersToRevise) {
          const chapter = allFreshChapters.find(c => c.chapterNumber === chapterNum && (c.status === "completed" || c.status === "revision"));
          const sectionData = allSections.find(s => s.numero === chapterNum);

          if (chapter && sectionData) {
            const chapterNumStr = String(chapterNum);
            const issuesForChapter = allIssues.filter(issue => {
              const lower = issue.toLowerCase();
              return lower.includes(`capítulo ${chapterNumStr}`) || 
                     lower.includes(`cap ${chapterNumStr}`) ||
                     lower.includes(`cap. ${chapterNumStr}`) ||
                     lower.includes(`capitulo ${chapterNumStr}`);
            }).join("\n");

            this.callbacks.onChapterRewrite(
              chapterNum,
              chapter.title || `Capítulo ${chapterNum}`,
              allChaptersToRevise.indexOf(chapterNum) + 1,
              allChaptersToRevise.length,
              "Corrección por auditoría final"
            );

            await this.rewriteChapterForQA(
              project,
              chapter,
              sectionData,
              worldBibleData,
              guiaEstilo,
              "continuity",
              issuesForChapter || allIssues.join("\n")
            );
          }
        }

        const postRewriteChapters = await storage.getChaptersByProject(project.id);
        const stuckInRevision = postRewriteChapters.filter(c => 
          allChaptersToRevise.includes(c.chapterNumber) && c.status === "revision"
        );
        for (const stuck of stuckInRevision) {
          await storage.updateChapter(stuck.id, { status: "completed" });
          console.warn(`[FinalAudit] Cap ${stuck.chapterNumber} quedó en revision post-rewrite. Restaurado a completed.`);
        }

        this.callbacks.onAgentStatus("continuity-sentinel", "completed",
          `Auditoría final completada. ${allChaptersToRevise.length} capítulos corregidos.`
        );
        return { correctedCount: allChaptersToRevise.length, status: "corrected", warnings };
      } else if (hasActionable && allChaptersToRevise.length === 0) {
        warnings.push(`${allIssues.length} errores detectados sin capítulos específicos para corregir`);
        this.callbacks.onAgentStatus("continuity-sentinel", "warning",
          `Auditoría final: ${allIssues.length} errores detectados pero sin capítulos específicos para corregir. Requiere revisión manual.`
        );
        return { correctedCount: 0, status: "unresolved", warnings };
      } else {
        this.callbacks.onAgentStatus("continuity-sentinel", "warning",
          `Auditoría final: ${allIssues.length} errores MENORES detectados (no críticos). Anotados pero no reescritos.`
        );
        return { correctedCount: 0, status: "clean", warnings };
      }
    } catch (error) {
      console.error("[Orchestrator] Final continuity audit error:", error);
      this.callbacks.onAgentStatus("continuity-sentinel", "warning",
        `Error en auditoría final: ${error instanceof Error ? error.message : "Error desconocido"}. Continuando...`
      );
      return { correctedCount: 0, status: "error", warnings: [error instanceof Error ? error.message : "Error desconocido"] };
    }
  }

  private async runPostAuditVerification(project: Project): Promise<"passed" | "acceptable" | "inconclusive"> {
    try {
      let styleGuideContent = "";

      if (project.styleGuideId) {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg) styleGuideContent = sg.content;
      }

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (!worldBible) return "passed";

      const worldBibleData: ParsedWorldBible = {
        world_bible: {
          personajes: worldBible.characters as any[] || [],
          lugares: [],
          reglas_lore: worldBible.worldRules as any[] || [],
        },
        escaleta_capitulos: worldBible.plotOutline as any[] || [],
      };

      const chapters = await storage.getChaptersByProject(project.id);
      const sortedChapters = sortChaptersNarrative(
        chapters.filter(c => c.content && c.status === "completed")
      );
      const chaptersForReview = sortedChapters.map(c => ({
        numero: c.chapterNumber,
        titulo: c.title || `Capítulo ${c.chapterNumber}`,
        contenido: c.content || "",
      }));

      const guiaEstilo = styleGuideContent
        ? `Género: ${project.genre}, Tono: ${project.tone}\n\n--- GUÍA DE ESTILO DEL AUTOR ---\n${styleGuideContent}`
        : `Género: ${project.genre}, Tono: ${project.tone}`;

      const MAX_VERIFY_CYCLES = 2;
      const scores: number[] = [];

      for (let cycle = 0; cycle < MAX_VERIFY_CYCLES; cycle++) {
        this.callbacks.onAgentStatus("final-reviewer", "reviewing",
          `Re-verificación post-auditoría (Ciclo ${cycle + 1}/${MAX_VERIFY_CYCLES})...`
        );

        const reviewResult = await this.finalReviewer.execute({
          projectTitle: project.title,
          chapters: chaptersForReview,
          worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
          guiaEstilo,
          pasadaNumero: cycle + 1,
          issuesPreviosCorregidos: ["Correcciones de auditoría de continuidad aplicadas"],
          capitulosConLimitaciones: [],
        });

        await this.trackTokenUsage(project.id, reviewResult.tokenUsage, "El Revisor Final", "deepseek-v4-flash", undefined, "post_audit_verify");

        const score = reviewResult.result?.puntuacion_global || 0;
        scores.push(score);

        const scoreForDb = score != null ? Math.round(score) : null;
        await storage.updateProject(project.id, {
          finalScore: scoreForDb,
          finalReviewResult: reviewResult.result as any,
        });

        this.callbacks.onAgentStatus("final-reviewer", "reviewing",
          `Re-verificación: puntuación ${score}/10`
        );

        if (scores.length >= 2 && scores.every(s => s >= 9)) {
          this.callbacks.onAgentStatus("final-reviewer", "completed",
            `Re-verificación APROBADA. Puntuaciones: ${scores.join(", ")}/10. Manuscrito confirmado tras correcciones.`
          );
          return "passed";
        }
      }

      const bestScore = Math.max(...scores);
      if (bestScore >= 8) {
        this.callbacks.onAgentStatus("final-reviewer", "completed",
          `Re-verificación aceptada. Mejor puntuación: ${bestScore}/10. Calidad suficiente tras correcciones.`
        );
        return "acceptable";
      }

      this.callbacks.onAgentStatus("final-reviewer", "warning",
        `Re-verificación inconclusa. Puntuaciones: ${scores.join(", ")}/10. Manuscrito aceptado pero requiere atención.`
      );
      return "inconclusive";
    } catch (error) {
      console.error("[Orchestrator] Post-audit verification error:", error);
      this.callbacks.onAgentStatus("final-reviewer", "warning",
        `Error en re-verificación: ${error instanceof Error ? error.message : "Error desconocido"}. Continuando...`
      );
      return "inconclusive";
    }
  }

  private async runOrthotypographicPass(project: Project): Promise<{ chaptersProcessed: number; totalChanges: number }> {
    try {
      const chapters = await storage.getChaptersByProject(project.id);
      const completedChapters = sortChaptersNarrative(
        chapters.filter(c => c.status === "completed" && c.content)
      );

      if (completedChapters.length === 0) return { chaptersProcessed: 0, totalChanges: 0 };

      this.callbacks.onAgentStatus("copyeditor", "polishing",
        `Corrección ortotipográfica final: revisando ${completedChapters.length} capítulos...`
      );

      await storage.createActivityLog({
        projectId: project.id,
        level: "info",
        message: `Iniciando corrección ortotipográfica de ${completedChapters.length} capítulos`,
        agentRole: "proofreader",
      });

      let totalChanges = 0;
      let chaptersProcessed = 0;

      for (let i = 0; i < completedChapters.length; i++) {
        if (this.aborted) {
          console.log(`[Orthotypographic] Aborted after ${chaptersProcessed}/${completedChapters.length} chapters (project ${project.id}). Exiting silently.`);
          return;
        }
        const chapter = completedChapters[i];

        if (await isProjectCancelledFromDb(project.id)) {
          console.log(`[Orchestrator] Project ${project.id} cancelled during orthotypographic pass.`);
          break;
        }

        const sectionLabel = chapter.chapterNumber === 0 ? "el Prólogo"
          : chapter.chapterNumber === -1 ? "el Epílogo"
          : `el Capítulo ${chapter.chapterNumber}`;

        this.callbacks.onAgentStatus("copyeditor", "polishing",
          `Corrector Ortotipográfico revisando ${sectionLabel} (${i + 1}/${completedChapters.length})...`
        );

        try {
          const result = await this.proofreader.execute({
            chapterContent: chapter.content!,
            chapterNumber: String(chapter.chapterNumber),
            genre: project.genre || undefined,
            language: "es",
            projectId: project.id,
          });

          await this.trackTokenUsage(project.id, result.tokenUsage, "Corrector Ortotipográfico", "deepseek-v4-flash", chapter.chapterNumber, "orthotypographic");

          if (result.result && result.result.textoCorregido && result.result.textoCorregido.length > 100) {
            const changes = result.result.totalCambios || 0;
            totalChanges += changes;

            if (changes > 0) {
              const wordCount = result.result.textoCorregido.split(/\s+/).filter(w => w.length > 0).length;
              await storage.updateChapter(chapter.id, {
                content: result.result.textoCorregido,
                wordCount,
              });

              await storage.createActivityLog({
                projectId: project.id,
                level: "info",
                message: `${sectionLabel}: ${changes} correcciones ortotipográficas aplicadas. Calidad: ${result.result.nivelCalidad || "bueno"}`,
                agentRole: "proofreader",
              });
            }

            chaptersProcessed++;
          } else {
            chaptersProcessed++;
            console.warn(`[Proofreader] ${sectionLabel}: No result or too short, skipping.`);
          }
        } catch (err) {
          console.error(`[Proofreader] Error on ${sectionLabel}:`, err);
          chaptersProcessed++;
        }
      }

      this.callbacks.onAgentStatus("copyeditor", "completed",
        `Corrección ortotipográfica completada: ${totalChanges} correcciones en ${chaptersProcessed} capítulos`
      );

      await storage.createActivityLog({
        projectId: project.id,
        level: "success",
        message: `Corrección ortotipográfica completada: ${totalChanges} correcciones en ${chaptersProcessed}/${completedChapters.length} capítulos`,
        agentRole: "proofreader",
      });

      return { chaptersProcessed, totalChanges };
    } catch (error) {
      console.error("[Orchestrator] Orthotypographic pass error:", error);
      this.callbacks.onAgentStatus("copyeditor", "warning",
        `Error en corrección ortotipográfica: ${error instanceof Error ? error.message : "Error desconocido"}. Continuando...`
      );
      return { chaptersProcessed: 0, totalChanges: 0 };
    }
  }

  private async loadSeriesThreadsAndEvents(project: Project): Promise<{ threads: string[]; events: string[] }> {
    const threads: string[] = [];
    const events: string[] = [];
    if (!project.seriesId) return { threads, events };

    try {
      const currentOrder = project.seriesOrder || 1;
      const isPrequel = (project as any).projectSubtype === "prequel";
      const fullContinuity = await storage.getSeriesFullContinuity(project.seriesId);
      const seriesProjects = await storage.getProjectsBySeries(project.seriesId);

      const prevSnapshots = fullContinuity.projectSnapshots.filter(s => {
        if (s.projectId === project.id) return false;
        const matchingProject = seriesProjects.find(p => p.id === s.projectId);
        if (isPrequel) return true;
        return (matchingProject?.seriesOrder || 999) < currentOrder;
      });

      const prevManuscripts = fullContinuity.manuscriptSnapshots.filter(
        ms => {
          if (isPrequel) return true;
          return (ms.seriesOrder || 999) < currentOrder;
        }
      );

      for (const snap of prevSnapshots) {
        const ut = snap.unresolvedThreads as any[];
        if (ut?.length) threads.push(...ut.map((t: any) => typeof t === "string" ? t : t.thread || t.name || JSON.stringify(t)));
        const ke = snap.keyEvents as any[];
        if (ke?.length) events.push(...ke.map((e: any) => typeof e === "string" ? e : e.event || e.description || JSON.stringify(e)));
      }
      for (const ms of prevManuscripts) {
        const snap = ms.snapshot as any;
        if (snap?.unresolvedThreads?.length) threads.push(...snap.unresolvedThreads.map((t: any) => typeof t === "string" ? t : t.thread || t.name || JSON.stringify(t)));
        if (snap?.keyEvents?.length) events.push(...snap.keyEvents.map((e: any) => typeof e === "string" ? e : e.event || e.description || JSON.stringify(e)));
      }

      if (threads.length > 0) {
        console.log(`[Orchestrator] Loaded ${threads.length} unresolved threads and ${events.length} key events from previous books (vol < ${currentOrder})`);
      }
    } catch (err) {
      console.warn(`[Orchestrator] Failed to load series threads:`, err);
    }

    return { threads, events };
  }

  private async generateSeriesContinuitySnapshot(project: Project): Promise<void> {
    try {
      if (!project.seriesId) return;

      const chapters = await storage.getChaptersByProject(project.id);
      const completedChapters = sortChaptersNarrative(
        chapters.filter(c => c.status === "completed" && c.content)
      );

      if (completedChapters.length === 0) return;

      const synopsisParts: string[] = [];
      const allCharacterStates: any = {};
      const allUnresolvedThreads: string[] = [];
      const allKeyEvents: string[] = [];

      for (const ch of completedChapters) {
        const label = ch.chapterNumber === 0 ? "Prólogo" : ch.chapterNumber === -1 ? "Epílogo" : `Capítulo ${ch.chapterNumber}`;
        const content = ((ch as any).editedContent || ch.content || "") as string;
        const preview = content.length > 300 ? content.substring(0, 300) + "..." : content;
        synopsisParts.push(`${label}: ${ch.title || ""} - ${preview}`);

        const state = ch.continuityState as any;
        if (state?.characterStates) {
          for (const [name, charState] of Object.entries(state.characterStates)) {
            allCharacterStates[name] = charState;
          }
        }
        if (state?.pendingThreads?.length) {
          for (const t of state.pendingThreads) {
            const threadStr = typeof t === "string" ? t : t.thread || t.name || JSON.stringify(t);
            if (!allUnresolvedThreads.includes(threadStr)) allUnresolvedThreads.push(threadStr);
          }
        }
        if (state?.resolvedThreads?.length) {
          for (const t of state.resolvedThreads) {
            const threadStr = typeof t === "string" ? t : t.thread || t.name || JSON.stringify(t);
            const idx = allUnresolvedThreads.indexOf(threadStr);
            if (idx >= 0) allUnresolvedThreads.splice(idx, 1);
          }
        }
        if (state?.keyEvents?.length) {
          allKeyEvents.push(...state.keyEvents.map((e: any) => typeof e === "string" ? e : e.event || JSON.stringify(e)));
        }
      }

      const worldBible = await storage.getWorldBibleByProject(project.id);
      if (worldBible) {
        const dbRules = (worldBible.worldRules || []) as any[];
        const threadRule = dbRules.find((r: any) => r.category === "__narrative_threads");
        if (threadRule?.pending?.length) {
          for (const t of threadRule.pending) {
            if (!allUnresolvedThreads.includes(t)) allUnresolvedThreads.push(t);
          }
        }
        if (threadRule?.resolved?.length) {
          for (const t of threadRule.resolved) {
            const idx = allUnresolvedThreads.indexOf(t);
            if (idx >= 0) allUnresolvedThreads.splice(idx, 1);
          }
        }
      }

      const synopsis = `${project.title} (${completedChapters.length} capítulos). ${synopsisParts.slice(0, 5).join(" | ")}`;

      const existing = await storage.getContinuitySnapshotByProject(project.id);
      if (existing) {
        await storage.updateContinuitySnapshot(existing.id, {
          synopsis,
          characterStates: allCharacterStates,
          unresolvedThreads: allUnresolvedThreads,
          keyEvents: allKeyEvents,
        });
        console.log(`[Orchestrator] Updated continuity snapshot for project ${project.id}: ${allUnresolvedThreads.length} unresolved threads, ${allKeyEvents.length} key events`);
      } else {
        await storage.createContinuitySnapshot({
          projectId: project.id,
          synopsis,
          characterStates: allCharacterStates,
          unresolvedThreads: allUnresolvedThreads,
          keyEvents: allKeyEvents,
        });
        console.log(`[Orchestrator] Created continuity snapshot for project ${project.id}: ${allUnresolvedThreads.length} unresolved threads, ${allKeyEvents.length} key events`);
      }

      await storage.createActivityLog({
        projectId: project.id,
        level: "info",
        message: `Snapshot de continuidad generado para la serie: ${allUnresolvedThreads.length} hilos pendientes, ${Object.keys(allCharacterStates).length} personajes rastreados, ${allKeyEvents.length} eventos clave`,
        agentRole: "orchestrator",
      });
    } catch (error) {
      console.error(`[Orchestrator] Error generating continuity snapshot:`, error);
      await storage.createActivityLog({
        projectId: project.id,
        level: "warn",
        message: `Error al generar snapshot de continuidad: ${error instanceof Error ? error.message : "Error desconocido"}`,
        agentRole: "orchestrator",
      });
    }
  }

  private async runSeriesArcVerification(project: Project): Promise<void> {
    try {
      if (!project.seriesId) return;

      const series = await storage.getSeries(project.seriesId);
      if (!series) return;

      const milestones = await storage.getMilestonesBySeries(project.seriesId);
      const threads = await storage.getPlotThreadsBySeries(project.seriesId);

      if (milestones.length === 0 && threads.length === 0) {
        console.log(`[Orchestrator] No milestones or threads defined for series ${project.seriesId}. Skipping arc verification.`);
        return;
      }

      this.callbacks.onAgentStatus("arc-validator", "reviewing", "Verificando cumplimiento de hitos y progresión de hilos de la serie...");

      const chapters = await storage.getChaptersByProject(project.id);
      const sortedChapters = sortChaptersNarrative(chapters);
      const worldBible = await storage.getWorldBibleByProject(project.id);

      const chaptersSummary = sortedChapters.map(c => {
        const label = c.chapterNumber === 0 ? "Prólogo" : c.chapterNumber === -1 ? "Epílogo" : `Capítulo ${c.chapterNumber}`;
        const content = ((c as any).editedContent || c.content || "");
        const preview = content.substring(0, 8000);
        return `${label}: ${c.title || ""} (${c.wordCount || 0} palabras)\n${preview}${content.length > 8000 ? "\n[...truncado...]" : ""}`;
      }).join("\n\n---\n\n");

      const { ArcValidatorAgent } = await import("./agents/arc-validator");
      const arcValidator = new ArcValidatorAgent();

      let previousContext = "";
      const currentOrder = project.seriesOrder || 1;
      const fullContinuity = await storage.getSeriesFullContinuity(project.seriesId);
      const seriesProjectsForArc = await storage.getProjectsBySeries(project.seriesId);
      const prevSnapshots = fullContinuity.projectSnapshots.filter(s => {
        if (s.projectId === project.id) return false;
        const matchingProject = seriesProjectsForArc.find(p => p.id === s.projectId);
        return (matchingProject?.seriesOrder || 999) < currentOrder;
      });
      if (prevSnapshots.length > 0) {
        previousContext = prevSnapshots.map(s => `Synopsis: ${s.synopsis || "N/A"}\nHilos no resueltos: ${JSON.stringify(s.unresolvedThreads)}`).join("\n---\n");
      }

      const result = await arcValidator.execute({
        projectTitle: project.title,
        seriesTitle: series.title,
        volumeNumber: project.seriesOrder || 1,
        totalVolumes: series.totalPlannedBooks || 10,
        chaptersSummary,
        milestones,
        plotThreads: threads,
        worldBible: worldBible || {},
        previousVolumesContext: previousContext || undefined,
      });

      if (result.result) {
        await storage.createArcVerification({
          seriesId: project.seriesId,
          projectId: project.id,
          volumeNumber: project.seriesOrder || 1,
          status: result.result.passed ? "passed" : "needs_attention",
          overallScore: result.result.overallScore,
          milestonesChecked: result.result.milestonesChecked,
          milestonesFulfilled: result.result.milestonesFulfilled,
          threadsProgressed: result.result.threadsProgressed,
          threadsResolved: result.result.threadsResolved,
          findings: JSON.stringify(result.result.findings),
          recommendations: result.result.recommendations,
        });

        for (const mv of result.result.milestoneVerifications) {
          if (mv.isFulfilled) {
            const existingMilestone = milestones.find(m => m.id === mv.milestoneId);
            if (existingMilestone?.isFulfilled) {
              console.log(`[Orchestrator] Milestone ${mv.milestoneId} already fulfilled, preserving`);
              continue;
            }
            await storage.updateMilestone(mv.milestoneId, {
              isFulfilled: true,
              fulfilledInProjectId: project.id,
            });
          }
        }

        const threadStatusPriority: Record<string, number> = { "active": 0, "introduced": 0, "developing": 1, "resolved": 2, "abandoned": 1 };
        for (const tp of result.result.threadProgressions) {
          const updateData: any = {};
          if (tp.resolvedInVolume) {
            updateData.status = "resolved";
            updateData.resolvedVolume = project.seriesOrder || 1;
          } else if (tp.progressedInVolume) {
            updateData.status = "developing";
          } else if (tp.currentStatus === "abandoned") {
            updateData.status = "abandoned";
          }
          if (Object.keys(updateData).length > 0) {
            const existingThread = threads.find(t => t.id === tp.threadId);
            const existingPriority = threadStatusPriority[existingThread?.status || "active"] || 0;
            const newPriority = threadStatusPriority[updateData.status] || 0;
            if (newPriority < existingPriority) {
              console.log(`[Orchestrator] Thread ${tp.threadId} already "${existingThread?.status}", not regressing to "${updateData.status}"`);
              continue;
            }
            await storage.updatePlotThread(tp.threadId, updateData);
          }
        }

        const statusMsg = result.result.passed 
          ? `Verificación de arco APROBADA (${result.result.overallScore}/100). Hitos: ${result.result.milestonesFulfilled}/${result.result.milestonesChecked}. Hilos progresados: ${result.result.threadsProgressed}, resueltos: ${result.result.threadsResolved}`
          : `Verificación de arco REQUIERE ATENCIÓN (${result.result.overallScore}/100). Hitos: ${result.result.milestonesFulfilled}/${result.result.milestonesChecked}`;
        
        this.callbacks.onAgentStatus("arc-validator", result.result.passed ? "completed" : "warning", statusMsg);
        
        await storage.createActivityLog({
          projectId: project.id,
          level: result.result.passed ? "info" : "warn",
          message: statusMsg,
          agentRole: "arc-validator",
        });

        console.log(`[Orchestrator] Arc verification complete for project ${project.id}: ${result.result.passed ? "PASSED" : "NEEDS_ATTENTION"} (${result.result.overallScore}/100)`);
      }
    } catch (error) {
      console.error(`[Orchestrator] Error running arc verification:`, error);
      await storage.createActivityLog({
        projectId: project.id,
        level: "warn",
        message: `Error en verificación de arco: ${error instanceof Error ? error.message : "Error desconocido"}`,
        agentRole: "orchestrator",
      });
    }
  }

  private async updateWorldBibleTimeline(projectId: number, worldBibleId: number, chapterNumber: number, chapterData: any): Promise<void> {
    const worldBible = await storage.getWorldBibleByProject(projectId);
    if (worldBible) {
      const timeline = (worldBible.timeline || []) as TimelineEvent[];
      
      const existingIndex = timeline.findIndex(t => t.chapter === chapterNumber);
      const newEvent: TimelineEvent = {
        chapter: chapterNumber,
        event: chapterData.objetivo_narrativo || `Eventos del capítulo ${chapterNumber}`,
        characters: chapterData.elenco_presente || [],
        significance: chapterData.continuidad_salida || "",
      };
      
      if (existingIndex >= 0) {
        timeline[existingIndex] = newEvent;
      } else {
        timeline.push(newEvent);
      }
      
      await storage.updateWorldBible(worldBible.id, { timeline });
    }
  }

  private async runContinuityCheckpoint(
    project: Project,
    checkpointNumber: number,
    chaptersInScope: Chapter[],
    worldBibleData: ParsedWorldBible,
    previousIssues: string[]
  ): Promise<{ passed: boolean; issues: string[]; chaptersToRevise: number[] }> {
    this.callbacks.onAgentStatus("continuity-sentinel", "analyzing", 
      `El Centinela está verificando continuidad (Checkpoint #${checkpointNumber})...`
    );

    const chaptersData = chaptersInScope.map(c => ({
      numero: c.chapterNumber,
      titulo: c.title || `Capítulo ${c.chapterNumber}`,
      contenido: c.content || "",
      continuityState: c.continuityState || {},
    }));

    const SENTINEL_TIMEOUT_MS = 5 * 60 * 1000;
    
    let result: Awaited<ReturnType<typeof this.continuitySentinel.execute>>;
    
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Sentinel timeout")), SENTINEL_TIMEOUT_MS);
      });
      
      result = await Promise.race([
        this.continuitySentinel.execute({
          projectTitle: project.title,
          checkpointNumber,
          chaptersInScope: chaptersData,
          worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
          previousCheckpointIssues: previousIssues,
        }),
        timeoutPromise
      ]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMsg.includes("Sentinel timeout");
      console.error(`[Orchestrator] Continuity Sentinel ${isTimeout ? "TIMEOUT" : "ERROR"}: ${errorMsg}`);
      
      if (isTimeout) {
        this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
          `⚠️ Checkpoint #${checkpointNumber} excedió el tiempo límite. Se marcará para revisión en la siguiente pasada.`
        );
        this.callbacks.onError?.(`Continuity Sentinel timeout en checkpoint #${checkpointNumber} (${chaptersInScope.length} capítulos). Capítulos no verificados: ${chaptersInScope.map(c => c.chapterNumber).join(", ")}.`);
        const uncheckdChapters = chaptersInScope.map(c => c.chapterNumber);
        return { 
          passed: false, 
          issues: [`[MAYOR] Checkpoint #${checkpointNumber} no pudo completarse por timeout. Capítulos ${uncheckdChapters.join(", ")} requieren verificación manual o en la revisión final.`], 
          chaptersToRevise: [] 
        };
      }
      
      this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
        `Checkpoint #${checkpointNumber} falló por error. Continuando con precaución...`
      );
      return { passed: false, issues: [`[MAYOR] Error en checkpoint: ${errorMsg}`], chaptersToRevise: [] };
    }

    await this.trackTokenUsage(project.id, result.tokenUsage, "El Centinela", "deepseek-v4-flash", undefined, "continuity_check");

    if (result.thoughtSignature) {
      await storage.createThoughtLog({
        projectId: project.id,
        agentName: "El Centinela",
        agentRole: "continuity-sentinel",
        thoughtContent: result.thoughtSignature,
      });
    }

    const sentinelResult = result.result;
    
    const effectiveIssues = sentinelResult?.issues || [];
    const isEffectivelyApproved = sentinelResult?.checkpoint_aprobado || effectiveIssues.length === 0;

    if (isEffectivelyApproved) {
      const minorIssues = effectiveIssues.map(i => 
        `[${(i.severidad || "menor").toUpperCase()}] ${i.tipo || "general"}: ${i.descripcion || "Sin descripción"}`
      );
      const score = sentinelResult?.puntuacion ?? 10;
      this.callbacks.onAgentStatus("continuity-sentinel", "completed", 
        `Checkpoint #${checkpointNumber} APROBADO (${score}/10).${minorIssues.length > 0 ? ` ${minorIssues.length} issues menores anotados para revisión final.` : " Sin issues de continuidad."}`
      );
      return { passed: true, issues: minorIssues, chaptersToRevise: [] };
    } else {
      const issueDescriptions = (sentinelResult?.issues || []).map(i => 
        `[${(i.severidad || "mayor").toUpperCase()}] ${i.tipo || "general"}: ${i.descripcion || "Sin descripción"}\n⚠️ PRESERVAR: ${i.elementos_a_preservar || "El resto del capítulo"}\n✏️ CORRECCIÓN: ${i.fix_sugerido || "Revisar manualmente"}`
      );
      
      let chaptersToRevise = sentinelResult?.capitulos_para_revision || [];
      const issues = sentinelResult?.issues ?? [];
      const scopeNums = new Set(chaptersInScope.map(c => c.chapterNumber));
      if (chaptersToRevise.length === 0 && issues.length > 0) {
        const derived = new Set<number>();
        for (const issue of issues) {
          if (issue.capitulos_afectados && Array.isArray(issue.capitulos_afectados)) {
            for (const cap of issue.capitulos_afectados) {
              const num = typeof cap === "number" ? cap : Number(cap);
              if (Number.isFinite(num) && Number.isInteger(num) && scopeNums.has(num)) derived.add(num);
            }
          }
        }
        if (derived.size === 0) {
          for (const issue of issues) {
            const text = `${issue.descripcion || ""} ${issue.evidencia_textual || ""} ${issue.fix_sugerido || ""}`;
            const allNums: number[] = [];
            const numPattern = /(?:cap[íi]tulos?|caps?\.?)\s*([\d]+(?:\s*[,y]\s*\d+)*)/gi;
            let m;
            while ((m = numPattern.exec(text)) !== null) {
              const segment = m[1];
              const nums = segment.match(/\d+/g);
              if (nums) {
                for (const ns of nums) {
                  const n = Number(ns);
                  if (scopeNums.has(n)) allNums.push(n);
                }
              }
            }
            const labelMap: Record<string, number> = { "prólogo": 0, "prologo": 0, "epílogo": -1, "epilogo": -1, "nota del autor": -2 };
            const lower = text.toLowerCase();
            for (const [label, num] of Object.entries(labelMap)) {
              if (lower.includes(label) && scopeNums.has(num)) allNums.push(num);
            }
            if (allNums.length === 0) {
              const bareNums = text.match(/\b(\d{1,3})\b/g);
              if (bareNums) {
                for (const ns of bareNums) {
                  const n = Number(ns);
                  if (n > 0 && n < 200 && scopeNums.has(n)) allNums.push(n);
                }
              }
            }
            for (const n of allNums) derived.add(n);
          }
        }
        chaptersToRevise = Array.from(derived).sort((a, b) => a - b);
      }

      let lastResortFallback = false;
      if (chaptersToRevise.length === 0 && issues.length > 0 && chaptersInScope.length > 0) {
        const lastInScope = chaptersInScope
          .map(c => c.chapterNumber)
          .filter(n => n > 0)
          .sort((a, b) => b - a)[0];
        if (typeof lastInScope === "number") {
          chaptersToRevise = [lastInScope];
          lastResortFallback = true;
          console.log(`[ContinuitySentinel] No chapters identified by model or regex; defaulting to last chapter in scope: ${lastInScope}`);
        }
      }

      const derivedViaFallback = (sentinelResult?.capitulos_para_revision || []).length === 0 && chaptersToRevise.length > 0;
      const fallbackTag = lastResortFallback ? " (fallback)" : (derivedViaFallback ? " (derivados)" : "");
      this.callbacks.onAgentStatus("continuity-sentinel", "warning", 
        `Checkpoint #${checkpointNumber}: ${sentinelResult?.issues?.length || 0} issues detectados. Caps afectados: ${chaptersToRevise.length > 0 ? chaptersToRevise.join(", ") + fallbackTag : "N/A"}`
      );
      
      return { 
        passed: false, 
        issues: issueDescriptions, 
        chaptersToRevise 
      };
    }
  }

  private async runVoiceRhythmAudit(
    project: Project,
    trancheNumber: number,
    chaptersInScope: Chapter[],
    styleGuideContent: string
  ): Promise<{ passed: boolean; issues: string[]; chaptersToRevise: number[] }> {
    this.callbacks.onAgentStatus("voice-auditor", "analyzing", 
      `El Auditor de Voz está analizando ritmo y tono (Tramo #${trancheNumber})...`
    );

    const chaptersData = chaptersInScope.map(c => ({
      numero: c.chapterNumber,
      titulo: c.title || `Capítulo ${c.chapterNumber}`,
      contenido: c.content || "",
    }));

    const result = await this.voiceRhythmAuditor.execute({
      projectTitle: project.title,
      trancheNumber,
      genre: project.genre,
      tone: project.tone,
      chaptersInScope: chaptersData,
      guiaEstilo: styleGuideContent || undefined,
    });

    await this.trackTokenUsage(project.id, result.tokenUsage, "El Auditor de Voz", "deepseek-v4-flash", undefined, "voice_audit");

    if (result.thoughtSignature) {
      await storage.createThoughtLog({
        projectId: project.id,
        agentName: "El Auditor de Voz",
        agentRole: "voice-auditor",
        thoughtContent: result.thoughtSignature,
      });
    }

    const auditResult = result.result;
    
    if (auditResult?.tranche_aprobado) {
      this.callbacks.onAgentStatus("voice-auditor", "completed", 
        `Tramo #${trancheNumber} APROBADO. Voz: ${auditResult.puntuacion_voz}/10, Ritmo: ${auditResult.puntuacion_ritmo}/10`
      );
      return { passed: true, issues: [], chaptersToRevise: [] };
    } else {
      const issueDescriptions = (auditResult?.issues || []).map(i => 
        `[${(i.severidad || "mayor").toUpperCase()}] ${i.tipo || "general"}: ${i.descripcion || "Sin descripción"}\n⚠️ PRESERVAR: ${i.elementos_a_preservar || "El resto del capítulo"}\n✏️ CORRECCIÓN: ${i.fix_sugerido || "Revisar manualmente"}`
      );
      
      this.callbacks.onAgentStatus("voice-auditor", "warning", 
        `Tramo #${trancheNumber}: Voz ${auditResult?.puntuacion_voz || 0}/10, Ritmo ${auditResult?.puntuacion_ritmo || 0}/10. ${auditResult?.issues?.length || 0} issues.`
      );
      
      return { 
        passed: false, 
        issues: issueDescriptions, 
        chaptersToRevise: auditResult?.capitulos_para_revision || [] 
      };
    }
  }

  private async runSemanticRepetitionAnalysis(
    project: Project,
    chapters: Chapter[],
    worldBibleData: ParsedWorldBible
  ): Promise<{ passed: boolean; clusters: any[]; foreshadowingStatus: any[]; chaptersToRevise: number[] }> {
    this.callbacks.onAgentStatus("semantic-detector", "analyzing", 
      `El Detector Semántico está buscando repeticiones y verificando foreshadowing...`
    );

    const chaptersData = chapters
      .filter(c => c.content)
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map(c => ({
        numero: c.chapterNumber,
        titulo: c.title || `Capítulo ${c.chapterNumber}`,
        contenido: c.content || "",
      }));

    const result = await this.semanticRepetitionDetector.execute({
      projectTitle: project.title,
      chapters: chaptersData,
      worldBible: await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible),
    });

    await this.trackTokenUsage(project.id, result.tokenUsage, "El Detector Semántico", "deepseek-v4-flash", undefined, "semantic_analysis");

    if (result.thoughtSignature) {
      await storage.createThoughtLog({
        projectId: project.id,
        agentName: "El Detector Semántico",
        agentRole: "semantic-detector",
        thoughtContent: result.thoughtSignature,
      });
    }

    const analysisResult = result.result;
    
    const originalityScore = analysisResult?.puntuacion_originalidad || 0;
    const foreshadowingScore = analysisResult?.puntuacion_foreshadowing || 0;
    const majorClusters = (analysisResult?.clusters || []).filter((c: any) => c.severidad === "mayor").length;
    const unresolvedForeshadowing = (analysisResult?.foreshadowing_detectado || [])
      .filter((f: any) => f.estado === "sin_payoff").length;
    
    const serverSideApproved = originalityScore >= 8 && foreshadowingScore >= 8 && majorClusters === 0;
    const passed = analysisResult?.analisis_aprobado || serverSideApproved;
    
    if (passed) {
      this.callbacks.onAgentStatus("semantic-detector", "completed", 
        `Análisis APROBADO. Originalidad: ${originalityScore}/10, Foreshadowing: ${foreshadowingScore}/10`
      );
    } else {
      this.callbacks.onAgentStatus("semantic-detector", "warning", 
        `Originalidad: ${originalityScore}/10, Foreshadowing: ${foreshadowingScore}/10. ${analysisResult?.clusters?.length || 0} clusters (${majorClusters} mayores), ${unresolvedForeshadowing} foreshadowing sin resolver.`
      );
    }
    
    return { 
      passed, 
      clusters: analysisResult?.clusters || [],
      foreshadowingStatus: analysisResult?.foreshadowing_detectado || [],
      chaptersToRevise: passed ? [] : (analysisResult?.capitulos_para_revision || [])
    };
  }

  /**
   * Escaneo semántico PROACTIVO: cada 5 capítulos completados (en novelas ≥10 caps),
   * analiza lo escrito hasta el momento y guarda una "hoja de prohibiciones vivas"
   * en `project.antiRepetitionGuidance` para que el Ghostwriter la consuma en los
   * capítulos siguientes y EVITE repeticiones antes de cometerlas.
   *
   * No bloquea ni reescribe — es una capa preventiva ligera que se suma al
   * SemanticRepetitionDetector forense que sigue corriendo al final.
   */
  private async runProactiveSemanticScan(
    project: Project,
    completedCount: number,
    totalChapters: number,
    worldBibleData: ParsedWorldBible
  ): Promise<void> {
    try {
      // Solo en novelas largas y solo si quedan capítulos por escribir
      if (totalChapters < 10) return;
      if (completedCount <= 0) return;
      if (completedCount % 5 !== 0) return;
      if (completedCount >= totalChapters) return;

      const chapters = await storage.getChaptersByProject(project.id);
      const completedChapters = chapters
        .filter(c => c.status === "completed" && c.chapterNumber > 0 && c.content)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);

      if (completedChapters.length < 5) return;

      this.callbacks.onAgentStatus("semantic-detector", "analyzing",
        `Escaneo preventivo tras ${completedCount} capítulos: detectando patrones a evitar en próximos capítulos...`
      );

      const result = await this.runSemanticRepetitionAnalysis(project, completedChapters, worldBibleData);

      const guidance = this.buildAntiRepetitionGuidanceFromClusters(result.clusters);

      if (guidance && guidance.trim().length > 0) {
        await storage.updateProject(project.id, {
          antiRepetitionGuidance: guidance,
          antiRepetitionUpdatedAt: new Date(),
        } as any);
        (project as any).antiRepetitionGuidance = guidance;

        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `Hoja de prohibiciones actualizada (escaneo preventivo tras cap. ${completedCount}): ${result.clusters.length} patrones detectados → se inyectarán en próximos capítulos para evitar repeticiones.`,
          agentRole: "semantic-detector",
        });
      } else {
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `Escaneo preventivo tras cap. ${completedCount}: sin patrones repetidos detectados. Manuscrito limpio hasta ahora.`,
          agentRole: "semantic-detector",
        });
      }
    } catch (error) {
      // No fallar el flujo principal si el escaneo preventivo da error
      console.error("[ProactiveSemanticScan] Non-fatal error:", error);
    }
  }

  /**
   * Convierte los clusters del SemanticRepetitionDetector en una hoja de
   * prohibiciones compacta y accionable para el Ghostwriter (≤2000 chars).
   */
  private buildAntiRepetitionGuidanceFromClusters(clusters: any[]): string {
    if (!clusters || clusters.length === 0) return "";

    // Priorizar mayores primero, luego menores. Top 7.
    const sorted = [...clusters].sort((a, b) => {
      const sa = a.severidad === "mayor" ? 0 : 1;
      const sb = b.severidad === "mayor" ? 0 : 1;
      return sa - sb;
    }).slice(0, 7);

    const lines = sorted.map((c) => {
      const tipoLabel: Record<string, string> = {
        idea_repetida: "Idea/reacción repetida",
        metafora_repetida: "Metáfora repetida",
        estructura_repetida: "Estructura narrativa repetida",
      };
      const tipo = tipoLabel[c.tipo] || "Patrón repetido";
      const caps = Array.isArray(c.capitulos_afectados) && c.capitulos_afectados.length > 0
        ? ` (caps. ${c.capitulos_afectados.join(", ")})`
        : "";
      const ejemplos = Array.isArray(c.ejemplos) && c.ejemplos.length > 0
        ? ` Ejemplos a NO repetir: ${c.ejemplos.slice(0, 2).map((e: string) => `"${e.slice(0, 80)}"`).join("; ")}.`
        : "";
      const fix = c.fix_sugerido ? ` Alternativa: ${c.fix_sugerido.slice(0, 120)}` : "";
      return `• [${tipo}${caps}] ${(c.descripcion || "").slice(0, 200)}${ejemplos}${fix}`;
    });

    let guidance = lines.join("\n");
    if (guidance.length > 2000) guidance = guidance.slice(0, 2000) + "\n[...truncado]";
    return guidance;
  }

  private async rewriteChapterForQA(
    project: Project,
    chapter: Chapter,
    sectionData: any,
    worldBibleData: ParsedWorldBible,
    guiaEstilo: string,
    qaSource: "continuity" | "voice" | "semantic" | "editorial",
    correctionInstructions: string
  ): Promise<void> {
    const qaLabels = {
      continuity: "Centinela de Continuidad",
      voice: "Auditor de Voz",
      semantic: "Detector Semántico",
      editorial: "Editor Humano"
    };

    const originalContent = chapter.content || "";
    const originalWordCount = chapter.wordCount || originalContent.split(/\s+/).filter(w => w.length > 0).length;
    const originalContinuityState = chapter.continuityState;
    const sectionLabel = this.getSectionLabel(sectionData);

    if (!originalContent.trim()) {
      console.warn(`[QA-Rewrite] ${sectionLabel} sin contenido original. Abortando reescritura por seguridad.`);
      this.callbacks.onAgentStatus("ghostwriter", "warning",
        `${sectionLabel}: sin contenido original. Reescritura cancelada.`
      );
      return;
    }

    await storage.updateChapter(chapter.id, { 
      status: "revision",
      needsRevision: true,
      revisionReason: correctionInstructions 
    });

    this.callbacks.onChapterStatusChange(chapter.chapterNumber, "revision");

    // ════════════════════════════════════════════════════════════════
    // PASO 1 — CIRUGÍA DETERMINISTA (find/replace)
    // Antes de dejar que el Narrador reescriba libremente (con el riesgo sistemático
    // de expandir +30/+70%), intentamos resolver la corrección con operaciones
    // find_exact/replace_with aplicadas de forma determinista. Si el cirujano produce
    // al menos una operación aplicable, terminamos aquí — sin Editor, sin Estilista,
    // sin red de seguridad de longitud (garantizada por construcción).
    // Si declara la instrucción como no-puntual ("operations": []), caemos al flujo
    // de reescritura completa del Ghostwriter con las redes de seguridad existentes.
    // ════════════════════════════════════════════════════════════════
    this.callbacks.onAgentStatus("surgical-patcher", "editing",
      `Cirugía determinista en ${sectionLabel} por ${qaLabels[qaSource]}: intentando parches localizados antes de reescritura completa...`
    );

    // Construimos el contexto canónico del World Bible que se pasará al Cirujano
    // para que ninguna operación contradiga la canon (personajes, reglas, eventos).
    let worldBibleContextForPatcher = "";
    try {
      const enrichedWB = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
      worldBibleContextForPatcher = this.serializeWorldBibleForSurgery(enrichedWB);
    } catch (wbErr) {
      console.warn(`[QA-Rewrite] No se pudo enriquecer World Bible para cirugía de ${sectionLabel}:`, wbErr);
      try {
        worldBibleContextForPatcher = this.serializeWorldBibleForSurgery(worldBibleData.world_bible);
      } catch {
        worldBibleContextForPatcher = "";
      }
    }

    try {
      const patchResult = await this.surgicalPatcher.execute({
        chapterNumber: sectionData.numero,
        chapterTitle: sectionData.titulo || `Capítulo ${sectionData.numero}`,
        originalContent,
        instructions: correctionInstructions,
        worldBibleContext: worldBibleContextForPatcher,
      });

      await this.trackTokenUsage(project.id, patchResult.tokenUsage, "Cirujano de Texto", "deepseek-v4-flash", sectionData.numero, `qa_surgical_${qaSource}`);

      const operations = patchResult.result?.operations || [];

      if (operations.length > 0) {
        const report = this.surgicalPatcher.applyOperations(originalContent, operations);

        if (report.applied.length > 0) {
          const newWc = report.finalContent.split(/\s+/).filter(w => w.length > 0).length;

          await storage.updateChapter(chapter.id, {
            content: report.finalContent,
            wordCount: newWc,
            status: "completed",
            needsRevision: false,
            revisionReason: null,
            preEditContent: originalContent,
            preEditAt: new Date() as any,
          });

          this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");

          const pctChange = ((Math.abs(report.finalLength - report.originalLength) / Math.max(report.originalLength, 1)) * 100).toFixed(1);
          const failedNote = report.failed.length > 0
            ? ` ${report.failed.length} operación(es) descartada(s) por no encontrar el texto literal.`
            : "";

          await storage.createActivityLog({
            projectId: project.id,
            level: "success",
            message: `${sectionLabel}: cirugía aplicada — ${report.applied.length}/${operations.length} operaciones puntuales (${report.originalLength}→${report.finalLength} caracteres, ${pctChange}% de cambio).${failedNote}`,
            agentRole: "surgical-patcher",
          });

          this.callbacks.onAgentStatus("surgical-patcher", "completed",
            `${sectionLabel}: cirugía aplicada (${report.applied.length} operaciones, ${pctChange}% de cambio).`
          );
          return;
        }

        // Operaciones generadas pero ninguna encontró el texto literal → cae al reescritura.
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `${sectionLabel}: las ${operations.length} operaciones del cirujano no encontraron texto literal. Cayendo a reescritura completa.`,
          agentRole: "surgical-patcher",
        });
      } else {
        const reason = patchResult.result?.not_applicable_reason || "El cirujano clasificó la instrucción como estructural.";
        // Detectar instrucciones que SOLO afectan al World Bible (no al texto del
        // capítulo): si el cirujano refusa porque la nota habla de modificar
        // entradas del WB (activeInjuries, persistentInjuries, plotDecisions,
        // characters, worldRules, timeline...), reescribir el capítulo NO va a
        // arreglar nada — sólo gasta tokens y arriesga corromper prosa correcta.
        // En su lugar, dejamos el capítulo intacto y levantamos un log explícito.
        if (this.isWorldBibleOnlyInstruction(reason, correctionInstructions)) {
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `${sectionLabel}: instrucción identificada como modificación SOLO del World Bible (no afecta a la prosa del capítulo). Reescritura cancelada para no corromper texto correcto. Revisar/actualizar el WB manualmente o esperar a que el árbitro lo resuelva en el siguiente ciclo. Razón del cirujano: ${reason}`,
            agentRole: "surgical-patcher",
          });
          await storage.updateChapter(chapter.id, {
            status: "completed",
            needsRevision: false,
            revisionReason: null,
          });
          this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
          this.callbacks.onAgentStatus("surgical-patcher", "completed",
            `${sectionLabel}: instrucción solo afecta al WB; capítulo no tocado.`
          );
          return;
        }
        // Detectar instrucciones basadas en contenido INEXISTENTE en el capítulo
        // (versión obsoleta de la nota / referencia alucinada) o instrucciones
        // que el capítulo YA SATISFACE. En ambos casos la reescritura completa
        // suele EMPEORAR el texto (caso visto: 5/10, revertido). Cancelamos.
        if (this.isInstructionStaleOrAlreadySatisfied(reason)) {
          await storage.createActivityLog({
            projectId: project.id,
            level: "warning",
            message: `${sectionLabel}: la instrucción cita contenido que NO existe en el capítulo actual (referencia obsoleta o alucinada), o el capítulo YA cumple lo pedido. Reescritura cancelada para no introducir regresiones. Razón del cirujano: ${reason}`,
            agentRole: "surgical-patcher",
          });
          await storage.updateChapter(chapter.id, {
            status: "completed",
            needsRevision: false,
            revisionReason: null,
          });
          this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
          this.callbacks.onAgentStatus("surgical-patcher", "completed",
            `${sectionLabel}: instrucción obsoleta o ya satisfecha; capítulo no tocado.`
          );
          return;
        }
        await storage.createActivityLog({
          projectId: project.id,
          level: "info",
          message: `${sectionLabel}: cirugía no aplicable (${reason}). Cayendo a reescritura completa con Narrador.`,
          agentRole: "surgical-patcher",
        });
      }
    } catch (patchErr) {
      console.error(`[QA-Rewrite] SurgicalPatcher error on ${sectionLabel}:`, patchErr);
      await storage.createActivityLog({
        projectId: project.id,
        level: "warning",
        message: `${sectionLabel}: error en cirugía determinista (${patchErr instanceof Error ? patchErr.message : "desconocido"}). Cayendo a reescritura completa.`,
        agentRole: "surgical-patcher",
      });
    }

    // ════════════════════════════════════════════════════════════════
    // PASO 2 — REESCRITURA COMPLETA DEL GHOSTWRITER (fallback)
    // Solo si la cirugía determinista no fue aplicable.
    // ════════════════════════════════════════════════════════════════
    this.callbacks.onAgentStatus("ghostwriter", "writing",
      `Reescritura de ${sectionLabel} por ${qaLabels[qaSource]} (cirugía no aplicable, fallback a narrador)...`
    );

    const allChapters = await storage.getChaptersByProject(project.id);
    const previousChapter = allChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
    
    let previousContinuity = "";
    if (previousChapter?.continuityState) {
      previousContinuity = `ESTADO DE CONTINUIDAD DEL CAPÍTULO ANTERIOR:\n${JSON.stringify(previousChapter.continuityState, null, 2)}`;
    } else if (previousChapter?.content) {
      const lastParagraphs = previousChapter.content.split("\n\n").slice(-3).join("\n\n");
      previousContinuity = `FINAL DEL CAPÍTULO ANTERIOR:\n${lastParagraphs}`;
    }

    let seriesThreadsRewrite: string[] = [];
    let seriesEventsRewrite: string[] = [];
    if (project.seriesId) {
      const { threads, events } = await this.loadSeriesThreadsAndEvents(project);
      seriesThreadsRewrite = threads;
      seriesEventsRewrite = events;
    }

    const allChaptersCount = allChapters.length || project.chapterCount || 1;
    const calculatedTargetRewrite = this.calculatePerChapterTarget((project as any).minWordCount, allChaptersCount);
    const perChapterMinRewrite = (project as any).minWordsPerChapter || calculatedTargetRewrite;
    const perChapterMaxRewrite = (project as any).maxWordsPerChapter || Math.round(perChapterMinRewrite * 1.15);

    // ─── Rango de longitud permitido ────────────────────────────────────
    // Preservamos el original (±8%) PERO si el capítulo está fuera del rango saludable
    // del proyecto (caps cortos o largos respecto al target), permitimos que la edición
    // mueva la longitud hacia ese rango. Esto evita que la red de seguridad descarte
    // expansiones/contracciones legítimas cuando el original ya es anómalo.
    const originalLower = Math.round(originalWordCount * 0.92);
    const originalUpper = Math.round(originalWordCount * 1.08);
    const allowedLower = Math.min(originalLower, perChapterMinRewrite);
    const allowedUpper = Math.max(originalUpper, perChapterMaxRewrite);
    const originalBelowTarget = originalWordCount < perChapterMinRewrite;
    const originalAboveTarget = originalWordCount > perChapterMaxRewrite;

    const lengthContextNote = originalBelowTarget
      ? `NOTA DE LONGITUD: este capítulo original tiene ${originalWordCount} palabras y el rango saludable del proyecto es ${perChapterMinRewrite}-${perChapterMaxRewrite}. Está POR DEBAJO del rango. Si la instrucción editorial lo justifica (p.ej. siembra, desarrollo, redistribución de arco), tienes permiso para EXPANDIR hacia el rango del proyecto — pero solo con material que la instrucción demande, no con descripciones o monólogos gratuitos.`
      : originalAboveTarget
        ? `NOTA DE LONGITUD: este capítulo original tiene ${originalWordCount} palabras y el rango saludable del proyecto es ${perChapterMinRewrite}-${perChapterMaxRewrite}. Está POR ENCIMA del rango. Si la instrucción editorial lo justifica, puedes CONTRAER pasajes no esenciales para acercarlo al rango del proyecto.`
        : `NOTA DE LONGITUD: este capítulo original tiene ${originalWordCount} palabras, dentro del rango saludable del proyecto (${perChapterMinRewrite}-${perChapterMaxRewrite}). Mantén la longitud original (±8%).`;

    const surgicalInstructions = `🔧 CORRECCIÓN QUIRÚRGICA — MÁXIMA PRUDENCIA 🔧

Contexto: La novela ya está finalizada. Estás corrigiendo issues detectados en una auditoría posterior. CADA cambio innecesario es un riesgo de introducir nuevos problemas. Tu objetivo NO es reescribir el capítulo, sino aplicar correcciones MÍNIMAS y LOCALIZADAS.

REGLAS INVIOLABLES:
1. PRESERVA INTACTO el 90%+ del texto original. Solo modifica los pasajes que arrastran el problema señalado.
2. NO reescribas escenas completas que ya funcionan. NO cambies prosa, diálogos, descripciones ni estructura que no estén directamente implicados en el issue.
3. NO introduzcas información, eventos, personajes, objetos ni detalles nuevos que no estuvieran ya implícitos en el manuscrito original.
4. Mantén EXACTAMENTE el mismo arco narrativo, los mismos beats y el mismo final. Lo que cambia es la coherencia local, no la trama.
5. Mantén la longitud aproximada del original (${originalWordCount} palabras ± 10%). NO acortes ni alargues sustancialmente.
6. Mantén el tono, la voz narrativa y el registro lingüístico originales — el lector NO debe notar la corrección.
7. Si el issue señala una contradicción entre capítulos, ajusta SOLO la frase/párrafo conflictivo de este capítulo, no la escena entera.
8. Antes de editar un pasaje, pregúntate: "¿Este cambio es estrictamente necesario para resolver el issue?". Si la respuesta es "no" o "tal vez", NO LO TOQUES.

ISSUES A CORREGIR (origen: ${qaLabels[qaSource]}):
${correctionInstructions}

${lengthContextNote}

PROHIBIDO ABSOLUTAMENTE:
- Reescribir desde cero.
- Cambiar el inicio, el cierre o los giros narrativos.
- Añadir foreshadowing, simbolismo o subtramas que no estuvieran ya (salvo que la instrucción editorial lo pida explícitamente).
- Eliminar pasajes que no estén directamente relacionados con el issue.
- "Mejorar" la prosa de paso (eso ya lo hizo el Estilista).

Devuelve el capítulo COMPLETO con las correcciones aplicadas y el resto del texto idéntico al original.`;

    const surgicalMin = allowedLower;
    const surgicalMax = allowedUpper;

    const enrichedWBSurgical = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesThreadsRewrite, seriesEventsRewrite);
    const resolvedLexicoSurgical = this.resolveLexicoForChapter(worldBibleData, sectionData.numero);
    let writerResult = await this.ghostwriter.execute({
      chapterNumber: sectionData.numero,
      chapterData: sectionData,
      worldBible: this.worldBibleWithResolvedLexico(enrichedWBSurgical, resolvedLexicoSurgical),
      guiaEstilo,
      previousContinuity,
      refinementInstructions: surgicalInstructions,
      previousChapterContent: originalContent,
      minWordCount: surgicalMin,
      maxWordCount: surgicalMax,
      kindleUnlimitedOptimized: false,
      surgicalEdit: true,
    } as any);

    await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", sectionData.numero, "qa_rewrite");

    // Primera red (permisiva): aceptamos cualquier cosa dentro del rango permitido con 5% de holgura.
    const firstTryLower = Math.round(surgicalMin * 0.95);
    const firstTryUpper = Math.round(surgicalMax * 1.05);
    const checkLengthOk = (content: string): boolean => {
      const wc = content.split(/\s+/).filter(w => w.length > 0).length;
      return wc >= firstTryLower && wc <= firstTryUpper;
    };

    if (writerResult.content && !checkLengthOk(writerResult.content)) {
      const firstWc = writerResult.content.split(/\s+/).filter(w => w.length > 0).length;
      console.warn(`[QA-Rewrite] ${sectionLabel}: primer intento fuera de rango (${firstWc}, permitido ${firstTryLower}-${firstTryUpper}, original ${originalWordCount}). Reintentando...`);
      this.callbacks.onAgentStatus("ghostwriter", "writing",
        `${sectionLabel}: longitud ${firstWc} fuera de rango ${firstTryLower}-${firstTryUpper}. Reintentando...`
      );
      const retryInstructions = surgicalInstructions + `\n\n🚨 REINTENTO — TU INTENTO ANTERIOR TUVO ${firstWc} PALABRAS Y EL RANGO PERMITIDO ES ${firstTryLower}-${firstTryUpper}. Devuelve el capítulo con una extensión ESTRICTAMENTE dentro de ese rango. Copia el original verbatim y modifica SOLO los pasajes que la instrucción editorial requiere.`;
      const enrichedWBSurgicalRetry = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible, seriesThreadsRewrite, seriesEventsRewrite);
      writerResult = await this.ghostwriter.execute({
        chapterNumber: sectionData.numero,
        chapterData: sectionData,
        worldBible: this.worldBibleWithResolvedLexico(enrichedWBSurgicalRetry, resolvedLexicoSurgical),
        guiaEstilo,
        previousContinuity,
        refinementInstructions: retryInstructions,
        previousChapterContent: originalContent,
        minWordCount: surgicalMin,
        maxWordCount: surgicalMax,
        kindleUnlimitedOptimized: false,
        surgicalEdit: true,
      } as any);
      await this.trackTokenUsage(project.id, writerResult.tokenUsage, "El Narrador", "deepseek-v4-flash", sectionData.numero, "qa_rewrite_retry");
    }

    if (!writerResult.content || !writerResult.content.trim()) {
      console.warn(`[QA-Rewrite] ${sectionLabel}: writer returned empty content. Reverting to original.`);
      await storage.updateChapter(chapter.id, {
        content: originalContent,
        status: "completed",
        wordCount: originalWordCount,
        needsRevision: false,
        revisionReason: null,
      });
      this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
      this.callbacks.onAgentStatus("ghostwriter", "warning",
        `${sectionLabel}: reescritura vacía. Conservando versión original.`
      );
      return;
    }

    let candidateContent = writerResult.content;
    const candidateWordCount = candidateContent.split(/\s+/).filter(w => w.length > 0).length;

    // Segunda red (hard reject): 10% de holgura adicional sobre el rango permitido.
    const hardLower = Math.round(surgicalMin * 0.90);
    const hardUpper = Math.round(surgicalMax * 1.10);
    if (candidateWordCount < hardLower || candidateWordCount > hardUpper) {
      console.warn(`[QA-Rewrite] ${sectionLabel}: longitud fuera del rango permitido (${candidateWordCount}, permitido ${hardLower}-${hardUpper}, original ${originalWordCount}). Conservando original.`);
      await storage.updateChapter(chapter.id, {
        content: originalContent,
        status: "completed",
        wordCount: originalWordCount,
        needsRevision: false,
        revisionReason: null,
      });
      this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
      this.callbacks.onAgentStatus("ghostwriter", "warning",
        `${sectionLabel}: reescritura ${candidateWordCount} palabras fuera del rango permitido (${hardLower}-${hardUpper}, original ${originalWordCount}). Conservando original.`
      );
      return;
    }

    let editorScoreCandidate = 0;
    let editorHardRejectCandidate = false;
    try {
      this.callbacks.onAgentStatus("editor", "editing",
        `Verificando reescritura de ${sectionLabel} antes de aplicarla...`
      );
      const editorChaptersCtx = await storage.getChaptersByProject(project.id);
      const enrichedWBForVerify = await this.getEnrichedWorldBible(project.id, worldBibleData.world_bible);
      const resolvedLexicoForVerify = this.resolveLexicoForChapter(worldBibleData, sectionData.numero);
      const verifyResult = await this.editor.execute({
        chapterNumber: sectionData.numero,
        chapterContent: candidateContent,
        chapterData: sectionData,
        worldBible: this.worldBibleWithResolvedLexico(enrichedWBForVerify, resolvedLexicoForVerify),
        guiaEstilo,
        previousContinuityState: previousChapter?.continuityState as any,
        previousChaptersContext: this.buildPreviousChaptersContextForEditor(editorChaptersCtx, sectionData.numero),
      });
      await this.trackTokenUsage(project.id, verifyResult.tokenUsage, "El Editor", "deepseek-v4-flash", sectionData.numero, "qa_verify");

      editorScoreCandidate = verifyResult.result?.puntuacion || 0;
      editorHardRejectCandidate = this.hasHardRejectViolations(verifyResult.result);

      const originalHadHardReject = (chapter as any).editorHardReject === true;
      const introducedHardReject = editorHardRejectCandidate && !originalHadHardReject;

      if (introducedHardReject) {
        console.warn(`[QA-Rewrite] ${sectionLabel}: la reescritura introdujo nuevas violaciones críticas. Revirtiendo al original.`);
        await storage.updateChapter(chapter.id, {
          content: originalContent,
          status: "completed",
          wordCount: originalWordCount,
          needsRevision: false,
          revisionReason: null,
        });
        this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
        this.callbacks.onAgentStatus("editor", "warning",
          `${sectionLabel}: la reescritura introdujo nuevos errores críticos (${editorScoreCandidate}/10). Conservando original.`
        );
        return;
      }
    } catch (verifyErr) {
      console.warn(`[QA-Rewrite] ${sectionLabel}: verificación con Editor falló:`, verifyErr);
    }

    let finalContent = candidateContent;
    try {
      this.callbacks.onAgentStatus("copyeditor", "polishing",
        `Puliendo ${sectionLabel} tras corrección de ${qaLabels[qaSource]}...`
      );

      let styleGuideContent = "";
      if (project.styleGuideId) {
        const sg = await storage.getStyleGuide(project.styleGuideId);
        if (sg) styleGuideContent = sg.content;
      }

      const polishResult = await this.copyeditor.execute({
        chapterContent: finalContent,
        chapterNumber: sectionData.numero,
        chapterTitle: sectionData.titulo || `Capítulo ${sectionData.numero}`,
        guiaEstilo: styleGuideContent || undefined,
        lexicoHistorico: this.resolveLexicoForChapter(worldBibleData, sectionData.numero),
      });

      await this.trackTokenUsage(project.id, polishResult.tokenUsage, "El Estilista", "deepseek-v4-flash", sectionData.numero, "qa_polish");

      if (polishResult.result?.texto_final && polishResult.result.texto_final.trim().length > 0) {
        const polishedWc = polishResult.result.texto_final.split(/\s+/).filter((w: string) => w.length > 0).length;
        const polishRatio = polishedWc / Math.max(candidateWordCount, 1);
        if (polishRatio >= 0.85 && polishRatio <= 1.15) {
          finalContent = polishResult.result.texto_final;
        } else {
          console.warn(`[QA-Rewrite] ${sectionLabel}: polish cambió la longitud demasiado (${polishedWc}/${candidateWordCount}). Usando candidato sin pulir.`);
        }
      }
    } catch (polishError) {
      console.warn(`[Orchestrator] CopyEditor failed for QA rewrite of ${sectionLabel}, using raw Ghostwriter output:`, polishError);
    }

    const finalWordCount = finalContent.split(/\s+/).filter(w => w.length > 0).length;

    await storage.updateChapter(chapter.id, {
      content: finalContent,
      status: "completed",
      wordCount: finalWordCount,
      needsRevision: false,
      revisionReason: null,
      preEditContent: originalContent,
      preEditAt: new Date() as any,
    });

    this.chaptersRewrittenInCurrentCycle++;
    this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
    this.callbacks.onAgentStatus("copyeditor", "completed",
      `${sectionLabel} corregido quirúrgicamente${editorScoreCandidate ? ` (verificado ${editorScoreCandidate}/10)` : ""} — ${finalWordCount} palabras (original ${originalWordCount}).`
    );
    void originalContinuityState;
  }

  // ════════════════════════════════════════════════════════════════
  // Árbitro del World Bible: ante issues del Revisor Final, decide si la novela
  // tiene razón y debe actualizarse el WB en lugar de reescribir el capítulo.
  // SOLO actualiza datos puntuales aislados; nunca trama, arcos, decisiones.
  // Devuelve { handledIssueIndices, appliedPatches } — el caller filtra los
  // issues "handled" antes de mandar el resto al cirujano/narrador.
  // ════════════════════════════════════════════════════════════════
  private async arbitrateWorldBibleForIssues(
    project: Project,
    chapter: Chapter,
    sectionData: any,
    issuesForChapter: FinalReviewIssue[],
    worldBibleData: ParsedWorldBible,
    allChapters: Chapter[]
  ): Promise<{ handledIssueIndices: Set<number>; appliedPatches: WorldBiblePatch[] }> {
    const empty = { handledIssueIndices: new Set<number>(), appliedPatches: [] as WorldBiblePatch[] };

    if (!issuesForChapter || issuesForChapter.length === 0) return empty;
    if (!chapter.content || !chapter.content.trim()) return empty;

    // Las únicas categorías que tienen sentido arbitrar contra el WB son las que
    // describen datos canónicos puntuales. Las demás (trama, ritmo, hook, etc.)
    // jamás deben modificar el WB — siempre reescritura del capítulo.
    const ARBITRABLE_CATS = new Set([
      "continuidad_fisica", "timeline", "ubicacion", "personajes", "otro"
    ]);
    const arbitrable = issuesForChapter
      .map((iss, idx) => ({ iss, idx }))
      .filter(x => ARBITRABLE_CATS.has(String(x.iss.categoria || "otro")));
    if (arbitrable.length === 0) {
      const cats = Array.from(new Set(issuesForChapter.map(i => String(i.categoria || "otro"))));
      await storage.createActivityLog({
        projectId: project.id, level: "info", agentRole: "wb-arbiter",
        message: `Cap ${sectionData.numero}: ${issuesForChapter.length} issue(s) NO arbitrables (categorías: ${cats.join(", ")}). Pasan directos a reescritura.`,
      });
      return empty;
    }

    const wbRecord = await storage.getWorldBibleByProject(project.id);
    if (!wbRecord) {
      await storage.createActivityLog({
        projectId: project.id, level: "warning", agentRole: "wb-arbiter",
        message: `Cap ${sectionData.numero}: No se encontró registro de World Bible para el proyecto. Imposible arbitrar.`,
      });
      return empty;
    }
    await storage.createActivityLog({
      projectId: project.id, level: "info", agentRole: "wb-arbiter",
      message: `Cap ${sectionData.numero}: árbitro evaluando ${arbitrable.length} issue(s) potencialmente resoluble(s) por canon del WB...`,
    });

    const wbSnapshot = {
      characters: wbRecord.characters || [],
      worldRules: wbRecord.worldRules || [],
      timeline: wbRecord.timeline || [],
      plotOutline: wbRecord.plotOutline || {},
    };

    // Concordancia: para cada nombre de personaje (de los que aparecen en
    // los issues o en el WB), contamos en cuántos capítulos aparecen y con
    // qué frecuencia. El árbitro lo usa para verificar la condición (b).
    const concordanceLines: string[] = [];
    const characters = (wbRecord.characters as any[]) || [];

    // Recolectar nombres mencionados en los issues
    const issueText = arbitrable.map(x =>
      `${x.iss.descripcion || ""} ${x.iss.instrucciones_correccion || ""}`
    ).join(" ").toLowerCase();

    const relevantNames = new Set<string>();
    for (const c of characters) {
      const fullName = String(c?.nombre || c?.name || "").trim();
      if (!fullName) continue;
      const firstName = fullName.split(/\s+/)[0];
      if (issueText.includes(fullName.toLowerCase()) || (firstName && issueText.includes(firstName.toLowerCase()))) {
        relevantNames.add(fullName);
      }
    }

    // Si no detectamos nombres explícitos en los issues, no merece la pena
    // pasar concordancia (el árbitro decidirá con WB + capítulo solo).
    if (relevantNames.size > 0) {
      const sortedChapters = [...allChapters].sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
      for (const name of Array.from(relevantNames).slice(0, 8)) {
        const firstName = name.split(/\s+/)[0];
        const re = new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "gi");
        const perChapter: string[] = [];
        for (const ch of sortedChapters) {
          const content = ch.content || "";
          if (!content) continue;
          const matches = content.match(re);
          if (matches && matches.length > 0) {
            perChapter.push(`cap${ch.chapterNumber}=${matches.length}`);
          }
        }
        if (perChapter.length > 0) {
          concordanceLines.push(`• ${name}: aparece en ${perChapter.length} capítulos → ${perChapter.join(", ")}`);
        } else {
          concordanceLines.push(`• ${name}: SIN apariciones literales en la novela.`);
        }
      }
    }

    let arbiterResult;
    try {
      const response = await this.wbArbiter.execute({
        chapterNumber: sectionData.numero,
        chapterTitle: sectionData.titulo || `Capítulo ${sectionData.numero}`,
        chapterContent: chapter.content || "",
        issues: arbitrable.map(x => ({
          index: x.idx,
          categoria: String(x.iss.categoria || "otro"),
          descripcion: x.iss.descripcion || "",
          instrucciones_correccion: x.iss.instrucciones_correccion || "",
          capitulos_afectados: x.iss.capitulos_afectados || [],
        })),
        worldBibleJson: JSON.stringify(wbSnapshot, null, 2).slice(0, 40000),
        concordance: concordanceLines.join("\n"),
      });
      await this.trackTokenUsage(project.id, response.tokenUsage, "Árbitro del World Bible", "deepseek-v4-flash", sectionData.numero, "wb_arbitration");
      arbiterResult = response.result;
    } catch (err) {
      console.warn(`[WBArbiter] Error en cap ${sectionData.numero}:`, err);
      return empty;
    }

    if (!arbiterResult || !Array.isArray(arbiterResult.wb_patches) || arbiterResult.wb_patches.length === 0) {
      const reason = (arbiterResult?.reasoning || "").toString().slice(0, 400) || "(sin razonamiento devuelto)";
      await storage.createActivityLog({
        projectId: project.id, level: "info", agentRole: "wb-arbiter",
        message: `Cap ${sectionData.numero}: árbitro decidió NO modificar el WB (0 parches). Razón: ${reason}`,
      });
      return empty;
    }

    // Aplicar parches al WB de forma segura (validando que la entidad+campo existen
    // y que el "before" coincide con el valor actual; si no, descartamos el parche).
    // Sólo se aceptan parches cuyo `resolves_issue_index` esté en el set enviado:
    // evita que el modelo "marque resuelto" un issue que en realidad no abordó.
    const submittedIndices = new Set(arbitrable.map(x => x.idx));
    const appliedPatches: WorldBiblePatch[] = [];
    const rejectedLogs: string[] = [];
    const handledIssueIndices = new Set<number>();
    const updatedSnapshot = JSON.parse(JSON.stringify(wbSnapshot));

    for (const patch of arbiterResult.wb_patches) {
      if (typeof patch.resolves_issue_index !== "number" || !submittedIndices.has(patch.resolves_issue_index)) {
        rejectedLogs.push(`Parche descartado: resolves_issue_index inválido (${patch.resolves_issue_index}) — no estaba en los issues enviados.`);
        continue;
      }
      const diag = this.applyWorldBiblePatchWithDiag(updatedSnapshot, patch);
      if (diag.ok) {
        appliedPatches.push(patch);
        handledIssueIndices.add(patch.resolves_issue_index);
      } else {
        rejectedLogs.push(
          `Parche rechazado [${patch.section}/${patch.entity_id_or_name}/${patch.field}]: ${diag.reason}` +
          (diag.foundValue !== undefined ? ` — valor real en WB: "${String(diag.foundValue).slice(0, 120)}"; before declarado: "${String(patch.before).slice(0, 120)}"` : "")
        );
      }
    }

    if (appliedPatches.length === 0) {
      // Si hubo rechazos, dejamos rastro para auditoría.
      for (const msg of rejectedLogs) {
        await storage.createActivityLog({ projectId: project.id, level: "warning", message: msg, agentRole: "wb-arbiter" });
      }
      return empty;
    }

    // Persistir PRIMERO; logs de éxito SOLO si la persistencia funciona.
    try {
      await storage.updateWorldBible(wbRecord.id, {
        characters: updatedSnapshot.characters,
        worldRules: updatedSnapshot.worldRules,
        timeline: updatedSnapshot.timeline,
        plotOutline: updatedSnapshot.plotOutline,
      });
    } catch (err) {
      console.error(`[WBArbiter] Error persistiendo WB actualizado:`, err);
      await storage.createActivityLog({
        projectId: project.id, level: "error", agentRole: "wb-arbiter",
        message: `Fallo al persistir parches del WB: ${(err as Error)?.message || err}. Ningún cambio aplicado; los issues seguirán por reescritura.`,
      });
      return empty;
    }

    for (const patch of appliedPatches) {
      await storage.createActivityLog({
        projectId: project.id, level: "success", agentRole: "wb-arbiter",
        message: `World Bible actualizado: ${patch.section}/${patch.entity_id_or_name}/${patch.field}: "${patch.before}" → "${patch.after}". Razón: ${patch.justification}`,
      });
    }
    for (const msg of rejectedLogs) {
      await storage.createActivityLog({ projectId: project.id, level: "warning", message: msg, agentRole: "wb-arbiter" });
    }

    return { handledIssueIndices, appliedPatches };
  }

  // Aplica UN parche al snapshot mutable. Estricto: solo modifica si la entidad
  // existe, el campo ya existe en ella, y el "before" coincide con el valor actual.
  // Solo acepta secciones tipo array (characters/worldRules/timeline). plotOutline
  // se rechaza por seguridad (estructura compleja, alto riesgo de corrupción).
  private applyWorldBiblePatch(snapshot: any, patch: WorldBiblePatch): boolean {
    return this.applyWorldBiblePatchWithDiag(snapshot, patch).ok;
  }

  // Heurística: la instrucción de corrección habla SOLO de actualizar el World
  // Bible (no la prosa del capítulo). En ese caso, ni cirugía ni reescritura del
  // capítulo van a "arreglar" nada — la solución es tocar el WB. Detectamos:
  //   • La razón del cirujano menciona explícitamente WB / world bible.
  //   • La instrucción menciona campos canónicos del WB (activeInjuries,
  //     persistentInjuries, plotDecisions, characters/personajes, worldRules,
  //     timeline, etc.) y verbos de "actualizar entrada / añadir registro".
  // Si SOLO uno de los dos lados lo menciona y la instrucción ALSO describe
  // cambios concretos al texto, devolvemos false para no perdernos correcciones
  // mixtas. Por eso pedimos señal en la razón del cirujano (que ya analizó
  // ambos lados).
  private isWorldBibleOnlyInstruction(surgeonReason: string, originalInstructions: string): boolean {
    const r = (surgeonReason || "").toLowerCase();
    const i = (originalInstructions || "").toLowerCase();

    // Señal primaria: el cirujano dice explícitamente que la nota es para el WB,
    // no para el texto del capítulo. Es el indicador más fiable.
    const surgeonFlagsWB =
      /world bible|world\s*bible|wb\b|gestionar la world bible|modificación en la world bible|modificacion en la world bible|no en el texto/.test(r);

    if (!surgeonFlagsWB) return false;

    // Confirmación secundaria: la instrucción menciona campos canónicos del WB.
    const wbFieldTokens = [
      "activeinjuries", "active_injuries", "heridas_activas",
      "persistentinjuries", "persistent_injuries", "lesiones persistentes", "lesiones_persistentes",
      "plotdecisions", "plot_decisions", "decisiones de trama",
      "world bible", "worldbible", "world_bible",
      "entrada de", "entry of", "registro en",
    ];
    const mentionsWBFields = wbFieldTokens.some(t => i.includes(t));

    return mentionsWBFields;
  }

  // Heurística: la razón del cirujano deja claro que la instrucción está basada
  // en contenido que NO existe en el capítulo actual (típico de notas obsoletas
  // que se refieren a una versión anterior del texto, o de issues alucinados
  // por el revisor) o que el capítulo YA cumple lo que la instrucción pide.
  // En ambos casos, dejar al Narrador reescribir suele EMPEORAR el texto: o
  // mete contenido inventado para "encajar" con la nota, o destroza una versión
  // que ya estaba bien. La opción correcta es dejar el capítulo intacto.
  private isInstructionStaleOrAlreadySatisfied(surgeonReason: string): boolean {
    const r = (surgeonReason || "").toLowerCase().trim();
    if (!r) return false;

    // Patrones de "no existe en el capítulo"
    const noExistencePatterns = [
      /no\s+contiene\s+(ning[uú]n|ninguna)/,
      /no\s+contiene\s+(referencia|mención|menci[oó]n|elemento|pasaje|fragmento|párrafo|parrafo)/,
      /no\s+(incluye|menciona|hace\s+referencia|aparece|encuentra|existe)/,
      /no\s+hay\s+(ning[uú]n|elemento|menci[oó]n|referencia|fragmento|texto)/,
      /sin\s+embargo,?\s+el\s+texto/,
      /el\s+texto\s+(proporcionado|del\s+cap[ií]tulo)\s+(no|tampoco)/,
      /no\s+se\s+encuentr[ae]n?\s+(en|dentro)/,
    ];

    // Patrones de "el capítulo ya satisface la instrucción"
    const alreadySatisfiedPatterns = [
      /ya\s+(proporciona|cumple|satisface|incluye|tiene|presenta|refleja|expresa|contiene)/,
      /el\s+cap[ií]tulo,?\s+tal\s+como\s+est[aá]/,
      /no\s+hay\s+(elementos?|nada)\s+(que\s+(eliminar|corregir|modificar|cambiar|añadir|agregar|reescribir))/,
      /la\s+correcci[oó]n\s+ya\s+est[aá]\s+aplicada/,
      /el\s+texto\s+ya\s+/,
    ];

    return [...noExistencePatterns, ...alreadySatisfiedPatterns].some(re => re.test(r));
  }

  // Versión instrumentada: devuelve un objeto con `ok` y la razón de fallo
  // (más el valor real encontrado en la ruta, si llegamos hasta él) para que
  // la capa superior pueda dejar rastros útiles de auditoría.
  private applyWorldBiblePatchWithDiag(snapshot: any, patch: WorldBiblePatch): { ok: boolean; reason: string; foundValue?: any } {
    const ALLOWED_SECTIONS = new Set(["characters", "worldRules", "timeline"]);
    if (!ALLOWED_SECTIONS.has(patch.section)) {
      return { ok: false, reason: `sección "${patch.section}" no permitida (sólo characters/worldRules/timeline)` };
    }
    if (typeof patch.before !== "string" || typeof patch.after !== "string") {
      return { ok: false, reason: `before/after deben ser strings` };
    }
    if (!patch.entity_id_or_name?.trim() || !patch.field?.trim()) {
      return { ok: false, reason: `entity_id_or_name o field vacíos` };
    }

    const list = snapshot[patch.section];
    if (!Array.isArray(list)) {
      return { ok: false, reason: `sección "${patch.section}" no es un array en el WB` };
    }

    const target = patch.entity_id_or_name.trim().toLowerCase();
    const entity = list.find((e: any) => {
      const candidates = [e?.nombre, e?.name, e?.id, e?.titulo, e?.evento]
        .filter(v => typeof v === "string")
        .map(v => v.trim().toLowerCase());
      return candidates.includes(target);
    });
    if (!entity) {
      const available = list.map((e: any) => e?.nombre || e?.name || e?.id || e?.titulo || e?.evento).filter(Boolean).slice(0, 6);
      return { ok: false, reason: `entidad "${patch.entity_id_or_name}" no encontrada en ${patch.section}. Disponibles: ${available.join(", ") || "(vacío)"}` };
    }

    return this.setByPath(entity, patch.field, patch.before, patch.after);
  }

  // Setter por path "a.b.c" o "a.b[2]". REQUIERE que la ruta y el campo final
  // ya existan, y que el valor previo coincida con `before` (laxo: trim+lowercase).
  // Bloquea tokens peligrosos (__proto__, prototype, constructor) para evitar
  // prototype pollution vía paths controlados por el modelo.
  // Si el campo final es un array de strings, busca el `before` dentro del array
  // y reemplaza ese elemento concreto (caso típico: rasgos_distintivos[]).
  private setByPath(obj: any, path: string, before: string, after: string): { ok: boolean; reason: string; foundValue?: any } {
    const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
    const tokens = path.split(/\.|\[|\]/).filter(t => t.length > 0);
    if (tokens.length === 0) return { ok: false, reason: `path vacío` };
    if (tokens.some(t => FORBIDDEN.has(t))) return { ok: false, reason: `path contiene tokens prohibidos` };

    let cursor: any = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      const k = tokens[i];
      if (cursor === null || typeof cursor !== "object") {
        return { ok: false, reason: `tramo "${tokens.slice(0, i + 1).join(".")}" no es objeto navegable` };
      }
      const next = tokens[i + 1];
      const nextIsIndex = /^\d+$/.test(next);
      if (nextIsIndex && !Array.isArray(cursor[k])) {
        return { ok: false, reason: `"${k}" no es array, no admite índice [${next}]` };
      }
      if (!Object.prototype.hasOwnProperty.call(cursor, k)) {
        const keys = Object.keys(cursor).slice(0, 8);
        return { ok: false, reason: `campo "${k}" no existe en la entidad. Campos disponibles: ${keys.join(", ")}` };
      }
      cursor = cursor[k];
    }
    const lastKey = tokens[tokens.length - 1];
    if (cursor === null || typeof cursor !== "object") {
      return { ok: false, reason: `padre del campo final no es objeto navegable` };
    }

    const norm = (v: any) => String(v ?? "").trim().toLowerCase();

    if (Array.isArray(cursor)) {
      // Si lastKey es índice numérico, validar bounds y exactitud
      if (/^\d+$/.test(lastKey)) {
        const idx = Number(lastKey);
        if (idx < 0 || idx >= cursor.length) {
          return { ok: false, reason: `índice [${idx}] fuera de bounds (longitud ${cursor.length})`, foundValue: cursor.slice(0, 6).join(" | ") };
        }
        if (norm(cursor[idx]) !== norm(before)) {
          return { ok: false, reason: `"before" no coincide con valor en índice [${idx}]`, foundValue: cursor[idx] };
        }
        cursor[idx] = after;
        return { ok: true, reason: "ok" };
      }
      return { ok: false, reason: `cursor es array pero lastKey "${lastKey}" no es índice numérico` };
    }

    if (!Object.prototype.hasOwnProperty.call(cursor, lastKey)) {
      const keys = Object.keys(cursor).slice(0, 8);
      return { ok: false, reason: `campo final "${lastKey}" no existe. Campos disponibles: ${keys.join(", ")}` };
    }

    const current = cursor[lastKey];

    // Caso especial: el campo final ES un array de strings y el modelo
    // declaró un `before` que es UNO de los elementos (no un índice). Buscamos
    // el elemento por contenido y lo reemplazamos. Ej.: rasgos_distintivos.
    if (Array.isArray(current) && current.every(v => typeof v === "string")) {
      const idx = current.findIndex(v => norm(v) === norm(before));
      if (idx === -1) {
        return { ok: false, reason: `"before" no aparece en el array "${lastKey}"`, foundValue: current.slice(0, 6).join(" | ") };
      }
      current[idx] = after;
      return { ok: true, reason: "ok (array string match)" };
    }

    // Caso normal: campo escalar string.
    if (norm(current) !== norm(before)) {
      return { ok: false, reason: `"before" no coincide con valor actual del campo`, foundValue: current };
    }

    cursor[lastKey] = after;
    return { ok: true, reason: "ok" };
  }

  private async polishChapterForVoice(
    project: Project,
    chapter: Chapter,
    styleGuideContent: string,
    voiceIssues: string
  ): Promise<void> {
    await storage.updateChapter(chapter.id, { status: "editing" });
    this.callbacks.onChapterStatusChange(chapter.chapterNumber, "editing");
    
    this.callbacks.onAgentStatus("copyeditor", "polishing", 
      `Puliendo voz y ritmo del capítulo ${chapter.chapterNumber}`
    );

    // Reconstruir WB completa para poder resolver la época correcta del capítulo
    // (puede ser una de varias épocas paralelas si la novela tiene timeline dual).
    let lexicoHistorico: any = null;
    try {
      const wb = await storage.getWorldBibleByProject(project.id);
      if (wb) {
        const reconstructed = this.reconstructWorldBibleData(wb, project);
        lexicoHistorico = this.resolveLexicoForChapter(reconstructed, chapter.chapterNumber);
      }
    } catch (e) {
      lexicoHistorico = null;
    }

    const copyEditResult = await this.copyeditor.execute({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || `Capítulo ${chapter.chapterNumber}`,
      chapterContent: chapter.content || "",
      guiaEstilo: `${styleGuideContent || "Tone: literary, professional"}\n\nCORRECCIONES DEL AUDITOR DE VOZ:\n${voiceIssues}\n\nAjusta el tono y ritmo según las indicaciones manteniendo el contenido narrativo.`,
      lexicoHistorico,
    });

    await this.trackTokenUsage(project.id, copyEditResult.tokenUsage, "El Estilista", "deepseek-v4-flash", chapter.chapterNumber, "voice_polish");

    const polishedContent = copyEditResult.result?.texto_final;
    if (polishedContent) {
      const wordCount = polishedContent.split(/\s+/).filter((w: string) => w.length > 0).length;
      
      await storage.updateChapter(chapter.id, {
        content: polishedContent,
        status: "completed",
        wordCount,
      });

      this.callbacks.onChapterStatusChange(chapter.chapterNumber, "completed");
      this.callbacks.onAgentStatus("copyeditor", "completed", 
        `Capítulo ${chapter.chapterNumber} pulido correctamente`
      );
    }
  }
}

function extractCharacterNames(characters: any[], names: Set<string>): void {
  if (!Array.isArray(characters)) return;
  for (const char of characters) {
    const nombre = char?.nombre || char?.name;
    if (!nombre || typeof nombre !== "string") continue;
    const parts = nombre.trim().split(/\s+/);
    for (const part of parts) {
      const clean = part.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/gi, "");
      if (clean.length >= 3) {
        names.add(clean);
      }
    }
  }
}

export async function extractForbiddenNames(currentSeriesId: number | null | undefined): Promise<string[]> {
  try {
    const allWorldBibles = await storage.getAllWorldBibles();
    const allProjects = await storage.getAllProjects();

    const projectSeriesMap = new Map<number, number | null>();
    for (const p of allProjects) {
      projectSeriesMap.set(p.id, p.seriesId);
    }

    const names = new Set<string>();

    for (const wb of allWorldBibles) {
      const wbSeriesId = projectSeriesMap.get(wb.projectId);
      if (currentSeriesId && wbSeriesId === currentSeriesId) continue;
      extractCharacterNames(wb.characters as any[], names);
    }

    try {
      const allReeditProjects = await storage.getAllReeditProjects();
      const reeditSeriesMap = new Map<number, number | null>();
      for (const rp of allReeditProjects) {
        reeditSeriesMap.set(rp.id, (rp as any).seriesId ?? null);
      }

      const allReeditWorldBibles = await storage.getAllReeditWorldBibles();
      for (const rwb of allReeditWorldBibles) {
        const rwbSeriesId = reeditSeriesMap.get(rwb.projectId);
        if (currentSeriesId && rwbSeriesId === currentSeriesId) continue;
        extractCharacterNames(rwb.characters as any[], names);
      }
    } catch (_e) {}

    const blacklistEntries = await storage.getAllNameBlacklistEntries();
    for (const entry of blacklistEntries) {
      const clean = entry.name.trim();
      if (clean.length >= 2) {
        names.add(clean);
      }
    }

    return [...names];
  } catch (error) {
    console.error("[extractForbiddenNames] Error:", error);
    return [];
  }
}
