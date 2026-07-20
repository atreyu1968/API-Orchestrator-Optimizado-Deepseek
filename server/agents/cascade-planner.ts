import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// [Fix229] PLANIFICADOR DE CASCADA. Cuando una correccion pide un cambio de
// TRAMA en un capitulo (p.ej. "que los protagonistas escapen de la emboscada")
// que es incompatible con el canon de capitulos POSTERIORES ya escritos (p.ej.
// el cap siguiente arranca con un personaje capturado), ni la cirugia local ni
// la reescritura completa de ESE capitulo pueden resolverlo: o no aplican el
// cambio o dejan una contradiccion dura en la costura. Este juez expande la
// instruccion al conjunto MINIMO de capitulos afectados (el actual + hasta 2
// posteriores) y produce una instruccion autocontenida por capitulo, coherente
// con el nuevo desenlace, para ejecutarlas EN ORDEN.
// ───────────────────────────────────────────────────────────────────

export interface CascadePlannerInput {
  title: string;
  genre: string;
  tone?: string;
  instruction: string;
  surgeonReason: string;
  currentChapter: { numero: number; titulo: string; texto: string };
  nextChapters: Array<{ numero: number; titulo: string; texto: string }>;
  seriesContext?: string;
  projectId?: number;
}

export interface CascadePlannerResult {
  viable: boolean;
  motivo: string;
  pasos: Array<{ capitulo: number; instruccion: string }>;
}

const SYSTEM_PROMPT = `
Eres el PLANIFICADOR DE CASCADA de una editorial. Recibes una instrucción editorial que pide un cambio de TRAMA en un capítulo concreto, pero ese cambio es incompatible con lo que ya está escrito en capítulos posteriores (el cirujano de texto la rechazó por ese motivo). Tu trabajo es decidir si el cambio puede ejecutarse como una REVISIÓN COORDINADA del conjunto mínimo de capítulos afectados, y si es así, producir el plan.

QUÉ DEBES DECIDIR:
1. ¿El cambio pedido puede quedar completamente resuelto reescribiendo SOLO el capítulo origen y los capítulos posteriores que se te muestran (los que tienes en el contexto)? Si la onda expansiva llega más lejos (capítulos que no ves, cambios de estructura del manuscrito, personajes cuyo arco entero dejaría de tener sentido), el plan NO es viable.
2. Si es viable: divide el cambio en una instrucción POR CAPÍTULO, en orden ascendente, empezando por el capítulo origen.

REGLAS DEL PLAN:
- Máximo 3 capítulos en total (el origen + hasta 2 posteriores). Si haría falta tocar más, NO es viable.
- El primer paso es SIEMPRE el capítulo origen con el cambio de trama pedido.
- Cada instrucción debe ser AUTOCONTENIDA y ACCIONABLE: qué debe cambiar en ESE capítulo, qué debe conservarse (tramas secundarias, canon no afectado, voz, extensión aproximada), y cuál es el NUEVO desenlace que sustituye al canon anterior. Quien la ejecute no verá esta conversación ni los otros pasos.
- Los pasos posteriores deben ADAPTAR su capítulo al nuevo canon (p.ej. si ahora los protagonistas escapan, el capítulo siguiente ya no puede arrancar con la captura: decide qué lo sustituye de forma coherente con el resto del capítulo y di exactamente qué escenas/beats cambian y cuáles se conservan).
- PROHIBIDO proponer fusionar, dividir, eliminar o reordenar capítulos: solo reescritura de prosa dentro de cada capítulo.
- Si se te da contexto de serie, sus hitos, hilos y canon de otros volúmenes son INVIOLABLES: si el cambio pedido los contradice, NO es viable (explícalo en "motivo").
- Sé honesto en la viabilidad: un plan a medias deja la novela PEOR que no tocar nada.

Responde ÚNICAMENTE con un JSON válido con esta forma exacta:
{
  "viable": true | false,
  "motivo": "<1-3 frases: por qué es viable (alcance del impacto) o por qué no>",
  "pasos": [
    { "capitulo": <número>, "instruccion": "<instrucción autocontenida para ese capítulo>" }
  ]
}
Si "viable" es false, "pasos" debe ser []. Responde ÚNICAMENTE con el JSON.
`;

export class CascadePlannerAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Planificador de Cascada",
      role: "cascade-planner",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // [Fix229] Techo COMBINADO razonamiento+contenido (leccion Fix155/Fix156):
      // con thinking y entrada grande, un techo bajo devuelve JSON vacio/cortado.
      maxOutputTokens: 16384,
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async plan(input: CascadePlannerInput): Promise<{ result: CascadePlannerResult | null; raw: AgentResponse }> {
    const nextBlock = input.nextChapters
      .map(c => `=== CAPÍTULO ${c.numero}: ${c.titulo} ===\n${c.texto}`)
      .join("\n\n");

    const userPrompt = `
NOVELA: ${input.title}
GÉNERO: ${input.genre}${input.tone ? `\nTONO: ${input.tone}` : ""}
${input.seriesContext ? `\nCONTEXTO DE SERIE (INVIOLABLE):\n${input.seriesContext.slice(0, 8000)}\n` : ""}
INSTRUCCIÓN EDITORIAL ORIGINAL (el cambio de trama pedido, dirigido al capítulo ${input.currentChapter.numero}):
${input.instruction.slice(0, 4000)}

POR QUÉ LA RECHAZÓ EL CIRUJANO (diagnóstico de incompatibilidad):
${input.surgeonReason.slice(0, 2000)}

=== CAPÍTULO ORIGEN ${input.currentChapter.numero}: ${input.currentChapter.titulo} ===
${input.currentChapter.texto}

CAPÍTULOS POSTERIORES DISPONIBLES (los únicos que puedes incluir en la cascada):
${nextBlock}

Decide la viabilidad y, si procede, el plan por capítulo. Devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[CascadePlanner] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as CascadePlannerResult;
      if (!parsed || typeof parsed.viable !== "boolean") {
        console.error(`[CascadePlanner] JSON invalido: falta "viable".`);
        return { result: null, raw: response };
      }
      const allowed = new Set([input.currentChapter.numero, ...input.nextChapters.map(c => c.numero)]);
      parsed.motivo = String(parsed.motivo || "");
      parsed.pasos = (Array.isArray(parsed.pasos) ? parsed.pasos : [])
        .filter(p => p && Number.isFinite(Number(p.capitulo)) && String(p.instruccion || "").trim().length >= 20)
        .map(p => ({ capitulo: Number(p.capitulo), instruccion: String(p.instruccion) }))
        .filter(p => allowed.has(p.capitulo))
        .slice(0, 3);
      if (!parsed.viable) parsed.pasos = [];
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[CascadePlanner] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
