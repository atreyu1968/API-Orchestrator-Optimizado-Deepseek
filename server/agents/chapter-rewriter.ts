/**
 * ChapterRewriteAgent (ARE — Agente de Reescritura Estructural)
 * -------------------------------------------------------------
 * Reescribe un capítulo completo aplicando un cambio estructural.
 * A diferencia del pipeline de generación, ELIMINA explícitamente los
 * fragmentos contradictorios listados en `contradictionsToRemove` y produce
 * un capítulo coherente, no un parche sobre el anterior.
 *
 * Cuándo usarlo: intervenciones de tipo "estructural" en la Revisión Editorial
 * Externa, donde el LLM debe reconstruir la escena en lugar de añadir sobre ella.
 */

import { BaseAgent } from "./base-agent";

export interface ChapterRewriteInput {
  chapterNumber: number;
  chapterTitle: string;
  content: string;
  /** Qué debe lograr la reescritura. */
  instruction: string;
  /**
   * Fragmentos textuales del capítulo que son INCOMPATIBLES con la instrucción
   * y que DEBEN desaparecer del resultado. El agente no puede reformularlos
   * ni atenuarlos; debe eliminarlos y reconstruir la escena sin ellos.
   */
  contradictionsToRemove: string[];
  /** Contexto narrativo breve del proyecto (opcional). */
  projectContext?: string;
}

export interface ChapterRewriteResult {
  rewrittenContent: string;
  /** Resumen de qué cambió en ≤ 5 frases. */
  changeSummary: string;
}

const SYSTEM_PROMPT = `Eres el Agente de Reescritura Estructural (ARE). Recibes un capítulo ya escrito y una instrucción de cambio estructural que DEBES ejecutar de forma completa y coherente.

REGLAS ABSOLUTAS:
1. Elimina por completo los fragmentos listados en CONTRADICCIONES A ELIMINAR. No los reformules, no los atenúes, no los parafrasees: BÓRRALOs y reconstruye la escena sin ellos. Si un párrafo entero depende de una contradicción, reescribe el párrafo desde cero.
2. Aplica la instrucción en TODOS los lugares del capítulo donde sea relevante, no solo en el primer párrafo que menciones.
3. Mantén el estilo prosaico, el tono y la extensión aproximada del capítulo original.
4. Cambia únicamente lo que la instrucción pide. No inventes subtramas, personajes, giros ni contenido no solicitado.
5. El resultado debe ser un capítulo COHERENTE leído de principio a fin, no un palimpsesto de versiones.

FORMATO DE SALIDA:
Responde con este JSON exacto (sin markdown, sin preámbulos):
{
  "rewrittenContent": "texto completo del capítulo reescrito",
  "changeSummary": "resumen de qué cambió en ≤5 frases"
}`;

export class ChapterRewriteAgent extends BaseAgent {
  constructor() {
    super({
      name: "Agente de Reescritura Estructural",
      role: "chapter-rewriter",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 10000,
      maxOutputTokens: 16000,
    });
  }

  async rewrite(input: ChapterRewriteInput): Promise<ChapterRewriteResult> {
    const contradictionsBlock = input.contradictionsToRemove.length
      ? `\n═══ CONTRADICCIONES A ELIMINAR (obligatorio) ═══\n${input.contradictionsToRemove.map((c, i) => `[${i + 1}] "${c}"`).join("\n")}\n═══════════════════════════════════════════════\n`
      : "";

    const contextBlock = input.projectContext
      ? `\nCONTEXTO DEL PROYECTO:\n${input.projectContext}\n`
      : "";

    const userPrompt = `CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"
${contextBlock}
INSTRUCCIÓN DE REESCRITURA:
${input.instruction}
${contradictionsBlock}
═══ TEXTO ACTUAL DEL CAPÍTULO ═══
${input.content}
═════════════════════════════════

Reescribe el capítulo aplicando la instrucción y eliminando TODAS las contradicciones listadas. Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(userPrompt);

    // Intentar parsear JSON
    let parsed: any;
    try {
      // Buscar el bloque JSON en la respuesta
      const jsonMatch = response.content.match(/\{[\s\S]*"rewrittenContent"[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Si no hay JSON, tratar toda la respuesta como el contenido reescrito
        return {
          rewrittenContent: response.content.trim(),
          changeSummary: "Capítulo reescrito (sin resumen disponible)",
        };
      }
    } catch {
      // Fallback: usar la respuesta cruda como contenido
      return {
        rewrittenContent: response.content.trim(),
        changeSummary: "Capítulo reescrito (sin resumen disponible)",
      };
    }

    if (!parsed?.rewrittenContent || typeof parsed.rewrittenContent !== "string") {
      throw new Error("El agente de reescritura no devolvió contenido válido");
    }

    return {
      rewrittenContent: parsed.rewrittenContent,
      changeSummary: parsed.changeSummary || "",
    };
  }
}
