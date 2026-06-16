import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// [Fix161] Anotador de expresividad en linea para Fish Audio S2 (s2-pro).
// Recibe prosa YA limpiada por prepareTtsText y decide DONDE colocar etiquetas
// expresivas en linea ([susurrando], [suspiro], [con miedo], ...). NUNCA reescribe
// la prosa: solo devuelve una lista de anclas + etiquetas; la insercion de los
// corchetes la hace este agente programaticamente sobre el texto original, de modo
// que las palabras del autor son inalterables por construccion. Si el modelo falla
// o devuelve basura, se devuelve el texto SIN etiquetas (advisory, nunca bloquea).

export interface ExpressionTagEntry {
  // Subcadena EXACTA copiada del texto (4-10 palabras) donde empieza el efecto.
  antes_de: string;
  // Etiqueta entre corchetes, p.ej. "[susurrando]".
  etiqueta: string;
  // Cual ocurrencia de "antes_de" (1 = la primera). Por defecto 1.
  ocurrencia?: number;
}

export interface ExpressionTaggerInput {
  text: string;
  projectId?: number;
}

export interface ExpressionTaggerOutput {
  // Texto con las etiquetas en linea ya insertadas (o el original si no hubo nada).
  taggedText: string;
  tagsApplied: number;
  raw: AgentResponse | null;
}

const MAX_TAGS_PER_CHAPTER = 40;
const MAX_TAG_INNER_LEN = 60;
const MAX_ANCHOR_LEN = 120;

const SYSTEM_PROMPT = `
Eres un DIRECTOR DE DOBLAJE para audiolibros. Recibes la prosa de un capítulo (en español) y tu única tarea es decidir DÓNDE colocar etiquetas expresivas en línea para el motor de voz Fish Audio S2, que interpreta instrucciones entre [corchetes] palabra a palabra.

═══════════════════════════════════════════════════════════════════
REGLA INVIOLABLE: NO TOCAS EL TEXTO
═══════════════════════════════════════════════════════════════════
- NO reescribes, NO resumes, NO traduces, NO corriges, NO cambias NI UNA palabra.
- Solo eliges PUNTOS del texto y QUÉ etiqueta poner justo antes de cada punto.
- Devuelves una lista JSON de anclas. Otro sistema insertará los corchetes por ti.

═══════════════════════════════════════════════════════════════════
CÓMO MARCAR UN PUNTO (campo "antes_de")
═══════════════════════════════════════════════════════════════════
- "antes_de" es una subcadena CORTA (4 a 10 palabras) COPIADA LETRA POR LETRA del texto, con sus mismos acentos, comas y mayúsculas. Marca el lugar donde el efecto debe EMPEZAR.
- La etiqueta afecta a lo que viene DESPUÉS de ella, hasta el final de la frase. Coloca el ancla justo antes de la palabra/frase a la que quieres dar el matiz.
- Elige anclas DISTINTIVAS (poco repetidas). Si la misma subcadena aparece varias veces, indica en "ocurrencia" cuál es (1 = la primera).
- Si el ancla no existe tal cual en el texto, esa etiqueta se descartará: cópiala con exactitud.

═══════════════════════════════════════════════════════════════════
QUÉ ETIQUETAS USAR
═══════════════════════════════════════════════════════════════════
Etiquetas recomendadas (en español): [susurrando], [en voz baja], [gritando], [suspiro], [pausa larga], [con miedo], [enojado], [triste], [con ternura], [con urgencia], [voz quebrada], [entre dientes], [con sarcasmo], [alegre], [serio], [con cansancio], [con sorpresa], [llorando], [con dulzura], [con firmeza].
También puedes escribir descripciones libres en español, p.ej. [con voz temblorosa, intentando sonar tranquilo].
Para reforzar, combina una etiqueta física con una de emoción usando DOS entradas con el MISMO "antes_de" (p.ej. [suspiro] y [triste]).

═══════════════════════════════════════════════════════════════════
DOSIFICACIÓN (CLAVE PARA QUE SUENE BIEN)
═══════════════════════════════════════════════════════════════════
- Sé SOBRIO: aproximadamente 1 etiqueta cada 150-250 palabras. Máximo 15 etiquetas en total.
- El exceso de etiquetas compite entre sí y empeora el resultado. Marca solo los momentos con carga emocional real (diálogo tenso, giros, silencios, reacciones).
- NO etiquetes el anuncio del capítulo (p.ej. "Capítulo 1, ...") ni la narración neutra.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════
{
  "etiquetas": [
    { "antes_de": "subcadena exacta copiada del texto", "etiqueta": "[susurrando]", "ocurrencia": 1 }
  ]
}
Si no hay buenos momentos, devuelve { "etiquetas": [] }.

Responde ÚNICAMENTE con el JSON. Escribe SIEMPRE en español.
`;

export class TtsExpressionTaggerAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Director de Doblaje (S2)",
      role: "tts-expression-tagger",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 4096,
      includeThoughts: false,
    });
    this.timeoutMs = 4 * 60 * 1000;
  }

  private normalizeTag(raw: any): string {
    let tag = String(raw ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!tag) return "";
    tag = "[" + tag.replace(/^\[+/, "").replace(/\]+$/, "").trim() + "]";
    const inner = tag.slice(1, -1).trim();
    if (!inner) return "";
    if (inner.length > MAX_TAG_INNER_LEN) return "";
    if (inner.includes("[") || inner.includes("]")) return "";
    return "[" + inner + "]";
  }

  private applyTags(text: string, entries: ExpressionTagEntry[]): { out: string; applied: number } {
    const insertions: { pos: number; tag: string; order: number }[] = [];
    let order = 0;
    for (const e of entries) {
      if (insertions.length >= MAX_TAGS_PER_CHAPTER) break;
      const anchor = typeof e.antes_de === "string" ? e.antes_de : "";
      if (!anchor || anchor.length > MAX_ANCHOR_LEN) continue;
      const tag = this.normalizeTag(e.etiqueta);
      if (!tag) continue;
      const occ = Math.max(1, Number(e.ocurrencia) || 1);
      let idx = -1;
      let from = 0;
      let count = 0;
      while (count < occ) {
        idx = text.indexOf(anchor, from);
        if (idx === -1) break;
        count++;
        from = idx + anchor.length;
      }
      if (idx === -1) continue;
      insertions.push({ pos: idx, tag, order: order++ });
    }
    if (!insertions.length) return { out: text, applied: 0 };

    insertions.sort((a, b) => a.pos - b.pos || a.order - b.order);

    let out = "";
    let cursor = 0;
    let applied = 0;
    for (const ins of insertions) {
      if (ins.pos < cursor) continue;
      out += text.slice(cursor, ins.pos) + ins.tag + " ";
      cursor = ins.pos;
      applied++;
    }
    out += text.slice(cursor);
    return { out, applied };
  }

  async tag(input: ExpressionTaggerInput): Promise<ExpressionTaggerOutput> {
    const original = String(input.text ?? "");
    if (!original.trim()) {
      return { taggedText: original, tagsApplied: 0, raw: null };
    }

    const userPrompt = `
PROSA DEL CAPÍTULO (no la cambies; solo marca puntos para las etiquetas):

${original}
`;

    let response: AgentResponse | null = null;
    try {
      response = await this.generateContent(userPrompt, input.projectId, { temperature: 0.4 });
    } catch (error) {
      console.error(`[TtsExpressionTagger] generateContent threw: ${(error as Error).message}`);
      return { taggedText: original, tagsApplied: 0, raw: null };
    }

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.log(`[TtsExpressionTagger] No usable response (${response.error || "empty"}); returning plain text`);
      return { taggedText: original, tagsApplied: 0, raw: response };
    }

    try {
      const parsed = repairJson(response.content) as { etiquetas?: ExpressionTagEntry[] };
      const entries = Array.isArray(parsed?.etiquetas) ? parsed.etiquetas : [];
      if (!entries.length) {
        return { taggedText: original, tagsApplied: 0, raw: response };
      }
      const { out, applied } = this.applyTags(original, entries);
      return { taggedText: out, tagsApplied: applied, raw: response };
    } catch (error) {
      console.error(`[TtsExpressionTagger] JSON parse failed: ${(error as Error).message}; returning plain text`);
      return { taggedText: original, tagsApplied: 0, raw: response };
    }
  }
}
