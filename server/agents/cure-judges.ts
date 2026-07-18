import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// [Fix210] + [Fix209] Jueces LLM ligeros para la Cura de Serie:
//   - FindingLocalizerAgent: recibe un hallazgo estructural SIN capitulo
//     concreto y el indice de capitulos del volumen, y devuelve los capitulos
//     concretos afectados (o "no localizable", o "sin problema real").
//   - SeamJudgeAgent: revisa la COSTURA entre dos volumenes (cierre del tomo N
//     + arranque del N+1) y devuelve hallazgos por capitulo con instruccion.

export interface LocalizedFinding {
  chapters: number[];
  localizable: boolean;
  esProblemaReal: boolean;
  razon: string;
}

class FindingLocalizerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Localizador de Hallazgos",
      role: "finding-localizer",
      systemPrompt: `Eres un editor tecnico. Tu unica tarea: dado un hallazgo editorial difuso (sin capitulo concreto) y un indice de capitulos con extractos, decidir (a) si describe un PROBLEMA REAL corregible (no un elogio ni una observacion neutra), y (b) en que capitulos CONCRETOS se manifiesta. Responde SOLO con JSON valido, sin markdown.`,
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 6 * 60 * 1000;
  }

  async localize(
    findingText: string,
    chapterIndex: Array<{ numero: number; titulo: string; extracto: string }>,
    projectId?: number,
  ): Promise<LocalizedFinding | null> {
    const indexBlock = chapterIndex
      .map((c) => `- Capitulo ${c.numero}: "${c.titulo}"\n  ${c.extracto.replace(/\n+/g, " ").slice(0, 500)}`)
      .join("\n");
    const prompt = `## HALLAZGO EDITORIAL (sin capitulo concreto)
${findingText}

## INDICE DE CAPITULOS DEL VOLUMEN
${indexBlock}

## TAREA
1. ¿El hallazgo describe un PROBLEMA REAL corregible en la prosa/estructura? (los elogios, observaciones neutras o "el ritmo es adecuado" NO lo son).
2. Si es problema real: ¿en que capitulos CONCRETOS se manifiesta? Elige los 1-3 capitulos mas afectados (no listas largas).
3. Si no puedes anclarlo a capitulos concretos con confianza, marca localizable=false.

Responde SOLO este JSON:
{"esProblemaReal": true|false, "localizable": true|false, "chapters": [numeros], "razon": "una frase"}`;
    const res = await this.generateContent(prompt, projectId, { temperature: 0.3 });
    if (res.error || !res.content) return null;
    try {
      const parsed = repairJson(res.content);
      if (!parsed || typeof parsed !== "object") return null;
      const chapters = Array.isArray(parsed.chapters)
        ? parsed.chapters.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];
      return {
        chapters,
        localizable: parsed.localizable === true && chapters.length > 0,
        esProblemaReal: parsed.esProblemaReal === true,
        razon: typeof parsed.razon === "string" ? parsed.razon : "",
      };
    } catch {
      return null;
    }
  }
}

export interface SeamFinding {
  volumen: "N" | "N+1";
  capitulo: number;
  instruccion: string;
}

export interface SeamJudgeResult {
  ganchoScore: number;
  recapInfodump: boolean;
  continuidadEmocional: boolean;
  hallazgos: SeamFinding[];
  resumen: string;
}

class SeamJudgeAgent extends BaseAgent {
  constructor() {
    super({
      name: "Juez de Costuras",
      role: "seam-judge",
      systemPrompt: `Eres un editor de sagas. Tu unica tarea: evaluar la COSTURA entre dos volumenes consecutivos de una serie — el cierre del tomo N y el arranque del tomo N+1 — como la vive un lector que encadena ambos. Buscas: (1) gancho de cierre debil o inexistente; (2) recap-infodump en el arranque (paginas de resumen de lo anterior en vez de escena viva); (3) incoherencia de estado emocional/situacional de los personajes entre el final y el arranque. Responde SOLO con JSON valido, sin markdown.`,
      useThinking: true,
      thinkingBudget: 6144,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 10 * 60 * 1000;
  }

  async judgeSeam(
    volNLabel: string,
    volNClosing: Array<{ numero: number; titulo: string; contenido: string }>,
    volN1Label: string,
    volN1Opening: Array<{ numero: number; titulo: string; contenido: string }>,
    projectId?: number,
  ): Promise<SeamJudgeResult | null> {
    const fmt = (chs: Array<{ numero: number; titulo: string; contenido: string }>) =>
      chs.map((c) => `### Capitulo ${c.numero}: ${c.titulo}\n${c.contenido}`).join("\n\n");
    const prompt = `## CIERRE DEL TOMO N (${volNLabel})
${fmt(volNClosing)}

## ARRANQUE DEL TOMO N+1 (${volN1Label})
${fmt(volN1Opening)}

## TAREA
Evalua la costura. Para cada problema REAL, emite un hallazgo con el capitulo concreto (usa "volumen": "N" para capitulos del cierre y "N+1" para los del arranque) y una instruccion editorial ACCIONABLE (que cambiar, sin reescribir tu el texto).

Responde SOLO este JSON:
{"ganchoScore": 1-10, "recapInfodump": true|false, "continuidadEmocional": true|false, "hallazgos": [{"volumen": "N"|"N+1", "capitulo": numero, "instruccion": "..."}], "resumen": "2-3 frases"}`;
    const res = await this.generateContent(prompt, projectId, { temperature: 0.4 });
    if (res.error || !res.content) return null;
    try {
      const parsed = repairJson(res.content);
      if (!parsed || typeof parsed !== "object") return null;
      const hallazgos: SeamFinding[] = Array.isArray(parsed.hallazgos)
        ? parsed.hallazgos
            .filter((h: any) => h && Number.isFinite(Number(h.capitulo)) && typeof h.instruccion === "string")
            .map((h: any) => ({
              volumen: h.volumen === "N" ? "N" as const : "N+1" as const,
              capitulo: Number(h.capitulo),
              instruccion: String(h.instruccion),
            }))
        : [];
      return {
        ganchoScore: Number(parsed.ganchoScore) || 0,
        recapInfodump: parsed.recapInfodump === true,
        continuidadEmocional: parsed.continuidadEmocional !== false,
        hallazgos,
        resumen: typeof parsed.resumen === "string" ? parsed.resumen : "",
      };
    } catch {
      return null;
    }
  }
}

export const findingLocalizer = new FindingLocalizerAgent();
export const seamJudge = new SeamJudgeAgent();
