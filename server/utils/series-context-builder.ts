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
  // [Fix68] Necesario para detectar precuelas. Una precuela tiene
  // `seriesOrder = 0` y `projectSubtype = "prequel"`; sin esta señal, el
  // contexto de serie cargaba por error los hitos del Volumen 1 (porque
  // `seriesOrder || 1` colapsaba el 0 a 1) y el Beta se frustraba pensando
  // que faltaban hitos que pertenecen a otro libro.
  projectSubtype?: string | null;
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
    // [Fix68] Precuela = `projectSubtype === "prequel"` o `seriesOrder === 0`.
    // Antes hacíamos `seriesOrder || 1`, lo que convertía un 0 legítimo
    // (precuela) en 1 y cargaba los hitos del Volumen 1 como si fueran de la
    // precuela. Ahora distinguimos los tres casos: precuela, volumen normal,
    // volumen sin orden conocido (fallback a 1).
    const isPrequel = opts.projectSubtype === "prequel" || opts.seriesOrder === 0;
    const volumeNumber = isPrequel
      ? 0
      : (typeof opts.seriesOrder === "number" && opts.seriesOrder > 0 ? opts.seriesOrder : 1);
    const totalVolumes = seriesData.totalPlannedBooks || 10;
    const isLastVolume = !isPrequel && volumeNumber >= totalVolumes;
    // Hitos de ESTE volumen: si es precuela, filtramos por volumeNumber === 0
    // (si el usuario los registró). NUNCA reusamos los del vol 1.
    const volumeMilestones = milestones.filter(m => m.volumeNumber === volumeNumber);

    const parts: string[] = [];
    parts.push("═══════════════════════════════════════════════════════════════════");
    parts.push("## CONTEXTO DE SERIE");
    parts.push("═══════════════════════════════════════════════════════════════════");
    parts.push("");
    if (isPrequel) {
      parts.push(`Esta novela es una **PRECUELA (Vol. 0)** de la serie "${seriesData.title}" (de ${totalVolumes} volúmenes principales planificados).`);
      parts.push(`**¿Último volumen?**: NO aplica — una precuela ocurre ANTES, cronológicamente, de los otros libros. Su misión es ser una novela autoconclusiva que enriquece la serie, no cerrar arcos de los volúmenes posteriores.`);
      parts.push(`**Hilos largos de la serie**: lo que pasa en los volúmenes posteriores (Vol. 1+) es el **FUTURO** de los personajes de esta precuela. NO exijas que la precuela los resuelva ni los plantee explícitamente; tampoco te quejes si personajes "salen vivos" o "no se sabe nada de X" cuando X aparece en libros posteriores — el lector de la serie sabe lo que pasa después.`);
      parts.push(`**Coherencia inversa**: lo que esta precuela establezca debe encajar hacia adelante con lo ya escrito en los volúmenes posteriores (no contradicción), pero la precuela en sí se juzga como novela independiente.`);
      parts.push("");
    } else {
      parts.push(`Esta novela es el **VOLUMEN ${volumeNumber} de ${totalVolumes}** de la serie "${seriesData.title}".`);
      parts.push(`**¿Último volumen?**: ${isLastVolume ? "SÍ — TODOS los arcos (de libro y de serie) deben cerrarse aquí." : "NO — los arcos largos de la serie están DISEÑADOS para cerrarse en volúmenes posteriores; valora SOLO el cierre de la trama autoconclusiva interna de este libro."}`);
      parts.push("");
    }

    if (threads.length > 0) {
      // [Fix68] En precuela los "threads" provienen de libros POSTERIORES
      // (cronológicamente futuro). El título y la nota lo dejan explícito
      // para que Beta/Holístico/FR no exijan resolución.
      parts.push(isPrequel
        ? "### HILOS PLANTEADOS EN LIBROS POSTERIORES (futuro de estos personajes — NO exigir aquí)"
        : "### HILOS HEREDADOS DE LIBROS PREVIOS (no requieren re-presentación)");
      parts.push(threads.slice(0, 25).map(t => `- ${t}`).join("\n"));
      parts.push("");
    }
    if (events.length > 0) {
      parts.push(isPrequel
        ? "### EVENTOS CLAVE DE LIBROS POSTERIORES (cronológicamente futuro — la precuela no debe contradecirlos)"
        : "### EVENTOS CLAVE PREVIOS (el lector ya los conoce)");
      parts.push(events.slice(0, 25).map(e => `- ${e}`).join("\n"));
      parts.push("");
    }
    if (volumeMilestones.length > 0) {
      parts.push(`### MILESTONES OBLIGATORIOS DE ESTE VOLUMEN (${isPrequel ? "precuela / vol 0" : `vol ${volumeNumber}`})`);
      parts.push(volumeMilestones.map(m => `- ${m.isRequired ? "[OBLIGATORIO] " : "[opcional] "}${m.description}`).join("\n"));
      parts.push("Si alguno de los OBLIGATORIOS no aparece, ESO sí es un problema estructural mayor.");
      parts.push("");
    } else if (isPrequel) {
      // [Fix68] Aviso explícito para que el Beta NO infiera/invente hitos
      // a partir de los volúmenes posteriores cuando lee una precuela sin
      // hitos registrados.
      parts.push("### MILESTONES OBLIGATORIOS DE ESTE VOLUMEN (precuela / vol 0)");
      parts.push("- (No hay hitos específicos registrados para esta precuela.)");
      parts.push("NO uses los hitos de Vol. 1+ como referencia: pertenecen a libros POSTERIORES y la precuela no debe cumplirlos. Valora la precuela como novela autoconclusiva por su propia trama.");
      parts.push("");
    }
    if (plotThreads.length > 0) {
      const seriesLevel = plotThreads.filter(t => t.status !== "resolved");
      if (seriesLevel.length > 0) {
        parts.push("### HILOS DE LA SERIE (estado planificado)");
        parts.push(seriesLevel.slice(0, 30).map(t =>
          `- "${t.threadName}" (importancia: ${t.importance || "n/a"}, estado: ${t.status || "abierto"})`
        ).join("\n"));
        if (isPrequel) {
          parts.push("[Fix68] Esta novela es una PRECUELA: los hilos arriba se desarrollan/resuelven en los volúmenes POSTERIORES, no aquí. No exijas su planteamiento ni su cierre en la precuela; como mucho, valora si algún detalle de la precuela los CONTRADICE.");
        } else {
          parts.push("Estos hilos pertenecen al arco de SERIE. Si este NO es el último volumen, no exijas su cierre aquí.");
        }
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
