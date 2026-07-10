import { storage } from "../storage";

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
 * Es idempotente: si los capitulos ya son contiguos no hace ningun UPDATE.
 * Devuelve cuantos capitulos cambiaron de numero.
 *
 * OJO: renumera SOLO la columna chapter_number. No remapea referencias a numeros
 * de capitulo en el World Bible ni en las acciones administrativas pendientes
 * (igual que el borrado manual desde la lista de capitulos). El bucle autonomo
 * relee el manuscrito limpio en cada iteracion, asi que trabaja con la numeracion
 * ya compactada.
 */
export async function renumberChaptersSequential(projectId: number): Promise<number> {
  const chapters = await storage.getChaptersByProject(projectId);
  const positives = chapters
    .filter(c => Number(c.chapterNumber) > 0)
    .sort((a, b) => Number(a.chapterNumber) - Number(b.chapterNumber));
  let changed = 0;
  for (let i = 0; i < positives.length; i++) {
    const desired = i + 1;
    if (Number(positives[i].chapterNumber) !== desired) {
      await storage.updateChapter(positives[i].id, { chapterNumber: desired } as any);
      changed++;
    }
  }
  return changed;
}
