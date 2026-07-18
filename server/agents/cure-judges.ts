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

// [Fix217] Juez de decisiones pendientes: cuando un volumen agota el rescate
// y sigue "publicable con reservas", este juez lee las notas finales de los
// lectores y las traduce a una lista CORTA de decisiones editoriales concretas
// (que cambiar, en que capitulos, y como) que el usuario puede APROBAR en el
// panel para que la cura las ejecute. Recibe el contexto de serie para que
// ninguna propuesta rompa la continuidad con otros volumenes.
export interface DiagnosedDecision {
  titulo: string;
  instruccion: string;
  capitulos: number[];
  tipo: "correccion" | "reescritura";
}

class DecisionDiagnosisAgent extends BaseAgent {
  constructor() {
    super({
      name: "Diagnostico de Decisiones",
      role: "decision-diagnosis",
      systemPrompt: `Eres un editor jefe. Un volumen NO llego a "publicable" (quedo "publicable con reservas" o "necesita cirugia") tras varias rondas automaticas de correccion: los arreglos mecanicos ya se agotaron y lo que falta son DECISIONES DE CONTENIDO. Tu unica tarea: leer las notas finales de los lectores y proponer una lista CORTA (2-5) de decisiones editoriales concretas y ejecutables que subirian el veredicto a "publicable". Cada decision debe decir QUE cambiar, EN QUE capitulos y COMO (instruccion accionable para un editor-cirujano, sin reescribir tu el texto). Si hay contexto de serie, NINGUNA propuesta puede contradecir hechos, arcos o estados finales de otros volumenes. Responde SOLO con JSON valido, sin markdown.`,
      useThinking: true,
      thinkingBudget: 6144,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 8 * 60 * 1000;
  }

  async diagnose(opts: {
    volumeTitle: string;
    reviewNotes: string;
    betaScore: number | null;
    holisticScore: number | null;
    arcPassed: boolean;
    chapterIndex: Array<{ numero: number; titulo: string; extracto: string }>;
    seriesContext?: string;
    projectId?: number;
  }): Promise<DiagnosedDecision[] | null> {
    const indexBlock = opts.chapterIndex
      .map((c) => `- Capitulo ${c.numero}: "${c.titulo}"\n  ${c.extracto.replace(/\n+/g, " ").slice(0, 400)}`)
      .join("\n");
    const prompt = `## VOLUMEN
"${opts.volumeTitle}" — Beta ${opts.betaScore ?? "?"}/10, Holistico ${opts.holisticScore ?? "?"}/10, arco ${opts.arcPassed ? "SUPERADO" : "con observaciones"}. Umbral para "publicable": arco superado + Beta >=9 + Holistico >=8.
${opts.seriesContext ? `\n## CONTEXTO DE SERIE (INVIOLABLE: ninguna decision puede contradecirlo)\n${opts.seriesContext.slice(0, 8000)}\n` : ""}
## NOTAS FINALES DE LOS LECTORES
${opts.reviewNotes.slice(0, 12000)}

## INDICE DE CAPITULOS
${indexBlock}

## TAREA
Propon 2-5 decisiones editoriales CONCRETAS que subirian las notas al umbral. Reglas:
- Cada decision ataca UNA queja real de las notas (no inventes problemas).
- "capitulos": los 1-3 capitulos concretos donde ejecutarla.
- "tipo": "correccion" si basta una intervencion quirurgica localizada; "reescritura" si el capitulo necesita reescribirse entero.
- "instruccion": orden accionable para el editor-cirujano (que cambiar y como), coherente con el contexto de serie si existe.
- "titulo": 4-10 palabras que el usuario entienda de un vistazo.

Responde SOLO este JSON:
{"decisiones": [{"titulo": "...", "instruccion": "...", "capitulos": [numeros], "tipo": "correccion"|"reescritura"}]}`;
    const res = await this.generateContent(prompt, opts.projectId, { temperature: 0.4 });
    if (res.error || !res.content) return null;
    try {
      const parsed = repairJson(res.content);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.decisiones)) return null;
      const out: DiagnosedDecision[] = parsed.decisiones
        .filter((d: any) => d && typeof d.instruccion === "string" && d.instruccion.trim().length > 20 && Array.isArray(d.capitulos))
        .map((d: any) => ({
          titulo: typeof d.titulo === "string" && d.titulo.trim() ? d.titulo.trim().slice(0, 120) : "Decision editorial",
          instruccion: d.instruccion.trim(),
          capitulos: d.capitulos.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0).slice(0, 3),
          tipo: d.tipo === "reescritura" ? "reescritura" as const : "correccion" as const,
        }))
        .filter((d: DiagnosedDecision) => d.capitulos.length > 0)
        .slice(0, 5);
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }
}

export const findingLocalizer = new FindingLocalizerAgent();
export const seamJudge = new SeamJudgeAgent();
export const decisionDiagnosis = new DecisionDiagnosisAgent();
