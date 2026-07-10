import { storage } from "./storage";
import { Orchestrator } from "./orchestrator";
import type { Project } from "@shared/schema";
import { tryMarkPolishActive, clearPolishActive, isPolishActive } from "./utils/polish-registry";

// [Fix177] Auto-resume del pulido advisory (Holistico+Beta) tras un reinicio.
//
// El bucle de pulido corre en segundo plano DESPUES de marcar el proyecto como
// "completed" (finalizeCompletedProject). No es un status "processing", asi que
// ni el watchdog de reedicion ni la reanudacion de generacion lo cubren: un
// reinicio del server lo mata en silencio y el libro queda con la nota que
// tuviera y los arreglos sin aplicar. Este modulo, invocado en el arranque,
// busca proyectos con autoPolishPending=true y relanza el bucle, con un tope de
// reanudaciones para no gastar tokens en bucle si el pulido se cuelga siempre.

const MAX_POLISH_RESUMES = 3;

function makeSilentOrchestrator(): Orchestrator {
  // El pulido de resume no tiene cliente SSE conectado; los callbacks solo
  // registran en consola. La persistencia real (chapters, scores, activity
  // logs) la hace el propio bucle via storage, no via callbacks.
  return new Orchestrator({
    onAgentStatus: () => {},
    onChapterComplete: () => {},
    onChapterRewrite: () => {},
    onChapterStatusChange: () => {},
    onProjectComplete: () => {},
    onError: (error: string) => console.error(`[PolishAutoResume] orchestrator error: ${error}`),
  });
}

async function launchPolishResume(project: Project, attempt: number): Promise<boolean> {
  // [Fix177] Adquisicion ATOMICA (check+set sincrono, sin await en medio) del
  // guard COMPARTIDO con finalizeCompletedProject. Es el gate DEFINITIVO: si dos
  // /resume-polish llegan a la vez, solo uno obtiene true y arranca el bucle; el
  // otro recibe false (-> 409). Si algo falla en la preparacion (antes de
  // enganchar el .finally del bucle) se libera el guard en el catch para no dejar
  // el id "pegado" hasta el proximo reinicio.
  if (!tryMarkPolishActive(project.id)) {
    return false;
  }
  try {
    await storage.updateProject(project.id, { autoPolishResumeCount: attempt }).catch(() => {});
    await storage.createActivityLog({
      projectId: project.id,
      level: "info",
      message: `Reanudando pulido interrumpido (intento ${attempt}/${MAX_POLISH_RESUMES}) tras reinicio del servidor.`,
      agentRole: "orchestrator",
    }).catch(() => {});

    // Relee el proyecto fresco por si cambio entre el scan y el lanzamiento.
    const fresh = (await storage.getProject(project.id)) ?? project;
    const orchestrator = makeSilentOrchestrator();
    orchestrator.runAutoPolishResume(fresh)
      .then(() => {
        console.log(`[PolishAutoResume] Pulido del proyecto ${project.id} finalizado.`);
      })
      .catch((error) => {
        console.error(`[PolishAutoResume] Pulido del proyecto ${project.id} fallo:`, error);
      })
      .finally(() => {
        clearPolishActive(project.id);
      });
    return true;
  } catch (error) {
    clearPolishActive(project.id);
    throw error;
  }
}

export async function autoResumePendingPolish(): Promise<void> {
  console.log("[PolishAutoResume] Buscando pulidos interrumpidos que reanudar...");
  try {
    const projects = await storage.getAllProjects();
    const pending = projects.filter(
      (p) => (p as any).autoPolishPending === true && p.status === "completed",
    );

    if (pending.length === 0) {
      console.log("[PolishAutoResume] No hay pulidos pendientes.");
      return;
    }

    console.log(
      `[PolishAutoResume] ${pending.length} pulido(s) pendiente(s):`,
      pending.map((p) => `${p.id}: ${p.title}`),
    );

    for (const project of pending) {
      if (isPolishActive(project.id)) {
        console.log(`[PolishAutoResume] Proyecto ${project.id} ya tiene un pulido activo, se omite.`);
        continue;
      }

      const count = (project as any).autoPolishResumeCount || 0;
      if (count >= MAX_POLISH_RESUMES) {
        console.warn(
          `[PolishAutoResume] Proyecto ${project.id} alcanzo el maximo de reanudaciones (${count}); se limpia el flag y queda para revision manual.`,
        );
        await storage.updateProject(project.id, { autoPolishPending: false }).catch(() => {});
        await storage.createActivityLog({
          projectId: project.id,
          level: "warning",
          message: `El pulido automatico agoto ${MAX_POLISH_RESUMES} reanudaciones sin cerrar; se detiene para evitar coste infinito. Relanza la revision manual si quieres continuar.`,
          agentRole: "orchestrator",
        }).catch(() => {});
        continue;
      }

      const launched = await launchPolishResume(project, count + 1);
      if (launched) {
        console.log(`[PolishAutoResume] Pulido del proyecto ${project.id} lanzado en segundo plano.`);
      } else {
        console.log(`[PolishAutoResume] Proyecto ${project.id} ya tiene un pulido activo, se omite.`);
      }
    }
  } catch (error) {
    console.error("[PolishAutoResume] Error durante el auto-resume:", error);
  }
}

/**
 * [Fix177] Fuerza la reanudacion del pulido de un proyecto concreto (usado para
 * rescatar libros ya completados antes de este fix, cuyo pulido murio en un
 * reinicio). Marca el flag, resetea el contador y lanza el bucle.
 */
export async function forcePolishResume(projectId: number): Promise<{ success: boolean; message: string }> {
  const project = await storage.getProject(projectId);
  if (!project) {
    return { success: false, message: "Proyecto no encontrado" };
  }
  // Rechazo temprano (fast-path) sin escrituras si ya hay pulido activo. El gate
  // DEFINITIVO es el tryMark atomico dentro de launchPolishResume: si dos requests
  // se cuelan por esta comprobacion a la vez, solo uno adquirira el lock.
  if (isPolishActive(projectId)) {
    return { success: false, message: "El pulido ya esta en marcha" };
  }
  await storage.updateProject(projectId, { autoPolishPending: true, autoPolishResumeCount: 0 });
  const fresh = (await storage.getProject(projectId)) ?? project;
  const launched = await launchPolishResume(fresh, 1);
  if (!launched) {
    return { success: false, message: "El pulido ya esta en marcha" };
  }
  return { success: true, message: "Pulido relanzado en segundo plano" };
}
