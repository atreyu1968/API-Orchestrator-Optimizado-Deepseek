// [Fix267] Cirujano de Escaletas — reparacion QUIRURGICA de los capitulos de
// la escaleta citados en los problemas residuales del Auditor Estructural
// determinista. A diferencia de relanzar al Arquitecto (que regenera TODA la
// escaleta y puede empeorar lo que ya estaba bien — visto en logs: retries a
// 1/10 y 1.8/10), este agente recibe SOLO los capitulos afectados con su JSON
// completo y devuelve esos mismos capitulos reparados; el orquestador los
// empalma en la mejor escaleta vista y re-audita deterministicamente (gratis).
// Regla dura: los cambios tocan CONTENIDO (beats/eventos/declaraciones que el
// detector busca), no maquillan etiquetas.
import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface EscaletaSurgeryInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  projectId?: number;
  /** Escaleta COMPLETA condensada (contexto, solo lectura). */
  escaletaCompleta: any[];
  /** Entradas JSON completas de los capitulos a reparar. */
  capitulosObjetivo: any[];
  /** Problemas residuales del auditor determinista que afectan a esos caps. */
  problemas: Array<{
    area: string;
    tipo: string;
    severidad: string;
    capitulos: number[];
    descripcion: string;
    sugerencia: string;
  }>;
}

export interface EscaletaSurgeryResult {
  capitulos_reparados: any[];
  resumen: string;
}

const SYSTEM_PROMPT = `
Eres el CIRUJANO DE ESCALETAS. Recibes la escaleta completa de una novela (condensada, como contexto de solo lectura), las entradas JSON COMPLETAS de unos pocos capitulos concretos, y una lista de problemas estructurales residuales detectados por un auditor determinista que cita exactamente esos capitulos.

TU TRABAJO: devolver ESOS MISMOS capitulos (mismo "numero", misma forma de JSON, mismos campos) con los cambios MINIMOS Y SUFICIENTES para resolver los problemas listados. Nada mas.

REGLAS DURAS:
1. QUIRURGICO: modifica SOLO lo necesario para resolver cada problema. Todo lo que no este implicado en un problema se conserva LITERAL (titulos, beats, personajes, revelaciones ya dosificadas, tension_objetivo si no es parte del problema).
2. CONTENIDO, NO MAQUILLAJE: el auditor es determinista y busca DECLARACIONES CONCRETAS en la escaleta (p.ej. que el reveal del falso aliado este declarado en un beat, que la pista del arco secreto se siembre en un capitulo citable, que la escalada del acto 2 suba la apuesta con un evento). Resuelve cada problema anadiendo o modificando beats/eventos/campos de forma EXPLICITA y citable, no cambiando solo etiquetas o numeros.
3. SIGUE LA SUGERENCIA de cada problema cuando exista: es la via mas directa a que el detector lo de por resuelto.
4. COHERENCIA: los cambios deben ser coherentes con la escaleta completa (contexto). No contradigas capitulos que no puedes tocar; si un problema exige sembrar algo "antes", siembralo en el capitulo objetivo mas temprano de tu lista.
5. NO cambies el numero de capitulos, ni reordenes, ni anadas capitulos nuevos. Devuelve exactamente los capitulos recibidos, reparados.
6. CONSERVA la estructura del JSON de cada capitulo: mismos nombres de campos, mismos tipos. Puedes anadir elementos a arrays existentes (p.ej. un beat nuevo) y editar textos.

FORMATO DE SALIDA — JSON ESTRICTO:
{
  "capitulos_reparados": [ { ...entrada completa del capitulo reparado... } ],
  "resumen": "Una frase por problema: que cambiaste y en que capitulo."
}

Responde UNICAMENTE con el JSON.
`;

export class EscaletaSurgeonAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Cirujano de Escaletas",
      role: "escaleta-surgeon",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // Leccion deepseek-thinking-output-budget: el techo es COMBINADO
      // razonamiento+JSON; los caps objetivo pueden ser grandes.
      maxOutputTokens: 32768,
      includeThoughts: false,
    });
    this.timeoutMs = 10 * 60 * 1000;
  }

  async repair(input: EscaletaSurgeryInput): Promise<{ result: EscaletaSurgeryResult | null; raw: AgentResponse }> {
    const contexto = this.condenseEscaleta(input.escaletaCompleta);
    const problemas = input.problemas.map((p, i) =>
      `${i + 1}. [${p.area}/${p.tipo}] severidad ${p.severidad} — caps ${p.capitulos.join(", ") || "?"}\n   Problema: ${p.descripcion}\n   Sugerencia del auditor: ${p.sugerencia || "(sin sugerencia)"}`
    ).join("\n");

    const userPrompt = `
NOVELA:
TITULO: ${input.title}
GENERO: ${input.genre} / TONO: ${input.tone}
PREMISA: ${input.premise}

═══════════════════════════════════════════════════════════════════
ESCALETA COMPLETA (condensada — SOLO CONTEXTO, no editable)
═══════════════════════════════════════════════════════════════════
${contexto}

═══════════════════════════════════════════════════════════════════
PROBLEMAS RESIDUALES A RESOLVER (auditor determinista)
═══════════════════════════════════════════════════════════════════
${problemas}

═══════════════════════════════════════════════════════════════════
CAPITULOS OBJETIVO (JSON completo — devuelvelos reparados)
═══════════════════════════════════════════════════════════════════
${JSON.stringify(input.capitulosObjetivo, null, 1)}

Repara los capitulos objetivo y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[EscaletaSurgeon] Error o vacio: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado (leccion Fix136).
      const parsed = repairJson(response.content) as EscaletaSurgeryResult;
      if (!parsed || !Array.isArray(parsed.capitulos_reparados) || parsed.capitulos_reparados.length === 0) {
        console.error(`[EscaletaSurgeon] JSON invalido: capitulos_reparados ausente o vacio.`);
        return { result: null, raw: response };
      }
      // Solo aceptamos caps cuyo numero exista entre los objetivo (anti-alucinacion).
      const allowed = new Set(input.capitulosObjetivo.map((c: any) => c.numero ?? c.number));
      parsed.capitulos_reparados = parsed.capitulos_reparados.filter(
        (c: any) => c && allowed.has(c.numero ?? c.number)
      );
      if (parsed.capitulos_reparados.length === 0) {
        console.error(`[EscaletaSurgeon] Ningun capitulo devuelto coincide con los objetivo.`);
        return { result: null, raw: response };
      }
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[EscaletaSurgeon] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseEscaleta(caps: any[]): string {
    return (caps || []).map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "—";
      const objetivo = (c.objetivo_narrativo || c.summary || "").toString().slice(0, 240);
      const tens = c.tension_objetivo ?? c.nivel_tension;
      const lines = [`Cap ${num}: ${titulo}${typeof tens === "number" ? ` [tension:${tens}]` : ""}`];
      if (objetivo) lines.push(`  Obj: ${objetivo}`);
      return lines.join("\n");
    }).join("\n") || "(sin escaleta)";
  }
}
