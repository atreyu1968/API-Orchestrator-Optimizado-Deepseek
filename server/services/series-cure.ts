import { storage } from "../storage";
import { forcePolishResume } from "../polish-auto-resume";
import { isPolishActive, requestPolishStop } from "../utils/polish-registry";

// [Fix194] Cura de Serie: pipeline reutilizable a nivel de SERIE que cura cada
// volumen desde la perspectiva de la saga, en orden y de forma autonoma:
//   1) Verificacion de arco (ArcValidator via endpoint existente, ramas
//      project/imported/reedit).
//   2) Correcciones de hitos no cumplidos (apply-corrections: escenas aditivas).
//   3) Reescritura profunda de capitulos senalados por hallazgos estructurales
//      de severidad alta (structural-rewrite: reescribe el capitulo ENTERO).
//   4) Pulido advisory Holistico+Beta (ya inyecta seriesContext) y espera a que
//      termine (solo volumenes tipo "project"; imported/reedit no tienen bucle).
//   5) Veredicto honesto por volumen (publicable / con reservas / cirugia).
// Los hallazgos que pedirian acciones DESTRUCTIVAS o anadir capitulos NUEVOS se
// registran como SUGERENCIAS para aprobacion manual (nunca se ejecutan solos),
// coherente con [Fix185]. El estado vive en memoria: si el server se reinicia a
// mitad, relanzar la cura es seguro (cada paso es idempotente y el pulido tiene
// su propio auto-resume via autoPolishPending).

// [Fix195] "validated" = el paso se examino y NO hizo falta tocar nada (todo
// correcto), distinto de "skipped" (el paso no aplica o no se pudo evaluar).
export type CureStepStatus = "pending" | "running" | "done" | "validated" | "skipped" | "failed";

export interface CureVolumeState {
  volumeType: "project" | "imported" | "reedit";
  volumeId: number;
  title: string;
  seriesOrder: number;
  steps: {
    arcVerify: CureStepStatus;
    corrections: CureStepStatus;
    deepRewrite: CureStepStatus;
    polish: CureStepStatus;
  };
  arcScore?: number;
  arcPassed?: boolean;
  correctionsApplied?: number;
  chaptersRewritten?: number;
  betaScore?: number | null;
  holisticScore?: number | null;
  verdict?: "publicable" | "publicable_con_reservas" | "necesita_cirugia" | "sin_veredicto";
  suggestions: string[];
  error?: string;
}

export interface SeriesCureState {
  seriesId: number;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  currentVolumeIndex: number;
  volumes: CureVolumeState[];
  log: { at: string; message: string }[];
  cancelRequested?: boolean;
}

const cureRegistry = new Map<number, SeriesCureState>();

// Topes de coste por volumen: la reescritura profunda reescribe capitulos
// ENTEROS con el Ghostwriter; sin tope un informe verboso podria disparar
// decenas de reescrituras.
const MAX_DEEP_REWRITE_CHAPTERS = 4;
const POLISH_POLL_MS = 30_000;
const POLISH_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 horas por volumen

function baseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || "5000"}`;
}

function log(state: SeriesCureState, message: string) {
  state.log.push({ at: new Date().toISOString(), message });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
  console.log(`[SeriesCure ${state.seriesId}] ${message}`);
}

export function getSeriesCureStatus(seriesId: number): SeriesCureState | undefined {
  return cureRegistry.get(seriesId);
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
    headers: { "Content-Type": "application/json" },
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
    steps: { arcVerify: "pending", corrections: "pending", deepRewrite: "pending", polish: "pending" },
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

async function runDeepRewrite(state: SeriesCureState, vol: CureVolumeState, arcResult: any): Promise<void> {
  const structural = (arcResult?.classifiedFindings || []).filter(
    (f: any) => f?.type === "structural" && (f?.severity === "high" || f?.severity === "medium"),
  );

  // Hallazgos SIN capitulos concretos (p.ej. "falta un capitulo que dramatice
  // X entre el 20 y el 21") no se pueden reescribir sobre un capitulo: quedan
  // como sugerencias para aprobacion manual (reescritura dirigida o
  // insercion de capitulo nuevo via insert-chapter).
  const withChapters: { chapters: number[]; text: string }[] = [];
  for (const f of structural) {
    const chapters = (f.affectedChapters || []).filter((n: any) => Number.isFinite(n));
    if (chapters.length > 0) {
      withChapters.push({ chapters, text: f.text });
    } else {
      vol.suggestions.push(`[estructural sin capitulo] ${f.text}`);
    }
  }

  if (withChapters.length === 0) {
    if (structural.length > 0) {
      // Hay hallazgos pero ninguno accionable automaticamente: omitido con sugerencias.
      vol.steps.deepRewrite = "skipped";
      log(state, `Vol ${vol.seriesOrder}: ${vol.suggestions.length} hallazgo(s) estructural(es) sin capitulo concreto -> quedan como sugerencias.`);
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

async function runPolishAndWait(state: SeriesCureState, vol: CureVolumeState): Promise<void> {
  if (vol.volumeType !== "project") {
    // El bucle de pulido advisory solo existe para proyectos generados; los
    // volumenes importados/reeditados tienen sus propios flujos de reedicion.
    vol.steps.polish = "skipped";
    log(state, `Vol ${vol.seriesOrder}: pulido omitido (volumen ${vol.volumeType}).`);
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
    const pending = (fresh as any).autoPolishPending === true || isPolishActive(vol.volumeId);
    if (!pending) {
      vol.betaScore = (fresh as any).betaScore ?? null;
      vol.holisticScore = (fresh as any).holisticScore ?? null;
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

function computeVerdict(vol: CureVolumeState): void {
  if (vol.volumeType !== "project" || vol.steps.polish !== "done") {
    // Sin pulido (importados/reedit o pulido fallido) el veredicto sale solo
    // del arco: honesto pero parcial.
    if (vol.arcPassed === undefined) { vol.verdict = "sin_veredicto"; return; }
    vol.verdict = vol.arcPassed ? "publicable_con_reservas" : "necesita_cirugia";
    return;
  }
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
      log(state, `=== Volumen ${vol.seriesOrder}: "${vol.title}" (${vol.volumeType}) ===`);

      const arcResult = await runArcVerify(state, vol);
      if (state.cancelRequested) { state.status = "cancelled"; break; }

      if (arcResult) {
        await runCorrections(state, vol, arcResult);
        if (state.cancelRequested) { state.status = "cancelled"; break; }
        await runDeepRewrite(state, vol, arcResult);
        if (state.cancelRequested) { state.status = "cancelled"; break; }
      } else {
        vol.steps.corrections = "skipped";
        vol.steps.deepRewrite = "skipped";
      }

      await runPolishAndWait(state, vol);
      computeVerdict(vol);
      log(state, `Vol ${vol.seriesOrder}: veredicto = ${vol.verdict}.`);
    }
    if (state.status === "running") state.status = "completed";
  } catch (e: any) {
    state.status = "failed";
    log(state, `La cura fallo: ${e?.message || e}`);
  } finally {
    state.finishedAt = new Date().toISOString();
    log(state, `Cura de serie terminada con estado: ${state.status}.`);
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

    void runCure(state);
    return { success: true, message: `Cura iniciada para ${volumes.length} volumen(es)` };
  } catch (e) {
    cureRegistry.delete(seriesId);
    throw e;
  }
}
