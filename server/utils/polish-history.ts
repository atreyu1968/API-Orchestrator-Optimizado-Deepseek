import { storage } from "../storage";

// [Fix268][Task 8] Invalidación de la memoria de meseta del pulido tras una
// CIRUGÍA ESTRUCTURAL del manuscrito (fusión/borrado/división de capítulos,
// reescritura de un capítulo por chat editorial o rewrite manual).
//
// Contexto: el bucle de pulido Holístico+Beta persiste su historial de rondas
// como worldRule "__polish_history" (Fix266) y usa ese historial para:
//  (a) cortar una ronda nueva en la iteración 2 si no supera el mejor
//      combinado histórico ("meseta persistente"), y
//  (b) aceptar la meseta y NO relanzar la ronda completa.
// Caso real ("La Geometría del Silencio"): el usuario ejecutó la fusión de
// los capítulos de resolución desde "Acciones administrativas pendientes"
// precisamente para desbloquear la nota del Beta, pero al relanzar el pulido
// la ronda se cortó en la iter 2 "por meseta histórica"... medida sobre un
// manuscrito que YA NO existe. Tras cualquier cirugía estructural el techo
// histórico deja de ser comparable y debe borrarse para que el pulido
// relanzado parta con historial limpio y margen real de subir.
//
// También se borra "__structural_rescue_history": sus pasadas cuentan
// intentos del brazo estructural sobre el manuscrito ANTERIOR; conservarlas
// haría que el bucle creyera que la escalada ya se probó sobre este texto.
export async function invalidatePolishHistoryAfterStructuralChange(
  projectId: number,
  reason: string,
): Promise<void> {
  try {
    const wb = await storage.getWorldBibleByProject(projectId);
    if (!wb) return;
    const rules = ((wb.worldRules || []) as any[]);
    const CATEGORIES = ["__polish_history", "__structural_rescue_history"];
    const hadHistory = rules.some((r: any) => CATEGORIES.includes(r?.category));
    if (!hadHistory) return; // Nada que invalidar: no ensuciamos el log.
    const next = rules.filter((r: any) => !CATEGORIES.includes(r?.category));
    await storage.updateWorldBible(wb.id, { worldRules: next } as any);
    await storage.createActivityLog({
      projectId,
      level: "info",
      agentRole: "editor",
      message: `[Fix268] Historial de meseta del pulido INVALIDADO: el manuscrito cambió estructuralmente (${reason}). El próximo pulido Holístico+Beta partirá con historial limpio, sin cortes por "meseta histórica" medida sobre el texto anterior.`,
      metadata: { fix: "Fix268", reason },
    });
    console.log(`[Fix268] Polish history invalidated for project ${projectId}: ${reason}`);
  } catch (e) {
    // Best-effort: la cirugía estructural ya se aplicó; no la revertimos por
    // un fallo al limpiar la memoria del pulido.
    console.warn(`[Fix268] invalidatePolishHistoryAfterStructuralChange fallo (project ${projectId}): ${(e as Error).message}`);
  }
}
