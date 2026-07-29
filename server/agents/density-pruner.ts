/**
 * DensityPrunerAgent
 * ------------------
 * Poda un capítulo eliminando redundancias narrativas sin tocar información
 * argumental. El patrón objetivo a eliminar:
 *
 *   acontecimiento → explicación → interpretación → recordatorio →
 *   declaración de intención → frase de cierre épica
 *
 * Reducción objetivo: 12–18 % del texto. También reduce tics gestuales
 * repetidos (la lista de tics conocidos se pasa desde el runner para
 * coordinar entre capítulos).
 */

import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface PruneOperation {
  find_exact: string;
  replace_with: string; // "" = borrar
  justification: string;
}

export interface PruneResult {
  operations: PruneOperation[];
  estimatedReductionPct: number;
  not_applicable_reason?: string;
}

export interface DensityPrunerInput {
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  /** Tics gestuales ya vistos en capítulos anteriores → reducir apariciones */
  knownGesturalTics?: string[];
  /** Motivos/ideas ya explicados en capítulos previos → no re-explicar */
  alreadyEstablishedFacts?: string[];
}

const SYSTEM_PROMPT = `Eres el Agente de Densidad Narrativa (ADN). Tu único trabajo es PODAR redundancias en el texto de un capítulo ya escrito, sin alterar argumento, personajes ni información nueva.

OBJETIVO:
Reducir el capítulo entre un 12 % y un 18 % de su longitud actual eliminando loops explicativos. El lector inteligente ya procesó la información la primera vez.

PATRÓN A ELIMINAR — el "loop de sobreexplicación":
  ACONTECIMIENTO → reacción inmediata → (✂ explicación del acontecimiento) → (✂ interpretación psicológica) → (✂ recordatorio de la misión/pasado) → (✂ declaración de intención) → (✂ frase de cierre épica)
Dejar solo: ACONTECIMIENTO → reacción → decisión o acción.

TAMBIÉN PODAR:
- Tics gestuales repetidos (si ya aparecieron en caps anteriores, máx. 1 por capítulo).
- Frases de "peso" ya usadas antes: "la USB pesaba más de lo que debería", "algo frío subía por su interior", "la tormenta rugía fuera", etc.
- Cualquier párrafo que DIGA lo que el lector ya SABE.

PROHIBIDO:
- Tocar líneas de diálogo que aporten información nueva.
- Eliminar el único lugar donde se establece un hecho argumental.
- Cambiar nombres, lugares, objetos, motivaciones.
- Reescribir (solo find/replace o borrado — replace_with: "").

FORMATO DE SALIDA — únicamente JSON válido:
{
  "operations": [
    { "find_exact": "texto exacto a encontrar", "replace_with": "texto sustituto o vacío para borrar", "justification": "razón en ≤15 palabras" }
  ],
  "estimatedReductionPct": <número entre 12 y 18>,
  "not_applicable_reason": null
}

Si el capítulo ya es denso y no hay loops redundantes, devuelve:
{
  "operations": [],
  "estimatedReductionPct": 0,
  "not_applicable_reason": "El capítulo es denso; no hay loops redundantes que podar"
}`;

export class DensityPrunerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Agente de Densidad Narrativa",
      role: "density-pruner",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 6000,
      maxOutputTokens: 8192,
    });
  }

  async prune(input: DensityPrunerInput): Promise<PruneResult> {
    const ticBlock = input.knownGesturalTics?.length
      ? `\nTICS GESTUALES YA USADOS EN CAPÍTULOS ANTERIORES (máx. 1 aparición por tic en este cap):\n${input.knownGesturalTics.map(t => `• ${t}`).join("\n")}`
      : "";

    const factsBlock = input.alreadyEstablishedFacts?.length
      ? `\nHECHOS YA ESTABLECIDOS — no volver a explicar:\n${input.alreadyEstablishedFacts.map(f => `• ${f}`).join("\n")}`
      : "";

    const userPrompt = `CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"
${ticBlock}${factsBlock}
═══════════ TEXTO DEL CAPÍTULO ═══════════
${input.content}
══════════════════════════════════════════

Analiza el texto e identifica todos los loops de sobreexplicación y tics repetidos.
Devuelve las operaciones find/replace para lograr la poda del 12–18 %.
Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(userPrompt);
    try {
      const parsed = repairJson(response.content) as PruneResult;
      return {
        operations: Array.isArray(parsed?.operations) ? parsed.operations : [],
        estimatedReductionPct: parsed?.estimatedReductionPct ?? 0,
        not_applicable_reason: parsed?.not_applicable_reason ?? undefined,
      };
    } catch {
      return { operations: [], estimatedReductionPct: 0, not_applicable_reason: "Error al parsear respuesta del agente" };
    }
  }
}
