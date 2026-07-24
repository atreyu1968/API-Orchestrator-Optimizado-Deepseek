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

  // 4. [Fix265] Tramas colgantes que la reparacion automatica no pudo cerrar
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    const rules = ((wb?.worldRules || []) as any[]);
    const ptRule = rules.find((r: any) => r?.category === "__plot_threads_pending");
    const ptCount = Array.isArray(ptRule?.pendientes) ? ptRule.pendientes.length : 0;
    if (ptCount > 0) {
      pendientes.push({
        source: "tramas_colgantes",
        count: ptCount,
        detail: `${ptCount} trama(s) secundaria(s) colgante(s) sin cerrar`,
      });
    }
  } catch (_e) {}

  return pendientes;
}

// [Fix265] Persiste (o limpia, si el array llega vacio) las tramas colgantes
// que el auditor de cierre detecto y la reparacion automatica no pudo cerrar,
// y recalcula el estado del proyecto (regla dura Fix263).
export async function persistPlotThreadsPending(projectId: number, pending: any[]): Promise<void> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    if (wb) {
      const rules = ((wb.worldRules || []) as any[]).filter((r: any) => r?.category !== "__plot_threads_pending");
      if (pending.length > 0) {
        rules.push({ category: "__plot_threads_pending", pendientes: pending, updatedAt: new Date().toISOString() });
      }
      await storage.updateWorldBible(wb.id, { worldRules: rules } as any);
    }
    await recomputeCompletionStatus(projectId);
  } catch (e) {
    console.warn(`[Fix265] persistPlotThreadsPending fallo para proyecto ${projectId}: ${(e as Error).message}`);
  }
}

// [Fix265] Retira tramas pendientes ya resueltas por el usuario (identificadas
// por nombre; sin nombres = retirar todas) y recalcula el estado del proyecto.
// Paralelo a resolveFactCheckPending: la via MANUAL de salida obligatoria para
// que el estado "completed_with_issues" nunca quede sin salida.
export async function resolvePlotThreadsPending(projectId: number, nombres?: string[]): Promise<number> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    if (!wb) return 0;
    const rules = (wb.worldRules || []) as any[];
    const rule = rules.find((r: any) => r?.category === "__plot_threads_pending");
    if (!rule || !Array.isArray(rule.pendientes)) return 0;
    const before = rule.pendientes.length;
    rule.pendientes = (nombres && nombres.length > 0)
      ? rule.pendientes.filter((p: any) => !nombres.includes(p?.nombre))
      : [];
    const removed = before - rule.pendientes.length;
    if (removed > 0) {
      const next = rule.pendientes.length > 0
        ? rules
        : rules.filter((r: any) => r?.category !== "__plot_threads_pending");
      rule.updatedAt = new Date().toISOString();
      await storage.updateWorldBible(wb.id, { worldRules: next } as any);
      await recomputeCompletionStatus(projectId);
    }
    return removed;
  } catch (e) {
    console.warn(`[Fix265] resolvePlotThreadsPending fallo para proyecto ${projectId}: ${(e as Error).message}`);
    return 0;
  }
}

// [Fix265] Lee las tramas colgantes pendientes persistidas (para UI/endpoint).
export async function getPlotThreadsPending(projectId: number): Promise<any[]> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    const rules = ((wb?.worldRules || []) as any[]);
    const rule = rules.find((r: any) => r?.category === "__plot_threads_pending");
    return Array.isArray(rule?.pendientes) ? rule.pendientes : [];
  } catch (_e) {
    return [];
  }
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
