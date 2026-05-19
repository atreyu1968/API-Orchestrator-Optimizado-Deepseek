/**
 * [Fix80] Helper compartido para extraer Hitos (milestones) e Hilos
 * argumentales (plot threads) desde la guía de una serie, y para construir
 * el bloque markdown que se inyecta al Architect y al Ghostwriter en los
 * volúmenes 2+ de una serie.
 *
 * Problema que resuelve: hasta Fix79 los hitos/hilos solo se creaban si el
 * usuario llamaba a mano al endpoint POST /api/series/:id/guide/extract, y
 * aun así solo se inyectaban a los lectores (Holístico/Beta) vía
 * `series-context-builder.ts`. El Architect del Vol 2 NO sabía qué hitos
 * debía planificar ni qué hilos abiertos debía continuar, y el Ghostwriter
 * tampoco. Resultado: libros de la serie que ignoraban la planificación.
 *
 * Este módulo hace dos cosas:
 *   1) `extractMilestonesAndThreadsFromGuide` — extracción AI (movida desde
 *      el endpoint de routes.ts para poder llamarla automáticamente al
 *      crear la serie). Es idempotente: si la serie ya tiene milestones o
 *      threads, no extrae de nuevo (salvo que el caller pida `force`).
 *   2) `buildSeriesMilestonesAndThreadsBlock` — bloque markdown con HITOS
 *      OBLIGATORIOS de ESTE volumen + HILOS abiertos + HITOS reservados
 *      para volúmenes futuros, inyectado a Architect y Ghostwriter.
 */
import { storage } from "../storage";
import { recordRawAiUsage } from "./ai-usage";

export interface ExtractMilestonesOptions {
  seriesId: number;
  seriesGuide?: string | null;
  /** Si la serie ya tiene milestones o threads, no extraemos. Default true. */
  skipIfExists?: boolean;
  /** Para registrar el uso de tokens contra un proyecto concreto. */
  projectId?: number | null;
}

export interface ExtractMilestonesResult {
  milestonesCreated: number;
  threadsCreated: number;
  skipped: boolean;
  skipReason?: string;
  extracted?: { milestones: any[]; threads: any[] };
}

function buildExtractionPrompt(guide: string): string {
  return `Analiza esta guía de serie literaria y extrae:

1. HITOS NARRATIVOS (plot milestones): Eventos clave que DEBEN ocurrir en volúmenes específicos
2. HILOS ARGUMENTALES (plot threads): Tramas secundarias que atraviesan múltiples volúmenes

Responde ÚNICAMENTE en JSON válido con esta estructura exacta:
{
  "milestones": [
    {
      "description": "Descripción del hito",
      "volumeNumber": 1,
      "milestoneType": "plot_point|character_development|revelation|conflict_resolution|setup",
      "isRequired": true
    }
  ],
  "threads": [
    {
      "threadName": "Nombre del hilo",
      "description": "Descripción del hilo argumental",
      "introducedVolume": 1,
      "importance": "major|minor|subplot"
    }
  ]
}

GUÍA DE SERIE:
${guide.substring(0, 50000)}`;
}

export async function extractMilestonesAndThreadsFromGuide(
  opts: ExtractMilestonesOptions
): Promise<ExtractMilestonesResult> {
  const { seriesId, skipIfExists = true, projectId = null } = opts;
  const result: ExtractMilestonesResult = {
    milestonesCreated: 0,
    threadsCreated: 0,
    skipped: false,
  };

  let guide = opts.seriesGuide;
  if (guide === undefined) {
    const series = await storage.getSeries(seriesId);
    guide = series?.seriesGuide || null;
  }
  if (!guide || !guide.trim()) {
    result.skipped = true;
    result.skipReason = "no-guide";
    return result;
  }

  if (skipIfExists) {
    const [existingMilestones, existingThreads] = await Promise.all([
      storage.getMilestonesBySeries(seriesId),
      storage.getPlotThreadsBySeries(seriesId),
    ]);
    if (existingMilestones.length > 0 || existingThreads.length > 0) {
      result.skipped = true;
      result.skipReason = "already-extracted";
      return result;
    }
  }

  const { default: OpenAI } = await import("openai");
  const ai = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: "https://api.deepseek.com",
  });

  const prompt = buildExtractionPrompt(guide);

  let response: any;
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      response = await ai.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        ...({ thinking: { type: "disabled" } } as any),
      });
      await recordRawAiUsage(response, {
        agentName: "series-milestones-extractor",
        model: "deepseek-v4-flash",
        projectId,
        operation: "extract-milestones",
      });
      break;
    } catch (err: any) {
      const msg = err?.message || "";
      const isRateLimit = msg.includes("RATELIMIT") || msg.includes("429") || msg.includes("Rate limit");
      if (isRateLimit && attempts < maxAttempts) {
        const waitTime = Math.pow(2, attempts) * 10; // 20s, 40s, 80s, 160s
        console.log(`[series-milestones-extractor] Rate limit (intento ${attempts}/${maxAttempts}). Esperando ${waitTime}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
      } else {
        throw err;
      }
    }
  }

  if (!response) {
    throw new Error("series-milestones-extractor: no response after retries");
  }

  const text: string = response?.choices?.[0]?.message?.content || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("series-milestones-extractor: no JSON in response");
  }

  let extracted: any;
  try {
    extracted = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    throw new Error(`series-milestones-extractor: JSON parse error: ${e?.message || e}`);
  }

  for (const m of extracted.milestones || []) {
    if (!m?.description) continue;
    await storage.createMilestone({
      seriesId,
      description: String(m.description),
      volumeNumber: Number.isInteger(m.volumeNumber) ? m.volumeNumber : 1,
      milestoneType: m.milestoneType || "plot_point",
      isRequired: m.isRequired !== false,
    });
    result.milestonesCreated++;
  }

  for (const t of extracted.threads || []) {
    if (!t?.threadName) continue;
    await storage.createPlotThread({
      seriesId,
      threadName: String(t.threadName),
      description: String(t.description || ""),
      introducedVolume: Number.isInteger(t.introducedVolume) ? t.introducedVolume : 1,
      importance: t.importance || "major",
      status: "active",
    });
    result.threadsCreated++;
  }

  result.extracted = {
    milestones: extracted.milestones || [],
    threads: extracted.threads || [],
  };
  return result;
}

export interface SeriesMilestonesBlockOptions {
  seriesId: number;
  volumeNumber: number;
  totalVolumes?: number;
  isPrequel?: boolean;
}

/**
 * Construye el bloque markdown a inyectar en el prompt de Architect y
 * Ghostwriter. Si la serie no tiene milestones ni threads registrados,
 * devuelve undefined (no contamina el prompt con secciones vacías).
 */
export async function buildSeriesMilestonesAndThreadsBlock(
  opts: SeriesMilestonesBlockOptions
): Promise<string | undefined> {
  try {
    const [milestones, threads] = await Promise.all([
      storage.getMilestonesBySeries(opts.seriesId),
      storage.getPlotThreadsBySeries(opts.seriesId),
    ]);
    if (milestones.length === 0 && threads.length === 0) return undefined;

    const vol = opts.isPrequel ? 0 : opts.volumeNumber;
    const totalVolumes = opts.totalVolumes || 0;
    const thisVolume = milestones.filter((m) => m.volumeNumber === vol);
    const future = milestones.filter(
      (m) => typeof m.volumeNumber === "number" && m.volumeNumber > vol,
    );

    const parts: string[] = [];
    parts.push(
      `### 🎯 HITOS OBLIGATORIOS DE ESTE VOLUMEN (vol ${vol}${totalVolumes ? ` de ${totalVolumes}` : ""})`,
    );
    if (thisVolume.length > 0) {
      parts.push(
        thisVolume
          .map(
            (m) =>
              `- ${m.isRequired ? "[OBLIGATORIO]" : "[opcional]"} (${m.milestoneType || "plot_point"}) ${m.description}`,
          )
          .join("\n"),
      );
      parts.push(
        "La escaleta DEBE planificar y cumplir TODOS los hitos OBLIGATORIOS dentro de los capítulos de este volumen.",
      );
    } else {
      parts.push("- (No hay hitos registrados específicamente para este volumen.)");
    }
    parts.push("");

    if (future.length > 0) {
      parts.push("### 🔮 HITOS RESERVADOS PARA VOLÚMENES POSTERIORES (NO los resuelvas aquí)");
      parts.push(
        future
          .slice(0, 30)
          .map((m) => `- Vol ${m.volumeNumber}: ${m.description}`)
          .join("\n"),
      );
      parts.push(
        "Estos hitos pertenecen a volúmenes FUTUROS. PROHIBIDO adelantarlos o cerrarlos en este libro.",
      );
      parts.push("");
    }

    const openThreads = threads.filter((t) => (t.status || "active") !== "resolved");
    if (openThreads.length > 0) {
      parts.push("### 🧵 HILOS ARGUMENTALES ABIERTOS DE LA SERIE");
      parts.push(
        openThreads
          .slice(0, 40)
          .map((t) => {
            const intro = t.introducedVolume ? ` · introducido vol ${t.introducedVolume}` : "";
            const desc = t.description ? `\n    ${t.description}` : "";
            return `- "${t.threadName}" (importancia: ${t.importance || "n/a"}, estado: ${t.status || "active"}${intro})${desc}`;
          })
          .join("\n"),
      );
      const isLast = totalVolumes > 0 && vol === totalVolumes;
      parts.push(
        isLast
          ? "ESTE ES EL ÚLTIMO VOLUMEN: TODOS los hilos abiertos deben cerrarse aquí."
          : "Continúa estos hilos: hazlos avanzar, da pistas, profundízalos — pero NO los cierres salvo que la guía indique resolución en este volumen.",
      );
      parts.push("");
    }

    return parts.join("\n");
  } catch (err) {
    console.warn(`[Fix80] buildSeriesMilestonesAndThreadsBlock falló: ${(err as Error).message}`);
    return undefined;
  }
}
