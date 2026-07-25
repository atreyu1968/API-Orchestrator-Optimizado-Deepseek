// ─────────────────────────────────────────────────────────────────────────────
// [Fix259] Verificacion de datos de TODA la novela (fact-check global).
// Recorre los capitulos en orden narrativo, verifica cada uno con el endpoint
// de Fix252/256, aplica automaticamente las correcciones OBJETIVAS (veredicto
// "incorrecto" con sugerencia) via el endpoint de Fix255 y re-verifica hasta
// 2 rondas por capitulo. Los "dudosos" y los hallazgos sin sugerencia NO se
// tocan (pueden ser retcons deliberados): van al informe final.
// Doble entrada: boton manual (routes) y pasada automatica del orquestador
// justo antes del gate del Lector Holistico (asi el Holistico y el Revisor
// Final leen el texto ya corregido). Best-effort: nunca bloquea el pipeline.
// Estado en memoria (sin tabla): un reinicio pierde la run en curso; la
// pasada es re-lanzable y cada correccion ya aplicada persiste en la BD.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { INTERNAL_AUTH_HEADER, INTERNAL_AUTH_TOKEN } from "../auth";
import { recomputeCompletionStatus } from "./completion-status";

export interface NovelFactFinding {
  chapterId: number;
  chapterLabel: string;
  afirmacion: string;
  categoria: string;
  veredicto: string;
  explicacion: string;
  sugerencia: string;
}

export interface NovelFactCheckState {
  projectId: number;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  chaptersTotal: number;
  chaptersDone: number;
  currentChapterLabel?: string;
  correctionsApplied: number;
  cleanChapters: number;
  // Capitulos que no pudieron verificarse/corregirse (413 por longitud, 409
  // en escritura, error de red...): el informe no debe parecer "completo".
  failedChapters: number;
  // Hallazgos NO corregidos automaticamente (dudosos, sin sugerencia, o
  // incorrectos que persistieron tras agotar las rondas).
  pending: NovelFactFinding[];
  cancelRequested?: boolean;
  error?: string;
}

const registry = new Map<number, NovelFactCheckState>();

// Techo de rondas de correccion por capitulo: la leccion de los bucles que
// persiguen a un juez que oscila — 2 rondas y lo restante va al informe.
const MAX_APPLY_ROUNDS = 2;

function baseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || "5000"}`;
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

async function logActivity(projectId: number, message: string, level: "info" | "warning" | "success" = "info"): Promise<void> {
  try {
    await storage.createActivityLog({ projectId, level, agentRole: "fact-checker", message, metadata: { fix: "Fix259" } });
  } catch { /* el log nunca rompe la pasada */ }
}

// [Fix263] Persiste (o limpia) la lista de fichas pendientes del fact-check
// como worldRule "__fact_check_pending" (patron del dossier Fix257) y
// recalcula el estado final del proyecto. Best-effort: nunca rompe la pasada.
export async function persistFactCheckPending(projectId: number, pending: NovelFactFinding[]): Promise<void> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    if (wb) {
      const rules = ((wb.worldRules || []) as any[]).filter((r: any) => r?.category !== "__fact_check_pending");
      if (pending.length > 0) {
        rules.push({ category: "__fact_check_pending", pendientes: pending, updatedAt: new Date().toISOString() });
      }
      await storage.updateWorldBible(wb.id, { worldRules: rules } as any);
    }
    await recomputeCompletionStatus(projectId);
  } catch (e) {
    console.warn(`[Fix263] persistFactCheckPending fallo para proyecto ${projectId}: ${(e as Error).message}`);
  }
}

// [Fix263] Retira de la worldRule las fichas ya decididas (corregidas a mano
// o via endpoint apply) identificandolas por afirmacion+capitulo, y recalcula
// el estado del proyecto. Llamado desde routes tras aplicar correcciones.
export async function resolveFactCheckPending(
  projectId: number,
  resolved: { afirmacion?: string; chapterId?: number }[]
): Promise<void> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    if (!wb) return;
    const rules = (wb.worldRules || []) as any[];
    const rule = rules.find((r: any) => r?.category === "__fact_check_pending");
    if (!rule || !Array.isArray(rule.pendientes)) return;
    const before = rule.pendientes.length;
    rule.pendientes = rule.pendientes.filter((p: NovelFactFinding) =>
      !resolved.some((r) =>
        (r.afirmacion ? p.afirmacion === r.afirmacion : true) &&
        (r.chapterId != null ? p.chapterId === r.chapterId : true)
      )
    );
    if (rule.pendientes.length !== before) {
      const next = rule.pendientes.length > 0
        ? rules
        : rules.filter((r: any) => r?.category !== "__fact_check_pending");
      rule.updatedAt = new Date().toISOString();
      await storage.updateWorldBible(wb.id, { worldRules: next } as any);
      await recomputeCompletionStatus(projectId);
    }
  } catch (e) {
    console.warn(`[Fix263] resolveFactCheckPending fallo para proyecto ${projectId}: ${(e as Error).message}`);
  }
}

function chapterLabel(n: number): string {
  return n === 0 ? "Prólogo" : n === -1 ? "Epílogo" : n === -2 ? "Nota del Autor" : `Capítulo ${n}`;
}

function narrativeIndex(n: number): number {
  return n === 0 ? 0 : n > 0 ? n : n === -1 ? 1_000_000 : 1_000_001;
}

export function getNovelFactCheckStatus(projectId: number): NovelFactCheckState | undefined {
  return registry.get(projectId);
}

export function cancelNovelFactCheck(projectId: number): boolean {
  const state = registry.get(projectId);
  if (!state || state.status !== "running") return false;
  state.cancelRequested = true;
  return true;
}

async function runPass(state: NovelFactCheckState): Promise<void> {
  const { projectId } = state;
  try {
    const chapters = (await storage.getChaptersByProject(projectId))
      .filter((c) => (c.content || "").trim())
      .sort((a, b) => narrativeIndex(a.chapterNumber) - narrativeIndex(b.chapterNumber));
    state.chaptersTotal = chapters.length;
    await logActivity(projectId, `[Fix259] Verificación de datos de toda la novela iniciada: ${chapters.length} capítulos en orden narrativo. Se corrigen automáticamente solo los errores objetivos con corrección propuesta; los dudosos se listan en el informe final.`);

    for (const ch of chapters) {
      if (state.cancelRequested) {
        state.status = "cancelled";
        state.finishedAt = new Date().toISOString();
        await logActivity(projectId, `[Fix259] Verificación cancelada por el usuario tras ${state.chaptersDone}/${state.chaptersTotal} capítulos.`, "warning");
        return;
      }
      const label = chapterLabel(ch.chapterNumber);
      state.currentChapterLabel = label;
      let appliedHere = 0;
      let leftover: NovelFactFinding[] = [];

      try {
        let findings: any[] = [];
        for (let round = 0; round <= MAX_APPLY_ROUNDS; round++) {
          const result = await selfFetch(`/api/projects/${projectId}/chapters/${ch.id}/fact-check`, {});
          findings = Array.isArray(result?.findings) ? result.findings : [];
          const correctables = findings.filter(
            (f: any) => f.veredicto === "incorrecto" && typeof f.sugerencia === "string" && f.sugerencia.trim(),
          );
          if (correctables.length === 0 || round === MAX_APPLY_ROUNDS) break;
          const applied = await selfFetch(`/api/projects/${projectId}/chapters/${ch.id}/fact-check/apply`, { findings: correctables });
          appliedHere += Number(applied?.appliedCount) || correctables.length;
          state.correctionsApplied += Number(applied?.appliedCount) || correctables.length;
        }
        // Lo que queda tras la ultima verificacion y NO es "correcto" va al informe.
        leftover = findings
          .filter((f: any) => f.veredicto === "incorrecto" || f.veredicto === "dudoso")
          .map((f: any) => ({
            chapterId: ch.id,
            chapterLabel: label,
            afirmacion: String(f.afirmacion || "").slice(0, 500),
            categoria: String(f.categoria || "otros"),
            veredicto: String(f.veredicto),
            explicacion: String(f.explicacion || "").slice(0, 800),
            sugerencia: String(f.sugerencia || "").slice(0, 800),
          }));
        state.pending.push(...leftover);
        if (appliedHere === 0 && leftover.length === 0) {
          state.cleanChapters++;
        } else {
          const parts: string[] = [];
          if (appliedHere > 0) parts.push(`${appliedHere} corrección(es) aplicada(s)`);
          const dud = leftover.filter((f) => f.veredicto === "dudoso").length;
          const inc = leftover.length - dud;
          if (inc > 0) parts.push(`${inc} error(es) sin resolver`);
          if (dud > 0) parts.push(`${dud} dudoso(s) para revisión manual`);
          await logActivity(projectId, `[Fix259] ${label}: ${parts.join(", ")}.`, inc > 0 ? "warning" : "info");
        }
      } catch (e) {
        // Un capitulo que falla (p. ej. 413 por longitud, o 409 en escritura)
        // no tumba la pasada: se anota y se continua con el siguiente.
        state.failedChapters++;
        await logActivity(projectId, `[Fix259] ${label}: no se pudo verificar/corregir (${(e as Error).message.slice(0, 200)}). Se continúa con el siguiente.`, "warning");
      }
      state.chaptersDone++;
    }

    state.status = "completed";
    state.finishedAt = new Date().toISOString();
    state.currentChapterLabel = undefined;
    // [Fix263] Persistir las fichas pendientes como worldRule para que
    // sobrevivan a un reinicio del server y cuenten como "issues conocidos"
    // en el estado final del proyecto (completed vs completed_with_issues).
    await persistFactCheckPending(projectId, state.pending);
    const dudosos = state.pending.filter((f) => f.veredicto === "dudoso").length;
    const incorrectos = state.pending.length - dudosos;
    await logActivity(
      projectId,
      `[Fix259] Verificación de toda la novela completada: ${state.chaptersDone} capítulos revisados, ${state.correctionsApplied} corrección(es) objetiva(s) aplicada(s), ${state.cleanChapters} capítulos limpios${state.failedChapters > 0 ? `, ${state.failedChapters} capítulo(s) NO verificados por error` : ""}. Pendientes de decisión humana: ${incorrectos} error(es) no resueltos y ${dudosos} dudoso(s) (corrígelos ficha a ficha desde el visor de capítulos).`,
      incorrectos > 0 || state.failedChapters > 0 ? "warning" : "success",
    );
  } catch (e) {
    state.status = "failed";
    state.finishedAt = new Date().toISOString();
    state.error = (e as Error).message;
    await logActivity(projectId, `[Fix259] La verificación de toda la novela falló: ${(e as Error).message.slice(0, 300)}. Puedes relanzarla; las correcciones ya aplicadas se conservan.`, "warning");
  }
}

export function startNovelFactCheck(projectId: number): { success: boolean; message: string } {
  // Guard atomico (check+set sincrono, sin await en medio): dos arranques
  // simultaneos no pueden crear dos runners.
  const existing = registry.get(projectId);
  if (existing && existing.status === "running") {
    return { success: false, message: "Ya hay una verificación en marcha para esta novela" };
  }
  const state: NovelFactCheckState = {
    projectId,
    status: "running",
    startedAt: new Date().toISOString(),
    chaptersTotal: 0,
    chaptersDone: 0,
    correctionsApplied: 0,
    cleanChapters: 0,
    failedChapters: 0,
    pending: [],
  };
  registry.set(projectId, state);
  void runPass(state);
  return { success: true, message: "Verificación de toda la novela iniciada" };
}

// [Fix259] Entrada sincrona para el orquestador: corre la pasada completa y
// espera a que termine (asi el Holistico lee el texto ya corregido). Si ya
// se completo una pasada para este proyecto en esta sesion del server, no se
// repite (evita pagar dos veces si el Revisor Final se relanza).
export async function runNovelFactCheckBeforeReview(projectId: number): Promise<NovelFactCheckState | null> {
  // Techo defensivo de espera: ~2h para novelas grandes (32 caps ~ 30-60 min
  // reales). Si se supera, el pipeline continua (best-effort) sin bloquear.
  const WAIT_TIMEOUT_MS = 2 * 60 * 60 * 1000;
  const waitFor = async (state: NovelFactCheckState): Promise<NovelFactCheckState> => {
    const start = Date.now();
    while (state.status === "running" && Date.now() - start < WAIT_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    return state;
  };
  const existing = registry.get(projectId);
  if (existing) {
    // Ya hay una en marcha (p. ej. lanzada a mano): ESPERARLA en vez de
    // seguir, o el Holistico leeria un texto a medio corregir.
    if (existing.status === "running") return waitFor(existing);
    if (existing.status === "completed") return existing; // ya pagada en esta sesion
  }
  const started = startNovelFactCheck(projectId);
  if (!started.success) {
    // Carrera: otro arranque gano entre el get y el start — esperar ese.
    const raced = registry.get(projectId);
    return raced && raced.status === "running" ? waitFor(raced) : (raced ?? null);
  }
  return waitFor(registry.get(projectId)!);
}

// ─────────────────────────────────────────────────────────────────────────────
// [Fix266] Gestion MASIVA de fichas pendientes del fact-check. Caso real: 186
// fichas bloqueando el estado "completada" durante 2 dias porque la unica via
// era corregirlas capitulo a capitulo desde la UI. Tres operaciones:
//   - getFactCheckPending: lee las fichas persistidas (worldRule).
//   - discardFactCheckPending: descarta "dudosas" (posibles retcons deliberados)
//     o "todas" de golpe, y recomputa el estado del proyecto.
//   - startFactCheckPendingApply: aplica en BACKGROUND las corregibles
//     (veredicto "incorrecto" con sugerencia) agrupadas por capitulo via el
//     endpoint apply de Fix255 (lotes de <=20, su techo). El endpoint ya retira
//     las fichas aplicadas y recomputa el estado. Best-effort por capitulo:
//     un 413/409 no frena el resto; lo que falle queda pendiente.
// ─────────────────────────────────────────────────────────────────────────────
export async function getFactCheckPending(projectId: number): Promise<NovelFactFinding[]> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    const rule = ((wb?.worldRules || []) as any[]).find((r: any) => r?.category === "__fact_check_pending");
    return Array.isArray(rule?.pendientes) ? rule.pendientes : [];
  } catch {
    return [];
  }
}

export function isFactFindingCorrectable(f: NovelFactFinding): boolean {
  return f.veredicto === "incorrecto" && typeof f.sugerencia === "string" && f.sugerencia.trim().length > 0;
}

export async function discardFactCheckPending(projectId: number, scope: "dudosas" | "todas"): Promise<number> {
  const pending = await getFactCheckPending(projectId);
  const toDiscard = scope === "todas" ? pending : pending.filter((f) => !isFactFindingCorrectable(f));
  if (toDiscard.length === 0) return 0;
  await resolveFactCheckPending(projectId, toDiscard.map((f) => ({ afirmacion: f.afirmacion, chapterId: f.chapterId })));
  await logActivity(
    projectId,
    `[Fix266] Descartadas ${toDiscard.length} ficha(s) pendientes del verificador de datos (alcance: ${scope}). Se consideran retcons deliberados o hallazgos no accionables; si era lo ultimo pendiente, la novela pasa a "completada".`,
    "success",
  );
  return toDiscard.length;
}

const bulkApplyInFlight = new Set<number>();

export function isFactCheckBulkApplyRunning(projectId: number): boolean {
  return bulkApplyInFlight.has(projectId);
}

export function startFactCheckPendingApply(projectId: number): { success: boolean; message: string } {
  // Check+set SINCRONO antes de cualquier await: dos clicks seguidos no deben
  // lanzar dos pasadas (leccion del runner de Cura de Serie).
  if (bulkApplyInFlight.has(projectId)) {
    return { success: false, message: "Ya hay una correccion masiva en curso para este proyecto" };
  }
  const running = registry.get(projectId);
  if (running && running.status === "running") {
    return { success: false, message: "Hay una verificacion de novela en curso; espera a que termine" };
  }
  bulkApplyInFlight.add(projectId);
  void runFactCheckPendingApply(projectId).finally(() => bulkApplyInFlight.delete(projectId));
  return { success: true, message: "Correccion masiva iniciada en segundo plano" };
}

async function runFactCheckPendingApply(projectId: number): Promise<void> {
  try {
    const pending = await getFactCheckPending(projectId);
    const correctable = pending.filter(isFactFindingCorrectable);
    if (correctable.length === 0) {
      await logActivity(projectId, "[Fix266] Correccion masiva: no hay fichas corregibles automaticamente (incorrectas con sugerencia).");
      return;
    }
    const byChapter = new Map<number, NovelFactFinding[]>();
    for (const f of correctable) {
      if (typeof f.chapterId !== "number") continue;
      const list = byChapter.get(f.chapterId) || [];
      list.push(f);
      byChapter.set(f.chapterId, list);
    }
    await logActivity(
      projectId,
      `[Fix266] Correccion masiva de datos iniciada: ${correctable.length} ficha(s) corregibles en ${byChapter.size} capitulo(s). Se aplican en segundo plano, capitulo a capitulo; las dudosas o sin sugerencia no se tocan.`,
    );
    let applied = 0;
    let failedChapters = 0;
    for (const [chapterId, findings] of Array.from(byChapter.entries())) {
      // Lotes de <=20 (techo del endpoint apply de Fix255).
      for (let i = 0; i < findings.length; i += 20) {
        const batch = findings.slice(i, i + 20);
        try {
          await selfFetch(`/api/projects/${projectId}/chapters/${chapterId}/fact-check/apply`, {
            findings: batch.map((f) => ({
              afirmacion: f.afirmacion,
              veredicto: f.veredicto,
              explicacion: f.explicacion,
              sugerencia: f.sugerencia,
            })),
          });
          applied += batch.length;
        } catch (e) {
          failedChapters++;
          const label = batch[0]?.chapterLabel || `capitulo ${chapterId}`;
          await logActivity(
            projectId,
            `[Fix266] Correccion masiva: fallo en ${label} (${(e as Error).message.slice(0, 200)}). Sus fichas siguen pendientes; puedes corregirlas a mano o reintentar.`,
            "warning",
          );
          break; // siguiente capitulo: mas lotes del mismo cap fallarian igual
        }
      }
    }
    const remaining = (await getFactCheckPending(projectId)).length;
    await logActivity(
      projectId,
      `[Fix266] Correccion masiva de datos terminada: ${applied} ficha(s) aplicadas${failedChapters > 0 ? `, ${failedChapters} capitulo(s) con fallo` : ""}. Quedan ${remaining} ficha(s) pendientes${remaining === 0 ? " — si no hay otros issues, la novela pasa a \"completada\"" : " (dudosas, sin sugerencia o de capitulos fallidos)"}.`,
      failedChapters > 0 ? "warning" : "success",
    );
    await recomputeCompletionStatus(projectId).catch(() => {});
  } catch (e) {
    await logActivity(projectId, `[Fix266] Correccion masiva de datos fallo: ${(e as Error).message.slice(0, 300)}`, "warning");
  }
}
