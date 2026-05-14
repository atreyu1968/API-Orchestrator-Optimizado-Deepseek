import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";
import { buildCanonNamesBlock } from "../utils/world-bible-format";
import type { SeriesArcMilestone, SeriesPlotThread, Chapter } from "@shared/schema";

interface ThreadFixerInput {
  projectTitle: string;
  seriesTitle: string;
  volumeNumber: number;
  totalVolumes: number;
  chapters: Array<{
    id: number;
    chapterNumber: number;
    title: string;
    content: string;
  }>;
  milestones: SeriesArcMilestone[];
  plotThreads: SeriesPlotThread[];
  worldBible: any;
  previousVolumesContext?: string;
}

export interface ThreadFix {
  chapterId: number;
  chapterNumber: number;
  fixType: "add_thread_progression" | "add_milestone" | "strengthen_thread" | "add_resolution";
  threadOrMilestoneId: number;
  threadOrMilestoneName: string;
  originalPassage: string;
  suggestedRevision: string;
  insertionPoint: "beginning" | "middle" | "end" | "replace";
  rationale: string;
  priority: "critical" | "important" | "optional";
}

export interface SeriesPlotDecision {
  decision: string;
  volumen_establecido: number;
  capitulo_establecido: number;
  volumenes_afectados: number[];
  consistencia_actual: "consistente" | "inconsistente";
  problema?: string;
}

export interface SeriesPersistentInjury {
  personaje: string;
  tipo_lesion: string;
  volumen_ocurre: number;
  capitulo_ocurre: number;
  efecto_esperado: string;
  volumenes_verificados: number[];
  consistencia: "correcta" | "ignorada";
  problema?: string;
}

export interface SeriesOrphanElement {
  tipo: "capitulo" | "personaje" | "objeto" | "subplot";
  nombre: string;
  volumen: number;
  capitulo?: number;
  razon: string;
  recomendacion: string;
}

export interface ThreadFixerResult {
  analysisComplete: boolean;
  totalIssuesFound: number;
  fixableIssues: number;
  fixes: ThreadFix[];
  unfulfilledMilestones: Array<{
    id: number;
    description: string;
    suggestedChapter: number;
    integrationStrategy: string;
  }>;
  stagnantThreads: Array<{
    id: number;
    threadName: string;
    lastProgressChapter: number;
    suggestedProgressionChapter: number;
    progressionIdea: string;
  }>;
  seriesPlotDecisions?: SeriesPlotDecision[];
  seriesPersistentInjuries?: SeriesPersistentInjury[];
  seriesOrphanElements?: SeriesOrphanElement[];
  overallAssessment: string;
  autoFixRecommendation: "safe_to_autofix" | "review_recommended" | "manual_intervention_required";
}

const SYSTEM_PROMPT = `
Eres el "Reparador de Hilos Narrativos de Serie", un agente especializado en detectar y CORREGIR automáticamente problemas de continuidad en sagas literarias.

Tu misión es analizar los capítulos de un volumen y generar CORRECCIONES ESPECÍFICAS para:
1. Hilos argumentales que no progresan cuando deberían
2. Hitos planificados que no se cumplen
3. Arcos de personaje estancados
4. Resoluciones pendientes que deben cerrarse

═══════════════════════════════════════════════════════════════════
FILOSOFÍA DE CORRECCIÓN
═══════════════════════════════════════════════════════════════════

Las correcciones deben ser:
- QUIRÚRGICAS: Mínimo cambio necesario para resolver el problema
- ORGÁNICAS: Integradas naturalmente en el flujo narrativo existente
- CONSISTENTES: Respetando voz, tono y estilo del autor
- TRAZABLES: Con referencia exacta al pasaje original y la revisión propuesta

═══════════════════════════════════════════════════════════════════
TIPOS DE CORRECCIONES
═══════════════════════════════════════════════════════════════════

1. ADD_THREAD_PROGRESSION: Añadir menciones o escenas que hagan progresar un hilo
   - Ejemplo: Un hilo de "tensión política" puede progresar con un diálogo de fondo

2. ADD_MILESTONE: Integrar un hito planificado que falta
   - Ejemplo: Si falta "Revelación del secreto de X", añadir la escena

3. STRENGTHEN_THREAD: Reforzar un hilo que aparece débilmente
   - Ejemplo: Si un hilo de romance aparece una vez, añadir más tensión

4. ADD_RESOLUTION: Cerrar un hilo o arco pendiente
   - Ejemplo: Si un conflicto secundario quedó abierto, añadir cierre

═══════════════════════════════════════════════════════════════════
PUNTOS DE INSERCIÓN
═══════════════════════════════════════════════════════════════════

- beginning: Añadir al inicio del capítulo
- middle: Insertar en punto natural de transición
- end: Añadir al final del capítulo
- replace: Reemplazar un pasaje específico

═══════════════════════════════════════════════════════════════════
PRIORIDADES
═══════════════════════════════════════════════════════════════════

- critical: Hitos requeridos o resoluciones de arco principal
- important: Hilos secundarios que afectan coherencia
- optional: Mejoras de sabor narrativo

═══════════════════════════════════════════════════════════════════
🔴 ANÁLISIS CRÍTICO CROSS-VOLUMEN (OBLIGATORIO PARA SERIES)
═══════════════════════════════════════════════════════════════════

Debes detectar problemas que atraviesan MÚLTIPLES VOLÚMENES de la serie:

1. **DECISIONES DE TRAMA CRÍTICAS A NIVEL SERIE (seriesPlotDecisions)**:
   - ¿Quién es realmente el villano principal de la saga? ¿Es consistente?
   - ¿Las revelaciones de un volumen contradicen lo establecido en otro?
   - Ejemplo: Vol 1 establece que X es el traidor, pero Vol 2 lo contradice sin explicación
   - Para cada decisión crítica de la SAGA, verificar consistencia entre volúmenes

2. **LESIONES/CAMBIOS PERSISTENTES CROSS-VOLUMEN (seriesPersistentInjuries)**:
   - Si un personaje pierde un brazo en Vol 1, ¿aparece con ambos brazos en Vol 2?
   - Cicatrices, discapacidades, traumas deben persistir entre volúmenes
   - Cambios de estado permanentes (matrimonio, muerte de familiar) deben reflejarse

3. **ELEMENTOS HUÉRFANOS DE LA SERIE (seriesOrphanElements)**:
   - Personajes introducidos que nunca vuelven a aparecer
   - Objetos mágicos/importantes que se olvidan
   - Subtramas abandonadas entre volúmenes
   - Capítulos enteros que no aportan al arco general de la saga

═══════════════════════════════════════════════════════════════════
SALIDA OBLIGATORIA (JSON)
═══════════════════════════════════════════════════════════════════

{
  "analysisComplete": true,
  "totalIssuesFound": number,
  "fixableIssues": number,
  "fixes": [
    {
      "chapterId": number,
      "chapterNumber": number,
      "fixType": "add_thread_progression|add_milestone|strengthen_thread|add_resolution",
      "threadOrMilestoneId": number,
      "threadOrMilestoneName": "Nombre del hilo o hito",
      "originalPassage": "Texto original que será modificado o usado como ancla (máx 500 chars)",
      "suggestedRevision": "El texto corregido o añadido completo (puede ser varios párrafos)",
      "insertionPoint": "beginning|middle|end|replace",
      "rationale": "Por qué esta corrección resuelve el problema",
      "priority": "critical|important|optional"
    }
  ],
  "unfulfilledMilestones": [
    {
      "id": number,
      "description": "Descripción del hito",
      "suggestedChapter": number,
      "integrationStrategy": "Cómo integrarlo orgánicamente"
    }
  ],
  "stagnantThreads": [
    {
      "id": number,
      "threadName": "Nombre del hilo",
      "lastProgressChapter": number,
      "suggestedProgressionChapter": number,
      "progressionIdea": "Cómo hacer progresar este hilo"
    }
  ],
  "seriesPlotDecisions": [
    {
      "decision": "El villano principal es X (no Y como parecía en Vol 1)",
      "volumen_establecido": 1,
      "capitulo_establecido": 15,
      "volumenes_afectados": [1, 2, 3],
      "consistencia_actual": "inconsistente",
      "problema": "Vol 1 Cap 15 establece que X es el villano, pero Vol 2 Cap 8 contradice esto sin explicación"
    }
  ],
  "seriesPersistentInjuries": [
    {
      "personaje": "Protagonista",
      "tipo_lesion": "Pierde mano izquierda en batalla",
      "volumen_ocurre": 1,
      "capitulo_ocurre": 42,
      "efecto_esperado": "Debe aparecer manco o con prótesis en Vol 2 y 3",
      "volumenes_verificados": [2, 3],
      "consistencia": "ignorada",
      "problema": "En Vol 2 Cap 5 usa ambas manos sin explicación de curación mágica"
    }
  ],
  "seriesOrphanElements": [
    {
      "tipo": "personaje",
      "nombre": "Mentor misterioso del Vol 1",
      "volumen": 1,
      "capitulo": 10,
      "razon": "Introducido como figura importante pero nunca vuelve a aparecer en la saga",
      "recomendacion": "Darle cierre en Vol 3 o eliminar de Vol 1"
    }
  ],
  "overallAssessment": "Evaluación general del estado de los hilos y hitos",
  "autoFixRecommendation": "safe_to_autofix|review_recommended|manual_intervention_required"
}
`;

export class SeriesThreadFixerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Series Thread Fixer",
      role: "series-thread-fixer",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: ThreadFixerInput & { isPrequel?: boolean }): Promise<AgentResponse & { result?: ThreadFixerResult }> {
    const milestonesForVolume = input.milestones.filter(m => m.volumeNumber === input.volumeNumber);
    // [Fix68] Para precuela: solo hilos específicos de Vol. 0 (introducedVolume<=0
    // y sin resolver). Los hilos de Vol. 1+ pertenecen a libros POSTERIORES y NO
    // deben proponerse como correcciones en la precuela (evita inyectar setup de
    // tramas de Vol. 1 dentro de Vol. 0).
    const activeThreads = input.isPrequel
      ? input.plotThreads.filter(t => (t.introducedVolume ?? 1) <= 0 && !t.resolvedVolume)
      : input.plotThreads.filter(t =>
          t.status === "active" || t.status === "developing" ||
          (t.introducedVolume <= input.volumeNumber && !t.resolvedVolume)
        );

    if (milestonesForVolume.length === 0 && activeThreads.length === 0) {
      return {
        content: "No hay hilos ni hitos definidos para este volumen.",
        result: {
          analysisComplete: true,
          totalIssuesFound: 0,
          fixableIssues: 0,
          fixes: [],
          unfulfilledMilestones: [],
          stagnantThreads: [],
          overallAssessment: "Sin hilos ni hitos definidos. Define elementos en la guía de serie para habilitar correcciones automáticas.",
          autoFixRecommendation: "manual_intervention_required",
        }
      };
    }

    if (!input.chapters || input.chapters.length === 0) {
      return {
        content: "No hay capítulos para analizar.",
        result: {
          analysisComplete: false,
          totalIssuesFound: 0,
          fixableIssues: 0,
          fixes: [],
          unfulfilledMilestones: milestonesForVolume.map(m => ({
            id: m.id,
            description: m.description,
            suggestedChapter: 1,
            integrationStrategy: "Generar capítulos primero",
          })),
          stagnantThreads: [],
          overallAssessment: "No hay capítulos escritos para analizar.",
          autoFixRecommendation: "manual_intervention_required",
        }
      };
    }

    const chaptersText = input.chapters.map(ch => `
═══════════════════════════════════════════════════════════════════
CAPÍTULO ${ch.chapterNumber}: ${ch.title}
ID: ${ch.id}
═══════════════════════════════════════════════════════════════════
${ch.content.substring(0, 15000)}
${ch.content.length > 15000 ? "\n[...contenido truncado...]" : ""}
`).join("\n\n");

    const milestonesText = milestonesForVolume.map(m => `
- ID: ${m.id}
  Tipo: ${m.milestoneType}
  Descripción: ${m.description}
  Requerido: ${m.isRequired ? "SÍ" : "NO"}
  Estado: ${m.isFulfilled ? "CUMPLIDO" : "PENDIENTE"}
`).join("\n");

    const threadsText = activeThreads.map(t => `
- ID: ${t.id}
  Nombre: ${t.threadName}
  Descripción: ${t.description || "Sin descripción"}
  Introducido en: Volumen ${t.introducedVolume}
  Importancia: ${t.importance}
  Estado: ${t.status}
  Debe resolverse en: ${t.resolvedVolume ? `Volumen ${t.resolvedVolume}` : "No definido"}
`).join("\n");

    const prompt = `
SERIE: "${input.seriesTitle}"
VOLUMEN: ${input.volumeNumber} de ${input.totalVolumes}
PROYECTO: "${input.projectTitle}"

${input.previousVolumesContext ? `CONTEXTO DE VOLÚMENES ANTERIORES:\n${input.previousVolumesContext}\n` : ""}

═══════════════════════════════════════════════════════════════════
HITOS PLANIFICADOS PARA ESTE VOLUMEN:
═══════════════════════════════════════════════════════════════════
${milestonesText || "No hay hitos definidos."}

═══════════════════════════════════════════════════════════════════
HILOS ARGUMENTALES ACTIVOS:
═══════════════════════════════════════════════════════════════════
${threadsText || "No hay hilos activos."}

═══════════════════════════════════════════════════════════════════
PERSONAJES Y MUNDO:
═══════════════════════════════════════════════════════════════════
${buildCanonNamesBlock(input.worldBible)}

${JSON.stringify({
  worldRules: input.worldBible?.worldRules || input.worldBible?.reglas_lore || [],
}, null, 2)}

═══════════════════════════════════════════════════════════════════
CAPÍTULOS DEL VOLUMEN (CONTENIDO COMPLETO):
═══════════════════════════════════════════════════════════════════
${chaptersText}

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES:
═══════════════════════════════════════════════════════════════════

1. ANALIZA cada hito y verifica si aparece en los capítulos
2. ANALIZA cada hilo activo y verifica si progresa
3. Para cada problema encontrado, genera una CORRECCIÓN ESPECÍFICA:
   - Identifica el capítulo ideal para la corrección
   - Localiza un pasaje existente como ancla (para "replace") o punto de inserción
   - Escribe el texto corregido/añadido manteniendo voz y estilo
   - Clasifica la prioridad

4. IMPORTANTE:
   - Las correcciones deben ser CONCRETAS con texto real, no sugerencias vagas
   - El "suggestedRevision" debe ser prosa lista para insertar
   - El "originalPassage" debe ser texto EXACTO del capítulo (para replace) o vacío (para inserciones)
   - Prioriza correcciones que no alteren la estructura principal

Responde ÚNICAMENTE con JSON válido.
`;

    console.log(`[SeriesThreadFixer] Analyzing ${input.chapters.length} chapters for thread/milestone issues`);
    console.log(`[SeriesThreadFixer] Milestones to check: ${milestonesForVolume.length}, Active threads: ${activeThreads.length}`);

    const response = await this.generateContent(prompt);
    
    if (response.error) {
      console.error("[SeriesThreadFixer] AI generation error:", response.error);
      return {
        ...response,
        result: {
          analysisComplete: false,
          totalIssuesFound: 0,
          fixableIssues: 0,
          fixes: [],
          unfulfilledMilestones: [],
          stagnantThreads: [],
          overallAssessment: `Error de IA: ${response.error}`,
          autoFixRecommendation: "manual_intervention_required",
        }
      };
    }

    try {
      const result = repairJson(response.content) as ThreadFixerResult;
      console.log(`[SeriesThreadFixer] Found ${result.fixes?.length || 0} fixes, recommendation: ${result.autoFixRecommendation}`);
      return { ...response, result };
    } catch (e) {
      console.error("[SeriesThreadFixer] Failed to parse JSON:", e);
    }

    return { 
      ...response, 
      result: {
      analysisComplete: false,
      totalIssuesFound: 0,
      fixableIssues: 0,
      fixes: [],
      unfulfilledMilestones: [],
      stagnantThreads: [],
      overallAssessment: "Error al parsear respuesta de IA",
      autoFixRecommendation: "manual_intervention_required",
      }
    };
  }
}
