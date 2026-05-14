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
      // [Fix68b] Reformulación: el Beta seguía evaluando la precuela con
      // rúbrica de "novela autoconclusiva" y quejándose de que era "solo un
      // primer acto" o "se siente inconclusa". El usuario plantea que la
      // precuela debe juzgarse como PRIMER LIBRO CRONOLÓGICO de una serie
      // en curso: el lector va a continuar leyendo los volúmenes
      // posteriores, así que arcos largos LEGÍTIMAMENTE quedan abiertos como
      // ganchos. Cambio de marco: no "novela independiente" sino "primer
      // libro de una serie".
      parts.push(`Esta novela es la **PRECUELA (Vol. 0)** de la serie "${seriesData.title}" — el **primer libro cronológico** de una serie planificada de ${totalVolumes} volúmenes principales. El lector seguirá leyendo Vol. 1+ a continuación.`);
      parts.push(`**¿Último volumen?**: NO. Esta precuela NO debe juzgarse como una novela autoconclusiva ni con la rúbrica de "novela completa cerrada". Debe juzgarse como el **primer libro de una serie larga**: arcos amplios, hilos de fondo, presentaciones de personajes y promesas a largo plazo PUEDEN y DEBEN quedar abiertos al final — eso es lo esperado, no un defecto. Un cliffhanger o una transición hacia Vol. 1 al cerrar el libro son válidos.`);
      parts.push(`**Lo que SÍ debes evaluar**: que la PROPIA TRAMA INTERNA que esta precuela elige contar (no la de la serie entera, ni la del Vol. 1) tenga progresión sostenida y un cierre coherente del ARCO PUNTUAL que se haya planteado. Si en este manuscrito se plantea el viaje de X a Y, valida que ese viaje se cierre; si se plantea la transformación interior de Z, valida que esa transformación tenga un punto de inflexión claro. NO exijas más cierre del que el libro promete dentro de sí mismo.`);
      parts.push(`**Lo que NO debes hacer**: NO penalices que personajes salgan vivos, que "no se sepa nada de" un personaje que aparece en libros posteriores, que queden conflictos políticos/místicos/familiares abiertos hacia el futuro, ni que el manuscrito "termine cuando empieza la acción grande de la serie". Eso es exactamente lo que una precuela hace por diseño.`);
      parts.push(`**Coherencia inversa (sí debes auditar)**: que nada de lo escrito en esta precuela CONTRADIGA los eventos/personajes/reglas establecidos en los volúmenes posteriores (personajes deben aparecer más jóvenes/inexpertos, geografía/cultura compatibles, etc.).`);
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
