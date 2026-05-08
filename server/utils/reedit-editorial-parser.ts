// [Fix34] Parser de notas Holístico+Beta para el reedit (human-in-the-loop, 1 iteración).
//
// Equivalente al `parseEditorialNotesOnly` del orquestador principal, pero adaptado
// al modelo del reedit (`reeditChapters` y `reeditProjects`). Estrategia:
//   1. Intenta extraer bloques `<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO/FIN -->`
//      directamente de la concatenación de notas Holístico+Beta. Si los lectores
//      emitieron JSON estructurado (que es lo normal), nos saltamos la llamada LLM.
//   2. Si no hay bloques, cae al `EditorialNotesParser.execute()` clásico.
//   3. Filtra y normaliza tipos a los soportados por el applier del reedit:
//      - `puntual` y `estructural` → SurgicalPatcher (auto-aplicable).
//      - `global_rename`           → find/replace word-boundary global (auto-aplicable).
//      - `eliminar` / `fusionar` / `global_style` / `regenerate_chapter` /
//        `restructure_arc` → no se auto-aplican; se marcan como administrativas.
//
// Cada instrucción de salida lleva un `id` numérico estable (índice 0..n-1) para que
// la UI pueda enviar `selectedIds: number[]` al endpoint de aplicación.

import { EditorialNotesParser, type EditorialInstruction } from "../agents/editorial-notes-parser";
import { repairJson } from "./json-repair";

export type ReeditInstructionTipo =
  | "puntual"
  | "estructural"
  | "eliminar"
  | "fusionar"
  | "global_style"
  | "global_rename"
  | "regenerate_chapter"
  | "restructure_arc";

export interface ReeditEditorialInstruction extends EditorialInstruction {
  id: number;
  autoApplicable: boolean;
  reasonNotAutoApplicable?: string;
}

export interface ReeditPendingEditorialParse {
  resumen_general?: string;
  instrucciones: ReeditEditorialInstruction[];
  count: number;
  completedAt: string;
  source: "auto_holistic_beta_reedit" | "human_critique_reedit" | "mixed_reedit";
}

const AUTO_APPLICABLE_TYPES: Set<string> = new Set(["puntual", "estructural", "global_rename"]);
const ADMINISTRATIVE_REASONS: Record<string, string> = {
  eliminar: "Borra capítulos completos: requiere acción administrativa manual.",
  fusionar: "Fusiona capítulos: requiere acción administrativa manual.",
  global_style: "Directiva transversal de estilo: aplicar en pase de pulido.",
  regenerate_chapter: "Regeneración completa: usar pipeline principal de generación.",
  restructure_arc: "Reestructuración del arco: requiere reinvocar al Arquitecto.",
};

interface ChapterIndexEntry {
  numero: number;
  titulo: string;
}

interface ParseInput {
  notesText: string;
  chapterIndex: ChapterIndexEntry[];
  projectTitle: string;
}

function tryExtractMarkerBlocks(notesText: string): EditorialInstruction[] | null {
  const startMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO -->";
  const endMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_FIN -->";
  const collected: EditorialInstruction[] = [];
  let cursor = 0;
  let blocksFound = 0;
  while (cursor < notesText.length) {
    const sIdx = notesText.indexOf(startMarker, cursor);
    if (sIdx === -1) break;
    const eIdx = notesText.indexOf(endMarker, sIdx + startMarker.length);
    if (eIdx === -1 || eIdx <= sIdx) break;
    blocksFound += 1;
    const inner = notesText.slice(sIdx + startMarker.length, eIdx).trim();
    const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = (fenced ? fenced[1] : inner).trim();
    cursor = eIdx + endMarker.length;
    if (!jsonText) continue;
    let parsed: any;
    try {
      parsed = repairJson(jsonText);
    } catch {
      try { parsed = JSON.parse(jsonText); } catch { continue; }
    }
    if (parsed && Array.isArray(parsed.instrucciones)) {
      collected.push(...parsed.instrucciones);
    }
  }
  if (blocksFound === 0) return null;
  return collected;
}

function normalizeAndAssignIds(
  rawInstructions: any[],
  validChapterNumbers: Set<number>
): ReeditEditorialInstruction[] {
  const out: ReeditEditorialInstruction[] = [];
  let nextId = 0;
  for (const raw of rawInstructions) {
    if (!raw || typeof raw !== "object") continue;

    const descripcion = String(raw.descripcion || "").trim();
    const correccion = String(raw.instrucciones_correccion || "").trim();
    if (!descripcion && !correccion) continue;

    const tipoRaw = String(raw.tipo || "estructural").toLowerCase();
    const tipo = (AUTO_APPLICABLE_TYPES.has(tipoRaw) || ADMINISTRATIVE_REASONS[tipoRaw])
      ? (tipoRaw as ReeditInstructionTipo)
      : "estructural";

    const capsRaw: any[] = Array.isArray(raw.capitulos_afectados) ? raw.capitulos_afectados : [];
    const caps = capsRaw
      .map(n => (typeof n === "number" ? n : parseInt(String(n), 10)))
      .filter(n => Number.isFinite(n) && validChapterNumbers.has(n));

    // Para global_rename aceptamos array vacío (se aplica a todos).
    if (caps.length === 0 && tipo !== "global_rename") continue;

    const isAuto = AUTO_APPLICABLE_TYPES.has(tipo);
    out.push({
      id: nextId++,
      capitulos_afectados: caps,
      categoria: String(raw.categoria || "otro"),
      descripcion: descripcion || correccion.slice(0, 200),
      instrucciones_correccion: correccion || descripcion,
      elementos_a_preservar: raw.elementos_a_preservar ? String(raw.elementos_a_preservar) : undefined,
      prioridad: ["alta", "media", "baja"].includes(String(raw.prioridad)) ? raw.prioridad : "media",
      tipo,
      plan_por_capitulo: (raw.plan_por_capitulo && typeof raw.plan_por_capitulo === "object") ? raw.plan_por_capitulo : undefined,
      rename_from: typeof raw.rename_from === "string" ? raw.rename_from : undefined,
      rename_to: typeof raw.rename_to === "string" ? raw.rename_to : undefined,
      restructure_from_chapter: typeof raw.restructure_from_chapter === "number" ? raw.restructure_from_chapter : undefined,
      restructure_instructions: typeof raw.restructure_instructions === "string" ? raw.restructure_instructions : undefined,
      merge_into: typeof raw.merge_into === "number" ? raw.merge_into : undefined,
      merge_sources: Array.isArray(raw.merge_sources) ? raw.merge_sources.filter((n: any) => typeof n === "number") : undefined,
      autoApplicable: isAuto,
      reasonNotAutoApplicable: isAuto ? undefined : ADMINISTRATIVE_REASONS[tipo],
    });
  }
  return out;
}

export async function parseHolisticBetaForReedit(
  input: ParseInput
): Promise<ReeditPendingEditorialParse> {
  const validChapterNumbers = new Set(input.chapterIndex.map(c => c.numero));

  // 1. Camino rápido determinista.
  const fromMarkers = tryExtractMarkerBlocks(input.notesText);
  let rawInstructions: any[] = [];
  let resumen: string | undefined;

  if (fromMarkers !== null && fromMarkers.length > 0) {
    rawInstructions = fromMarkers;
    resumen = `Informe estructurado del sistema (Holístico/Beta): ${fromMarkers.length} instrucción(es) detectada(s) sin invocar parser LLM.`;
  } else {
    // 2. Fallback LLM.
    const parser = new EditorialNotesParser();
    const parsed = await parser.execute({
      notas: input.notesText,
      chapterIndex: input.chapterIndex,
      projectTitle: input.projectTitle,
    });
    rawInstructions = parsed.result?.instrucciones || [];
    resumen = parsed.result?.resumen_general
      || `Parser LLM extrajo ${rawInstructions.length} instrucción(es) del informe Holístico+Beta.`;
  }

  const instrucciones = normalizeAndAssignIds(rawInstructions, validChapterNumbers);

  return {
    resumen_general: resumen,
    instrucciones,
    count: instrucciones.length,
    completedAt: new Date().toISOString(),
    source: "auto_holistic_beta_reedit",
  };
}
