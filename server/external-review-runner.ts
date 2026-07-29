/**
 * external-review-runner.ts
 * -------------------------
 * Orquesta la ejecución de un plan de revisión editorial externa sobre un
 * proyecto completado. Funciona de forma completamente independiente del
 * pipeline principal de generación.
 *
 * ORDEN DE EJECUCIÓN (seguro):
 *   1. puntual      — correcciones localizadas (SurgicalPatcher existente)
 *   2. densidad     — poda de redundancias (DensityPrunerAgent nuevo)
 *   3. siembra      — semillas retroactivas (RetroactiveSeederAgent nuevo)
 *   4. estructural  — reescrituras amplias (applyEditorialNotes existente)
 */

import { storage } from "./storage";
import { DensityPrunerAgent } from "./agents/density-pruner";
import { RetroactiveSeederAgent } from "./agents/retroactive-seeder";
import { SurgicalPatcherAgent } from "./agents/surgical-patcher";
import type { ReviewIntervention, ExternalReviewPlan } from "./agents/critique-classifier";
import type { Project } from "@shared/schema";

type SendFn = (data: Record<string, unknown>) => void;

// ─── helpers ──────────────────────────────────────────────────────────────────

function applyFindReplace(
  content: string,
  ops: Array<{ find_exact?: string; anchor_after?: string; replace_with?: string; seed_text?: string }>
): string {
  let result = content;
  for (const op of ops) {
    const find = op.find_exact ?? op.anchor_after ?? "";
    const replacement = op.replace_with !== undefined ? op.replace_with : (op.seed_text ? `${find}\n${op.seed_text}` : find);
    if (!find) continue;
    const idx = result.indexOf(find);
    if (idx === -1) continue;
    if (op.anchor_after !== undefined && op.seed_text !== undefined) {
      // Insertar DESPUÉS del ancla
      result = result.substring(0, idx + find.length) + "\n" + op.seed_text + result.substring(idx + find.length);
    } else {
      result = result.substring(0, idx) + replacement + result.substring(idx + find.length);
    }
  }
  return result;
}

function persistPlan(projectId: number, plan: ExternalReviewPlan): Promise<unknown> {
  return storage.updateProject(projectId, { pendingExternalReview: plan as any });
}

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
  project: Project,
  interventionIds: string[] | null, // null = all pending
  send: SendFn
): Promise<void> {
  const projectId = project.id;
  const rawPlan = project.pendingExternalReview as ExternalReviewPlan | null;
  if (!rawPlan) throw new Error("No hay plan de revisión externo pendiente para este proyecto");

  let plan: ExternalReviewPlan = { ...rawPlan, interventions: rawPlan.interventions.map(i => ({ ...i })) };

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

  await storage.updateProject(projectId, { externalReviewStatus: "running" });
  send({ type: "external_review_started", count: toRun.length });

  const typeOrder: ReviewIntervention["type"][] = ["puntual", "densidad", "siembra", "estructural"];
  const sorted = [...toRun].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

  const densityAgent = new DensityPrunerAgent();
  const seederAgent = new RetroactiveSeederAgent();
  const surgicalAgent = new SurgicalPatcherAgent();

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
    await persistPlan(projectId, plan);
    send({ type: "intervention_start", id: intervention.id, interventionType: intervention.type, titulo: intervention.titulo });

    try {
      if (intervention.type === "puntual") {
        await runPuntual(projectId, intervention, surgicalAgent, send);

      } else if (intervention.type === "densidad") {
        await runDensidad(projectId, intervention, densityAgent, knownTics, send);

      } else if (intervention.type === "siembra") {
        await runSiembra(projectId, intervention, seederAgent, send);

      } else if (intervention.type === "estructural") {
        await runEstructural(projectId, intervention, project, send);
      }

      plan = updateInterventionStatus(plan, intervention.id, "done");
      await persistPlan(projectId, plan);
      send({ type: "intervention_done", id: intervention.id });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ExternalReview] Intervención ${intervention.id} falló:`, msg);
      plan = updateInterventionStatus(plan, intervention.id, "failed", { errorMsg: msg });
      await persistPlan(projectId, plan);
      send({ type: "intervention_failed", id: intervention.id, error: msg });
    }
  }

  const allDone = plan.interventions.every(i => i.status === "done" || i.status === "skipped");
  const finalStatus = allDone ? "completed" : (plan.interventions.some(i => i.status === "failed") ? "failed" : "completed");
  plan = { ...plan };
  await storage.updateProject(projectId, {
    externalReviewStatus: finalStatus,
    pendingExternalReview: plan as any,
  });
  send({ type: "external_review_done", status: finalStatus });
}

// ─── puntual ─────────────────────────────────────────────────────────────────

async function runPuntual(
  projectId: number,
  intervention: ReviewIntervention,
  agent: SurgicalPatcherAgent,
  send: SendFn
): Promise<void> {
  const chapters = await storage.getChaptersByProject(projectId);
  const targets = chapters.filter(c => intervention.capitulosAfectados.includes(c.chapterNumber));

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
        await storage.updateChapter(chapter.id, { content: report.finalContent });
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length} operaciones aplicadas` });
      }
    }
  }
}

// ─── densidad ────────────────────────────────────────────────────────────────

async function runDensidad(
  projectId: number,
  intervention: ReviewIntervention,
  agent: DensityPrunerAgent,
  knownTics: string[],
  send: SendFn
): Promise<void> {
  const chapters = await storage.getChaptersByProject(projectId);
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const alreadyEstablished = [
    "Linnea preparó a Sloane durante años",
    "La señal de Linnea lleva esperando",
    "Kincaid controla la base",
    "Sloane ha sido entrenada para esto",
    "La tormenta impide escapar",
  ];

  for (const chapter of targets) {
    send({ type: "intervention_progress", id: intervention.id, message: `Podando cap ${chapter.chapterNumber}...` });

    const result = await agent.prune({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title || "",
      content: chapter.content || "",
      knownGesturalTics: knownTics,
      alreadyEstablishedFacts: alreadyEstablished,
    });

    if (result.operations.length > 0) {
      // Reutilizamos el applyOperations del SurgicalPatcher (mismo formato find/replace)
      const patcher = new SurgicalPatcherAgent();
      const report = patcher.applyOperations(chapter.content || "", result.operations as any);
      if (report.applied.length > 0) {
        await storage.updateChapter(chapter.id, { content: report.finalContent });
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
  projectId: number,
  intervention: ReviewIntervention,
  agent: RetroactiveSeederAgent,
  send: SendFn
): Promise<void> {
  if (!intervention.sembraRevelacion) {
    throw new Error("La intervención de siembra no tiene 'sembraRevelacion' definida");
  }

  const chapters = await storage.getChaptersByProject(projectId);
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
      // Convertir a formato find/replace y aplicar con el patcher normalizado
      // (Fix212: maneja tildes, comillas tipográficas, espacios distintos).
      const patcher = new SurgicalPatcherAgent();
      const patchOps = result.operations.map(op => ({
        type: "find_exact_and_replace" as const,
        find_exact: op.anchor_after,
        replace_with: op.anchor_after + "\n\n" + op.seed_text,
        justification: op.justification,
      }));
      const report = patcher.applyOperations(chapter.content || "", patchOps);

      if (report.applied.length > 0) {
        await storage.updateChapter(chapter.id, { content: report.finalContent });
        for (const op of result.operations) previousSeeds.push(op.justification);
        const skipped = report.failed.length > 0 ? ` (${report.failed.length} ancla(s) no encontrada(s))` : "";
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length} semilla(s) plantada(s)${skipped}` });
      } else {
        // Ningún ancla encontrada: loguear pero no fallar la intervención entera
        send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: anclas no encontradas — omitido` });
      }
    } else if (result.not_applicable_reason) {
      send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${result.not_applicable_reason}` });
    }
  }
}

// ─── estructural ─────────────────────────────────────────────────────────────

async function runEstructural(
  projectId: number,
  intervention: ReviewIntervention,
  _project: Project,
  send: SendFn
): Promise<void> {
  // Las intervenciones estructurales se canalizan a través del flujo
  // applyEditorialNotes existente (vía la instrucción de la intervención).
  // Lo hacemos de forma dinámica para no crear dependencia circular.
  send({ type: "intervention_progress", id: intervention.id, message: "Iniciando reescritura estructural..." });

  const { Orchestrator } = await import("./orchestrator");
  const project = await storage.getProject(projectId);
  if (!project) throw new Error("Proyecto no encontrado");

  const orchestrator = new Orchestrator({
    onAgentStatus: async (_role, _status, msg) => {
      if (msg) send({ type: "intervention_progress", id: intervention.id, message: msg });
    },
    onChapterComplete: async (chapNum, wc) => {
      send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapNum} reescrito (${wc} palabras)` });
    },
    onChapterRewrite: async () => {},
    onChapterStatusChange: () => {},
    onProjectComplete: async () => {},
    onError: async (e) => { throw new Error(e); },
  });

  // Construir instrucción editorial como objeto compatible
  const instruction = {
    capitulos_afectados: intervention.capitulosAfectados,
    categoria: "estructural",
    descripcion: intervention.descripcion,
    instrucciones_correccion: intervention.instruccion,
    tipo: "estructural" as const,
    prioridad: intervention.prioridad,
  };

  await orchestrator.applyEditorialNotes(project, "", [instruction]);
}
