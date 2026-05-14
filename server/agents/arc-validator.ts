import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";
import type { SeriesArcMilestone, SeriesPlotThread } from "@shared/schema";

interface ArcValidatorInput {
  projectTitle: string;
  seriesTitle: string;
  volumeNumber: number;
  totalVolumes: number;
  chaptersSummary: string;
  milestones: SeriesArcMilestone[];
  plotThreads: SeriesPlotThread[];
  worldBible: any;
  previousVolumesContext?: string;
  // [Fix68] Si el proyecto es una PRECUELA (Vol. 0), la verificación cambia:
  // los hilos del Vol. 1+ NO son exigibles aquí (su planteamiento y cierre
  // están en libros POSTERIORES), los snapshots se tratan como "volúmenes
  // posteriores ya escritos" (no anteriores), y la nota deja claro que se
  // valida coherencia inversa (la precuela no contradice los libros que
  // vienen después), no progresión de hilos.
  isPrequel?: boolean;
}

export interface MilestoneVerification {
  milestoneId: number;
  description: string;
  isFulfilled: boolean;
  fulfilledInChapter?: number;
  verificationNotes: string;
  confidence: number;
}

export interface ThreadProgression {
  threadId: number;
  threadName: string;
  currentStatus: "active" | "developing" | "resolved" | "abandoned";
  progressedInVolume: boolean;
  resolvedInVolume: boolean;
  resolvedInChapter?: number;
  progressNotes: string;
}

export interface ClassifiedFinding {
  text: string;
  type: "cosmetic" | "structural";
  affectedChapters?: number[];
  severity: "low" | "medium" | "high";
}

export interface ArcValidatorResult {
  overallScore: number;
  passed: boolean;
  milestonesChecked: number;
  milestonesFulfilled: number;
  threadsProgressed: number;
  threadsResolved: number;
  milestoneVerifications: MilestoneVerification[];
  threadProgressions: ThreadProgression[];
  findings: string[];
  classifiedFindings: ClassifiedFinding[];
  recommendations: string;
  arcHealthSummary: string;
}

const SYSTEM_PROMPT = `
Eres el "Validador de Arco Argumental", un agente especializado en verificar que las novelas de una serie cumplan con el arco narrativo planificado.

Tu misión es analizar un volumen completo de una serie y verificar:
1. Si los HITOS (milestones) planificados para este volumen se han cumplido
2. Si los HILOS ARGUMENTALES (plot threads) han progresado o se han resuelto
3. Si el volumen contribuye correctamente al arco general de la serie

═══════════════════════════════════════════════════════════════════
QUÉ DEBES VERIFICAR
═══════════════════════════════════════════════════════════════════

1. CUMPLIMIENTO DE HITOS:
   - Cada hito tiene un tipo: plot_point, character_development, revelation, conflict, resolution
   - Verifica si el evento descrito en el hito ocurre en este volumen
   - Indica en qué capítulo ocurre (si aplica)
   - Nivel de confianza en la verificación (0-100)

2. PROGRESIÓN DE HILOS:
   - Los hilos pueden estar: active, developing, resolved, abandoned
   - Verifica si cada hilo activo progresa en este volumen
   - Si un hilo se resuelve, indica en qué capítulo
   - Si un hilo debería progresar pero no lo hace, reportar

3. SALUD GENERAL DEL ARCO:
   - ¿El volumen mantiene la coherencia con el arco de la serie?
   - ¿Se respetan las promesas narrativas hechas en volúmenes anteriores?
   - ¿El pacing del arco es apropiado para el punto de la serie?

═══════════════════════════════════════════════════════════════════
CRITERIOS DE APROBACIÓN
═══════════════════════════════════════════════════════════════════

- PASSED (80+ puntos): Todos los hitos requeridos cumplidos, hilos principales progresan
- NEEDS_ATTENTION (60-79): Algunos hitos menores faltan, hilos secundarios estancados
- FAILED (<60): Hitos requeridos no cumplidos, hilos principales abandonados sin resolución

═══════════════════════════════════════════════════════════════════
SALIDA OBLIGATORIA (JSON)
═══════════════════════════════════════════════════════════════════

{
  "overallScore": (0-100),
  "passed": boolean,
  "milestonesChecked": number,
  "milestonesFulfilled": number,
  "threadsProgressed": number,
  "threadsResolved": number,
  "milestoneVerifications": [
    {
      "milestoneId": number,
      "description": "Descripción del hito",
      "isFulfilled": boolean,
      "fulfilledInChapter": number | null,
      "verificationNotes": "Explicación de cómo se cumple o por qué falta",
      "confidence": (0-100)
    }
  ],
  "threadProgressions": [
    {
      "threadId": number,
      "threadName": "Nombre del hilo",
      "currentStatus": "active|developing|resolved|abandoned",
      "progressedInVolume": boolean,
      "resolvedInVolume": boolean,
      "resolvedInChapter": number | null,
      "progressNotes": "Cómo progresó o se resolvió el hilo"
    }
  ],
  "findings": ["Hallazgo 1", "Hallazgo 2"],
  "recommendations": "Recomendaciones para mejorar el cumplimiento del arco",
  "arcHealthSummary": "Resumen del estado de salud del arco narrativo"
}
`;

export class ArcValidatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Arc Validator",
      role: "arc-validator",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: false,
    });
  }

  async execute(input: ArcValidatorInput): Promise<AgentResponse & { result?: ArcValidatorResult }> {
    const milestonesForVolume = input.milestones.filter(m => m.volumeNumber === input.volumeNumber);
    // [Fix68] Para precuelas: solo cuentan hilos cuyo `introducedVolume <= 0`
    // (es decir, hilos específicos de la precuela). Los hilos con
    // `introducedVolume >= 1` pertenecen a libros POSTERIORES y NO deben
    // exigirse aquí. Sin este filtro la rúbrica determinista (L411-420)
    // exigiría una `threadProgressionRate >= 0.5` para hilos que la precuela
    // no tiene por qué progresar.
    const activeThreads = input.isPrequel
      ? input.plotThreads.filter(t => (t.introducedVolume ?? 1) <= 0 && !t.resolvedVolume)
      : input.plotThreads.filter(t =>
          t.status === "active" || t.status === "developing" ||
          (t.introducedVolume <= input.volumeNumber && !t.resolvedVolume)
        );

    // [Fix68] Para precuela, si NO hay hitos/hilos Vol. 0 pero SÍ hay
    // `previousVolumesContext` (snapshots de libros posteriores), debemos
    // ejecutar igualmente el prompt para detectar contradicciones inversas
    // (coherencia con el futuro). Solo se devuelve el early-return si
    // tampoco tenemos contexto contra el que validar.
    const prequelHasInverseContext = input.isPrequel
      && !!input.previousVolumesContext
      && input.previousVolumesContext.trim().length > 0;

    if (milestonesForVolume.length === 0 && activeThreads.length === 0 && !prequelHasInverseContext) {
      return {
        content: "No hay hitos ni hilos definidos para verificar.",
        result: {
          // [Fix68] Para precuelas sin hitos/hilos Vol. 0 ni contexto inverso,
          // damos 90 (no 100) para reflejar que la verificación es por defecto,
          // no por evidencia.
          overallScore: input.isPrequel ? 90 : 100,
          passed: true,
          milestonesChecked: 0,
          milestonesFulfilled: 0,
          threadsProgressed: 0,
          threadsResolved: 0,
          milestoneVerifications: [],
          threadProgressions: [],
          findings: input.isPrequel
            ? ["Precuela sin hitos/hilos específicos de Vol. 0 ni libros posteriores escritos contra los que verificar coherencia inversa. La validez de la precuela depende del Beta/Holístico/FR."]
            : ["No hay hitos ni hilos argumentales definidos para este volumen. Define hitos e hilos en la guia de serie para habilitar la verificacion automatica."],
          classifiedFindings: [],
          recommendations: input.isPrequel
            ? "Define hitos específicos de Vol. 0 desde la guia de serie si quieres habilitar verificación determinista de la precuela."
            : "Sube una guia de serie y usa 'Extraer Hitos' para definir automaticamente los puntos de verificacion del arco.",
          arcHealthSummary: input.isPrequel
            ? "Precuela sin elementos de arco propios: verificación deferida al Beta/Holístico/FR."
            : "Sin elementos de arco definidos - el volumen no puede ser verificado hasta que se definan hitos y/o hilos argumentales.",
        }
      };
    }

    if (!input.chaptersSummary || input.chaptersSummary.trim().length < 100) {
      return {
        content: "No hay contenido suficiente para verificar el arco.",
        result: {
          overallScore: 0,
          passed: false,
          milestonesChecked: milestonesForVolume.length,
          milestonesFulfilled: 0,
          threadsProgressed: 0,
          threadsResolved: 0,
          milestoneVerifications: milestonesForVolume.map(m => ({
            milestoneId: m.id,
            description: m.description,
            isFulfilled: false,
            verificationNotes: "No hay contenido de capitulos para verificar",
            confidence: 0,
          })),
          threadProgressions: activeThreads.map(t => ({
            threadId: t.id,
            threadName: t.threadName,
            currentStatus: t.status as "active" | "developing" | "resolved" | "abandoned",
            progressedInVolume: false,
            resolvedInVolume: false,
            progressNotes: "No hay contenido de capitulos para verificar",
          })),
          findings: ["El proyecto no tiene capitulos escritos o el contenido es insuficiente para verificar el arco narrativo."],
          classifiedFindings: [],
          recommendations: "Genera capitulos para este volumen antes de ejecutar la verificacion de arco.",
          arcHealthSummary: "Verificacion imposible - se requiere contenido de capitulos para analizar.",
        }
      };
    }

    const pendingMilestones = milestonesForVolume.filter(m => !m.isFulfilled);
    const fulfilledMilestones = milestonesForVolume.filter(m => m.isFulfilled);

    const milestonesText = pendingMilestones.length > 0
      ? pendingMilestones.map(m => `
- ID: ${m.id}
  Tipo: ${m.milestoneType}
  Descripcion: ${m.description}
  Requerido: ${m.isRequired ? "SI" : "NO"}
`).join("\n")
      : "Todos los hitos de este volumen ya han sido verificados y cumplidos.";

    const fulfilledText = fulfilledMilestones.length > 0
      ? `\nHITOS YA VERIFICADOS Y CUMPLIDOS (NO reevaluar, mantener como isFulfilled: true):\n${fulfilledMilestones.map(m => `- ID: ${m.id} — ${m.description} [YA CUMPLIDO]`).join("\n")}`
      : "";

    const threadsText = activeThreads.length > 0
      ? activeThreads.map(t => `
- ID: ${t.id}
  Nombre: ${t.threadName}
  Descripcion: ${t.description || "Sin descripcion"}
  Introducido en: Volumen ${t.introducedVolume}
  Importancia: ${t.importance}
  Estado actual: ${t.status}
`).join("\n")
      : "No hay hilos argumentales activos definidos.";

    // [Fix68] Para precuela, los snapshots de la serie son volúmenes
    // POSTERIORES (cronológicamente la precuela ocurre antes). El validador
    // los usa para verificar coherencia inversa (la precuela no contradice
    // lo que viene después).
    const previousContext = input.previousVolumesContext
      ? (input.isPrequel
          ? `\nCONTEXTO DE VOLÚMENES POSTERIORES YA ESCRITOS (cronológicamente FUTURO; la precuela NO debe contradecirlos):\n${input.previousVolumesContext}`
          : `\nCONTEXTO DE VOLUMENES ANTERIORES:\n${input.previousVolumesContext}`)
      : "";

    const worldBiblePreview = {
      characters: input.worldBible?.characters?.slice(0, 10) || [],
      worldRules: input.worldBible?.worldRules || [],
    };

    const prompt = `
SERIE: "${input.seriesTitle}"
${input.isPrequel
  ? `VOLUMEN: PRECUELA (Vol. 0) — PRIMER LIBRO CRONOLÓGICO de una serie planificada de ${input.totalVolumes} volúmenes principales. El lector seguirá leyendo Vol. 1+ a continuación.

ESTA NOVELA ES UNA PRECUELA. NO la juzgues con la rúbrica de "novela autoconclusiva cerrada"; júzgala como **el primer libro de una serie larga**. Arcos amplios, hilos de fondo y promesas a largo plazo PUEDEN quedar abiertos al final — eso es lo esperado, no un defecto de arco. Reglas específicas:
- Solo verifica los HITOS PENDIENTES listados abajo (que pertenecen al Vol. 0). Si la lista está vacía, no exijas hitos del Vol. 1+ como sustituto: pertenecen a libros POSTERIORES.
- Solo verifica progresión/cierre de los HILOS ARGUMENTALES listados abajo (los específicos de la precuela). Hilos planteados para libros posteriores NO se incluyen aquí y NO debes exigirlos.
- NO reportes "arco incompleto" ni "el manuscrito termina como un primer acto" porque queden abiertos hilos largos hacia Vol. 1+: están planificados para resolverse después.
- SÍ verifica que el ARCO PUNTUAL que la precuela elige plantear internamente tenga progresión sostenida y un punto de inflexión coherente. NO exijas más cierre del que el libro promete dentro de sí mismo.
- Usa el CONTEXTO DE VOLÚMENES POSTERIORES (si lo hay) para detectar CONTRADICCIONES (anacronismos respecto a libros posteriores, personajes con conocimientos/edad incompatible, lugares/reglas del mundo incoherentes). Estas sí son fallos del arco.`
  : `VOLUMEN: ${input.volumeNumber} de ${input.totalVolumes}`}
PROYECTO: "${input.projectTitle}"
${previousContext}

PERSONAJES Y REGLAS DEL MUNDO:
${JSON.stringify(worldBiblePreview, null, 2)}

═══════════════════════════════════════════════════════════════════
HITOS PENDIENTES DE VERIFICACIÓN PARA ESTE VOLUMEN:
═══════════════════════════════════════════════════════════════════
${milestonesText || "No hay hitos definidos para este volumen. El usuario debe definir hitos desde la guia de serie."}
${fulfilledText}

═══════════════════════════════════════════════════════════════════
HILOS ARGUMENTALES ACTIVOS:
═══════════════════════════════════════════════════════════════════
${threadsText}

═══════════════════════════════════════════════════════════════════
CONTENIDO REAL DE LOS CAPÍTULOS DEL VOLUMEN:
═══════════════════════════════════════════════════════════════════
${input.chaptersSummary}

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES DE VERIFICACIÓN:
═══════════════════════════════════════════════════════════════════
1. Tu tarea es verificar si los HITOS PENDIENTES arriba se cumplen en el CONTENIDO DE LOS CAPÍTULOS
2. Para cada hito pendiente, busca evidencia concreta en los capitulos proporcionados
3. Verifica si los hilos argumentales activos progresan o se resuelven
4. NO te quejes de datos faltantes en la timeline - solo verifica los hitos definidos explícitamente
5. Los hilos argumentales pueden pausarse en algunos volúmenes - esto NO es un error si no hay hilos definidos para este volumen
6. Basa tu verificación ÚNICAMENTE en los hitos y hilos listados arriba, NO en eventos de la timeline
7. HITOS MARCADOS COMO "YA CUMPLIDO": Devuelve isFulfilled: true para ellos SIN reevaluarlos. Ya fueron verificados previamente
8. HILOS CON STATUS "resolved": Devuelve currentStatus: "resolved". NO regreses su estado a "active" o "developing"
9. NUNCA regreses el estado de un hito o hilo a un estado inferior al que tiene actualmente

PUNTUACIÓN:
- 80-100: Todos los hitos requeridos cumplidos
- 60-79: Mayoría de hitos cumplidos, algunos menores faltan  
- 0-59: Hitos requeridos no cumplidos

IMPORTANTE: Responde UNICAMENTE con JSON valido siguiendo el formato especificado. Sin texto adicional.
`;

    console.log(`[ArcValidator] Starting verification for project "${input.projectTitle}" vol ${input.volumeNumber}`);
    console.log(`[ArcValidator] Milestones to check: ${milestonesForVolume.length}, Active threads: ${activeThreads.length}`);
    console.log(`[ArcValidator] Chapters summary length: ${input.chaptersSummary.length} chars`);

    const response = await this.generateContent(prompt);
    
    if (response.error) {
      console.error("[ArcValidator] AI generation error:", response.error);
      return {
        ...response,
        result: {
          overallScore: 0,
          passed: false,
          milestonesChecked: milestonesForVolume.length,
          milestonesFulfilled: 0,
          threadsProgressed: 0,
          threadsResolved: 0,
          milestoneVerifications: [],
          threadProgressions: [],
          findings: [`Error de IA: ${response.error}`],
          classifiedFindings: [],
          recommendations: "Reintenta la verificacion. Si el error persiste, contacta soporte.",
          arcHealthSummary: "Error en la verificacion automatica.",
        }
      };
    }

    console.log(`[ArcValidator] Raw response length: ${response.content.length}`);
    
    try {
      let cleanContent = response.content;
      cleanContent = cleanContent.replace(/```(?:json)?\s*/g, "").replace(/```\s*$/g, "");
      
      const result = repairJson(cleanContent) as ArcValidatorResult;
      result.classifiedFindings = this.classifyFindings(result.findings || [], result.recommendations || "");

      for (const fm of fulfilledMilestones) {
        const alreadyInResult = result.milestoneVerifications?.some(mv => mv.milestoneId === fm.id);
        if (!alreadyInResult) {
          result.milestoneVerifications = result.milestoneVerifications || [];
          result.milestoneVerifications.push({
            milestoneId: fm.id,
            description: fm.description,
            isFulfilled: true,
            verificationNotes: "Verificado previamente durante la generación del libro",
            confidence: 100,
          });
        }
      }

      result.milestoneVerifications?.forEach(mv => {
        const wasFulfilled = fulfilledMilestones.some(fm => fm.id === mv.milestoneId);
        if (wasFulfilled) mv.isFulfilled = true;
      });

      result.milestonesChecked = milestonesForVolume.length;
      result.milestonesFulfilled = result.milestoneVerifications?.filter(mv => mv.isFulfilled).length || 0;

      // Fix 12: SCORE Y PASSED DETERMINISTAS (no fiarse del LLM).
      // El LLM tiende a aprobar con 95/100 incluso cuando solo resolvió 1 de 4
      // hilos (caso real: novela "La Sal del Vino Amargo" — passed=true, 95/100,
      // pero 3 de 4 arcos quedaron abiertos). Recalculamos aquí basados en datos
      // observables: hitos requeridos cumplidos + hilos resueltos.
      const requiredMilestones = milestonesForVolume.filter(m => m.isRequired);
      const requiredFulfilled = result.milestoneVerifications?.filter(mv => {
        const mDef = milestonesForVolume.find(m => m.id === mv.milestoneId);
        return mv.isFulfilled && mDef?.isRequired;
      }).length || 0;
      const requiredRate = requiredMilestones.length > 0 ? requiredFulfilled / requiredMilestones.length : 1;

      const totalThreads = activeThreads.length;
      const resolvedThreads = result.threadProgressions?.filter(tp => tp.resolvedInVolume || tp.currentStatus === "resolved").length || 0;
      const progressedThreads = result.threadProgressions?.filter(tp => tp.progressedInVolume || tp.resolvedInVolume).length || 0;
      result.threadsResolved = resolvedThreads;
      result.threadsProgressed = progressedThreads;

      const isFinalVolume = input.volumeNumber >= input.totalVolumes;
      const threadResolutionRate = totalThreads > 0 ? resolvedThreads / totalThreads : 1;
      const threadProgressionRate = totalThreads > 0 ? progressedThreads / totalThreads : 1;

      // Importancia de los hilos: para volumen final, los hilos "main"/"alta"
      // DEBEN estar resueltos al 100%. Hilos secundarios pueden quedar abiertos
      // pero penalizan el score.
      const mainThreads = activeThreads.filter((t: any) => {
        const imp = String(t.importance || "").toLowerCase();
        return imp === "main" || imp === "alta" || imp === "high" || imp === "principal";
      });
      const mainResolvedCount = result.threadProgressions?.filter(tp => {
        const tDef = activeThreads.find((t: any) => t.id === tp.threadId);
        const imp = String((tDef as any)?.importance || "").toLowerCase();
        const isMain = imp === "main" || imp === "alta" || imp === "high" || imp === "principal";
        return isMain && (tp.resolvedInVolume || tp.currentStatus === "resolved");
      }).length || 0;
      const mainResolutionRate = mainThreads.length > 0 ? mainResolvedCount / mainThreads.length : 1;

      let computedScore: number;
      let computedPassed: boolean;
      const computedFindings: string[] = [];

      if (isFinalVolume) {
        // Volumen final / novela única: todo debe cerrarse.
        // Score = 50% required milestones + 30% main threads resolved + 20% all threads resolved.
        computedScore = Math.round(
          requiredRate * 50 +
          mainResolutionRate * 30 +
          threadResolutionRate * 20
        );
        // Passed solo si: 100% required milestones + 100% main threads resolved + >=80% all threads resolved.
        computedPassed = requiredRate >= 1 && mainResolutionRate >= 1 && threadResolutionRate >= 0.8;

        if (requiredRate < 1) {
          const missing = requiredMilestones.filter(m => !result.milestoneVerifications?.some(mv => mv.milestoneId === m.id && mv.isFulfilled));
          computedFindings.push(`${missing.length} hito(s) requerido(s) sin cumplir en el volumen final: ${missing.slice(0, 3).map(m => m.description.substring(0, 80)).join(" | ")}`);
        }
        if (mainResolutionRate < 1) {
          const unresolvedMain = mainThreads.filter((t: any) => {
            const tp = result.threadProgressions?.find(p => p.threadId === t.id);
            return !(tp?.resolvedInVolume || tp?.currentStatus === "resolved");
          });
          computedFindings.push(`${unresolvedMain.length} hilo(s) PRINCIPAL(es) sin resolver al cierre de la novela: ${unresolvedMain.slice(0, 3).map((t: any) => t.threadName).join(" | ")}`);
        }
        if (threadResolutionRate < 0.8 && totalThreads > 0) {
          const unresolved = result.threadProgressions?.filter(tp => !(tp.resolvedInVolume || tp.currentStatus === "resolved")) || [];
          computedFindings.push(`Solo ${resolvedThreads}/${totalThreads} hilos resueltos (${Math.round(threadResolutionRate * 100)}%). Quedan abiertos: ${unresolved.slice(0, 5).map(tp => tp.threadName).join(" | ")}`);
        }
      } else if (input.isPrequel) {
        // [Fix68] Precuela: NO exigimos progresión ni resolución de hilos —
        // los hilos de Vol. 1+ se filtran fuera; los específicos de Vol. 0
        // pueden o no resolverse. Score = 100% hitos requeridos (si los
        // hay); si no hay hitos ni hilos específicos de Vol. 0, se aprueba
        // por defecto porque la validez de la precuela depende del Beta/
        // Holístico/FR y de la coherencia inversa contra volúmenes
        // posteriores, no de la rúbrica de hitos.
        computedScore = milestonesForVolume.length > 0
          ? Math.round(requiredRate * 100)
          : 90;
        computedPassed = milestonesForVolume.length === 0 || requiredRate >= 1;
      } else {
        // Volumen intermedio: hilos pueden quedar abiertos. Solo exigimos hitos requeridos.
        // Score = 60% required milestones + 25% threads progressed + 15% threads resolved.
        computedScore = Math.round(
          requiredRate * 60 +
          threadProgressionRate * 25 +
          threadResolutionRate * 15
        );
        computedPassed = requiredRate >= 1 && threadProgressionRate >= 0.5;
      }

      // Aplicar override solo si difiere significativamente del LLM (evita
      // sobrescribir cuando el LLM ya está conservador).
      const llmScore = typeof result.overallScore === "number" ? result.overallScore : 50;
      const llmPassed = result.passed === true;
      if (llmScore - computedScore >= 15 || (llmPassed && !computedPassed)) {
        console.log(`[ArcValidator] Override determinista: LLM dijo ${llmScore}/${llmPassed ? "PASS" : "FAIL"}, calculado ${computedScore}/${computedPassed ? "PASS" : "FAIL"} (final=${isFinalVolume}, mainRes=${Math.round(mainResolutionRate*100)}%, allRes=${Math.round(threadResolutionRate*100)}%, reqMile=${Math.round(requiredRate*100)}%)`);
        result.overallScore = computedScore;
        result.passed = computedPassed;
        result.findings = [...(result.findings || []), ...computedFindings];
        // Re-clasificar hallazgos tras añadir los nuevos.
        result.classifiedFindings = this.classifyFindings(result.findings, result.recommendations || "");
      }

      console.log(`[ArcValidator] Successfully parsed result: score=${result.overallScore}, passed=${result.passed}, classifiedFindings=${result.classifiedFindings.length}`);
      return { ...response, result };
    } catch (e) {
      console.error("[ArcValidator] Failed to parse JSON response:", e);
      console.error("[ArcValidator] Content that failed to parse:", response.content.substring(0, 1000));
    }

    return { 
      ...response, 
      result: { 
        overallScore: 50,
        passed: false,
        milestonesChecked: milestonesForVolume.length,
        milestonesFulfilled: 0,
        threadsProgressed: 0,
        threadsResolved: 0,
        milestoneVerifications: milestonesForVolume.map(m => ({
          milestoneId: m.id,
          description: m.description,
          isFulfilled: m.isFulfilled || false,
          verificationNotes: m.isFulfilled ? "Verificado previamente" : "No se pudo analizar automaticamente",
          confidence: m.isFulfilled ? 100 : 0,
        })),
        threadProgressions: activeThreads.map(t => ({
          threadId: t.id,
          threadName: t.threadName,
          currentStatus: t.status as "active" | "developing" | "resolved" | "abandoned",
          progressedInVolume: false,
          resolvedInVolume: false,
          progressNotes: "No se pudo analizar automaticamente",
        })),
        findings: ["La IA no devolvio un formato JSON valido. Verifica los logs del servidor para mas detalles."],
        classifiedFindings: [],
        recommendations: "Reintenta la verificacion. Si el problema persiste, revisa que los capitulos tengan contenido narrativo claro.",
        arcHealthSummary: "Verificacion parcial - el analisis automatico fallo pero se listaron los elementos a verificar.",
      }
    };
  }

  private classifyFindings(findings: string[], recommendations: string): ClassifiedFinding[] {
    const classified: ClassifiedFinding[] = [];
    
    const structuralKeywords = [
      "reestructurar", "restructure", "mover", "move", "crear capítulo", "create chapter",
      "expandir", "expand", "desarrollar más", "develop more", "mostrar en lugar de",
      "show instead of", "relegado al epílogo", "relegated to epilogue", "clímax",
      "climax", "añadir escenas", "add scenes", "reescribir", "rewrite",
      "pacing", "ritmo narrativo", "estructura", "structure"
    ];
    
    const allText = [...findings, recommendations].join(" ").toLowerCase();
    
    for (const finding of findings) {
      const findingLower = finding.toLowerCase();
      const isStructural = structuralKeywords.some(kw => findingLower.includes(kw));
      
      const chapterMatches = finding.match(/cap[íi]tulo\s*(\d+)/gi) || 
                              finding.match(/chapter\s*(\d+)/gi) ||
                              finding.match(/ep[íi]logo/gi);
      const affectedChapters: number[] = [];
      if (chapterMatches) {
        for (const match of chapterMatches) {
          const numMatch = match.match(/\d+/);
          if (numMatch) affectedChapters.push(parseInt(numMatch[0]));
          if (match.toLowerCase().includes("epílogo") || match.toLowerCase().includes("epilogo")) {
            affectedChapters.push(-1);
          }
        }
      }
      
      classified.push({
        text: finding,
        type: isStructural ? "structural" : "cosmetic",
        affectedChapters: affectedChapters.length > 0 ? affectedChapters : undefined,
        severity: isStructural ? "high" : "medium",
      });
    }
    
    if (recommendations && structuralKeywords.some(kw => recommendations.toLowerCase().includes(kw))) {
      classified.push({
        text: recommendations,
        type: "structural",
        severity: "high",
      });
    }
    
    return classified;
  }
}
