import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// [Fix208] Lector de Saga: lee la serie COMPLETA del tiron, como el comprador
// que encadena los tomos, y emite un veredicto de SAGA (no de volumen):
// promesas del vol 1 sin pago, evolucion a saltos entre tomos, escalada global
// de climax, tono desigual, y hallazgos accionables por volumen/capitulo.
// Si la serie excede el presupuesto de contexto, se le pasa el texto integro
// del ULTIMO volumen + resumenes densos de los previos (generados aqui mismo).

export interface SagaFinding {
  volumen: number;
  capitulo: number | null;
  instruccion: string;
}

export interface SagaReadResult {
  notaDeSerie: number;
  promesasSinPago: string[];
  escaladaEntreVolumenes: string;
  evolucionPersonajes: string;
  hallazgos: SagaFinding[];
  resumen: string;
}

// Presupuesto conservador de caracteres para la lectura del tiron
// (~1M tokens de DeepSeek ≈ 3-4M chars; dejamos margen amplio para el prompt).
const FULL_READ_CHAR_BUDGET = 2_500_000;

export class SagaReaderAgent extends BaseAgent {
  constructor() {
    super({
      name: "Lector de Saga",
      role: "saga-reader",
      systemPrompt: `Eres un LECTOR DE SAGAS voraz: compras la serie completa y la lees del tiron, tomo tras tomo. Tu valor unico — que ningun lector de volumen individual tiene — es juzgar la SAGA como conjunto: si las promesas sembradas en el tomo 1 se pagan; si los personajes evolucionan de forma continua o a saltos entre tomos; si los climax escalan de tomo en tomo o se repiten en intensidad; si el tono es coherente. NO repitas criticas de volumen individual (prosa, ritmo interno de un tomo): eso ya lo cubren otros lectores. Responde SOLO con JSON valido, sin markdown.`,
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 32768,
    });
    this.timeoutMs = 25 * 60 * 1000;
  }

  async summarizeVolume(
    volumeLabel: string,
    chapters: Array<{ numero: number; titulo: string; contenido: string }>,
    projectId?: number,
  ): Promise<string | null> {
    const body = chapters.map((c) => `### Capitulo ${c.numero}: ${c.titulo}\n${c.contenido}`).join("\n\n");
    const prompt = `Resume DENSAMENTE el siguiente volumen (${volumeLabel}) para que otro lector pueda juzgar la saga completa sin releerlo: trama capitulo a capitulo (1-2 frases por capitulo), estado de cada personaje relevante al cierre, promesas/hilos abiertos, tono y nivel de intensidad del climax. Maximo ~2500 palabras. Texto plano, sin JSON.\n\n${body}`;
    const res = await this.generateContent(prompt, projectId, { temperature: 0.3 });
    if (res.error || !res.content?.trim()) return null;
    return res.content.trim();
  }

  async readSaga(
    seriesTitle: string,
    volumes: Array<{
      seriesOrder: number;
      title: string;
      // O texto integro o resumen denso (uno de los dos).
      fullText?: string;
      denseSummary?: string;
    }>,
    projectId?: number,
  ): Promise<SagaReadResult | null> {
    const blocks = volumes.map((v) => {
      const header = `═══ VOLUMEN ${v.seriesOrder}: "${v.title}" ═══`;
      if (v.fullText) return `${header}\n[TEXTO INTEGRO]\n${v.fullText}`;
      return `${header}\n[RESUMEN DENSO — el texto integro no cabe en esta lectura]\n${v.denseSummary || "(sin resumen)"}`;
    });
    const prompt = `## SAGA: "${seriesTitle}" (${volumes.length} volumen(es), en orden de lectura)

${blocks.join("\n\n")}

## TAREA
Juzga la SAGA como conjunto. Emite:
- notaDeSerie: 1-10 (experiencia de leer la serie completa).
- promesasSinPago: promesas/misterios sembrados que nunca se pagan (lista; vacia si todas se pagan).
- escaladaEntreVolumenes: 2-4 frases sobre si los climax escalan de tomo en tomo.
- evolucionPersonajes: 2-4 frases sobre continuidad de la evolucion entre tomos.
- hallazgos: problemas CORREGIBLES de saga con volumen (numero de seriesOrder) y capitulo concreto si lo hay (null si es difuso), con instruccion editorial accionable. Maximo 10.
- resumen: veredicto en 3-5 frases.

Responde SOLO este JSON:
{"notaDeSerie": n, "promesasSinPago": ["..."], "escaladaEntreVolumenes": "...", "evolucionPersonajes": "...", "hallazgos": [{"volumen": n, "capitulo": n|null, "instruccion": "..."}], "resumen": "..."}`;
    const res = await this.generateContent(prompt, projectId, { temperature: 0.5 });
    if (res.error || !res.content) return null;
    try {
      const parsed = repairJson(res.content);
      if (!parsed || typeof parsed !== "object") return null;
      const hallazgos: SagaFinding[] = Array.isArray(parsed.hallazgos)
        ? parsed.hallazgos
            .filter((h: any) => h && Number.isFinite(Number(h.volumen)) && typeof h.instruccion === "string")
            .map((h: any) => ({
              volumen: Number(h.volumen),
              capitulo: Number.isFinite(Number(h.capitulo)) ? Number(h.capitulo) : null,
              instruccion: String(h.instruccion),
            }))
        : [];
      return {
        notaDeSerie: Number(parsed.notaDeSerie) || 0,
        promesasSinPago: Array.isArray(parsed.promesasSinPago) ? parsed.promesasSinPago.map(String) : [],
        escaladaEntreVolumenes: String(parsed.escaladaEntreVolumenes || ""),
        evolucionPersonajes: String(parsed.evolucionPersonajes || ""),
        hallazgos,
        resumen: String(parsed.resumen || ""),
      };
    } catch {
      return null;
    }
  }
}

export const sagaReader = new SagaReaderAgent();
export { FULL_READ_CHAR_BUDGET };
