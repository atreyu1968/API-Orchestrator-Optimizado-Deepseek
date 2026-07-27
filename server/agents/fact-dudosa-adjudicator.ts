// [Fix273] Adjudicador de fichas DUDOSAS del Verificador de Datos.
// Problema de fondo (señalado por el usuario): las fichas "dudosas" esperaban
// decision HUMANA ("¿es un error o una decision deliberada de la historia?"),
// pero quien diseño la trama es el SISTEMA — el usuario nunca leyo la novela
// durante su creacion, asi que no tiene el criterio que se le pide. Este juez
// SI lo tiene: recibe el canon del proyecto (world bible, escaleta/plan de
// trama, decisiones de trama registradas) y adjudica cada dudosa:
//   - "deliberado": coherente con el canon o licencia narrativa -> descartar.
//   - "error": contradice el canon o un dato objetivo -> corregir (con texto).
// Sin bucle de re-verificacion despues (leccion reevaluation-treadmill).
import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface DudosaFicha {
  id: number;
  chapterLabel: string;
  afirmacion: string;
  categoria: string;
  explicacion: string;
  sugerencia: string;
}

export interface DudosaAdjudicationInput {
  title: string;
  genre: string;
  tone: string;
  projectId?: number;
  /** Canon condensado: world bible, plan de trama, decisiones de trama. */
  canon: string;
  fichas: DudosaFicha[];
}

export interface DudosaDecision {
  id: number;
  decision: "deliberado" | "error";
  /** Correccion concreta si decision === "error" (texto de reemplazo/ajuste). */
  correccion?: string;
  motivo: string;
}

const SYSTEM_PROMPT = `
Eres el ADJUDICADOR DE DUDOSAS. El Verificador de Datos de una novela marco unas afirmaciones como "dudosas": no sabe si son un ERROR o una DECISION DELIBERADA de la historia. Tu tienes lo que a el le falto: el CANON del proyecto (world bible, plan de trama, decisiones de trama registradas).

PARA CADA FICHA decide:
- "deliberado": la afirmacion es coherente con el canon, o es una licencia narrativa legitima (retcon intencionado, alias, ciencia ficticia interna del mundo, exageracion de un personaje EN SU VOZ, etc.). La prosa NO se toca.
- "error": la afirmacion contradice el canon, la continuidad interna, o un dato objetivo del mundo real que la novela presenta como cierto (no en boca de un personaje poco fiable). Da una "correccion" CONCRETA y minima (que texto debe decir).

REGLAS DURAS:
1. ANTE LA DUDA, "deliberado": tocar prosa sin certeza es peor que dejar una ambiguedad. Solo marca "error" si puedes CITAR que parte del canon o que dato objetivo contradice la afirmacion (hazlo en "motivo").
2. Un dato en boca de un personaje (dialogo/pensamiento) puede ser mentira o error DEL PERSONAJE a proposito: eso es "deliberado" salvo que el canon muestre que el narrador lo valida como cierto.
3. La "correccion" debe ser minima y quirurgica: el dato corregido, no una reescritura de la escena.
4. Devuelve TODAS las fichas recibidas, cada una con su "id" original.

FORMATO DE SALIDA — JSON ESTRICTO:
{
  "decisiones": [
    { "id": 1, "decision": "deliberado", "motivo": "..." },
    { "id": 2, "decision": "error", "correccion": "...", "motivo": "..." }
  ]
}

Responde UNICAMENTE con el JSON.
`;

export class FactDudosaAdjudicatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Adjudicador de Dudosas",
      role: "fact-dudosa-adjudicator",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // Leccion deepseek-thinking-output-budget: techo COMBINADO razonamiento
      // + JSON; con canon grande y lotes de fichas, minimo 16384.
      maxOutputTokens: 16384,
      includeThoughts: false,
    });
    this.timeoutMs = 8 * 60 * 1000;
  }

  async adjudicate(input: DudosaAdjudicationInput): Promise<{ result: DudosaDecision[] | null; raw: AgentResponse }> {
    const fichas = input.fichas.map((f) =>
      `ID ${f.id} — ${f.chapterLabel} [${f.categoria}]\n  Afirmacion: ${f.afirmacion}\n  Duda del verificador: ${f.explicacion || "(sin detalle)"}${f.sugerencia ? `\n  Sugerencia previa: ${f.sugerencia}` : ""}`
    ).join("\n\n");

    const userPrompt = `
NOVELA: ${input.title} (${input.genre} / ${input.tone})

═══════════════════════════════════════════════════════════════════
CANON DEL PROYECTO (world bible, plan de trama, decisiones de trama)
═══════════════════════════════════════════════════════════════════
${input.canon}

═══════════════════════════════════════════════════════════════════
FICHAS DUDOSAS A ADJUDICAR (${input.fichas.length})
═══════════════════════════════════════════════════════════════════
${fichas}

Adjudica cada ficha y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[DudosaAdjudicator] Error o vacio: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }
    try {
      // repairJson ya devuelve el objeto parseado (leccion Fix136).
      const parsed = repairJson(response.content) as { decisiones?: DudosaDecision[] };
      if (!parsed || !Array.isArray(parsed.decisiones)) {
        console.error(`[DudosaAdjudicator] JSON invalido: "decisiones" ausente.`);
        return { result: null, raw: response };
      }
      const validIds = new Set(input.fichas.map((f) => f.id));
      const decisiones = parsed.decisiones.filter(
        (d) => d && validIds.has(d.id) && (d.decision === "deliberado" || d.decision === "error"),
      );
      return { result: decisiones, raw: response };
    } catch (error) {
      console.error(`[DudosaAdjudicator] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
