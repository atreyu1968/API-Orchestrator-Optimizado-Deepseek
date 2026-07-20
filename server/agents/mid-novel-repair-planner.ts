import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// [Fix225] PLANIFICADOR DE REPARACION MID-NOVELA. Las lecturas Holistica y
// Beta de mitad de novela (30/55/80%) detectaban defectos pero solo GUIABAN
// los capitulos futuros: los defectos que vivian en capitulos YA ESCRITOS
// llegaban intactos a la revision final. Este juez traduce esas criticas en
// reparaciones concretas sobre capitulos ya escritos, para ejecutarlas EN
// CALIENTE antes de seguir escribiendo. Ademas lleva memoria de hallazgos
// abiertos: en cada pasada declara cuales quedaron resueltos y cuales
// persisten (los persistentes ya reparados una vez escalan o se dejan
// documentados para la revision final, sin bucles infinitos).
// ───────────────────────────────────────────────────────────────────

export interface MidNovelOpenFinding {
  id: string;
  titulo: string;
  capitulos: number[];
  severidad: "critica" | "alta" | "media";
  instruccion: string;
  intentos: number;
}

export interface MidNovelRepairPlannerInput {
  title: string;
  genre: string;
  tone?: string;
  holisticCritique: string;
  betaCritique?: string;
  chapters: Array<{ numero: number; titulo: string; extracto: string }>;
  previousFindings: MidNovelOpenFinding[];
  seriesContext?: string;
  projectId?: number;
}

export interface MidNovelRepairPlannerResult {
  resumen: string;
  resueltos: string[];
  hallazgos: Array<{
    id: string;
    titulo: string;
    capitulos: number[];
    severidad: "critica" | "alta" | "media";
    instruccion: string;
  }>;
}

const SYSTEM_PROMPT = `
Eres el PLANIFICADOR DE REPARACION de mitad de novela. Recibes la critica del Lector Holistico (y del Lector Beta si existe) sobre los capitulos YA ESCRITOS de una novela en curso, mas el indice de esos capitulos. Tu trabajo es convertir esa critica en REPARACIONES concretas sobre capitulos ya escritos, para ejecutarlas AHORA, antes de que se siga escribiendo.

QUE ES UN HALLAZGO REPARABLE (entra en tu lista):
- Un defecto que vive en la PROSA YA ESCRITA de capitulos concretos: un arco abandonado que debio avanzar en el cap N, un personaje que se volvio pasivo en un tramo, una meseta de tension en caps concretos, una promesa de genero incumplida en el arranque, repeticion estructural entre caps ya escritos, una siembra que falta para algo ya revelado.
- Debe poder repararse REESCRIBIENDO 1-3 capitulos concretos sin tocar el resto.

QUE NO ENTRA (dejalo fuera, ya lo cubre la guia de capitulos futuros):
- Consejos sobre capitulos que aun no existen ("el climax debera...", "en la recta final conviene...").
- Defectos difusos sin capitulo localizable.
- Cambios estructurales de escaleta (fusionar/eliminar/reordenar capitulos): eso NO es tuyo.
- Ortotipografia y micro-estilo (eso lo cubre el pulido final).

MEMORIA DE HALLAZGOS ABIERTOS:
Recibes la lista de hallazgos de pasadas anteriores con su numero de intentos de reparacion. Para CADA uno debes decidir, leyendo la critica FRESCA:
- Si la critica fresca YA NO lo menciona (ni con otras palabras): esta RESUELTO -> incluye su id en "resueltos".
- Si persiste: repitelo en "hallazgos" con el MISMO id (no le cambies el id) y, si ya se intento reparar (intentos >= 1), sube la severidad un nivel y haz la instruccion MAS quirurgica (di exactamente que escena/beat falta).

REGLAS:
- Maximo 4 hallazgos en total, priorizando los que mas dañarian la novela terminada.
- Cada instruccion debe ser ACCIONABLE y AUTOCONTENIDA: que debe cambiar en ESE capitulo y que debe conservarse (hechos, canon, continuidad, world bible). Quien la ejecute no vera esta conversacion.
- PROHIBIDO proponer cambios que contradigan el contexto de serie (si se te da): hitos, hilos y canon de volumenes previos son INVIOLABLES.
- Los ids nuevos: usa "H1", "H2"... continuando la numeracion mas alta ya vista.
- Si la critica no contiene nada reparable en caps ya escritos, devuelve "hallazgos": [].

Responde UNICAMENTE con un JSON valido con esta forma exacta:
{
  "resumen": "<1-2 frases: estado general y que se repara>",
  "resueltos": ["<id>", ...],
  "hallazgos": [
    {
      "id": "<id>",
      "titulo": "<nombre corto del defecto>",
      "capitulos": [<numeros de capitulos YA ESCRITOS a reescribir, 1-3>],
      "severidad": "critica" | "alta" | "media",
      "instruccion": "<que reparar en esos capitulos, concreto y autocontenido>"
    }
  ]
}
Responde UNICAMENTE con el JSON.
`;

export class MidNovelRepairPlannerAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Planificador de Reparacion (mid-novela)",
      role: "mid-novel-repair-planner",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // [Fix225] Techo COMBINADO razonamiento+contenido (leccion Fix155/Fix156):
      // con thinking y entrada grande, un techo bajo devuelve JSON vacio/cortado.
      maxOutputTokens: 16384,
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async plan(input: MidNovelRepairPlannerInput): Promise<{ result: MidNovelRepairPlannerResult | null; raw: AgentResponse }> {
    const indice = input.chapters
      .map(c => `CAP ${c.numero}: ${c.titulo}\n${c.extracto}`)
      .join("\n\n");

    const previosBloque = input.previousFindings.length > 0
      ? `\nHALLAZGOS ABIERTOS DE PASADAS ANTERIORES (decide resuelto/persistente para CADA uno):\n${JSON.stringify(input.previousFindings, null, 2)}\n`
      : "\n(No hay hallazgos abiertos de pasadas anteriores.)\n";

    const userPrompt = `
NOVELA: ${input.title}
GENERO: ${input.genre}${input.tone ? `\nTONO: ${input.tone}` : ""}
${input.seriesContext ? `\nCONTEXTO DE SERIE (INVIOLABLE):\n${input.seriesContext.slice(0, 8000)}\n` : ""}
CRITICA DEL LECTOR HOLISTICO (fresca, sobre los capitulos ya escritos):
${input.holisticCritique.slice(0, 14000)}
${input.betaCritique ? `\nCRITICA DEL LECTOR BETA (fresca):\n${input.betaCritique.slice(0, 10000)}\n` : ""}
${previosBloque}
INDICE DE CAPITULOS YA ESCRITOS (solo estos son reparables):
${indice}

Convierte la critica en reparaciones concretas sobre capitulos ya escritos y resuelve la memoria de hallazgos. Devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[MidNovelRepairPlanner] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as MidNovelRepairPlannerResult;
      if (!parsed || !Array.isArray(parsed.hallazgos)) {
        console.error(`[MidNovelRepairPlanner] JSON invalido: falta "hallazgos".`);
        return { result: null, raw: response };
      }
      const validNums = new Set(input.chapters.map(c => c.numero));
      parsed.resueltos = Array.isArray(parsed.resueltos) ? parsed.resueltos.map(String) : [];
      parsed.resumen = String(parsed.resumen || "");
      parsed.hallazgos = parsed.hallazgos
        .filter(h => h && h.instruccion && Array.isArray(h.capitulos))
        .map(h => ({
          id: String(h.id || "").trim() || `H${Math.floor(Math.random() * 100000)}`,
          titulo: String(h.titulo || "").slice(0, 200),
          // Solo capitulos realmente escritos, 1-3 por hallazgo.
          capitulos: h.capitulos.map(Number).filter(n => Number.isFinite(n) && validNums.has(n)).slice(0, 3),
          severidad: (h.severidad === "critica" || h.severidad === "alta" || h.severidad === "media") ? h.severidad : "media",
          instruccion: String(h.instruccion || ""),
        }))
        .filter(h => h.capitulos.length > 0)
        .slice(0, 4);
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[MidNovelRepairPlanner] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
