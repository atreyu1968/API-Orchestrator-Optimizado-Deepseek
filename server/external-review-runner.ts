/**
 * external-review-runner.ts
 * -------------------------
 * Orquesta la ejecución de un plan de revisión editorial externa sobre un
 * proyecto completado O un manuscrito importado. Funciona de forma
 * completamente independiente del pipeline principal de generación.
 *
 * ORDEN DE EJECUCIÓN (seguro):
 *   1. puntual      — correcciones localizadas (SurgicalPatcher existente)
 *   2. densidad     — poda de redundancias (DensityPrunerAgent nuevo)
 *   3. siembra      — semillas retroactivas (RetroactiveSeederAgent nuevo)
 *   4. estructural  — reescrituras amplias (ChapterRewriteAgent)
 */

import { storage } from "./storage";
import { DensityPrunerAgent } from "./agents/density-pruner";
import { RetroactiveSeederAgent } from "./agents/retroactive-seeder";
import { SurgicalPatcherAgent } from "./agents/surgical-patcher";
import { ChapterRewriteAgent } from "./agents/chapter-rewriter";
import { OccurrenceScannerAgent } from "./agents/occurrence-scanner";
import { renumberChaptersSequential, remapPendingAdminActionsForRenumber } from "./utils/renumber-chapters";
import type { ReviewIntervention, ExternalReviewPlan } from "./agents/critique-classifier";

type SendFn = (data: Record<string, unknown>) => void;

// ─── adapter (abstrae proyectos normales vs importados) ───────────────────────

export interface ChapterLike {
  id: number;
  chapterNumber: number;
  title: string | null;
  content: string | null;
}

/**
 * Abstracción que permite que el runner trabaje con proyectos normales
 * (chapters) y con manuscritos importados (imported_chapters) sin cambiar
 * la lógica de las intervenciones.
 */
export interface ReviewAdapter {
  plan: ExternalReviewPlan;
  persistPlan(plan: ExternalReviewPlan): Promise<void>;
  setStatus(status: string): Promise<void>;
  getChapters(): Promise<ChapterLike[]>;
  /** Guarda el contenido nuevo. preEditContent es opcional (backup). */
  saveChapter(id: number, newContent: string, preEditContent?: string): Promise<void>;
  /** Elimina un capítulo por su número (usado por fusionar y eliminar). */
  deleteChapter(chapterNumber: number): Promise<void>;
  /** Renumera todos los capítulos positivos para cerrar huecos tras borrar.
   *  Recibe los números VIEJOS eliminados para remapar también las acciones admin (proyectos). */
  renumberAll(deletedNumbers: number[]): Promise<void>;
}

/** Crea un adapter para proyectos normales. */
export function projectAdapter(project: { id: number; pendingExternalReview: unknown }): ReviewAdapter {
  const projectId = project.id;
  const plan = project.pendingExternalReview as ExternalReviewPlan;
  return {
    plan,
    async persistPlan(p) {
      await storage.updateProject(projectId, { pendingExternalReview: p as any });
    },
    async setStatus(status) {
      await storage.updateProject(projectId, { externalReviewStatus: status } as any);
    },
    async getChapters() {
      const chs = await storage.getChaptersByProject(projectId);
      return chs.map(c => ({ id: c.id, chapterNumber: c.chapterNumber, title: c.title ?? null, content: (c as any).content ?? null }));
    },
    async saveChapter(id, newContent, preEditContent) {
      const upd: Record<string, unknown> = { content: newContent };
      if (preEditContent !== undefined) upd.preEditContent = preEditContent;
      await storage.updateChapter(id, upd as any);
    },
    async deleteChapter(chapterNumber) {
      const chs = await storage.getChaptersByProject(projectId);
      const ch = chs.find(c => c.chapterNumber === chapterNumber);
      if (ch) await storage.deleteChapter(ch.id);
    },
    async renumberAll(deletedNumbers) {
      // Remapar acciones admin pendientes antes de renumerar
      const proj = await storage.getProject(projectId);
      const rawActions = (proj as any)?.pendingAdminActions;
      if (Array.isArray(rawActions) && rawActions.length > 0) {
        const { actions } = remapPendingAdminActionsForRenumber(rawActions, { deleted: deletedNumbers });
        await storage.updateProject(projectId, { pendingAdminActions: actions as any });
      }
      await renumberChaptersSequential(projectId);
    },
  };
}

/** Crea un adapter para manuscritos importados con estado en memoria. */
export function manuscriptAdapter(
  manuscriptId: number,
  plan: ExternalReviewPlan,
  persistPlanFn: (p: ExternalReviewPlan) => Promise<void>,
  setStatusFn: (s: string) => Promise<void>
): ReviewAdapter {
  return {
    plan,
    persistPlan: persistPlanFn,
    setStatus: setStatusFn,
    async getChapters() {
      const chs = await storage.getImportedChaptersByManuscript(manuscriptId);
      return chs.map(c => ({
        id: c.id,
        chapterNumber: c.chapterNumber,
        title: c.title ?? null,
        // Los capítulos importados usan editedContent si existe, si no originalContent
        content: (c.editedContent ?? c.originalContent) ?? null,
      }));
    },
    async saveChapter(id, newContent, _preEditContent) {
      await storage.updateImportedChapter(id, { editedContent: newContent });
    },
    async deleteChapter(chapterNumber) {
      const chs = await storage.getImportedChaptersByManuscript(manuscriptId);
      const ch = chs.find(c => c.chapterNumber === chapterNumber);
      if (ch) await storage.deleteImportedChapter(ch.id);
    },
    async renumberAll(_deletedNumbers) {
      // Renumerar capítulos positivos del manuscrito
      const chs = await storage.getImportedChaptersByManuscript(manuscriptId);
      const positives = chs
        .filter(c => c.chapterNumber > 0)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
      for (let i = 0; i < positives.length; i++) {
        const desired = i + 1;
        if (positives[i].chapterNumber !== desired) {
          await storage.updateImportedChapter(positives[i].id, { chapterNumber: desired });
        }
      }
    },
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function updateInterventionStatus(
  plan: ExternalReviewPlan,
  id: string,
  status: ReviewIntervention["status"],
  extra?: Partial<ReviewIntervention>
): ExternalReviewPlan {
  return {
    ...plan,
    interventions: plan.interventions.map(i =>
      i.id === id
        ? { ...i, status, completedAt: status === "done" || status === "failed" ? new Date().toISOString() : i.completedAt, ...extra }
        : i
    ),
  };
}

// ─── main runner ──────────────────────────────────────────────────────────────

export async function runExternalReview(
  adapter: ReviewAdapter,
  interventionIds: string[] | null, // null = all pending
  send: SendFn
): Promise<void> {
  let plan: ExternalReviewPlan = { ...adapter.plan, interventions: adapter.plan.interventions.map(i => ({ ...i })) };

  // Filtrar qué intervenciones ejecutar
  const toRun = plan.interventions.filter(i => {
    if (i.status === "done" || i.status === "running") return false;
    if (interventionIds && !interventionIds.includes(i.id)) return false;
    return true;
  });

  if (toRun.length === 0) {
    send({ type: "external_review_done", message: "No hay intervenciones pendientes" });
    return;
  }

  await adapter.setStatus("running");
  send({ type: "external_review_started", count: toRun.length });

  // fusionar y eliminar van al final: son destructivos y deben ejecutarse
  // después de que las demás intervenciones hayan terminado de modificar el
  // contenido. eliminar se ejecuta después de fusionar para no borrar un
  // capítulo que todavía podría estar siendo absorbido.
  const typeOrder: ReviewIntervention["type"][] = ["puntual", "densidad", "siembra", "estructural", "fusionar", "eliminar"];
  const sorted = [...toRun].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  const densityAgent = new DensityPrunerAgent();
  const seederAgent = new RetroactiveSeederAgent();
  const surgicalAgent = new SurgicalPatcherAgent();
  const rewriterAgent = new ChapterRewriteAgent();
  const scannerAgent = new OccurrenceScannerAgent();

  // Track gesturalTics seen so far for density passes
  const knownTics = [
    "se mordió la cara interior de la mejilla",
    "tamborileó",
    "desvió los ojos",
    "se pasó la mano por la cabeza",
    "se tocó el puente de la nariz",
    "dedos manchados de nicotina",
    "sonrisa que no llegaba a los ojos",
    "apretó la mandíbula",
    "algo frío subía por su interior",
    "pesaba más de lo que debería",
    "fría y precisa",
  ];

  for (const intervention of sorted) {
    // Mark running
    plan = updateInterventionStatus(plan, intervention.id, "running");
    await adapter.persistPlan(plan);
    send({ type: "intervention_start", id: intervention.id, interventionType: intervention.type, titulo: intervention.titulo });

    try {
      if (intervention.type === "puntual") {
        await runPuntual(adapter, intervention, surgicalAgent, scannerAgent, send);

      } else if (intervention.type === "densidad") {
        await runDensidad(adapter, intervention, densityAgent, knownTics, send);

      } else if (intervention.type === "siembra") {
        await runSiembra(adapter, intervention, seederAgent, send);

      } else if (intervention.type === "estructural") {
        await runEstructural(adapter, intervention, rewriterAgent, send);

      } else if (intervention.type === "fusionar") {
        await runFusionar(adapter, intervention, rewriterAgent, send);

      } else if (intervention.type === "eliminar") {
        await runEliminar(adapter, intervention, send);
      }

      plan = updateInterventionStatus(plan, intervention.id, "done");
      await adapter.persistPlan(plan);
      send({ type: "intervention_done", id: intervention.id });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ExternalReview] Intervención ${intervention.id} falló:`, msg);
      plan = updateInterventionStatus(plan, intervention.id, "failed", { errorMsg: msg });
      await adapter.persistPlan(plan);
      send({ type: "intervention_failed", id: intervention.id, error: msg });
    }
  }

  const allDone = plan.interventions.every(i => i.status === "done" || i.status === "skipped");
  const finalStatus = allDone ? "completed" : (plan.interventions.some(i => i.status === "failed") ? "failed" : "completed");
  plan = { ...plan };
  await adapter.persistPlan(plan);
  await adapter.setStatus(finalStatus);
  send({ type: "external_review_done", status: finalStatus });
}

// ─── puntual ─────────────────────────────────────────────────────────────────

async function runPuntual(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  agent: SurgicalPatcherAgent,
  scanner: OccurrenceScannerAgent,
  send: SendFn
): Promise<void> {
  const chapters = await adapter.getChapters();
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (targets.length === 0) return;

  // ── Ruta A: intervención multi-capítulo → escáner semántico global ──────────
  if (targets.length > 1) {
    send({ type: "intervention_progress", id: intervention.id, message: `Escaneando ${targets.length} capítulos en busca de todas las ocurrencias...` });

    const scanResult = await scanner.scan({
      problem: intervention.instruccion,
      chapters: targets.map(c => ({
        chapterNumber: c.chapterNumber,
        chapterTitle: c.title || "",
        content: c.content || "",
      })),
    });

    if (scanResult.matches.length > 0) {
      const byChapter = new Map<number, typeof scanResult.matches>();
      for (const m of scanResult.matches) {
        if (!byChapter.has(m.chapterNumber)) byChapter.set(m.chapterNumber, []);
        byChapter.get(m.chapterNumber)!.push(m);
      }

      for (const chapter of targets) {
        const matches = byChapter.get(chapter.chapterNumber);
        if (!matches?.length) continue;

        const patchOps = matches.map(m => ({
          type: "find_exact_and_replace" as const,
          find_exact: m.anchorText,
          replace_with: m.replacementText,
          justification: m.justification,
        }));

        const report = agent.applyOperations(chapter.content || "", patchOps);
        if (report.applied.length > 0) {
          await adapter.saveChapter(chapter.id, report.finalContent);
          const fuzzyNote = (report.fuzzyApplied ?? 0) > 0 ? ` (${report.fuzzyApplied} fuzzy)` : "";
          send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length}/${matches.length} ocurrencias corregidas${fuzzyNote}` });
        } else if (report.failed.length > 0) {
          send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.failed.length} anclas no encontradas — omitido` });
        }
      }
      send({ type: "intervention_progress", id: intervention.id, message: `Total: ${scanResult.matches.length} ocurrencias identificadas` });

    } else {
      send({ type: "intervention_progress", id: intervention.id, message: `Escáner global sin resultados${scanResult.not_found_reason ? ": " + scanResult.not_found_reason : ""}. Aplicando cirugía individual...` });
      await runPuntualPerChapter(targets, adapter, intervention, agent, send);
    }

  } else {
    await runPuntualPerChapter(targets, adapter, intervention, agent, send);
  }
}

/** Cirugía capítulo a capítulo (ruta fallback o single-chapter). */
async function runPuntualPerChapter(
  targets: ChapterLike[],
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  agent: SurgicalPatcherAgent,
  send: SendFn
): Promise<void> {
  for (const chapter of targets) {
    send({ type: "intervention_progress", id: intervention.id, message: `Cirujano en cap ${chapter.chapterNumber}` });

    const result = await agent.execute({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || "",
      originalContent: chapter.content || "",
      instructions: intervention.instruccion,
      worldBibleContext: "",
      instructionCount: 1,
    });

    if (result.result?.operations?.length) {
      const report = agent.applyOperations(chapter.content || "", result.result.operations);
      if (report.applied.length > 0) {
        await adapter.saveChapter(chapter.id, report.finalContent);
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length} operaciones aplicadas` });
      }
    }
  }
}

// ─── densidad ────────────────────────────────────────────────────────────────

async function runDensidad(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  agent: DensityPrunerAgent,
  knownTics: string[],
  send: SendFn
): Promise<void> {
  const chapters = await adapter.getChapters();
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  for (const chapter of targets) {
    send({ type: "intervention_progress", id: intervention.id, message: `Podando cap ${chapter.chapterNumber}...` });

    const result = await agent.prune({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || "",
      content: chapter.content || "",
      knownGesturalTics: knownTics,
    });

    if (result.operations.length > 0) {
      const patcher = new SurgicalPatcherAgent();
      const report = patcher.applyOperations(chapter.content || "", result.operations as any);
      if (report.applied.length > 0) {
        await adapter.saveChapter(chapter.id, report.finalContent);
        const pct = Math.round(((report.originalLength - report.finalLength) / report.originalLength) * 100);
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: −${pct}% (${report.applied.length} podas)` });
      }
    } else if (result.not_applicable_reason) {
      send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${result.not_applicable_reason}` });
    }
  }
}

// ─── siembra ─────────────────────────────────────────────────────────────────

async function runSiembra(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  agent: RetroactiveSeederAgent,
  send: SendFn
): Promise<void> {
  if (!intervention.sembraRevelacion) {
    throw new Error("La intervención de siembra no tiene 'sembraRevelacion' definida");
  }

  const chapters = await adapter.getChapters();
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const previousSeeds: string[] = [];

  for (const chapter of targets) {
    send({ type: "intervention_progress", id: intervention.id, message: `Sembrando en cap ${chapter.chapterNumber}...` });

    const result = await agent.seed({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || "",
      content: chapter.content || "",
      revelation: intervention.sembraRevelacion,
      readerKnowledgeAtThisPoint: intervention.sembraContextoLector || "El lector no conoce aún la revelación",
      previousSeedsForThisRevelation: previousSeeds,
    });

    if (result.operations.length > 0) {
      const patcher = new SurgicalPatcherAgent();
      const patchOps = result.operations.map(op => ({
        type: "find_exact_and_replace" as const,
        find_exact: op.anchor_after,
        replace_with: op.anchor_after + "\n\n" + op.seed_text,
        justification: op.justification,
      }));
      const report = patcher.applyOperations(chapter.content || "", patchOps);

      if (report.applied.length > 0) {
        await adapter.saveChapter(chapter.id, report.finalContent);
        for (const op of result.operations) previousSeeds.push(op.justification);
        const skipped = report.failed.length > 0 ? ` (${report.failed.length} ancla(s) no encontrada(s))` : "";
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length} semilla(s) plantada(s)${skipped}` });
      } else {
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: anclas no encontradas — omitido` });
      }
    } else if (result.not_applicable_reason) {
      send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${result.not_applicable_reason}` });
    }
  }
}

// ─── fusionar ────────────────────────────────────────────────────────────────

async function runFusionar(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  rewriter: ChapterRewriteAgent,
  send: SendFn
): Promise<void> {
  const caps = [...intervention.capitulosAfectados].sort((a, b) => a - b);
  if (caps.length < 2) {
    throw new Error("La intervención 'fusionar' requiere exactamente 2 capítulos en capitulosAfectados");
  }
  const [capA, capB] = caps;
  const survivor = typeof intervention.mergeIntoChapter === "number"
    ? intervention.mergeIntoChapter
    : capA;
  const absorbed = caps.find(c => c !== survivor) ?? capB;

  send({ type: "intervention_progress", id: intervention.id, message: `Leyendo caps ${capA} y ${capB}...` });

  const chapters = await adapter.getChapters();
  const chA = chapters.find(c => c.chapterNumber === capA);
  const chB = chapters.find(c => c.chapterNumber === capB);
  if (!chA) throw new Error(`Capítulo ${capA} no encontrado`);
  if (!chB) throw new Error(`Capítulo ${capB} no encontrado`);
  const survivorCh = chapters.find(c => c.chapterNumber === survivor);
  const absorbedCh = chapters.find(c => c.chapterNumber === absorbed);
  if (!survivorCh || !absorbedCh) throw new Error(`No se encontró el capítulo superviviente (${survivor}) o el absorbido (${absorbed})`);

  send({ type: "intervention_progress", id: intervention.id, message: `Fusionando cap ${capA} + cap ${capB} → cap ${survivor} (el cap ${absorbed} desaparece)...` });

  // Pasar ambos capítulos al rewriter como un único bloque con separador claro
  const combinedContent =
    `# CAPÍTULO ${capA}: ${chA.title || `Capítulo ${capA}`}\n\n${chA.content || ""}\n\n` +
    `---\n\n` +
    `# CAPÍTULO ${capB}: ${chB.title || `Capítulo ${capB}`}\n\n${chB.content || ""}`;

  const result = await rewriter.rewrite({
    chapterNumber: survivor,
    chapterTitle: survivorCh.title || `Capítulo ${survivor}`,
    content: combinedContent,
    instruction:
      `Este bloque contiene DOS capítulos separados por "---". ` +
      `Fusiónales en un único capítulo coherente y bien estructurado. ` +
      `Elimina la duplicación, mantén los beats narrativos esenciales de ambos y produce ` +
      `una sola unidad de lectura. ` +
      intervention.instruccion,
    contradictionsToRemove: [],
  });

  if (!result.rewrittenContent || result.rewrittenContent.trim().length < 200) {
    throw new Error(`El agente de fusión devolvió contenido vacío o demasiado corto (${result.rewrittenContent?.length ?? 0} chars)`);
  }

  const oldContent = survivorCh.content ?? undefined;
  await adapter.saveChapter(survivorCh.id, result.rewrittenContent, oldContent);

  send({ type: "intervention_progress", id: intervention.id, message: `Contenido fusionado guardado en cap ${survivor} (${result.rewrittenContent.split(/\s+/).length} palabras). Eliminando cap ${absorbed}...` });

  await adapter.deleteChapter(absorbed);
  await adapter.renumberAll([absorbed]);

  const summary = result.changeSummary ? ` — ${result.changeSummary.substring(0, 100)}` : "";
  send({ type: "intervention_progress", id: intervention.id, message: `Cap ${absorbed} eliminado. Capítulos renumerados${summary}` });
}

// ─── eliminar ────────────────────────────────────────────────────────────────

async function runEliminar(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  send: SendFn
): Promise<void> {
  if (intervention.capitulosAfectados.length === 0) {
    throw new Error("La intervención 'eliminar' requiere al menos 1 capítulo en capitulosAfectados");
  }

  // Procesamos en orden descendente para que la renumeración de cada borrado
  // no desplace los números de los siguientes dentro de la misma intervención.
  // Luego llamamos renumberAll una sola vez al final con todos los borrados.
  const toDelete = [...intervention.capitulosAfectados]
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a); // descendente

  send({ type: "intervention_progress", id: intervention.id, message: `Eliminando ${toDelete.length > 1 ? `caps ${toDelete.join(", ")}` : `cap ${toDelete[0]}`}...` });

  for (const capNum of toDelete) {
    const chapters = await adapter.getChapters();
    const ch = chapters.find(c => c.chapterNumber === capNum);
    if (!ch) {
      send({ type: "intervention_progress", id: intervention.id, message: `Cap ${capNum} no encontrado — ya pudo haberse borrado, omitiendo` });
      continue;
    }
    await adapter.deleteChapter(capNum);
    send({ type: "intervention_progress", id: intervention.id, message: `Cap ${capNum} eliminado` });
  }

  const ascendingDeleted = [...toDelete].sort((a, b) => a - b);
  await adapter.renumberAll(ascendingDeleted);
  send({ type: "intervention_progress", id: intervention.id, message: `Capítulos renumerados (${ascendingDeleted.length} hueco(s) cerrado(s))` });
}

// ─── estructural ─────────────────────────────────────────────────────────────

async function runEstructural(
  adapter: ReviewAdapter,
  intervention: ReviewIntervention,
  rewriter: ChapterRewriteAgent,
  send: SendFn
): Promise<void> {
  send({ type: "intervention_progress", id: intervention.id, message: "Iniciando reescritura estructural..." });

  const chapters = await adapter.getChapters();
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (targets.length === 0) {
    send({ type: "intervention_progress", id: intervention.id, message: "No se encontraron capítulos afectados" });
    return;
  }

  const contradictions = intervention.contradictionsToRemove ?? [];

  for (const chapter of targets) {
    send({ type: "intervention_progress", id: intervention.id, message: `Reescribiendo cap ${chapter.chapterNumber}${contradictions.length ? ` (${contradictions.length} contradicción(es) a eliminar)` : ""}...` });

    const result = await rewriter.rewrite({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || "",
      content: chapter.content || "",
      instruction: intervention.instruccion,
      contradictionsToRemove: contradictions,
    });

    if (!result.rewrittenContent || result.rewrittenContent.trim().length < 100) {
      throw new Error(`Cap ${chapter.chapterNumber}: el rewriter devolvió contenido vacío o demasiado corto`);
    }

    await adapter.saveChapter(chapter.id, result.rewrittenContent, chapter.content ?? undefined);

    const wordCount = result.rewrittenContent.split(/\s+/).length;
    const summary = result.changeSummary ? ` — ${result.changeSummary.substring(0, 80)}` : "";
    send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber} reescrito (${wordCount} palabras)${summary}` });
  }
}
