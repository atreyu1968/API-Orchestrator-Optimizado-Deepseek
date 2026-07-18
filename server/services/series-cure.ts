import { storage } from "../storage";
import { INTERNAL_AUTH_HEADER, INTERNAL_AUTH_TOKEN } from "../auth";
import { forcePolishResume } from "../polish-auto-resume";
import { isPolishActive, requestPolishStop } from "../utils/polish-registry";
import { cleanProseMarkdown } from "../utils/prose-markdown-cleaner";
import { findingLocalizer, seamJudge, decisionDiagnosis, type SeamJudgeResult } from "../agents/cure-judges";
import { sagaReader, FULL_READ_CHAR_BUDGET, type SagaReadResult } from "../agents/saga-reader";
import { BetaReaderAgent } from "../agents/beta-reader";
import { HolisticReviewerAgent } from "../agents/holistic-reviewer";
import { buildSeriesContextForReviewers } from "../utils/series-context-builder";
import { db } from "../db";
import { sql } from "drizzle-orm";

// [Fix194] Cura de Serie: pipeline reutilizable a nivel de SERIE que cura cada
// volumen desde la perspectiva de la saga, en orden y de forma autonoma:
//   1) Verificacion de arco (ArcValidator via endpoint existente, ramas
//      project/imported/reedit).
//   2) Correcciones de hitos no cumplidos (apply-corrections: escenas aditivas).
//   3) [Fix198] Limpieza determinista de Markdown residual en la prosa.
//   4) Reescritura profunda de capitulos senalados por hallazgos estructurales
//      (structural-rewrite); [Fix210] los hallazgos DIFUSOS (sin capitulo) se
//      intentan LOCALIZAR con un juez LLM antes de degradarlos a sugerencia.
//   5) Pulido advisory Holistico+Beta con espera (volumenes nativos); para
//      volumenes imported/reedit, [Fix211] UNA ronda de lectura Holistico+Beta.
//   6) [Fix213] Resolucion de issues documentados del Revisor Final (nativos).
//   7) [Fix209] Revision de la COSTURA con el volumen anterior.
//   8) Veredicto honesto por volumen.
//   9) [Fix208] Al final, Lector de Saga: lectura de la serie completa del
//      tiron con veredicto de saga y correcciones dirigidas o sugerencias.
// Los hallazgos que pedirian acciones DESTRUCTIVAS o anadir capitulos NUEVOS se
// registran como SUGERENCIAS para aprobacion manual (nunca se ejecutan solos),
// coherente con [Fix185].
// [Fix205] El estado ya NO vive solo en memoria: se persiste en la tabla
// series_cure_runs en cada transicion relevante y, si el server se reinicia a
// mitad, la cura se AUTO-REANUDA desde el volumen donde iba.

// [Fix195] "validated" = el paso se examino y NO hizo falta tocar nada (todo
// correcto), distinto de "skipped" (el paso no aplica o no se pudo evaluar).
export type CureStepStatus = "pending" | "running" | "done" | "validated" | "skipped" | "failed";

// [Fix203] Progresion estructurada del pulido para el panel de la cura.
export interface PolishProgress {
  beta: number | null;
  holistico: number | null;
  ultimaActividad?: string;
  ultimaActividadAt?: string;
  fase?: string;
}

export interface CureVolumeState {
  volumeType: "project" | "imported" | "reedit";
  volumeId: number;
  title: string;
  seriesOrder: number;
  steps: {
    arcVerify: CureStepStatus;
    corrections: CureStepStatus;
    mdClean: CureStepStatus;
    deepRewrite: CureStepStatus;
    polish: CureStepStatus;
    issues: CureStepStatus;
    seam: CureStepStatus;
  };
  arcScore?: number;
  arcPassed?: boolean;
  correctionsApplied?: number;
  markdownCleaned?: number;
  chaptersRewritten?: number;
  betaScore?: number | null;
  holisticScore?: number | null;
  polishProgress?: PolishProgress;
  reviewNotes?: string;
  issuesResolved?: number;
  seamSummary?: string;
  verdict?: "publicable" | "publicable_con_reservas" | "necesita_cirugia" | "sin_veredicto";
  // [Fix216] Rondas extra de rescate ejecutadas para intentar subir el
  // veredicto de "con reservas" a "publicable".
  rescueRounds?: number;
  // [Fix217] Decisiones editoriales pendientes diagnosticadas al agotar el
  // rescate: el usuario selecciona cuales ejecutar desde el panel.
  pendingDecisions?: PendingCureDecision[];
  decisionRun?: "running" | "done" | "failed";
  suggestions: string[];
  error?: string;
}

// [Fix217] Decision editorial concreta propuesta por el juez de diagnostico.
export interface PendingCureDecision {
  id: string;
  titulo: string;
  instruccion: string;
  capitulos: number[];
  tipo: "correccion" | "reescritura";
  status: "pendiente" | "ejecutando" | "ejecutada" | "fallida";
}

export interface SeriesCureState {
  seriesId: number;
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  startedAt: string;
  finishedAt?: string;
  currentVolumeIndex: number;
  volumes: CureVolumeState[];
  log: { at: string; message: string }[];
  cancelRequested?: boolean;
  // [Fix208] Veredicto de saga del Lector de Saga (paso final).
  sagaVerdict?: SagaReadResult & { correccionesAplicadas: number; sugerencias: string[] };
  sagaStep?: CureStepStatus;
  resumedAt?: string;
}

const cureRegistry = new Map<number, SeriesCureState>();

// Topes de coste por volumen: la reescritura profunda reescribe capitulos
// ENTEROS con el Ghostwriter; sin tope un informe verboso podria disparar
// decenas de reescrituras.
const MAX_DEEP_REWRITE_CHAPTERS = 4;
const MAX_SEAM_REWRITE_CHAPTERS = 2;
const MAX_SAGA_CORRECTIONS = 6;
// [Fix216] Rondas maximas de rescate por volumen cuando el veredicto sale
// "publicable_con_reservas": el objetivo es que TODO volumen termine
// "publicable" sin reservas. Cada ronda repite verificacion de arco +
// correcciones + reescritura dirigida + relectura fresca. Se corta antes si
// una ronda no mejora ninguna nota (estancamiento).
const MAX_RESCUE_ROUNDS = 3;
const POLISH_POLL_MS = 30_000;
const POLISH_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 horas por volumen
const ISSUES_POLL_MS = 30_000;
const ISSUES_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 horas por volumen

function baseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || "5000"}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// [Fix205] Persistencia del estado en la tabla series_cure_runs.
// Sin drizzle-kit (convencion del proyecto): CREATE TABLE IF NOT EXISTS lazy.
// ─────────────────────────────────────────────────────────────────────────────
let cureTableReady = false;
async function ensureCureTable(): Promise<void> {
  if (cureTableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS series_cure_runs (
      id SERIAL PRIMARY KEY,
      series_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      state JSONB NOT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  cureTableReady = true;
}

const lastPersistAt = new Map<number, number>();
const PERSIST_THROTTLE_MS = 5_000;

// [Fix220] Cola de persistencia por serie: con el worker de decisiones y la
// cura corriendo en paralelo, dos escrituras JSONB simultaneas podian llegar
// fuera de orden a la BD (snapshot viejo pisando uno nuevo). Encadenarlas
// garantiza orden de llegada; ambas serializan el MISMO objeto vivo, asi que
// la ultima escritura siempre contiene el estado mas fresco.
const persistChain = new Map<number, Promise<void>>();
function persistState(state: SeriesCureState, force = false): Promise<void> {
  const prev = persistChain.get(state.seriesId) || Promise.resolve();
  const next = prev.then(() => doPersistState(state, force)).catch(() => {});
  persistChain.set(state.seriesId, next);
  return next;
}

async function doPersistState(state: SeriesCureState, force = false): Promise<void> {
  try {
    const now = Date.now();
    const last = lastPersistAt.get(state.seriesId) || 0;
    if (!force && now - last < PERSIST_THROTTLE_MS) return;
    lastPersistAt.set(state.seriesId, now);
    await ensureCureTable();
    // Estado serializable sin funciones; cancelRequested NO se persiste (es
    // una peticion efimera de la sesion en curso).
    const { cancelRequested, ...persistable } = state;
    await db.execute(sql`
      INSERT INTO series_cure_runs (series_id, status, state, started_at, updated_at)
      VALUES (${state.seriesId}, ${state.status}, ${JSON.stringify(persistable)}::jsonb, ${state.startedAt}::timestamp, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `);
    // Upsert manual: solo debe existir UNA fila por (series_id, started_at);
    // si ya existe, se actualiza.
    await db.execute(sql`
      UPDATE series_cure_runs
      SET status = ${state.status}, state = ${JSON.stringify(persistable)}::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE series_id = ${state.seriesId} AND started_at = ${state.startedAt}::timestamp
    `);
    // Limpieza de duplicados accidentales del mismo run (carrera improbable).
    await db.execute(sql`
      DELETE FROM series_cure_runs a
      USING series_cure_runs b
      WHERE a.series_id = b.series_id AND a.started_at = b.started_at AND a.id > b.id
    `);
  } catch (e) {
    console.warn(`[SeriesCure ${state.seriesId}] No se pudo persistir el estado: ${(e as Error).message}`);
  }
}

function log(state: SeriesCureState, message: string) {
  state.log.push({ at: new Date().toISOString(), message });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  console.log(`[SeriesCure ${state.seriesId}] ${message}`);
  void persistState(state);
}

export function getSeriesCureStatus(seriesId: number): SeriesCureState | undefined {
  return cureRegistry.get(seriesId);
}

// [Fix205] Si no hay runner en memoria, el status puede leerse del historico
// persistido (ultima run de la serie).
export async function getSeriesCureStatusWithHistory(seriesId: number): Promise<SeriesCureState | undefined> {
  const inMemory = cureRegistry.get(seriesId);
  if (inMemory) return inMemory;
  try {
    await ensureCureTable();
    const res: any = await db.execute(sql`
      SELECT state FROM series_cure_runs
      WHERE series_id = ${seriesId}
      ORDER BY started_at DESC LIMIT 1
    `);
    const row = res?.rows?.[0];
    if (!row?.state) return undefined;
    const state = row.state as SeriesCureState;
    // Un run persistido como "running" sin runner en memoria = interrumpido
    // por un reinicio (el auto-resume lo retomara; mientras, ser honesto).
    if (state.status === "running") state.status = "interrupted";
    // [Fix217] Sin runner en memoria tampoco existe el worker de decisiones:
    // normalizar estados huerfanos para que el panel no muestre una ejecucion
    // eterna y el usuario pueda relanzar.
    for (const vol of state.volumes || []) {
      if (vol.decisionRun === "running") {
        vol.decisionRun = "failed";
        for (const d of vol.pendingDecisions || []) {
          if (d.status === "ejecutando") d.status = "pendiente";
        }
      }
    }
    return state;
  } catch {
    return undefined;
  }
}

export function cancelSeriesCure(seriesId: number): boolean {
  const state = cureRegistry.get(seriesId);
  if (!state || state.status !== "running") return false;
  state.cancelRequested = true;
  log(state, "Cancelacion solicitada; se detendra al terminar el paso en curso.");
  return true;
}

async function selfFetch(path: string, body: any): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [INTERNAL_AUTH_HEADER]: INTERNAL_AUTH_TOKEN },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* respuesta no JSON */ }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${path}: ${json?.error || text.slice(0, 300)}`);
  }
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceso uniforme a los capitulos de un volumen (3 tablas distintas).
// ─────────────────────────────────────────────────────────────────────────────
interface NormalizedChapter {
  id: number;
  chapterNumber: number;
  title: string;
  content: string;
  // Para reedit/imported el contenido vigente es editedContent si existe.
  contentField: "content" | "editedContent";
}

async function getVolumeChapters(vol: CureVolumeState): Promise<NormalizedChapter[]> {
  if (vol.volumeType === "project") {
    const chs = await storage.getChaptersByProject(vol.volumeId);
    return chs.map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title || `Capitulo ${c.chapterNumber}`,
      content: c.content || "",
      contentField: "content" as const,
    }));
  }
  if (vol.volumeType === "imported") {
    const chs = await storage.getImportedChaptersByManuscript(vol.volumeId);
    return chs.map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title || `Capitulo ${c.chapterNumber}`,
      content: (c.editedContent && c.editedContent.trim() ? c.editedContent : c.originalContent) || "",
      contentField: (c.editedContent && c.editedContent.trim() ? "editedContent" : "editedContent") as "editedContent",
    }));
  }
  const chs = await storage.getReeditChaptersByProject(vol.volumeId);
  return chs.map((c) => ({
    id: c.id,
    chapterNumber: c.chapterNumber,
    title: c.title || `Capitulo ${c.chapterNumber}`,
    content: (c.editedContent && c.editedContent.trim() ? c.editedContent : c.originalContent) || "",
    contentField: "editedContent" as const,
  }));
}

async function updateVolumeChapterContent(vol: CureVolumeState, ch: NormalizedChapter, newContent: string): Promise<void> {
  if (vol.volumeType === "project") {
    await storage.updateChapter(ch.id, { content: newContent } as any);
  } else if (vol.volumeType === "imported") {
    await storage.updateImportedChapter(ch.id, { editedContent: newContent } as any);
  } else {
    await storage.updateReeditChapter(ch.id, { editedContent: newContent } as any);
  }
}

async function collectVolumes(seriesId: number): Promise<CureVolumeState[]> {
  // Una serie vive en TRES tablas (projects / imported_manuscripts /
  // reedit_projects); hay que unir las tres o la cura se salta volumenes.
  const [projects, imported, reedits] = await Promise.all([
    storage.getProjectsBySeries(seriesId),
    storage.getImportedManuscriptsBySeries(seriesId),
    storage.getReeditProjectsBySeries(seriesId),
  ]);

  const vols: CureVolumeState[] = [];
  const mk = (volumeType: CureVolumeState["volumeType"], id: number, title: string, order: number | null, subtype?: string | null): CureVolumeState => ({
    volumeType,
    volumeId: id,
    title,
    seriesOrder: subtype === "prequel" || order === 0 ? 0 : (order ?? 999),
    steps: { arcVerify: "pending", corrections: "pending", mdClean: "pending", deepRewrite: "pending", polish: "pending", issues: "pending", seam: "pending" },
    suggestions: [],
  });

  for (const p of projects) {
    // Solo novelas terminadas: un proyecto en generacion no se cura.
    if (p.status !== "completed") continue;
    vols.push(mk("project", p.id, p.title, p.seriesOrder, (p as any).projectSubtype));
  }
  for (const m of imported) {
    vols.push(mk("imported", m.id, m.title, m.seriesOrder, (m as any).projectSubtype));
  }
  for (const r of reedits) {
    vols.push(mk("reedit", r.id, r.title, r.seriesOrder, (r as any).projectSubtype));
  }
  vols.sort((a, b) => a.seriesOrder - b.seriesOrder);
  return vols;
}

async function runArcVerify(state: SeriesCureState, vol: CureVolumeState): Promise<any | null> {
  vol.steps.arcVerify = "running";
  log(state, `Vol ${vol.seriesOrder} "${vol.title}": verificacion de arco...`);
  try {
    const json = await selfFetch(`/api/series/${state.seriesId}/verify-project`, {
      projectId: vol.volumeId,
      volumeType: vol.volumeType,
    });
    const result = json?.result;
    vol.arcScore = result?.overallScore;
    vol.arcPassed = !!result?.passed;
    vol.steps.arcVerify = "done";
    log(state, `Vol ${vol.seriesOrder}: arco ${vol.arcPassed ? "PASSED" : "con observaciones"} (${vol.arcScore ?? "?"}/100).`);
    return result || null;
  } catch (e: any) {
    vol.steps.arcVerify = "failed";
    vol.error = `Verificacion de arco fallo: ${e?.message || e}`;
    log(state, `Vol ${vol.seriesOrder}: ${vol.error}`);
    return null;
  }
}

async function runCorrections(state: SeriesCureState, vol: CureVolumeState, arcResult: any): Promise<void> {
  const unfulfilled = (arcResult?.milestoneVerifications || [])
    .filter((m: any) => !m.isFulfilled)
    .map((m: any, index: number) => ({
      // Mismo contrato que el panel manual de verificacion de arco.
      chapterNumber: m.suggestedChapter || m.fulfilledInChapter || index + 1,
      instruction: `HITO NO CUMPLIDO: ${m.description}. ${m.verificationNotes || "Incorporar este elemento del arco argumental en el capitulo."}`,
      milestoneId: m.milestoneId,
    }));

  if (unfulfilled.length === 0) {
    // [Fix195] Todos los hitos cumplidos: el paso queda VALIDADO, no omitido.
    vol.steps.corrections = "validated";
    log(state, `Vol ${vol.seriesOrder}: todos los hitos cumplidos -> paso VALIDADO.`);
    return;
  }

  vol.steps.corrections = "running";
  log(state, `Vol ${vol.seriesOrder}: aplicando ${unfulfilled.length} correccion(es) de hitos...`);
  try {
    const json = await selfFetch(`/api/series/${state.seriesId}/apply-corrections`, {
      projectId: vol.volumeId,
      volumeType: vol.volumeType,
      corrections: unfulfilled,
    });
    vol.correctionsApplied = json?.totalCorrected ?? unfulfilled.length;
    vol.steps.corrections = "done";
    log(state, `Vol ${vol.seriesOrder}: ${vol.correctionsApplied} capitulo(s) corregido(s) por hitos.`);
  } catch (e: any) {
    vol.steps.corrections = "failed";
    log(state, `Vol ${vol.seriesOrder}: correcciones de hitos fallaron: ${e?.message || e}`);
  }
}

// [Fix198] Paso determinista: limpiar Markdown residual (**negrita**, __x__,
// *cursiva*) de la prosa de TODOS los capitulos del volumen. El exportador NO
// interpreta esos marcadores: salen literales en el ebook. Conserva
// separadores de escena ("***") y cabeceras. Idempotente y sin coste LLM.
async function runMarkdownCleanup(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  vol.steps.mdClean = "running";
  try {
    const chapters = await getVolumeChapters(vol);
    let touched = 0;
    for (const ch of chapters) {
      if (!ch.content) continue;
      const cleaned = cleanProseMarkdown(ch.content);
      if (cleaned !== ch.content) {
        await updateVolumeChapterContent(vol, ch, cleaned);
        touched++;
      }
    }
    vol.markdownCleaned = touched;
    vol.steps.mdClean = touched > 0 ? "done" : "validated";
    log(state, touched > 0
      ? `Vol ${vol.seriesOrder}: limpieza Markdown -> ${touched} capitulo(s) saneado(s).`
      : `Vol ${vol.seriesOrder}: sin Markdown residual en la prosa -> paso VALIDADO.`);
  } catch (e: any) {
    vol.steps.mdClean = "failed";
    log(state, `Vol ${vol.seriesOrder}: limpieza Markdown fallo: ${e?.message || e}`);
  }
}

async function runDeepRewrite(state: SeriesCureState, vol: CureVolumeState, arcResult: any): Promise<void> {
  const structural = (arcResult?.classifiedFindings || []).filter(
    (f: any) => f?.type === "structural" && (f?.severity === "high" || f?.severity === "medium"),
  );

  // [Fix210] Hallazgos SIN capitulos concretos ("el tramo se aplana") ya no
  // mueren directamente como sugerencia: un juez LLM ligero intenta
  // LOCALIZARLOS en capitulos concretos usando el indice del volumen. Solo si
  // no es localizable (o no describe un problema real) queda como sugerencia.
  const withChapters: { chapters: number[]; text: string }[] = [];
  const diffuse: any[] = [];
  for (const f of structural) {
    const chapters = (f.affectedChapters || []).filter((n: any) => Number.isFinite(n));
    if (chapters.length > 0) {
      withChapters.push({ chapters, text: f.text });
    } else {
      diffuse.push(f);
    }
  }

  if (diffuse.length > 0) {
    try {
      const volChapters = await getVolumeChapters(vol);
      const index = volChapters
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((c) => ({ numero: c.chapterNumber, titulo: c.title, extracto: c.content.slice(0, 600) }));
      for (const f of diffuse) {
        if (state.cancelRequested) break;
        const loc = await findingLocalizer.localize(f.text, index, vol.volumeType === "project" ? vol.volumeId : undefined);
        if (loc && !loc.esProblemaReal) {
          log(state, `Vol ${vol.seriesOrder}: hallazgo difuso descartado (no es problema real): "${String(f.text).slice(0, 80)}..."`);
          continue;
        }
        if (loc && loc.localizable && loc.chapters.length > 0) {
          withChapters.push({ chapters: loc.chapters.slice(0, 3), text: f.text });
          log(state, `Vol ${vol.seriesOrder}: hallazgo difuso LOCALIZADO en cap(s) ${loc.chapters.slice(0, 3).join(", ")} (${loc.razon || "sin razon"}).`);
        } else {
          vol.suggestions.push(`[estructural sin capitulo, no localizable] ${f.text}`);
        }
      }
    } catch (e: any) {
      log(state, `Vol ${vol.seriesOrder}: localizacion de hallazgos difusos fallo (${e?.message || e}); quedan como sugerencias.`);
      for (const f of diffuse) vol.suggestions.push(`[estructural sin capitulo] ${f.text}`);
    }
  }

  if (withChapters.length === 0) {
    if (structural.length > 0) {
      // Hay hallazgos pero ninguno accionable automaticamente: omitido con sugerencias.
      vol.steps.deepRewrite = "skipped";
      log(state, `Vol ${vol.seriesOrder}: ${vol.suggestions.length} hallazgo(s) estructural(es) sin capitulo accionable -> quedan como sugerencias.`);
    } else {
      // [Fix195] Sin hallazgos estructurales: el paso queda VALIDADO.
      vol.steps.deepRewrite = "validated";
      log(state, `Vol ${vol.seriesOrder}: sin hallazgos estructurales -> paso VALIDADO.`);
    }
    return;
  }

  // Agrupar: un capitulo puede aparecer en varios hallazgos; se reescribe UNA
  // vez con todas sus instrucciones juntas, con tope global por volumen.
  const byChapter = new Map<number, string[]>();
  for (const f of withChapters) {
    for (const ch of f.chapters) {
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch)!.push(f.text);
    }
  }
  const targets = Array.from(byChapter.entries()).slice(0, MAX_DEEP_REWRITE_CHAPTERS);
  const overflow = byChapter.size - targets.length;
  if (overflow > 0) {
    vol.suggestions.push(`Tope de reescritura profunda alcanzado: ${overflow} capitulo(s) adicional(es) quedan pendientes de reescritura manual.`);
  }

  vol.steps.deepRewrite = "running";
  vol.chaptersRewritten = 0;
  for (const [chapterNumber, texts] of targets) {
    if (state.cancelRequested) break;
    const instructions = [
      "REESCRITURA PROFUNDA DESDE LA PERSPECTIVA DE LA SERIE. Corrige estos fallos detectados por el Validador de Arco:",
      ...texts.map((t, i) => `${i + 1}. ${t}`),
      "Manten la trama y el elenco del capitulo; puedes modificar cualquier porcentaje del texto que haga falta para corregir los fallos, dramatizando EN PAGINA los eventos decisivos.",
    ].join("\n");
    log(state, `Vol ${vol.seriesOrder}: reescritura profunda del capitulo ${chapterNumber}...`);
    try {
      const json = await selfFetch(`/api/series/${state.seriesId}/structural-rewrite`, {
        projectId: vol.volumeId,
        volumeType: vol.volumeType,
        chapterNumbers: [chapterNumber],
        structuralInstructions: instructions,
      });
      const ok = (json?.results || []).some((r: any) => r.success);
      if (ok) {
        vol.chaptersRewritten = (vol.chaptersRewritten || 0) + 1;
        log(state, `Vol ${vol.seriesOrder}: capitulo ${chapterNumber} reescrito.`);
      } else {
        log(state, `Vol ${vol.seriesOrder}: la reescritura del capitulo ${chapterNumber} no produjo contenido.`);
      }
    } catch (e: any) {
      log(state, `Vol ${vol.seriesOrder}: reescritura del capitulo ${chapterNumber} fallo: ${e?.message || e}`);
    }
  }
  vol.steps.deepRewrite = (vol.chaptersRewritten || 0) > 0 ? "done" : "failed";
}

// [Fix211] Para volumenes imported/reedit (sin bucle advisory): UNA ronda de
// lectura Holistico + Beta para obtener notas y puntuaciones frescas, de modo
// que el veredicto del volumen no salga cojo.
async function runOneShotReview(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  vol.steps.polish = "running";
  log(state, `Vol ${vol.seriesOrder}: lectura puntual Holistico+Beta (volumen ${vol.volumeType})...`);
  try {
    const chapters = await getVolumeChapters(vol);
    if (chapters.length === 0) {
      vol.steps.polish = "skipped";
      log(state, `Vol ${vol.seriesOrder}: sin capitulos legibles; lectura omitida.`);
      return;
    }
    const readerChapters = chapters
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c) => ({ numero: c.chapterNumber, titulo: c.title, contenido: c.content }));

    const seriesContext = await buildSeriesContextForReviewers({
      seriesId: state.seriesId,
      seriesOrder: vol.seriesOrder,
    }).catch(() => undefined);

    const holistic = new HolisticReviewerAgent();
    const beta = new BetaReaderAgent();
    const [holResult, betaResult] = await Promise.all([
      holistic.runReview({ projectTitle: vol.title, chapters: readerChapters, seriesContext }).catch(() => null),
      beta.runReview({ projectTitle: vol.title, chapters: readerChapters, seriesContext }).catch(() => null),
    ]);

    vol.betaScore = betaResult?.score ?? null;
    vol.holisticScore = holResult?.score ?? null;
    const notes: string[] = [];
    if (holResult?.notesText) notes.push(`HOLISTICO (${holResult.score ?? "?"}/10):\n${holResult.notesText.slice(0, 3000)}`);
    if (betaResult?.notesText) notes.push(`BETA (${betaResult.score ?? "?"}/10):\n${betaResult.notesText.slice(0, 3000)}`);
    vol.reviewNotes = notes.join("\n\n────────────\n\n") || undefined;

    if (vol.betaScore === null && vol.holisticScore === null) {
      vol.steps.polish = "failed";
      log(state, `Vol ${vol.seriesOrder}: la lectura puntual no devolvio puntuaciones.`);
      return;
    }
    vol.steps.polish = "done";
    if ((vol.betaScore ?? 10) < 8 || (vol.holisticScore ?? 10) < 7) {
      vol.suggestions.push(`Lectura puntual con notas bajas (Beta ${vol.betaScore ?? "?"}, Holistico ${vol.holisticScore ?? "?"}): revisar las notas de lectura del panel para decidir correcciones manuales.`);
    }
    log(state, `Vol ${vol.seriesOrder}: lectura puntual terminada (Beta ${vol.betaScore ?? "?"}/10, Holistico ${vol.holisticScore ?? "?"}/10).`);
  } catch (e: any) {
    vol.steps.polish = "failed";
    log(state, `Vol ${vol.seriesOrder}: lectura puntual fallo: ${e?.message || e}`);
  }
}

async function runPolishAndWait(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  if (vol.volumeType !== "project") {
    // [Fix211] Antes se omitia; ahora los volumenes imported/reedit reciben
    // UNA ronda de lectura Holistico+Beta para tener notas y veredicto pleno.
    await runOneShotReview(state, vol);
    return;
  }

  vol.steps.polish = "running";
  log(state, `Vol ${vol.seriesOrder}: lanzando pulido Holistico+Beta (con contexto de serie)...`);
  try {
    const launch = await forcePolishResume(vol.volumeId);
    if (!launch.success && !isPolishActive(vol.volumeId)) {
      vol.steps.polish = "failed";
      vol.error = `No se pudo lanzar el pulido: ${launch.message}`;
      log(state, `Vol ${vol.seriesOrder}: ${vol.error}`);
      return;
    }
  } catch (e: any) {
    vol.steps.polish = "failed";
    vol.error = `Fallo lanzando el pulido: ${e?.message || e}`;
    log(state, `Vol ${vol.seriesOrder}: ${vol.error}`);
    return;
  }

  const deadline = Date.now() + POLISH_TIMEOUT_MS;
  // Espera activa: el bucle limpia autoPolishPending SIEMPRE al terminar
  // (exito, advisory o error), asi que ese flag es la senal fiable de fin.
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLISH_POLL_MS));
    const fresh = await storage.getProject(vol.volumeId).catch(() => undefined);
    if (!fresh) continue;

    // [Fix203] Progresion estructurada del pulido para el panel de la cura:
    // puntuaciones actuales + ultima actividad relevante del bucle.
    try {
      const logs = await storage.getActivityLogsByProject(vol.volumeId, 5);
      const relevant = (logs || []).find((l: any) =>
        ["editor", "beta-reader", "holistic-reviewer", "proofreader", "surgical-patcher", "orchestrator"].includes(l.agentRole || ""));
      const lastMsg = relevant || (logs || [])[0];
      const msgText = String(lastMsg?.message || "");
      let fase = "pulido en curso";
      if (/ortotipograf/i.test(msgText)) fase = "ortotipografica";
      else if (/revert|regresi/i.test(msgText)) fase = "reversion";
      else if (/beta/i.test(msgText)) fase = "lectura beta";
      else if (/holistic|holistico/i.test(msgText)) fase = "lectura holistica";
      else if (/cirug|quirurg|patch/i.test(msgText)) fase = "cirugia";
      vol.polishProgress = {
        beta: (fresh as any).betaScore ?? null,
        holistico: (fresh as any).holisticScore ?? null,
        ultimaActividad: msgText.slice(0, 160) || undefined,
        ultimaActividadAt: lastMsg?.createdAt ? new Date(lastMsg.createdAt).toISOString() : undefined,
        fase,
      };
      void persistState(state);
    } catch { /* progreso es best-effort */ }

    const pending = (fresh as any).autoPolishPending === true || isPolishActive(vol.volumeId);
    if (!pending) {
      vol.betaScore = (fresh as any).betaScore ?? null;
      vol.holisticScore = (fresh as any).holisticScore ?? null;
      // [Fix219] Copiar las notas de lectura del proyecto al estado de la
      // cura: sin esto el juez de decisiones ([Fix217]) no tiene material y
      // sale sin diagnosticar ("sin notas de lectura").
      const notes: string[] = [];
      const hol = (fresh as any).lastHolisticNotes;
      const bet = (fresh as any).lastBetaNotes;
      if (hol) notes.push(`HOLISTICO (${vol.holisticScore ?? "?"}/10):\n${String(hol).slice(0, 3000)}`);
      if (bet) notes.push(`BETA (${vol.betaScore ?? "?"}/10):\n${String(bet).slice(0, 3000)}`);
      if (notes.length > 0) vol.reviewNotes = notes.join("\n\n────────────\n\n");
      vol.steps.polish = "done";
      log(state, `Vol ${vol.seriesOrder}: pulido terminado (Beta ${vol.betaScore ?? "?"}/10, Holistico ${vol.holisticScore ?? "?"}/10).`);
      return;
    }
    if (state.cancelRequested) {
      // [Fix195] Cancelar la cura tambien PARA el pulido en marcha: se pide la
      // parada (el bucle sale limpio entre iteraciones conservando la mejor
      // version) y se apaga autoPolishPending para que no se reanude solo.
      requestPolishStop(vol.volumeId);
      await storage.updateProject(vol.volumeId, { autoPolishPending: false } as any).catch(() => {});
      vol.steps.polish = "skipped";
      log(state, `Vol ${vol.seriesOrder}: cura cancelada; parada del pulido solicitada (se detendra al cerrar la iteracion en curso).`);
      return;
    }
  }
  vol.steps.polish = "failed";
  vol.error = "El pulido no termino dentro del limite de 6 horas.";
  log(state, `Vol ${vol.seriesOrder}: ${vol.error}`);
}

// [Fix213] Resolver los issues documentados del Revisor Final ANTES del
// veredicto (solo volumenes nativos; el flujo de resolucion existe pero era
// manual). Una sola pasada por volumen; si quedan issues -> sugerencias.
async function runIssuesResolution(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  if (vol.volumeType !== "project") {
    vol.steps.issues = "skipped";
    return;
  }
  try {
    const project = await storage.getProject(vol.volumeId);
    const issues = (project as any)?.finalReviewResult?.issues;
    if (!project || !Array.isArray(issues) || issues.length === 0) {
      vol.steps.issues = "validated";
      log(state, `Vol ${vol.seriesOrder}: sin issues documentados del Revisor Final -> paso VALIDADO.`);
      return;
    }
    if ((project as any).status !== "completed") {
      vol.steps.issues = "skipped";
      log(state, `Vol ${vol.seriesOrder}: issues no resolubles ahora (status=${(project as any).status}).`);
      return;
    }

    vol.steps.issues = "running";
    log(state, `Vol ${vol.seriesOrder}: resolviendo ${issues.length} issue(s) documentado(s) del Revisor Final...`);
    await selfFetch(`/api/projects/${vol.volumeId}/resolve-issues`, {});

    const deadline = Date.now() + ISSUES_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, ISSUES_POLL_MS));
      const fresh = await storage.getProject(vol.volumeId).catch(() => undefined);
      if (!fresh) continue;
      if ((fresh as any).status === "completed") {
        const remaining = (fresh as any)?.finalReviewResult?.issues;
        const remainingCount = Array.isArray(remaining) ? remaining.length : 0;
        vol.issuesResolved = Math.max(0, issues.length - remainingCount);
        vol.steps.issues = "done";
        if (remainingCount > 0) {
          vol.suggestions.push(`Tras la resolucion automatica quedan ${remainingCount} issue(s) documentado(s) del Revisor Final (revisar manualmente).`);
        }
        log(state, `Vol ${vol.seriesOrder}: resolucion de issues terminada (${vol.issuesResolved}/${issues.length} resueltos).`);
        return;
      }
      if (state.cancelRequested) {
        vol.steps.issues = "skipped";
        log(state, `Vol ${vol.seriesOrder}: cura cancelada durante la resolucion de issues; el flujo interno terminara solo.`);
        return;
      }
    }
    vol.steps.issues = "failed";
    log(state, `Vol ${vol.seriesOrder}: la resolucion de issues no termino dentro del limite de 3 horas.`);
  } catch (e: any) {
    vol.steps.issues = "failed";
    log(state, `Vol ${vol.seriesOrder}: resolucion de issues fallo: ${e?.message || e}`);
  }
}

// [Fix209] Costura entre volumenes: cierre del tomo anterior + arranque de
// este, juzgados JUNTOS. Hallazgos con capitulo -> reescritura dirigida
// (tope 2 por costura); el resto -> sugerencias.
export async function runSeamCheck(
  state: SeriesCureState | null,
  prevVol: { volumeType: CureVolumeState["volumeType"]; volumeId: number; title: string; seriesOrder: number },
  vol: CureVolumeState,
): Promise<SeamJudgeResult | null> {
  const logSeam = (msg: string) => {
    if (state) log(state, msg);
    else console.log(`[SeriesCure seam] ${msg}`);
  };
  const prevAsVol: CureVolumeState = {
    ...prevVol,
    steps: { arcVerify: "pending", corrections: "pending", mdClean: "pending", deepRewrite: "pending", polish: "pending", issues: "pending", seam: "pending" },
    suggestions: [],
  };
  const [prevChapters, curChapters] = await Promise.all([
    getVolumeChapters(prevAsVol),
    getVolumeChapters(vol),
  ]);
  const sortAsc = (a: NormalizedChapter, b: NormalizedChapter) => a.chapterNumber - b.chapterNumber;
  // Cierre: ultimos 2-3 caps con numero positivo + epilogo (-1) si existe.
  const prevMain = prevChapters.filter((c) => c.chapterNumber > 0).sort(sortAsc);
  const prevEpilogue = prevChapters.filter((c) => c.chapterNumber === -1);
  const closing = [...prevMain.slice(-2), ...prevEpilogue].map((c) => ({ numero: c.chapterNumber, titulo: c.title, contenido: c.content }));
  // Arranque: prologo (0) si existe + primeros 2 caps.
  const curMain = curChapters.filter((c) => c.chapterNumber > 0).sort(sortAsc);
  const curPrologue = curChapters.filter((c) => c.chapterNumber === 0);
  const opening = [...curPrologue, ...curMain.slice(0, 2)].map((c) => ({ numero: c.chapterNumber, titulo: c.title, contenido: c.content }));

  if (closing.length === 0 || opening.length === 0) {
    logSeam(`Costura vol ${prevVol.seriesOrder}->${vol.seriesOrder}: sin capitulos suficientes; omitida.`);
    return null;
  }

  const result = await seamJudge.judgeSeam(
    `Vol ${prevVol.seriesOrder}: ${prevVol.title}`, closing,
    `Vol ${vol.seriesOrder}: ${vol.title}`, opening,
    vol.volumeType === "project" ? vol.volumeId : undefined,
  );
  if (!result) {
    logSeam(`Costura vol ${prevVol.seriesOrder}->${vol.seriesOrder}: el juez no devolvio veredicto.`);
    return null;
  }
  logSeam(`Costura vol ${prevVol.seriesOrder}->${vol.seriesOrder}: gancho ${result.ganchoScore}/10, recap-infodump=${result.recapInfodump}, continuidad=${result.continuidadEmocional}. ${result.hallazgos.length} hallazgo(s).`);
  return result;
}

async function runSeamStep(state: SeriesCureState, vol: CureVolumeState, prevVol: CureVolumeState | null): Promise<void> {
  if (!prevVol) {
    vol.steps.seam = "skipped";
    return;
  }
  // [Fix220] La costura reescribe el final del volumen ANTERIOR: si hay
  // decisiones editoriales ejecutandose sobre el, esperar a que terminen
  // (el worker siempre cierra decisionRun en su finally; tope defensivo).
  const SEAM_WAIT_POLL_MS = 20_000;
  const SEAM_WAIT_MAX_MS = 3 * 60 * 60 * 1000;
  const seamWaitStart = Date.now();
  let seamWaitLogged = false;
  while (
    prevVol.decisionRun === "running" &&
    !state.cancelRequested &&
    Date.now() - seamWaitStart < SEAM_WAIT_MAX_MS
  ) {
    if (!seamWaitLogged) {
      seamWaitLogged = true;
      log(state, `Vol ${vol.seriesOrder}: hay decisiones ejecutandose en el vol ${prevVol.seriesOrder}; la costura espera a que terminen.`);
    }
    await new Promise((r) => setTimeout(r, SEAM_WAIT_POLL_MS));
  }
  if (state.cancelRequested) { vol.steps.seam = "skipped"; return; }
  vol.steps.seam = "running";
  log(state, `Vol ${vol.seriesOrder}: revisando la costura con el vol ${prevVol.seriesOrder}...`);
  try {
    const result = await runSeamCheck(state, prevVol, vol);
    if (!result) {
      vol.steps.seam = "skipped";
      return;
    }
    vol.seamSummary = `Gancho ${result.ganchoScore}/10; recap-infodump=${result.recapInfodump ? "SI" : "no"}; continuidad emocional=${result.continuidadEmocional ? "ok" : "ROTA"}. ${result.resumen}`;

    const actionable = result.hallazgos.slice(0, MAX_SEAM_REWRITE_CHAPTERS);
    const rest = result.hallazgos.slice(MAX_SEAM_REWRITE_CHAPTERS);
    for (const h of rest) {
      vol.suggestions.push(`[costura vol ${h.volumen === "N" ? prevVol.seriesOrder : vol.seriesOrder}, cap ${h.capitulo}] ${h.instruccion}`);
    }

    let applied = 0;
    for (const h of actionable) {
      if (state.cancelRequested) break;
      const target = h.volumen === "N" ? prevVol : vol;
      try {
        const json = await selfFetch(`/api/series/${state.seriesId}/structural-rewrite`, {
          projectId: target.volumeId,
          volumeType: target.volumeType,
          chapterNumbers: [h.capitulo],
          structuralInstructions: `REESCRITURA DE COSTURA ENTRE VOLUMENES (cierre del tomo ${prevVol.seriesOrder} / arranque del tomo ${vol.seriesOrder}). ${h.instruccion}\nManten trama y elenco; corrige SOLO lo que pide la instruccion.`,
        });
        const ok = (json?.results || []).some((r: any) => r.success);
        if (ok) {
          applied++;
          log(state, `Costura: capitulo ${h.capitulo} del vol ${target.seriesOrder} reescrito.`);
        } else {
          vol.suggestions.push(`[costura vol ${target.seriesOrder}, cap ${h.capitulo}] ${h.instruccion}`);
        }
      } catch (e: any) {
        vol.suggestions.push(`[costura vol ${target.seriesOrder}, cap ${h.capitulo}] ${h.instruccion}`);
        log(state, `Costura: reescritura del cap ${h.capitulo} (vol ${target.seriesOrder}) fallo: ${e?.message || e}`);
      }
    }
    vol.steps.seam = result.hallazgos.length === 0 ? "validated" : "done";
    if (result.hallazgos.length === 0) {
      log(state, `Vol ${vol.seriesOrder}: costura limpia -> paso VALIDADO.`);
    } else {
      log(state, `Vol ${vol.seriesOrder}: costura revisada (${applied} correccion(es) aplicada(s), ${result.hallazgos.length - applied} sugerencia(s)).`);
    }
  } catch (e: any) {
    vol.steps.seam = "failed";
    log(state, `Vol ${vol.seriesOrder}: revision de costura fallo: ${e?.message || e}`);
  }
}

// [Fix208] Lector de Saga: al final de la cura, leer la serie completa del
// tiron y emitir veredicto de saga; hallazgos con volumen+capitulo concreto
// se corrigen por la via dirigida (tope global), el resto queda en sugerencias.
async function runSagaRead(state: SeriesCureState): Promise<void> {
  // [Fix220] La lectura de saga puede aplicar correcciones sobre CUALQUIER
  // volumen: si hay decisiones ejecutandose en paralelo, esperar a que
  // terminen (el worker siempre cierra decisionRun en su finally). Tope de
  // espera defensivo por si algo quedara colgado.
  const SAGA_WAIT_POLL_MS = 20_000;
  const SAGA_WAIT_MAX_MS = 3 * 60 * 60 * 1000;
  const waitStart = Date.now();
  while (
    state.volumes.some((v) => v.decisionRun === "running") &&
    !state.cancelRequested &&
    Date.now() - waitStart < SAGA_WAIT_MAX_MS
  ) {
    if (Date.now() - waitStart < SAGA_WAIT_POLL_MS) {
      log(state, "Lector de Saga: hay decisiones editoriales ejecutandose; se espera a que terminen antes de leer la saga.");
    }
    await new Promise((r) => setTimeout(r, SAGA_WAIT_POLL_MS));
  }
  if (state.cancelRequested) return;
  state.sagaStep = "running";
  log(state, `Lector de Saga: preparando lectura de la serie completa...`);
  try {
    const series = await storage.getSeries(state.seriesId);
    const seriesTitle = (series as any)?.name || (series as any)?.title || `Serie ${state.seriesId}`;

    const volTexts: Array<{ vol: CureVolumeState; text: string }> = [];
    for (const vol of state.volumes) {
      const chapters = (await getVolumeChapters(vol)).sort((a, b) => a.chapterNumber - b.chapterNumber);
      const text = chapters.map((c) => `### Capitulo ${c.chapterNumber}: ${c.title}\n${c.content}`).join("\n\n");
      volTexts.push({ vol, text });
    }
    const totalChars = volTexts.reduce((acc, v) => acc + v.text.length, 0);

    let volumesInput: Array<{ seriesOrder: number; title: string; fullText?: string; denseSummary?: string }>;
    if (totalChars <= FULL_READ_CHAR_BUDGET) {
      volumesInput = volTexts.map((v) => ({ seriesOrder: v.vol.seriesOrder, title: v.vol.title, fullText: v.text }));
      log(state, `Lector de Saga: la serie cabe integra (${Math.round(totalChars / 1000)}k chars) -> lectura del tiron.`);
    } else {
      // No cabe: texto integro del ULTIMO volumen + resumenes densos previos.
      log(state, `Lector de Saga: la serie excede el presupuesto (${Math.round(totalChars / 1000)}k chars) -> resumenes densos de los previos + ultimo integro.`);
      volumesInput = [];
      for (let i = 0; i < volTexts.length; i++) {
        const v = volTexts[i];
        if (i === volTexts.length - 1) {
          volumesInput.push({ seriesOrder: v.vol.seriesOrder, title: v.vol.title, fullText: v.text });
        } else {
          if (state.cancelRequested) { state.sagaStep = "skipped"; return; }
          const chapters = (await getVolumeChapters(v.vol)).sort((a, b) => a.chapterNumber - b.chapterNumber)
            .map((c) => ({ numero: c.chapterNumber, titulo: c.title, contenido: c.content }));
          const summary = await sagaReader.summarizeVolume(`Vol ${v.vol.seriesOrder}: ${v.vol.title}`, chapters);
          volumesInput.push({ seriesOrder: v.vol.seriesOrder, title: v.vol.title, denseSummary: summary || "(resumen no disponible)" });
          log(state, `Lector de Saga: resumen denso del vol ${v.vol.seriesOrder} ${summary ? "generado" : "FALLO"}.`);
        }
      }
    }

    const result = await sagaReader.readSaga(seriesTitle, volumesInput);
    if (!result) {
      state.sagaStep = "failed";
      log(state, `Lector de Saga: no devolvio veredicto.`);
      return;
    }

    const sugerencias: string[] = [];
    let aplicadas = 0;
    const actionable = result.hallazgos.filter((h) => h.capitulo !== null).slice(0, MAX_SAGA_CORRECTIONS);
    const nonActionable = result.hallazgos.filter((h) => h.capitulo === null || !actionable.includes(h));
    for (const h of nonActionable) {
      sugerencias.push(`[saga, vol ${h.volumen}${h.capitulo ? `, cap ${h.capitulo}` : ""}] ${h.instruccion}`);
    }
    for (const h of actionable) {
      if (state.cancelRequested) break;
      const target = state.volumes.find((v) => v.seriesOrder === h.volumen);
      if (!target) {
        sugerencias.push(`[saga, vol ${h.volumen}, cap ${h.capitulo}] ${h.instruccion}`);
        continue;
      }
      try {
        const json = await selfFetch(`/api/series/${state.seriesId}/apply-corrections`, {
          projectId: target.volumeId,
          volumeType: target.volumeType,
          corrections: [{ chapterNumber: h.capitulo, instruction: `HALLAZGO DE SAGA (lectura de la serie completa): ${h.instruccion}` }],
        });
        if ((json?.totalCorrected ?? 0) > 0) {
          aplicadas++;
          log(state, `Lector de Saga: correccion aplicada en vol ${h.volumen}, cap ${h.capitulo}.`);
        } else {
          sugerencias.push(`[saga, vol ${h.volumen}, cap ${h.capitulo}] ${h.instruccion}`);
        }
      } catch (e: any) {
        sugerencias.push(`[saga, vol ${h.volumen}, cap ${h.capitulo}] ${h.instruccion}`);
        log(state, `Lector de Saga: correccion en vol ${h.volumen} cap ${h.capitulo} fallo: ${e?.message || e}`);
      }
    }

    state.sagaVerdict = { ...result, correccionesAplicadas: aplicadas, sugerencias };
    state.sagaStep = "done";
    log(state, `Lector de Saga: nota de serie ${result.notaDeSerie}/10; ${aplicadas} correccion(es) aplicada(s), ${sugerencias.length} sugerencia(s).`);
  } catch (e: any) {
    state.sagaStep = "failed";
    log(state, `Lector de Saga fallo: ${e?.message || e}`);
  }
}

// [Fix216] Rescate "sin reservas": un veredicto "publicable_con_reservas" NO
// es aceptable como final — el usuario exige que todo volumen termine
// "publicable". Rondas extra (arco + correcciones + reescritura dirigida +
// relectura fresca Holistico+Beta) hasta lograrlo, con tope MAX_RESCUE_ROUNDS
// y corte por estancamiento (ronda sin mejora en ninguna nota).
async function runRescueLoop(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  let rescueRound = vol.rescueRounds ?? 0;
  while (
    vol.verdict === "publicable_con_reservas" &&
    rescueRound < MAX_RESCUE_ROUNDS &&
    !state.cancelRequested
  ) {
    rescueRound++;
    vol.rescueRounds = rescueRound;
    const prevBeta = vol.betaScore ?? 0;
    const prevHol = vol.holisticScore ?? 0;
    const prevArc = vol.arcScore ?? 0;
    log(state, `Vol ${vol.seriesOrder}: veredicto con reservas -> ronda de rescate ${rescueRound}/${MAX_RESCUE_ROUNDS} (objetivo: publicable sin reservas).`);
    await persistState(state, true);

    const rescueArc = await runArcVerify(state, vol);
    if (state.cancelRequested) return;
    if (rescueArc) {
      await runCorrections(state, vol, rescueArc);
      if (state.cancelRequested) return;
      await runDeepRewrite(state, vol, rescueArc);
      if (state.cancelRequested) return;
    }
    // Relectura FRESCA Holistico+Beta para todos los tipos de volumen
    // (mucho mas barata que relanzar el pulido completo) -> notas nuevas.
    await runOneShotReview(state, vol);
    if (state.cancelRequested) return;

    computeVerdict(vol);
    // TS no ve que computeVerdict muta vol.verdict (inferencia estrecha del
    // while); se relee via variable tipada ancha.
    const verdictNow = vol.verdict as CureVolumeState["verdict"];
    log(state, `Vol ${vol.seriesOrder}: rescate ${rescueRound} -> veredicto = ${verdictNow} (Beta ${vol.betaScore ?? "?"}, Holistico ${vol.holisticScore ?? "?"}, arco ${vol.arcScore ?? "?"}).`);

    if (verdictNow === "publicable") break;
    const improved =
      (vol.betaScore ?? 0) > prevBeta ||
      (vol.holisticScore ?? 0) > prevHol ||
      (vol.arcScore ?? 0) > prevArc;
    if (!improved) {
      log(state, `Vol ${vol.seriesOrder}: ronda de rescate ${rescueRound} sin mejora en ninguna nota; se corta el rescate para no gastar sin avance.`);
      break;
    }
  }
  // [Fix218] El diagnostico de decisiones ya no es solo para "con reservas":
  // un volumen que quedo "necesita_cirugia" tambien recibe la lista de
  // decisiones ejecutables (antes solo dejaba el aviso de revision manual).
  if (
    (vol.verdict === "publicable_con_reservas" || vol.verdict === "necesita_cirugia") &&
    !state.cancelRequested
  ) {
    // Dedupe: si la cura se reanuda varias veces no se apila la misma nota.
    const PREFIX = vol.verdict === "necesita_cirugia"
      ? `El volumen quedo "necesita cirugia"`
      : `El volumen quedo "publicable con reservas"`;
    vol.suggestions = vol.suggestions.filter(
      (s) => !s.startsWith(`El volumen quedo "publicable con reservas"`) && !s.startsWith(`El volumen quedo "necesita cirugia"`),
    );
    vol.suggestions.push(
      `${PREFIX} tras ${vol.rescueRounds ?? 0} ronda(s) de rescate (Beta ${vol.betaScore ?? "?"}/10, Holistico ${vol.holisticScore ?? "?"}/10, arco ${vol.arcPassed ? "PASSED" : "con observaciones"}). Revisa las decisiones pendientes del panel: puedes seleccionar cuales ejecutar.`,
    );
    // [Fix217] Diagnostico de decisiones: traducir las notas finales de los
    // lectores a una lista de cambios concretos que el usuario puede APROBAR
    // en el panel (con contexto de serie para no romper la continuidad).
    await runDecisionDiagnosis(state, vol);
  }
}

// [Fix217] Ejecuta el juez de diagnostico y deja las decisiones pendientes en
// el estado del volumen (sobrescribe las anteriores NO ejecutadas: en cada
// reanudacion el diagnostico se rehace sobre las notas frescas, pero las ya
// ejecutadas se conservan como historial).
async function runDecisionDiagnosis(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  if (!vol.reviewNotes && vol.volumeType === "project") {
    // [Fix219] Curas cerradas antes del fix: recuperar las ultimas notas de
    // lectura guardadas en el proyecto por el pulido.
    try {
      const proj = await storage.getProject(vol.volumeId);
      const notes: string[] = [];
      if ((proj as any)?.lastHolisticNotes) notes.push(`HOLISTICO (${vol.holisticScore ?? "?"}/10):\n${String((proj as any).lastHolisticNotes).slice(0, 3000)}`);
      if ((proj as any)?.lastBetaNotes) notes.push(`BETA (${vol.betaScore ?? "?"}/10):\n${String((proj as any).lastBetaNotes).slice(0, 3000)}`);
      if (notes.length > 0) {
        vol.reviewNotes = notes.join("\n\n────────────\n\n");
        log(state, `Vol ${vol.seriesOrder}: notas de lectura recuperadas del proyecto para el diagnostico.`);
      }
    } catch { /* fallback abajo */ }
  }
  if (!vol.reviewNotes) {
    // [Fix219] Ultimo recurso: lectura puntual fresca Holistico+Beta para
    // tener material de diagnostico (antes salia en silencio y el panel
    // prometia decisiones que nunca aparecian).
    log(state, `Vol ${vol.seriesOrder}: sin notas de lectura; se lanza una lectura puntual para poder diagnosticar.`);
    const prevPolish = vol.steps.polish;
    await runOneShotReview(state, vol);
    // Salvaguarda: la lectura es solo material de diagnostico; si el pulido
    // ya estaba cerrado no se degrada su estado en el panel/historico.
    if (prevPolish === "done") vol.steps.polish = "done";
  }
  if (!vol.reviewNotes) {
    log(state, `Vol ${vol.seriesOrder}: sin notas de lectura; no se puede diagnosticar decisiones pendientes.`);
    return;
  }
  try {
    const chapters = await getVolumeChapters(vol);
    const chapterIndex = chapters
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .map((c) => ({ numero: c.chapterNumber, titulo: c.title, extracto: c.content.slice(0, 500) }));
    const seriesContext = await buildSeriesContextForReviewers({
      seriesId: state.seriesId,
      seriesOrder: vol.seriesOrder,
    }).catch(() => undefined);
    log(state, `Vol ${vol.seriesOrder}: diagnostico de decisiones pendientes (juez editorial${seriesContext ? " con contexto de serie" : ""})...`);
    const decisions = await decisionDiagnosis.diagnose({
      volumeTitle: vol.title,
      reviewNotes: vol.reviewNotes,
      betaScore: vol.betaScore ?? null,
      holisticScore: vol.holisticScore ?? null,
      arcPassed: vol.arcPassed === true,
      chapterIndex,
      seriesContext,
      projectId: vol.volumeType === "project" ? vol.volumeId : undefined,
    });
    const executed = (vol.pendingDecisions || []).filter((d) => d.status === "ejecutada");
    if (!decisions || decisions.length === 0) {
      vol.pendingDecisions = executed;
      log(state, `Vol ${vol.seriesOrder}: el juez no devolvio decisiones accionables.`);
      return;
    }
    vol.pendingDecisions = [
      ...executed,
      ...decisions.map((d, i) => ({
        id: `${vol.volumeId}-${Date.now()}-${i}`,
        titulo: d.titulo,
        instruccion: d.instruccion,
        capitulos: d.capitulos,
        tipo: d.tipo,
        status: "pendiente" as const,
      })),
    ];
    log(state, `Vol ${vol.seriesOrder}: ${decisions.length} decision(es) pendiente(s) diagnosticada(s); seleccionalas en el panel para ejecutarlas.`);
    await persistState(state, true);
  } catch (e: any) {
    log(state, `Vol ${vol.seriesOrder}: el diagnostico de decisiones fallo: ${e?.message || e}`);
  }
}

// [Fix217] Ejecuta las decisiones SELECCIONADAS por el usuario sobre un volumen
// que quedo "publicable con reservas": correcciones quirurgicas o reescrituras
// dirigidas (ambas vias ya inyectan World Bible/contexto), y despues una
// relectura fresca Holistico+Beta que recalcula el veredicto.
// [Fix217] Lock SINCRONO por serie+volumen: Node es monohilo, asi que un
// check-and-set sin ningun await entre medias es atomico y evita que dos POST
// concurrentes lancen dos workers sobre el mismo volumen.
const decisionLocks = new Set<string>();

export async function executeCureDecisions(
  seriesId: number,
  volumeType: string,
  volumeId: number,
  decisionIds: string[],
): Promise<{ success: boolean; message: string }> {
  const lockKey = `${seriesId}:${volumeType}:${volumeId}`;
  if (decisionLocks.has(lockKey)) {
    return { success: false, message: "Ya hay decisiones ejecutandose en este volumen." };
  }
  decisionLocks.add(lockKey);
  let lockReleased = false;
  const releaseLock = () => { if (!lockReleased) { lockReleased = true; decisionLocks.delete(lockKey); } };
  try {
    const inMemory = cureRegistry.get(seriesId);
    if (inMemory && inMemory.status === "running") {
      // [Fix220] La cura en marcha ya NO bloquea todo: solo si esta
      // trabajando en ESTE volumen o en la lectura final de saga (que toca
      // cualquier volumen). Con la cura ocupada en otro volumen, las
      // decisiones de un volumen ya cerrado se pueden ejecutar en paralelo.
      const curIdx = inMemory.currentVolumeIndex ?? -1;
      const targetIdx = inMemory.volumes.findIndex((v) => v.volumeType === volumeType && v.volumeId === volumeId);
      // La cura toca el volumen ACTUAL; el ANTERIOR solo durante la costura
      // [Fix209] (puede reescribir su final), asi que se bloquea unicamente
      // mientras ese paso esta corriendo, no durante toda la tuberia.
      const busyOnThisVolume = targetIdx >= 0 && (
        targetIdx === curIdx ||
        (targetIdx === curIdx - 1 && inMemory.volumes[curIdx]?.steps?.seam === "running")
      );
      const sagaBusy = (inMemory as any).sagaStep === "running";
      if (busyOnThisVolume || sagaBusy) {
        releaseLock();
        return {
          success: false,
          message: sagaBusy
            ? "La lectura de saga final esta en marcha; espera a que termine."
            : "La cura esta trabajando ahora mismo en este volumen; espera a que lo cierre.",
        };
      }
    }
    const state = inMemory ?? (await getSeriesCureStatusWithHistory(seriesId));
    if (!state) { releaseLock(); return { success: false, message: "No hay ninguna cura registrada para esta serie." }; }
    // Los IDs pueden colisionar entre las 3 tablas (project/imported/reedit):
    // el volumen se resuelve SIEMPRE por tipo + id.
    const vol = state.volumes.find((v) => v.volumeType === volumeType && v.volumeId === volumeId);
    if (!vol) { releaseLock(); return { success: false, message: "Volumen no encontrado en la ultima cura." }; }
    if (vol.decisionRun === "running") {
      releaseLock();
      return { success: false, message: "Ya hay decisiones ejecutandose en este volumen." };
    }
    const selected = (vol.pendingDecisions || []).filter(
      (d) => decisionIds.includes(d.id) && d.status !== "ejecutada" && d.status !== "ejecutando",
    );
    if (selected.length === 0) {
      releaseLock();
      return { success: false, message: "Ninguna de las decisiones seleccionadas esta pendiente." };
    }
    // Registrar el estado en memoria para que el panel vea el progreso en vivo.
    cureRegistry.set(seriesId, state);
    vol.decisionRun = "running";
    // [Fix220] cancelRequested solo se resetea si NO hay cura corriendo:
    // antes se pisaba siempre y podia deshacer una cancelacion pedida por el
    // usuario mientras runCure seguia procesando otro volumen.
    if (!(inMemory && inMemory.status === "running")) state.cancelRequested = false;
    await persistState(state, true);

  void (async () => {
    try {
      for (const d of selected) {
        d.status = "ejecutando";
        log(state, `Vol ${vol.seriesOrder}: ejecutando decision aprobada "${d.titulo}" (${d.tipo}, cap(s) ${d.capitulos.join(", ")})...`);
        try {
          if (d.tipo === "reescritura") {
            const json = await selfFetch(`/api/series/${seriesId}/structural-rewrite`, {
              projectId: vol.volumeId,
              volumeType: vol.volumeType,
              chapterNumbers: d.capitulos,
              structuralInstructions: `DECISION EDITORIAL APROBADA POR EL USUARIO (perspectiva de serie): ${d.instruccion}\nManten la trama y el elenco; puedes modificar cualquier porcentaje del texto para cumplir la decision, dramatizando EN PAGINA lo decisivo.`,
            });
            const ok = (json?.results || []).some((r: any) => r.success);
            d.status = ok ? "ejecutada" : "fallida";
          } else {
            const json = await selfFetch(`/api/series/${seriesId}/apply-corrections`, {
              projectId: vol.volumeId,
              volumeType: vol.volumeType,
              corrections: d.capitulos.map((cap) => ({
                chapterNumber: cap,
                instruction: `DECISION EDITORIAL APROBADA POR EL USUARIO: ${d.instruccion}`,
              })),
            });
            d.status = (json?.totalCorrected ?? 0) > 0 ? "ejecutada" : "fallida";
          }
        } catch (e: any) {
          d.status = "fallida";
          log(state, `Vol ${vol.seriesOrder}: la decision "${d.titulo}" fallo: ${e?.message || e}`);
        }
        await persistState(state, true);
      }

      const anyApplied = selected.some((d) => d.status === "ejecutada");
      if (anyApplied) {
        // Relectura fresca + veredicto nuevo: si cruza el umbral, el volumen
        // queda "publicable"; si no, el proximo diagnostico partira de notas
        // frescas.
        await runOneShotReview(state, vol);
        computeVerdict(vol);
        log(state, `Vol ${vol.seriesOrder}: tras las decisiones, veredicto = ${vol.verdict} (Beta ${vol.betaScore ?? "?"}, Holistico ${vol.holisticScore ?? "?"}).`);
        if (vol.verdict === "publicable_con_reservas" || vol.verdict === "necesita_cirugia") {
          // [Fix218] Rediagnostico tambien si sigue en "necesita cirugia".
          await runDecisionDiagnosis(state, vol);
        } else if (vol.verdict === "publicable") {
          vol.pendingDecisions = (vol.pendingDecisions || []).filter((d) => d.status === "ejecutada");
        }
      }
      vol.decisionRun = "done";
    } catch (e: any) {
      vol.decisionRun = "failed";
      log(state, `Vol ${vol.seriesOrder}: la ejecucion de decisiones fallo: ${e?.message || e}`);
    } finally {
      releaseLock();
      await persistState(state, true);
    }
  })();

    return { success: true, message: `Ejecutando ${selected.length} decision(es); el panel mostrara el progreso y el nuevo veredicto.` };
  } catch (e) {
    releaseLock();
    throw e;
  }
}

function computeVerdict(vol: CureVolumeState): void {
  if (vol.steps.polish !== "done") {
    // Sin pulido ni lectura puntual el veredicto sale solo del arco:
    // honesto pero parcial.
    if (vol.arcPassed === undefined) { vol.verdict = "sin_veredicto"; return; }
    vol.verdict = vol.arcPassed ? "publicable_con_reservas" : "necesita_cirugia";
    return;
  }
  // [Fix211] Los volumenes imported/reedit con lectura puntual ya usan
  // Beta/Holistico como los nativos.
  const beta = vol.betaScore ?? 0;
  const holistic = vol.holisticScore ?? 0;
  if (vol.arcPassed && beta >= 9 && holistic >= 8) vol.verdict = "publicable";
  else if (beta >= 8 && (vol.arcPassed || holistic >= 7)) vol.verdict = "publicable_con_reservas";
  else vol.verdict = "necesita_cirugia";
}

async function runCure(state: SeriesCureState): Promise<void> {
  try {
    for (let i = 0; i < state.volumes.length; i++) {
      if (state.cancelRequested) {
        state.status = "cancelled";
        break;
      }
      state.currentVolumeIndex = i;
      const vol = state.volumes[i];
      // [Fix205] Reanudacion: un volumen ya cerrado (con veredicto) se respeta.
      if (vol.verdict) {
        // [Fix216] "publicable_con_reservas" ya no es final: al reanudar, un
        // volumen cerrado con reservas entra directo al rescate (sin repetir
        // toda la tuberia); los demas veredictos si se respetan.
        if (vol.verdict === "publicable_con_reservas" && (vol.rescueRounds ?? 0) < MAX_RESCUE_ROUNDS) {
          log(state, `=== Volumen ${vol.seriesOrder}: "${vol.title}" quedo con reservas; se reintenta el rescate. ===`);
          await runRescueLoop(state, vol);
          if (state.cancelRequested) { state.status = "cancelled"; break; }
          continue;
        }
        // [Fix218] Un volumen cerrado en "necesita_cirugia" SIN decisiones
        // pendientes (curas anteriores al fix) recibe el diagnostico al
        // reanudar: solo el juez, sin repetir la tuberia ni el rescate.
        if (vol.verdict === "necesita_cirugia" && !(vol.pendingDecisions || []).some((d) => d.status !== "ejecutada")) {
          log(state, `=== Volumen ${vol.seriesOrder}: "${vol.title}" quedo en necesita_cirugia sin decisiones; se diagnostican. ===`);
          await runDecisionDiagnosis(state, vol);
          if (state.cancelRequested) { state.status = "cancelled"; break; }
          continue;
        }
        log(state, `=== Volumen ${vol.seriesOrder}: "${vol.title}" ya curado (veredicto ${vol.verdict}); se omite. ===`);
        continue;
      }
      log(state, `=== Volumen ${vol.seriesOrder}: "${vol.title}" (${vol.volumeType}) ===`);

      const arcResult = await runArcVerify(state, vol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }

      if (arcResult) {
        await runCorrections(state, vol, arcResult);
        if (state.cancelRequested) { state.status = "cancelled"; break; }
        await runMarkdownCleanup(state, vol);
        if (state.cancelRequested) { state.status = "cancelled"; break; }
        await runDeepRewrite(state, vol, arcResult);
        if (state.cancelRequested) { state.status = "cancelled"; break; }
      } else {
        vol.steps.corrections = "skipped";
        await runMarkdownCleanup(state, vol);
        vol.steps.deepRewrite = "skipped";
      }

      await runPolishAndWait(state, vol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }

      // [Fix213] Issues documentados del Revisor Final antes del veredicto.
      await runIssuesResolution(state, vol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }

      // [Fix209] Costura con el volumen anterior (si existe).
      const prevVol = i > 0 ? state.volumes[i - 1] : null;
      await runSeamStep(state, vol, prevVol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }

      computeVerdict(vol);
      log(state, `Vol ${vol.seriesOrder}: veredicto = ${vol.verdict}.`);

      await runRescueLoop(state, vol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }
    }

    // [Fix208] Lectura de saga final (solo si la cura no se cancelo/fallo y
    // hay mas de un volumen: con uno solo no hay "saga" que juzgar).
    if (state.status === "running" && !state.cancelRequested) {
      if (state.volumes.length > 1) {
        await runSagaRead(state);
      } else {
        state.sagaStep = "skipped";
      }
    }

    if (state.status === "running") state.status = "completed";
  } catch (e: any) {
    state.status = "failed";
    log(state, `La cura fallo: ${e?.message || e}`);
  } finally {
    state.finishedAt = new Date().toISOString();
    log(state, `Cura de serie terminada con estado: ${state.status}.`);
    await persistState(state, true);
  }
}

export async function startSeriesCure(seriesId: number): Promise<{ success: boolean; message: string }> {
  // Guard ATOMICO (check+set sincrono, SIN await en medio): se registra el
  // estado "running" ANTES de cualquier operacion asincrona. Dos POST /cure
  // simultaneos no pueden arrancar dos runners: el segundo ve el registro y
  // recibe 409. Si la preparacion falla, el registro se limpia en el catch.
  const existing = cureRegistry.get(seriesId);
  if (existing && existing.status === "running") {
    return { success: false, message: "Ya hay una cura en marcha para esta serie" };
  }
  const state: SeriesCureState = {
    seriesId,
    status: "running",
    startedAt: new Date().toISOString(),
    currentVolumeIndex: 0,
    volumes: [],
    log: [],
  };
  cureRegistry.set(seriesId, state);

  try {
    const series = await storage.getSeries(seriesId);
    if (!series) {
      cureRegistry.delete(seriesId);
      return { success: false, message: "Serie no encontrada" };
    }

    const volumes = await collectVolumes(seriesId);
    if (volumes.length === 0) {
      cureRegistry.delete(seriesId);
      return { success: false, message: "La serie no tiene volumenes terminados que curar" };
    }

    state.volumes = volumes;
    log(state, `Cura de serie iniciada: ${volumes.length} volumen(es) en orden ${volumes.map((v) => v.seriesOrder).join(", ")}.`);
    await persistState(state, true);

    void runCure(state);
    return { success: true, message: `Cura iniciada para ${volumes.length} volumen(es)` };
  } catch (e) {
    cureRegistry.delete(seriesId);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [Fix205] Auto-reanudacion al arrancar el server: runs persistidas como
// "running" quedaron interrumpidas por un reinicio -> se reanudan desde el
// volumen donde iban (los volumenes con veredicto se respetan; el volumen en
// curso se re-ejecuta desde el arco, sus pasos son idempotentes; el pulido
// tiene ademas su propio auto-resume via autoPolishPending, coordinado porque
// runPolishAndWait espera por flag, no relanza si ya esta activo).
// ─────────────────────────────────────────────────────────────────────────────
export async function autoResumeInterruptedCures(): Promise<void> {
  try {
    await ensureCureTable();
    const res: any = await db.execute(sql`
      SELECT DISTINCT ON (series_id) series_id, state
      FROM series_cure_runs
      WHERE status = 'running'
      ORDER BY series_id, started_at DESC
    `);
    const rows: any[] = res?.rows || [];
    for (const row of rows) {
      const seriesId = Number(row.series_id);
      if (!Number.isFinite(seriesId) || cureRegistry.has(seriesId)) continue;
      const persisted = row.state as SeriesCureState;
      if (!persisted || !Array.isArray(persisted.volumes) || persisted.volumes.length === 0) {
        await db.execute(sql`UPDATE series_cure_runs SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE series_id = ${seriesId} AND status = 'running'`);
        continue;
      }
      const state: SeriesCureState = {
        ...persisted,
        status: "running",
        cancelRequested: false,
        resumedAt: new Date().toISOString(),
      };
      // Pasos que quedaron "running" al morir el proceso vuelven a "pending"
      // para re-ejecutarse (todos son idempotentes o re-verificables).
      for (const vol of state.volumes) {
        for (const key of Object.keys(vol.steps) as Array<keyof CureVolumeState["steps"]>) {
          if (vol.steps[key] === "running") vol.steps[key] = "pending";
        }
        // [Fix217] Estados huerfanos de la ejecucion de decisiones: si el
        // proceso murio a mitad, el worker ya no existe -> normalizar para
        // que el usuario pueda relanzarlas desde el panel.
        if (vol.decisionRun === "running") {
          vol.decisionRun = "failed";
          for (const d of vol.pendingDecisions || []) {
            if (d.status === "ejecutando") d.status = "pendiente";
          }
          log(state, `Vol ${vol.seriesOrder}: ejecucion de decisiones interrumpida por el reinicio; las decisiones vuelven a "pendiente" (relanzalas desde el panel).`);
        }
      }
      if (state.sagaStep === "running") state.sagaStep = "pending";
      cureRegistry.set(seriesId, state);
      log(state, `[Fix205] Cura reanudada tras reinicio del server (interrumpida en el volumen indice ${state.currentVolumeIndex}).`);
      void runCure(state);
    }
  } catch (e) {
    console.warn(`[SeriesCure] Auto-reanudacion fallo: ${(e as Error).message}`);
  }
}
