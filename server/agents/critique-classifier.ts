/**
 * CritiqueClassifierAgent
 * -----------------------
 * Parsea una crítica externa de texto libre y devuelve un plan estructurado
 * de intervenciones clasificadas por tipo:
 *
 *  - puntual:     corrección localizada en capítulo(s) concretos (2–10 líneas).
 *  - densidad:    poda de redundancias en un rango de capítulos (12–18 %).
 *  - siembra:     añadir semillas retroactivas en caps tempranos.
 *  - estructural: reescritura amplia o cambio narrativo significativo.
 */

import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export type InterventionType = "puntual" | "densidad" | "siembra" | "estructural";
export type InterventionPriority = "alta" | "media" | "baja";
export type InterventionStatus = "pending" | "running" | "done" | "skipped" | "failed";

export interface ReviewIntervention {
  id: string;
  type: InterventionType;
  titulo: string;
  descripcion: string;
  capitulosAfectados: number[];
  instruccion: string;
  /** Para tipo "siembra": la revelación que se quiere preparar. */
  sembraRevelacion?: string;
  /** Para tipo "siembra": lo que el lector sabe en ese punto. */
  sembraContextoLector?: string;
  prioridad: InterventionPriority;
  status: InterventionStatus;
  completedAt?: string;
  errorMsg?: string;
}

export interface ExternalReviewPlan {
  critiqueText: string;
  parsedAt: string;
  overallSummary: string;
  currentScore?: string;
  potentialScore?: string;
  interventions: ReviewIntervention[];
}

interface ClassifierInput {
  critiqueText: string;
  chapterIndex: Array<{ numero: number; titulo: string }>;
  projectTitle: string;
}

const SYSTEM_PROMPT = `Eres el Clasificador de Crítica Editorial (CCE). Recibes una crítica literaria de texto libre y la conviertes en un plan de intervenciones estructuradas.

TIPOS DE INTERVENCIÓN:
• "puntual": corrección pequeña en ≤3 capítulos concretos. Ej: una incoherencia de continuidad, un detalle técnico incorrecto, frases de cierre repetidas en capítulos específicos.
• "densidad": poda de redundancias en un rango de capítulos. Ej: "los capítulos 11–19 se explican demasiado". CapitulosAfectados = el rango completo.
• "siembra": añadir semillas retroactivas en capítulos tempranos para preparar una revelación. Requiere definir "sembraRevelacion" y "sembraContextoLector".
• "estructural": reescritura amplia de capítulo(s), cambio de muerte/clímax, inserción de escena nueva. Solo cuando la crítica lo pide explícitamente.

PRIORIDADES:
• "alta": el crítico dice que ES FUNDAMENTAL corregirlo antes de publicar.
• "media": mejora importante pero la novela funciona sin ella.
• "baja": sugerencia opcional.

REGLAS:
- No inventar problemas que la crítica NO menciona.
- Una intervención por problema identificado (no dividir artificialmente).
- Si la crítica menciona una fortaleza o algo que NO debe tocarse, NO crear intervención.
- Las instrucciones deben ser accionables: ¿qué hace exactamente el agente?
- capitulosAfectados: array de números de capítulo. Usa -1 para prólogo, -2 para epílogo.

FORMATO DE SALIDA — únicamente JSON válido:
{
  "overallSummary": "diagnóstico en 2-3 frases",
  "currentScore": "nota actual mencionada si la hay",
  "potentialScore": "nota potencial mencionada si la hay",
  "interventions": [
    {
      "id": "int-001",
      "type": "puntual|densidad|siembra|estructural",
      "titulo": "título corto (≤7 palabras)",
      "descripcion": "qué problema resuelve",
      "capitulosAfectados": [n, ...],
      "instruccion": "instrucción concreta para el agente ejecutor",
      "sembraRevelacion": "solo si type=siembra: la revelación a preparar",
      "sembraContextoLector": "solo si type=siembra: lo que el lector sabe en ese punto",
      "prioridad": "alta|media|baja",
      "status": "pending"
    }
  ]
}`;

export class CritiqueClassifierAgent extends BaseAgent {
  constructor() {
    super({
      name: "Clasificador de Crítica Editorial",
      role: "critique-classifier",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8000,
      maxOutputTokens: 12000,
    });
  }

  async classify(input: ClassifierInput): Promise<Omit<ExternalReviewPlan, "critiqueText" | "parsedAt">> {
    const indexBlock = input.chapterIndex.map(c => `  Cap ${c.numero}: ${c.titulo}`).join("\n");

    const userPrompt = `NOVELA: "${input.projectTitle}"

ÍNDICE DE CAPÍTULOS:
${indexBlock}

═══════════ CRÍTICA EXTERNA ═══════════
${input.critiqueText}
═══════════════════════════════════════

Extrae todas las intervenciones accionables. Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(userPrompt);
    try {
      const parsed = repairJson(response.content) as any;
      const interventions: ReviewIntervention[] = Array.isArray(parsed?.interventions)
        ? parsed.interventions.map((i: any, idx: number) => ({
            id: i.id || `int-${String(idx + 1).padStart(3, "0")}`,
            type: (["puntual", "densidad", "siembra", "estructural"].includes(i.type) ? i.type : "puntual") as InterventionType,
            titulo: i.titulo || `Intervención ${idx + 1}`,
            descripcion: i.descripcion || "",
            capitulosAfectados: Array.isArray(i.capitulosAfectados) ? i.capitulosAfectados.map(Number) : [],
            instruccion: i.instruccion || i.descripcion || "",
            sembraRevelacion: i.sembraRevelacion || undefined,
            sembraContextoLector: i.sembraContextoLector || undefined,
            prioridad: (["alta", "media", "baja"].includes(i.prioridad) ? i.prioridad : "media") as InterventionPriority,
            status: "pending" as InterventionStatus,
          }))
        : [];

      return {
        overallSummary: parsed?.overallSummary || "",
        currentScore: parsed?.currentScore || undefined,
        potentialScore: parsed?.potentialScore || undefined,
        interventions,
      };
    } catch {
      return { overallSummary: "Error al parsear la crítica", interventions: [] };
    }
  }
}
