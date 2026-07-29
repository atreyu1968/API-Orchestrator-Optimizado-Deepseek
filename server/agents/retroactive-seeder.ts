/**
 * RetroactiveSeederAgent
 * ----------------------
 * Siembra semillas retroactivas en capítulos ya escritos.
 * Una "semilla" es un detalle pequeño (una frase, un gesto, una reacción
 * ligeramente extraña) que, al releer tras la revelación, hace al lector
 * pensar: "claro, estaba ahí todo el tiempo".
 *
 * Reglas duras:
 *  - No revelar el secreto. Nunca.
 *  - No cambiar escenas, relaciones, información existente.
 *  - Máximo 3 semillas por capítulo.
 *  - Cada semilla ≤ 3 frases.
 *  - Anclar a momentos concretos del texto (find_exact obligatorio).
 */

import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface SeedOperation {
  /** Texto exacto en el capítulo DESPUÉS del cual se inserta la semilla. */
  anchor_after: string;
  /** Texto a insertar (≤ 3 frases). */
  seed_text: string;
  justification: string;
}

export interface SeedResult {
  operations: SeedOperation[];
  not_applicable_reason?: string;
}

export interface RetroactiveSeedInput {
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  /** La revelación que se quiere preparar (sin spoilear). */
  revelation: string;
  /**
   * Lo que el lector ya sabe en este punto de la novela
   * (para no sembrar algo que ya se reveló).
   */
  readerKnowledgeAtThisPoint: string;
  /**
   * Semillas ya plantadas en capítulos anteriores para esta revelación,
   * para no repetir el mismo tipo de pista.
   */
  previousSeedsForThisRevelation?: string[];
}

const SYSTEM_PROMPT = `Eres el Agente de Siembra Retroactiva (ASR). Tu trabajo es añadir semillas sutiles en un capítulo ya escrito que preparen al lector para una revelación futura sin desvelarla.

Una buena semilla:
• Es un detalle pequeño y natural — un gesto, una elección de palabras, una reacción levemente incongruente.
• No llama la atención en primera lectura.
• Al releer después de la revelación, hace pensar "ah, claro, estaba ahí".
• Se ancla a un momento concreto del texto existente (no flota en el aire).

PROHIBIDO:
• Revelar el secreto o insinuarlo directamente.
• Cambiar diálogos, motivaciones, hechos establecidos.
• Añadir personajes o escenas nuevas.
• Más de 3 semillas por capítulo.
• Cada semilla > 3 frases.
• Repetir el tipo de pista ya usada en capítulos anteriores.

FORMATO DE SALIDA — únicamente JSON válido:
{
  "operations": [
    {
      "anchor_after": "texto exacto del capítulo después del cual se inserta la semilla",
      "seed_text": "texto de la semilla a insertar",
      "justification": "qué prepara esta semilla en ≤20 palabras"
    }
  ],
  "not_applicable_reason": null
}

Si el capítulo no ofrece anclajes naturales o la revelación ya está preparada de otra forma, devuelve:
{
  "operations": [],
  "not_applicable_reason": "razón breve"
}`;

export class RetroactiveSeederAgent extends BaseAgent {
  constructor() {
    super({
      name: "Agente de Siembra Retroactiva",
      role: "retroactive-seeder",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 6000,
      maxOutputTokens: 6000,
    });
  }

  async seed(input: RetroactiveSeedInput): Promise<SeedResult> {
    const prevSeedsBlock = input.previousSeedsForThisRevelation?.length
      ? `\nSEMILLAS YA PLANTADAS EN CAPÍTULOS ANTERIORES (no repetir el mismo tipo):\n${input.previousSeedsForThisRevelation.map(s => `• ${s}`).join("\n")}`
      : "";

    const userPrompt = `CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"

REVELACIÓN A PREPARAR (no revelar, solo preparar):
${input.revelation}

LO QUE EL LECTOR SABE EN ESTE PUNTO:
${input.readerKnowledgeAtThisPoint}
${prevSeedsBlock}

═══════════ TEXTO DEL CAPÍTULO ═══════════
${input.content}
══════════════════════════════════════════

Identifica hasta 3 momentos naturales del capítulo donde insertar una semilla sutil.
Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(userPrompt);
    try {
      const parsed = repairJson(response.content) as SeedResult;
      return {
        operations: Array.isArray(parsed?.operations) ? parsed.operations.slice(0, 3) : [],
        not_applicable_reason: parsed?.not_applicable_reason ?? undefined,
      };
    } catch {
      return { operations: [], not_applicable_reason: "Error al parsear respuesta del agente" };
    }
  }
}
