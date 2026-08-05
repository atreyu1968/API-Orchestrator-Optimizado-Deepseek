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

export type InterventionType = "puntual" | "densidad" | "siembra" | "estructural" | "fusionar" | "eliminar";
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
  /**
   * Para tipo "estructural": fragmentos literales del texto que son INCOMPATIBLES
   * con la instrucción y que el ChapterRewriteAgent debe eliminar por completo.
   * Si están vacíos, el agente solo aplica la instrucción sin eliminaciones explícitas.
   */

  contradictionsToRemove?: string[];

  /**
   * Para tipo "fusionar": número del capítulo que SOBREVIVE (absorbe al otro).
   * Si no se especifica, sobrevive el capítulo con número menor.
   */
  mergeIntoChapter?: number;

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
• "estructural": reescritura amplia de capítulo(s), cambio de muerte/clímax, inserción de escena nueva. Solo cuando la crítica lo pide explícitamente. Requiere identificar los fragmentos del texto original que contradicen la nueva versión (campo "contradictionsToRemove").
• "fusionar": FUSIONAR dos capítulos en uno solo (⚠️ DESTRUCTIVO — elimina un capítulo). Solo cuando la crítica pide explícitamente unir/fusionar/combinar dos capítulos concretos. capitulosAfectados debe tener EXACTAMENTE 2 números. mergeIntoChapter = número del capítulo superviviente (el otro se elimina).
• "eliminar": ELIMINAR un capítulo completo (⚠️ DESTRUCTIVO — el capítulo desaparece). Solo cuando la crítica pide explícitamente eliminar/borrar/suprimir un capítulo concreto. capitulosAfectados debe tener EXACTAMENTE 1 número.

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
- NUNCA uses "fusionar" o "eliminar" si la crítica solo pide REDUCIR, CONDENSAR o ACORTAR un capítulo — para eso usa "densidad" o "estructural".

CAMPO contradictionsToRemove (OBLIGATORIO para type="estructural"):
Para cada intervención estructural, identifica los fragmentos narrativos INCOMPATIBLES con la corrección. Son pasajes concretos del texto que deben DESAPARECER por completo (no reformularse). Expresa cada contradicción como una descripción del tipo de contenido a eliminar (no necesitas conocer el texto exacto: el agente de reescritura localizará los pasajes). Ejemplos:
- "Cualquier frase que afirme que Kincaid mató directamente a Linnea antes del capítulo 25"
- "El fragmento donde Sloane concluye en cap 2 que la señal es de Linnea sin investigación previa"
- "La referencia al 'Protocolo de Sellado Termonuclear' en el clímax"

FORMATO DE SALIDA — únicamente JSON válido:
{
  "overallSummary": "diagnóstico en 2-3 frases",
  "currentScore": "nota actual mencionada si la hay",
  "potentialScore": "nota potencial mencionada si la hay",
  "interventions": [
    {
      "id": "int-001",
      "type": "puntual|densidad|siembra|estructural|fusionar|eliminar",
      "titulo": "título corto (≤7 palabras)",
      "descripcion": "qué problema resuelve",
      "capitulosAfectados": [n, ...],
      "instruccion": "instrucción concreta para el agente ejecutor",
      "sembraRevelacion": "solo si type=siembra: la revelación a preparar",
      "sembraContextoLector": "solo si type=siembra: lo que el lector sabe en ese punto",
      "contradictionsToRemove": ["solo si type=estructural: descripción del contenido incompatible a eliminar", "..."],
      "mergeIntoChapter": "solo si type=fusionar: número del capítulo superviviente (el otro se elimina y renumera)",
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
            type: (["puntual", "densidad", "siembra", "estructural", "fusionar", "eliminar"].includes(i.type) ? i.type : "puntual") as InterventionType,
            titulo: i.titulo || `Intervención ${idx + 1}`,
            descripcion: i.descripcion || "",
            capitulosAfectados: Array.isArray(i.capitulosAfectados) ? i.capitulosAfectados.map(Number) : [],
            instruccion: i.instruccion || i.descripcion || "",
            sembraRevelacion: i.sembraRevelacion || undefined,
            sembraContextoLector: i.sembraContextoLector || undefined,
            contradictionsToRemove: Array.isArray(i.contradictionsToRemove) && i.contradictionsToRemove.length
              ? i.contradictionsToRemove.filter((c: unknown) => typeof c === "string" && c.length > 0)
              : undefined,
            mergeIntoChapter: typeof i.mergeIntoChapter === "number" ? i.mergeIntoChapter : undefined,
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
