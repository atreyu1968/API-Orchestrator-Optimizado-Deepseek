import { storage } from "../storage";
import { stripMetaChapterHeader } from "./strip-chapter-header";

/**
 * [Fix182] Renumera los capitulos POSITIVOS de un proyecto para que formen una
 * secuencia contigua 1..N tras uno o varios borrados/fusiones, cerrando cualquier
 * hueco (p.ej. si se borra el cap 7 y quedan 1..6 y 8..20, pasan a 1..19).
 *
 * NUNCA toca los capitulos especiales: Prologo (0), Epilogo (-1) ni Nota del
 * autor (-2) — solo se compactan los positivos conservando su orden relativo.
 *
 * No existe restriccion UNIQUE en (project_id, chapter_number), pero renumeramos
 * en orden ascendente (cada numero destino siempre es <= el actual, y los
 * inferiores ya se han movido, asi que el destino queda libre antes del UPDATE),
 * de modo que el estado intermedio nunca es ambiguo.
 *
 * Es idempotente: si los capitulos ya son contiguos y sin encabezado meta
 * incrustado, no hace ningun UPDATE. Devuelve cuantos capitulos cambiaron.
 *
 * [Fix183] Al cambiar de numero, el content de un capitulo puede arrastrar un
 * encabezado meta incrustado ("# Capitulo 8: ...") de su numero ANTERIOR. El
 * exportador (epub/markdown/docx) ya lo elimina via stripMetaChapterHeader y
 * regenera su propio encabezado desde chapter_number + title, PERO los lectores
 * Holistico/Beta y el ensamblador de manuscrito leen el content crudo: ven el
 * numero de la columna MAS el numero incrustado obsoleto -> "doble numeracion"
 * (falso positivo que hacia gastar iteraciones del pulido). Por eso saneamos el
 * encabezado meta de todo capitulo que cambie de numero: es seguro (el export lo
 * regenera) e idempotente (solo persiste si el content realmente cambio).
 *
 * OJO: renumera SOLO la columna chapter_number (mas el saneo del encabezado). No
 * remapea referencias a numeros de capitulo en el World Bible ni en las acciones
 * administrativas pendientes (igual que el borrado manual desde la lista de
 * capitulos). El bucle autonomo relee el manuscrito limpio en cada iteracion,
 * asi que trabaja con la numeracion ya compactada.
 */
export async function renumberChaptersSequential(projectId: number): Promise<number> {
  const chapters = await storage.getChaptersByProject(projectId);
  const positives = chapters
    .filter(c => Number(c.chapterNumber) > 0)
    .sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber));
  let changed = 0;
  for (let i = 0; i < positives.length; i++) {
    const desired = i + 1;
    const ch = positives[i];
    if (Number(ch.chapterNumber) !== desired) {
      const update: Record<string, unknown> = { chapterNumber: desired };
      // Sanea el encabezado meta incrustado que ahora contradice la nueva posicion.
      if (typeof ch.content === "string" && ch.content.length > 0) {
        const cleaned = stripMetaChapterHeader(ch.content);
        if (cleaned !== ch.content) update.content = cleaned;
      }
      await storage.updateChapter(ch.id, update as any);
      changed++;
    }
  }
  return changed;
}
