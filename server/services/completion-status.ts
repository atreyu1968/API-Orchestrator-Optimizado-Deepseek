import { storage } from "../storage";

// ─────────────────────────────────────────────────────────────────────────────
// [Fix263] Regla dura del usuario: una novela NUNCA queda como "completed"
// limpio si hay issues conocidos sin resolver. Estas funciones son module-level
// (no de clase) para que routes.ts pueda recomputar el estado tras aplicar
// correcciones (fact-check, instrucciones editoriales) sin instanciar nada.

export interface PendingIssueSummary {
  source: string;
  count: number;
  detail: string;
}

export async function collectKnownPendingIssues(projectId: number): Promise<PendingIssueSummary[]> {
  const pendientes: PendingIssueSummary[] = [];
  const project = await storage.getProject(projectId);
  if (!project) return pendientes;

  // 1. Issues del Revisor Final (aprobado con reservas)
  const frr = project.finalReviewResult as any;
  const frrIssues = Array.isArray(frr?.issues) ? frr.issues.filter((i: any) => i && i.resolved !== true) : [];
  if (frrIssues.length > 0) {
    pendientes.push({
      source: "revisor_final",
      count: frrIssues.length,
      detail: `${frrIssues.length} issue(s) del Revisor Final sin resolver`,
    });
  }

  // 2. Instrucciones editoriales pendientes del bucle Holistico+Beta (advisory)
  const pep = project.pendingEditorialParse as any;
  const pepCount = Array.isArray(pep?.instrucciones) ? pep.instrucciones.length : 0;
  if (pepCount > 0) {
    pendientes.push({
      source: "revision_editorial",
      count: pepCount,
      detail: `${pepCount} instruccion(es) editorial(es) pendientes de aplicar`,
    });
  }

  // 3. Fact-check: fichas pendientes de decision humana (persistidas como worldRule)
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    const rules = ((wb?.worldRules || []) as any[]);
    const fcRule = rules.find((r: any) => r?.category === "__fact_check_pending");
    const fcCount = Array.isArray(fcRule?.pendientes) ? fcRule.pendientes.length : 0;
    if (fcCount > 0) {
      pendientes.push({
        source: "fact_check",
        count: fcCount,
        detail: `${fcCount} ficha(s) del verificador de datos pendientes de decision`,
      });
    }
  } catch (_e) {}

  return pendientes;
}

/**
 * [Fix263] Recalcula el estado final de un proyecto TERMINADO segun sus issues
 * conocidos: "completed" solo si esta limpio; "completed_with_issues" si quedan
 * pendientes. Solo actua si el proyecto ya esta en uno de esos dos estados (o
 * si forceFinalize=true, para la finalizacion inicial). Devuelve el estado
 * aplicado o null si no actuo.
 */
export async function recomputeCompletionStatus(
  projectId: number,
  opts: { forceFinalize?: boolean } = {}
): Promise<string | null> {
  const project = await storage.getProject(projectId);
  if (!project) return null;
  const isFinished = project.status === "completed" || project.status === "completed_with_issues";
  if (!isFinished && !opts.forceFinalize) return null;

  const pendientes = await collectKnownPendingIssues(projectId);
  const target = pendientes.length > 0 ? "completed_with_issues" : "completed";
  if (project.status !== target || opts.forceFinalize) {
    await storage.updateProject(projectId, { status: target });
    if (target === "completed_with_issues") {
      await storage.createActivityLog({
        projectId,
        level: "warn",
        agentRole: "orchestrator",
        message: `[Fix263] Manuscrito terminado PERO con issues conocidos sin resolver — estado "completada con issues": ${pendientes.map(p => p.detail).join("; ")}. Resuélvelos (aplicar instrucciones editoriales / decidir fichas del verificador) y el estado pasará a "completada" automáticamente.`,
      });
    } else if (project.status === "completed_with_issues") {
      await storage.createActivityLog({
        projectId,
        level: "success",
        agentRole: "orchestrator",
        message: `[Fix263] Todos los issues conocidos han quedado resueltos — la novela pasa a estado "completada".`,
      });
    }
  }
  return target;
}
