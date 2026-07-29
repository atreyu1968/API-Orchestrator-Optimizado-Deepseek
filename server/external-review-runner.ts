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
import { ChapterRewriteAgent } from "./agents/chapter-rewriter";
import { OccurrenceScannerAgent } from "./agents/occurrence-scanner";
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
    await persistPlan(projectId, plan);
    send({ type: "intervention_start", id: intervention.id, interventionType: intervention.type, titulo: intervention.titulo });

    try {
      if (intervention.type === "puntual") {
        await runPuntual(projectId, intervention, surgicalAgent, scannerAgent, send);

      } else if (intervention.type === "densidad") {
        await runDensidad(projectId, intervention, densityAgent, knownTics, send);

      } else if (intervention.type === "siembra") {
        await runSiembra(projectId, intervention, seederAgent, send);

      } else if (intervention.type === "estructural") {
        await runEstructural(projectId, intervention, rewriterAgent, send);
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
  scanner: OccurrenceScannerAgent,
  send: SendFn
): Promise<void> {
  const chapters = await storage.getChaptersByProject(projectId);
  const targets = chapters
    .filter(c => intervention.capitulosAfectados.includes(c.chapterNumber))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  if (targets.length === 0) return;

  // ── Ruta A: intervención multi-capítulo → escáner semántico global ──────────
  // Para problemas que aparecen en varios capítulos con distintas fórmulas
  // (Ej: "Kincaid presentado como culpable" en prólogo + cap 2 + cap 3),
  // primero escaneamos todos juntos para encontrar TODAS las ocurrencias,
  // luego las aplicamos capítulo a capítulo con el patcher normalizado.
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
      // Agrupar ocurrencias por capítulo
      const byChapter = new Map<number, typeof scanResult.matches>();
      for (const m of scanResult.matches) {
        if (!byChapter.has(m.chapterNumber)) byChapter.set(m.chapterNumber, []);
        byChapter.get(m.chapterNumber)!.push(m);
      }

      // Aplicar por capítulo con el patcher normalizado (Fix212)
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
          await storage.updateChapter(chapter.id, { content: report.finalContent });
          const fuzzyNote = (report.fuzzyApplied ?? 0) > 0 ? ` (${report.fuzzyApplied} fuzzy)` : "";
          send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.applied.length}/${matches.length} ocurrencias corregidas${fuzzyNote}` });
        } else if (report.failed.length > 0) {
          send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber}: ${report.failed.length} anclas no encontradas — omitido` });
        }
      }
      send({ type: "intervention_progress", id: intervention.id, message: `Total: ${scanResult.matches.length} ocurrencias identificadas` });

    } else {
      // Escáner no encontró nada — caer a la ruta individual por si el scanner erró
      send({ type: "intervention_progress", id: intervention.id, message: `Escáner global sin resultados${scanResult.not_found_reason ? ": " + scanResult.not_found_reason : ""}. Aplicando cirugía individual...` });
      await runPuntualPerChapter(targets, intervention, agent, send);
    }

  } else {
    // ── Ruta B: un solo capítulo → cirugía directa ───────────────────────────
    await runPuntualPerChapter(targets, intervention, agent, send);
  }
}

/** Cirugía capítulo a capítulo (ruta fallback o single-chapter). */
async function runPuntualPerChapter(
  targets: Array<{ id: number; chapterNumber: number; title: string | null; content: string | null }>,
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
  rewriter: ChapterRewriteAgent,
  send: SendFn
): Promise<void> {
  // Usa ChapterRewriteAgent (ARE) en lugar de applyEditorialNotes.
  // La diferencia clave: el ARE recibe las contradicciones a eliminar
  // explícitamente y reescribe el capítulo completo desde cero, sin dejar
  // restos del texto anterior que sean incompatibles con la corrección.
  send({ type: "intervention_progress", id: intervention.id, message: "Iniciando reescritura estructural..." });

  const chapters = await storage.getChaptersByProject(projectId);
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

    // Guardar con backup en pre_edit_content
    await storage.updateChapter(chapter.id, {
      content: result.rewrittenContent,
      preEditContent: chapter.content ?? undefined,
    });

    const wordCount = result.rewrittenContent.split(/\s+/).length;
    const summary = result.changeSummary ? ` — ${result.changeSummary.substring(0, 80)}` : "";
    send({ type: "intervention_progress", id: intervention.id, message: `Cap ${chapter.chapterNumber} reescrito (${wordCount} palabras)${summary}` });
  }
}
