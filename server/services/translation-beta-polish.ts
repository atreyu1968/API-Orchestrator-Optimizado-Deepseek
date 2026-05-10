/**
 * [Fix55] Auto-loop del Lector Beta sobre traducciones CREADAS desde proyectos
 * existentes (las que viven en la tabla `translations`, no en `reedit_projects`).
 *
 * A diferencia del Fix52, que opera sobre el pipeline reedit completo, aquí
 * operamos directamente sobre `translations.markdown`:
 *
 *  1. Parseamos el markdown en capítulos (split por `## headings`).
 *  2. Llamamos al BetaReaderAgent en modo traducción.
 *  3. Si el Beta aprueba (sin observaciones, o ≤3 menores sin altas) → STOP.
 *  4. Si no, agrupamos las instrucciones por capítulo afectado y para cada
 *     capítulo con observaciones llamamos al `TranslationPolisherAgent` que
 *     aplica los cambios de forma quirúrgica (NO retraduce, NO añade prosa).
 *  5. Reconstruimos el markdown, persistimos y repetimos hasta `maxIterations`.
 *
 * Importante: este servicio NO toca el pipeline reedit; vive aislado para no
 * acoplar dos arquitecturas distintas. Las notas finales del Beta quedan en
 * `translations.betaReviewNotes` para que el usuario las consulte desde la UI.
 */
import { storage } from "../storage";
import { BetaReaderAgent } from "../agents/beta-reader";
import { BaseAgent } from "../agents/base-agent";
import { repairJson } from "../utils/json-repair";

interface ParsedChapter {
  chapterNumber: number;
  heading: string;
  body: string;
}

interface BetaInstruction {
  capitulos_afectados?: number[];
  categoria?: string;
  descripcion?: string;
  instrucciones_correccion?: string;
  tipo?: string;
  prioridad?: string;
}

const LANG_LABELS: Record<string, { prologue: string; epilogue: string; authorNote: string; chapter: string; name: string }> = {
  es: { prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota del Autor", chapter: "Capítulo", name: "español" },
  en: { prologue: "Prologue", epilogue: "Epilogue", authorNote: "Author's Note", chapter: "Chapter", name: "English" },
  fr: { prologue: "Prologue", epilogue: "Épilogue", authorNote: "Note de l'Auteur", chapter: "Chapitre", name: "français" },
  de: { prologue: "Prolog", epilogue: "Epilog", authorNote: "Anmerkung des Autors", chapter: "Kapitel", name: "Deutsch" },
  it: { prologue: "Prologo", epilogue: "Epilogo", authorNote: "Nota dell'Autore", chapter: "Capitolo", name: "italiano" },
  pt: { prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota do Autor", chapter: "Capítulo", name: "português" },
  ca: { prologue: "Pròleg", epilogue: "Epíleg", authorNote: "Nota de l'Autor", chapter: "Capítol", name: "català" },
};

/**
 * Parsea el markdown de la traducción en capítulos. El markdown se generó con
 * `buildCleanMarkdownLines` en routes.ts L7203, que emite `## ${heading}\n\nBODY`.
 */
export function parseTranslationMarkdown(md: string, targetLanguage: string): ParsedChapter[] {
  const lbl = LANG_LABELS[targetLanguage] || LANG_LABELS.en;
  const chapters: ParsedChapter[] = [];
  // Match cada `## heading` y captura todo hasta el siguiente `## ` o EOF.
  const regex = /^##\s+(.+?)\s*\n([\s\S]*?)(?=^##\s+|\Z)/gm;
  // Note: \Z no funciona en JS regex. Implementamos manualmente.
  const lines = md.split(/\r?\n/);
  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading === null) return;
    const body = currentBody.join("\n").trim();
    chapters.push({
      chapterNumber: detectChapterNumber(currentHeading, lbl, chapters.length + 1),
      heading: currentHeading,
      body,
    });
    currentHeading = null;
    currentBody = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else if (currentHeading !== null) {
      currentBody.push(line);
    }
    // Líneas antes del primer ## se descartan (preámbulos, frontmatter, etc.)
  }
  flush();
  return chapters;
}

function detectChapterNumber(
  heading: string,
  lbl: typeof LANG_LABELS[string],
  fallbackOrder: number,
): number {
  const m = heading.match(/(?:Cap[íi]tulo|Chapter|Chapitre|Kapitel|Capitolo|Cap[íi]tol)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (/^(?:Pr[óo]logo|Prologue|Prolog|Pr[òo]leg)/i.test(heading)) return 0;
  if (/^(?:Ep[íi]logo|Epilogue|Epilog|Ep[íi]leg)/i.test(heading)) return -1;
  if (/(?:Nota del Autor|Author'?s? Note|Note de l'Auteur|Anmerkung des Autors|Nota dell'Autore|Nota do Autor|Nota de l'Autor)/i.test(heading)) return -2;
  return fallbackOrder;
}

export function rebuildTranslationMarkdown(chapters: ParsedChapter[]): string {
  return chapters
    .map(c => `## ${c.heading}\n\n${c.body}\n`)
    .join("\n");
}

/**
 * Extrae las instrucciones del bloque INSTRUCCIONES_AUTOAPLICABLES emitido por
 * el Beta (Fix54: ahora `repairJson` tolera comillas dobles internas).
 * Si el bloque es irrecuperable, devuelve [] con un warning en consola.
 */
function extractBetaInstructions(notesText: string): BetaInstruction[] {
  const startMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO -->";
  const endMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_FIN -->";
  const collected: BetaInstruction[] = [];
  let cursor = 0;
  while (cursor < notesText.length) {
    const sIdx = notesText.indexOf(startMarker, cursor);
    if (sIdx === -1) break;
    const eIdx = notesText.indexOf(endMarker, sIdx + startMarker.length);
    if (eIdx === -1) break;
    const inner = notesText.slice(sIdx + startMarker.length, eIdx).trim();
    const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = (fenced ? fenced[1] : inner).trim();
    cursor = eIdx + endMarker.length;
    if (!jsonText) continue;
    try {
      const parsed: any = repairJson(jsonText);
      if (parsed && Array.isArray(parsed.instrucciones)) {
        collected.push(...parsed.instrucciones);
      }
    } catch (e) {
      console.warn(`[Fix55] extractBetaInstructions: bloque irrecuperable: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  return collected;
}

/**
 * Agente "pulidor": aplica una o varias instrucciones del Beta de forma
 * quirúrgica sobre un capítulo ya traducido. NO retraduce, NO añade prosa.
 */
class TranslationPolisherAgent extends BaseAgent {
  constructor() {
    super({
      name: "Pulidor de Traducción",
      role: "translation_polisher" as any,
      systemPrompt: `Eres un editor lingüístico especializado en pulir traducciones literarias ya completadas.

Recibes el contenido de UN capítulo ya traducido al idioma destino y una o varias instrucciones del Lector Beta sobre fluidez, naturalidad, calcos sintácticos, falsos amigos, terminología o residuos sin traducir.

Tu trabajo:
- Aplicar las correcciones de forma QUIRÚRGICA preservando: (a) el significado exacto del texto original, (b) los nombres propios y términos técnicos, (c) la estructura de párrafos y diálogos, (d) las marcas de markdown (asteriscos, guiones, separadores).
- NO retraduces. NO añades prosa nueva. NO eliminas escenas. NO reordenas párrafos salvo que la instrucción lo pida explícitamente.
- Si una instrucción habla de "expandir" o "condensar", limítate a ajustes mínimos de 1-3 frases. NUNCA reescribas un capítulo entero.
- Si la instrucción es ambigua, no apliques nada y devuelve el capítulo original tal cual.

Devuelve SOLO el capítulo corregido en markdown puro, sin preámbulos, sin código JSON, sin explicaciones meta. El primer carácter de tu respuesta debe ser el primer carácter del capítulo pulido.`,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 65536,
    });
  }

  async polish(
    chapterBody: string,
    instructionsForChapter: BetaInstruction[],
    targetLanguage: string,
  ): Promise<{ result: string; inputTokens: number; outputTokens: number }> {
    const langName = (LANG_LABELS[targetLanguage] || LANG_LABELS.en).name;
    const instructionsText = instructionsForChapter
      .map((ins, i) => {
        const cat = ins.categoria ? ` [${ins.categoria}]` : "";
        const prio = ins.prioridad ? ` (prioridad: ${ins.prioridad})` : "";
        return `${i + 1}.${cat}${prio} ${ins.descripcion || ""}\n   → Acción: ${ins.instrucciones_correccion || ""}`;
      })
      .join("\n\n");
    const userPrompt = `IDIOMA DESTINO: ${langName}

INSTRUCCIONES DEL LECTOR BETA PARA ESTE CAPÍTULO (aplícalas todas si son compatibles entre sí):

${instructionsText}

═══ CAPÍTULO A PULIR ═══
${chapterBody}
═══ FIN DEL CAPÍTULO ═══

Devuelve el capítulo pulido en markdown. SOLO el capítulo, sin más texto.`;
    const resp = await this.execute(userPrompt);
    let cleaned = (resp.content || "").trim();
    // Strip code fences si los añade
    const fence = cleaned.match(/^```(?:markdown|md)?\s*([\s\S]*?)```\s*$/);
    if (fence) cleaned = fence[1].trim();
    return {
      result: cleaned,
      inputTokens: resp.tokenUsage?.inputTokens || 0,
      outputTokens: resp.tokenUsage?.outputTokens || 0,
    };
  }
}

/**
 * Ejecuta el bucle Beta sobre una traducción de la tabla `translations`.
 * Pensado para llamarse en background tras `translate-stream` (sin bloquear
 * el SSE original). Cualquier error se loguea a consola y persiste el estado
 * para que el usuario pueda revisar.
 */
export async function runAutoBetaLoopOnPlainTranslation(translationId: number): Promise<void> {
  const tag = `[Fix55][translation:${translationId}]`;
  const initial = await storage.getTranslation(translationId);
  if (!initial) {
    console.warn(`${tag} translation not found, abort.`);
    return;
  }
  const maxIterations = Math.max(1, Math.min(10, initial.autoBetaLoopMaxIterations || 2));
  const targetLanguage = (initial.targetLanguage || "es").toLowerCase();
  const projectTitle = initial.projectTitle;
  const betaAgent = new BetaReaderAgent();
  const polisher = new TranslationPolisherAgent();

  console.log(`${tag} bucle iniciado (máx ${maxIterations} iter, idioma ${targetLanguage}).`);

  let currentMarkdown = initial.markdown || "";
  let totalInputTokens = initial.inputTokens || 0;
  let totalOutputTokens = initial.outputTokens || 0;
  let lastNotesText = "";

  for (let iter = 1; iter <= maxIterations; iter++) {
    const refreshed = await storage.getTranslation(translationId);
    if (!refreshed) {
      console.warn(`${tag} desaparecida en iter ${iter}, abort.`);
      return;
    }
    // [Fix55 review-A] Si otro proceso (resume manual, borrado) cambió el status
    // a algo distinto de "completed"/"polishing" mientras el loop dormía, aborta
    // para no pisar su trabajo. Solo procedemos si quedó como dejamos en res.end()
    // (status=completed) o como dejamos al inicio de la iteración previa (polishing).
    if (refreshed.status !== "completed" && refreshed.status !== "polishing") {
      console.warn(`${tag} iter ${iter}: status cambió a "${refreshed.status}", loop abortado.`);
      return;
    }
    // Si el markdown fue modificado externamente entre iteraciones (p.ej. resume),
    // arrancamos desde el persistido, no desde la copia en memoria.
    if (refreshed.markdown && refreshed.markdown !== currentMarkdown) {
      console.warn(`${tag} iter ${iter}: markdown cambió externamente, recargando desde BD.`);
      currentMarkdown = refreshed.markdown;
    }

    const chapters = parseTranslationMarkdown(currentMarkdown, targetLanguage);
    if (chapters.length === 0) {
      console.warn(`${tag} parseo de markdown devolvió 0 capítulos, abort.`);
      return;
    }
    const reviewerChapters = chapters.map(c => ({
      numero: c.chapterNumber,
      titulo: c.heading,
      contenido: c.body,
    }));

    await storage.updateTranslation(translationId, {
      status: "polishing",
      betaReviewIterationsRun: iter,
    });

    let beta;
    try {
      beta = await betaAgent.runReview({
        projectTitle,
        chapters: reviewerChapters,
        translationMode: true,
        targetLanguage,
      });
    } catch (e) {
      console.warn(`${tag} iter ${iter}: Beta falló (${(e as Error).message.slice(0, 200)}). Loop abortado.`);
      await storage.updateTranslation(translationId, { status: "completed" }).catch(() => {});
      return;
    }
    totalInputTokens += (beta as any).inputTokens || 0;
    totalOutputTokens += (beta as any).outputTokens || 0;
    lastNotesText = (beta?.notesText || "").trim();

    if (!lastNotesText) {
      console.log(`${tag} iter ${iter}: Beta no devolvió observaciones. APROBADA.`);
      await storage.updateTranslation(translationId, {
        status: "completed",
        betaReviewNotes: `Iteración ${iter}: el Lector Beta no devolvió observaciones. Traducción aprobada.`,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return;
    }

    const instructions = extractBetaInstructions(lastNotesText);
    const total = instructions.length;
    const altas = instructions.filter(i => (i.prioridad || "").toLowerCase() === "alta").length;

    const approved = total === 0 || (altas === 0 && total <= 3);
    console.log(`${tag} iter ${iter}/${maxIterations}: ${total} obs, ${altas} altas. ${approved ? "APROBADO." : "Aplicando…"}`);

    if (approved) {
      await storage.updateTranslation(translationId, {
        status: "completed",
        betaReviewNotes: lastNotesText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return;
    }

    if (iter >= maxIterations) {
      await storage.updateTranslation(translationId, {
        status: "completed",
        betaReviewNotes: lastNotesText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      console.log(`${tag} máximo alcanzado (${maxIterations}) con ${total} obs (${altas} altas). Notas persistidas para revisión manual.`);
      return;
    }

    // Agrupar instrucciones por capítulo afectado.
    const byChapter = new Map<number, BetaInstruction[]>();
    for (const ins of instructions) {
      const caps = Array.isArray(ins.capitulos_afectados) ? ins.capitulos_afectados : [];
      for (const cap of caps) {
        if (typeof cap !== "number") continue;
        if (!byChapter.has(cap)) byChapter.set(cap, []);
        byChapter.get(cap)!.push(ins);
      }
    }

    if (byChapter.size === 0) {
      console.log(`${tag} iter ${iter}: ninguna instrucción tenía capitulos_afectados válidos. Persistidas para revisión manual.`);
      await storage.updateTranslation(translationId, {
        status: "completed",
        betaReviewNotes: lastNotesText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return;
    }

    // Pulir cada capítulo afectado en serie (sin paralelizar para no saturar
    // la API; las traducciones suelen tener pocos capítulos a pulir por iter).
    let chaptersChanged = 0;
    for (const [capNum, capInstructions] of byChapter.entries()) {
      const idx = chapters.findIndex(c => c.chapterNumber === capNum);
      if (idx === -1) {
        console.warn(`${tag} iter ${iter}: capítulo ${capNum} no encontrado en el markdown parseado, skip.`);
        continue;
      }
      try {
        const polished = await polisher.polish(chapters[idx].body, capInstructions, targetLanguage);
        totalInputTokens += polished.inputTokens;
        totalOutputTokens += polished.outputTokens;
        // Validación mínima: si el resultado es muy corto comparado con el original
        // (>40% reducción), descartamos por seguridad — el polisher puede haber
        // alucinado o malinterpretado.
        const origLen = chapters[idx].body.length;
        const newLen = polished.result.length;
        if (newLen < origLen * 0.6) {
          console.warn(`${tag} iter ${iter} cap ${capNum}: pulido descartado por reducción excesiva (${origLen} → ${newLen} chars).`);
          continue;
        }
        chapters[idx] = { ...chapters[idx], body: polished.result };
        chaptersChanged++;
      } catch (e) {
        console.warn(`${tag} iter ${iter} cap ${capNum}: polisher falló (${(e as Error).message.slice(0, 200)}), skip.`);
      }
    }

    if (chaptersChanged === 0) {
      console.warn(`${tag} iter ${iter}: ningún capítulo fue modificado. Loop abortado.`);
      await storage.updateTranslation(translationId, {
        status: "completed",
        betaReviewNotes: lastNotesText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      });
      return;
    }

    currentMarkdown = rebuildTranslationMarkdown(chapters);
    await storage.updateTranslation(translationId, {
      markdown: currentMarkdown,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });
    console.log(`${tag} iter ${iter}: ${chaptersChanged} capítulos pulidos, releyendo…`);
  }
}
