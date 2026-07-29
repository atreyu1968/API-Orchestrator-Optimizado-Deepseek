/**
 * OccurrenceScannerAgent
 * ----------------------
 * Escanea múltiples capítulos en una sola llamada LLM para encontrar TODAS
 * las ocurrencias de un mismo problema, incluidas rephrasings y reformulaciones
 * del mismo concepto.
 *
 * Cuándo usarlo: intervenciones puntuales con capitulosAfectados.length > 1,
 * donde el mismo error puede aparecer con distintas fórmulas en distintos
 * capítulos o incluso en distintos párrafos del mismo capítulo.
 */

import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface OccurrenceMatch {
  chapterNumber: number;
  anchorText: string;        // Fragmento exacto del capítulo a reemplazar
  replacementText: string;   // Cómo debe quedar tras la corrección
  justification: string;     // Por qué es una ocurrencia del problema
}

export interface OccurrenceScanResult {
  matches: OccurrenceMatch[];
  not_found_reason?: string;
}

export interface ScanInput {
  problem: string;           // Descripción del problema a buscar
  chapters: Array<{
    chapterNumber: number;
    chapterTitle: string;
    content: string;
  }>;
}

const SYSTEM_PROMPT = `Eres el Escáner de Ocurrencias (ESO). Recibes una descripción de un problema narrativo/textual y el texto de uno o más capítulos. Tu misión: encontrar TODAS las ocurrencias del problema, incluyendo variantes, rephrasings y reformulaciones del mismo concepto.

REGLAS:
• Busca exhaustivamente — si el problema es "Kincaid presentado como culpable antes de tiempo", incluye TODAS las frases que lo den por culpable, aunque usen palabras distintas.
• Cada "anchorText" debe ser un fragmento LITERAL del capítulo (mínimo 15 caracteres, máximo 200).
• El "replacementText" es cómo debe quedar tras la corrección. Debe ser del mismo estilo y extensión aproximada.
• No inventes ocurrencias que no están en el texto.
• Si el problema genuinamente no aparece en ningún capítulo, indica not_found_reason.

FORMATO DE SALIDA — únicamente JSON válido:
{
  "matches": [
    {
      "chapterNumber": N,
      "anchorText": "texto literal exacto del capítulo",
      "replacementText": "cómo debe quedar",
      "justification": "por qué es una ocurrencia del problema (≤15 palabras)"
    }
  ],
  "not_found_reason": null
}`;

export class OccurrenceScannerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Escáner de Ocurrencias",
      role: "occurrence-scanner",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8000,
      maxOutputTokens: 8000,
    });
  }

  async scan(input: ScanInput): Promise<OccurrenceScanResult> {
    const chaptersBlock = input.chapters
      .map(c => `\n═══ CAPÍTULO ${c.chapterNumber}: "${c.chapterTitle}" ═══\n${c.content}\n`)
      .join("\n");

    const userPrompt = `PROBLEMA A BUSCAR:
${input.problem}

${chaptersBlock}

Encuentra TODAS las ocurrencias del problema en estos capítulos (incluye rephrasings y variantes). Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(userPrompt);

    try {
      const parsed = repairJson(response.content) as OccurrenceScanResult;
      return {
        matches: Array.isArray(parsed?.matches)
          ? parsed.matches.filter(m =>
              m.chapterNumber && m.anchorText?.length >= 10 && m.replacementText
            )
          : [],
        not_found_reason: parsed?.not_found_reason ?? undefined,
      };
    } catch {
      return { matches: [], not_found_reason: "Error al parsear respuesta del escáner" };
    }
  }
}
