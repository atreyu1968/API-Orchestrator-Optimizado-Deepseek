/**
 * [Fix58] Helper compartido que construye un bloque markdown con el contexto
 * de serie para los lectores Holístico y Beta. Antes vivía duplicado en
 * `orchestrator.ts` (versión completa con threads/events) y en
 * `reedit-orchestrator.ts` (versión mínima inline). Ahora ambos consumen este
 * helper único y el reedit recibe el contexto rico igual que el principal.
 *
 * El bloque incluye:
 *   - Título de la serie y posición del volumen (N de M).
 *   - Si es el último volumen (gating crítico para la severidad).
 *   - Hilos no resueltos heredados de libros previos (si el caller los provee).
 *   - Eventos clave previos que el lector ya conoce (si el caller los provee).
 *   - Milestones obligatorios DEL volumen actual.
 *   - Plot threads conocidos de la serie con su estado.
 *
 * Los `threads` y `events` se cargan vía un callback opcional inyectado por el
 * caller, porque la función que los obtiene (`loadSeriesThreadsAndEvents`)
 * tiene lógica específica del orchestrator principal (lee texto íntegro de
 * volúmenes previos). Si el callback no se provee, esas dos secciones se
 * omiten pero el resto del contexto sigue funcionando.
 */
import { storage } from "../storage";

export interface SeriesContextOptions {
  seriesId: number | null | undefined;
  seriesOrder: number | null | undefined;
  loadThreadsAndEvents?: () => Promise<{ threads: string[]; events: string[] }>;
}

export async function buildSeriesContextForReviewers(opts: SeriesContextOptions): Promise<string | undefined> {
  if (!opts.seriesId) return undefined;
  try {
    const seriesData = await storage.getSeries(opts.seriesId);
    if (!seriesData) return undefined;

    let threads: string[] = [];
    let events: string[] = [];
    if (opts.loadThreadsAndEvents) {
      try {
        const loaded = await opts.loadThreadsAndEvents();
        threads = loaded.threads || [];
        events = loaded.events || [];
      } catch (err) {
        console.warn(`[Fix58] loadThreadsAndEvents falló: ${(err as Error).message}; sigo sin esa sección.`);
      }
    }

    const milestones = await storage.getMilestonesBySeries(opts.seriesId);
    const plotThreads = await storage.getPlotThreadsBySeries(opts.seriesId);
    const volumeNumber = opts.seriesOrder || 1;
    const totalVolumes = seriesData.totalPlannedBooks || 10;
    const isLastVolume = volumeNumber >= totalVolumes;
    const volumeMilestones = milestones.filter(m => m.volumeNumber === volumeNumber);

    const parts: string[] = [];
    parts.push("═══════════════════════════════════════════════════════════════════");
    parts.push("## CONTEXTO DE SERIE");
    parts.push("═══════════════════════════════════════════════════════════════════");
    parts.push("");
    parts.push(`Esta novela es el **VOLUMEN ${volumeNumber} de ${totalVolumes}** de la serie "${seriesData.title}".`);
    parts.push(`**¿Último volumen?**: ${isLastVolume ? "SÍ — TODOS los arcos (de libro y de serie) deben cerrarse aquí." : "NO — los arcos largos de la serie están DISEÑADOS para cerrarse en volúmenes posteriores; valora SOLO el cierre de la trama autoconclusiva interna de este libro."}`);
    parts.push("");

    if (threads.length > 0) {
      parts.push("### HILOS HEREDADOS DE LIBROS PREVIOS (no requieren re-presentación)");
      parts.push(threads.slice(0, 25).map(t => `- ${t}`).join("\n"));
      parts.push("");
    }
    if (events.length > 0) {
      parts.push("### EVENTOS CLAVE PREVIOS (el lector ya los conoce)");
      parts.push(events.slice(0, 25).map(e => `- ${e}`).join("\n"));
      parts.push("");
    }
    if (volumeMilestones.length > 0) {
      parts.push(`### MILESTONES OBLIGATORIOS DE ESTE VOLUMEN (vol ${volumeNumber})`);
      parts.push(volumeMilestones.map(m => `- ${m.isRequired ? "[OBLIGATORIO] " : "[opcional] "}${m.description}`).join("\n"));
      parts.push("Si alguno de los OBLIGATORIOS no aparece, ESO sí es un problema estructural mayor.");
      parts.push("");
    }
    if (plotThreads.length > 0) {
      const seriesLevel = plotThreads.filter(t => t.status !== "resolved");
      if (seriesLevel.length > 0) {
        parts.push("### HILOS DE LA SERIE (estado planificado)");
        parts.push(seriesLevel.slice(0, 30).map(t =>
          `- "${t.threadName}" (importancia: ${t.importance || "n/a"}, estado: ${t.status || "abierto"})`
        ).join("\n"));
        parts.push("Estos hilos pertenecen al arco de SERIE. Si este NO es el último volumen, no exijas su cierre aquí.");
        parts.push("");
      }
    }
    parts.push("═══════════════════════════════════════════════════════════════════");
    return parts.join("\n");
  } catch (err) {
    console.warn(`[Fix58] No se pudo construir contexto de serie para reviewers: ${(err as Error).message}`);
    return undefined;
  }
}
