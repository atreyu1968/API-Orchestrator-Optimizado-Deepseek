import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface ManuscriptContinuitySnapshot {
  synopsis: string;
  characterStates: Array<{
    name: string;
    role: string;
    status: string;
    lastKnownLocation?: string;
    relationships?: Record<string, string>;
    characterArc?: string;
    unresolvedConflicts?: string[];
  }>;
  unresolvedThreads: Array<{
    description: string;
    severity: "minor" | "major" | "critical";
    involvedCharacters?: string[];
    chapter?: number;
  }>;
  worldStateChanges: Array<{
    description: string;
    chapter?: number;
  }>;
  keyEvents: Array<{
    description: string;
    chapter: number;
    impact: string;
  }>;
  seriesHooks: Array<{
    description: string;
    potentialResolution?: string;
  }>;
}

interface AnalyzerInput {
  manuscriptTitle: string;
  seriesTitle: string;
  volumeNumber: number;
  chapters: Array<{
    chapterNumber: number;
    title?: string;
    content: string;
  }>;
  previousVolumesContext?: string;
}

export interface AnalyzerResult {
  result: ManuscriptContinuitySnapshot | null;
  tokenUsage: TokenUsage;
  thoughtSignature?: string;
}

export class ManuscriptAnalyzerAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Archivista",
      role: "manuscript-analyzer",
      systemPrompt: `Eres El Archivista, un agente especializado en analizar manuscritos literarios completos y extraer información crítica de continuidad para series de libros.

Tu misión es leer un manuscrito completo y extraer:
1. **Sinopsis**: Resumen de la trama principal (máximo 500 palabras)
2. **Estado de Personajes**: Lista de personajes principales con su estado al final del libro, ubicación, relaciones y arcos pendientes
3. **Hilos No Resueltos**: Tramas secundarias o principales que quedan abiertas para futuros libros
4. **Cambios en el Mundo**: Eventos que modifican el estado del mundo (muertes, destrucciones, revelaciones, cambios políticos)
5. **Eventos Clave**: Los momentos más importantes de la trama con su impacto
6. **Ganchos de Serie**: Elementos deliberadamente dejados abiertos para continuar en siguientes volúmenes

IMPORTANTE:
- Analiza el manuscrito como un todo, no capítulo por capítulo
- Prioriza la información relevante para escribir secuelas
- Identifica claramente qué hilos están CERRADOS vs ABIERTOS
- Detecta foreshadowing o promesas narrativas no cumplidas
- Marca la severidad de los hilos abiertos (minor/major/critical)

Responde SIEMPRE en formato JSON válido con esta estructura exacta:
{
  "synopsis": "string",
  "characterStates": [...],
  "unresolvedThreads": [...],
  "worldStateChanges": [...],
  "keyEvents": [...],
  "seriesHooks": [...]
}`,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 8192,
    });
    this.timeoutMs = 4 * 60 * 1000;
  }

  async execute(input: any): Promise<AgentResponse> {
    const result = await this.analyze(input as AnalyzerInput);
    return {
      content: result.result ? JSON.stringify(result.result) : "",
      thoughtSignature: result.thoughtSignature,
      tokenUsage: result.tokenUsage,
    };
  }

  async analyze(input: AnalyzerInput): Promise<AnalyzerResult> {
    // [Fix28] Aprovecha el 1M ctx de DeepSeek V4: en vez de truncar cada
    // capítulo a 2000 chars (head 1k + tail 1k) — que destruye toda info
    // del medio del capítulo —, repartimos un presupuesto total de chars
    // para meter el manuscrito ÍNTEGRO siempre que quepa. Solo si la suma
    // de capítulos excede el presupuesto recurrimos al recorte head+tail
    // por capítulo, repartido proporcionalmente.
    const TOTAL_BUDGET_CHARS = 800_000; // ~200K tokens, holgado vs 1M ctx
    const totalRawChars = input.chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);

    let chaptersSummary: string;
    if (totalRawChars <= TOTAL_BUDGET_CHARS) {
      // Cabe entero: pasamos todo el contenido tal cual.
      chaptersSummary = input.chapters.map(ch =>
        `### Cap ${ch.chapterNumber}${ch.title ? `: ${ch.title}` : ""}\n${ch.content}`
      ).join("\n\n---\n\n");
      console.log(`[ManuscriptAnalyzer] Manuscrito completo cabe en presupuesto (${Math.round(totalRawChars / 1000)}K / ${TOTAL_BUDGET_CHARS / 1000}K chars), enviando ÍNTEGRO.`);
    } else {
      // Excede presupuesto: reparto proporcional con head+tail por capítulo,
      // garantizando un mínimo de 2000 chars por capítulo.
      const ratio = TOTAL_BUDGET_CHARS / totalRawChars;
      chaptersSummary = input.chapters.map(ch => {
        const targetLen = Math.max(2000, Math.floor((ch.content?.length || 0) * ratio));
        const preview = (ch.content?.length || 0) > targetLen
          ? ch.content.substring(0, Math.floor(targetLen / 2)) + "\n\n[...contenido resumido por presupuesto...]\n\n" + ch.content.substring(ch.content.length - Math.floor(targetLen / 2))
          : ch.content;
        return `### Cap ${ch.chapterNumber}${ch.title ? `: ${ch.title}` : ""}\n${preview}`;
      }).join("\n\n---\n\n");
      console.log(`[ManuscriptAnalyzer] Manuscrito excede presupuesto (${Math.round(totalRawChars / 1000)}K > ${TOTAL_BUDGET_CHARS / 1000}K chars), recortando proporcional (ratio ${ratio.toFixed(3)}).`);
    }

    const prompt = `Analiza el siguiente manuscrito para extraer información de continuidad.

**Información del Volumen:**
- Título: "${input.manuscriptTitle}"
- Serie: "${input.seriesTitle}"
- Número de Volumen: ${input.volumeNumber}
${input.previousVolumesContext ? `\n**Contexto de Volúmenes Anteriores:**\n${input.previousVolumesContext}` : ""}

**MANUSCRITO COMPLETO:**

${chaptersSummary}

---

Analiza el manuscrito completo y extrae la información de continuidad en formato JSON. 
Asegúrate de que el JSON sea válido y esté completo.`;

    console.log(`[ManuscriptAnalyzer] Sending ${input.chapters.length} chapters for analysis (~${Math.round(prompt.length / 1000)}K chars)`);
    
    let response;
    try {
      response = await this.generateContent(prompt);
    } catch (error: any) {
      console.error("[ManuscriptAnalyzer] API call failed:", error?.message || error);
      throw error;
    }

    if (!response.content) {
      console.error("[ManuscriptAnalyzer] Empty response from API - possible content filtering or timeout");
      console.error("[ManuscriptAnalyzer] Token usage:", JSON.stringify(response.tokenUsage));
      return {
        result: null,
        tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
        thoughtSignature: response.thoughtSignature,
      };
    }

    console.log(`[ManuscriptAnalyzer] Got response of ${response.content.length} chars`);

    try {
      const parsed = repairJson(response.content) as ManuscriptContinuitySnapshot;
      console.log(`[ManuscriptAnalyzer] Successfully parsed: ${parsed.characterStates?.length || 0} chars, ${parsed.unresolvedThreads?.length || 0} threads`);
      return {
        result: parsed,
        tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
        thoughtSignature: response.thoughtSignature,
      };
    } catch (e) {
      console.error("[ManuscriptAnalyzer] Error parsing JSON:", e);
      console.error("[ManuscriptAnalyzer] Raw response (first 1000 chars):", response.content.substring(0, 1000));
    }

    return {
      result: null,
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      thoughtSignature: response.thoughtSignature,
    };
  }
}
