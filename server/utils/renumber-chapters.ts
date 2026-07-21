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

/**
 * [Fix237] Re-mapea los numeros de capitulo referenciados por las acciones
 * administrativas pendientes tras una renumeracion.
 *
 * Contexto del bug: las tarjetas apuntan por NUMERO (targetChapter,
 * secondaryChapter, sourceChapters), y ejecutar una accion renumera los
 * capitulos pero dejaba las demas tarjetas con la numeracion VIEJA. Caso real
 * del usuario: ejecuto delete_chapter del cap 10 y acto seguido la fusion
 * archivada "cap 15 absorbe cap 10" — que ya apuntaba a capitulos
 * desplazados y fusiono los equivocados.
 *
 * Reglas:
 *  - deleted: lista de numeros (numeracion VIEJA) de capitulos borrados.
 *    Toda referencia > n baja tantas posiciones como borrados haya por debajo.
 *    Si una accion referencia un capitulo BORRADO, la accion se INVALIDA
 *    (se retira del listado; su intencion ya no es representable) y se
 *    devuelve en `dropped` para que el caller lo registre en el log.
 *  - insertedAfter: numero tras el cual se inserto un capitulo nuevo (split);
 *    toda referencia > n sube +1.
 *
 * Cuando una accion cambia de numeros se elimina su targetLabel (texto con el
 * numero viejo incrustado; la UI cae a "Cap. {targetChapter}") y se anota en
 * el reason que la numeracion fue actualizada.
 */
export interface RemapAdminActionsResult {
  actions: any[];
  changed: number;
  dropped: { id: number; type: string; label: string }[];
}

export function remapPendingAdminActionsForRenumber(
  actions: any[],
  opts: { deleted?: number[]; insertedAfter?: number },
): RemapAdminActionsResult {
  const deleted = (opts.deleted || []).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const insertedAfter = Number.isFinite(opts.insertedAfter) ? Number(opts.insertedAfter) : null;
  const deletedSet = new Set(deleted);

  const mapNum = (n: number): number | null => {
    if (!Number.isFinite(n) || n <= 0) return n; // especiales (0/-1/-2) no se renumeran
    if (deletedSet.has(n)) return null;
    let out = n;
    if (deleted.length > 0) {
      let below = 0;
      for (const d of deleted) { if (d < n) below++; else break; }
      out -= below;
    }
    if (insertedAfter !== null && n > insertedAfter) out += 1;
    return out;
  };

  const result: any[] = [];
  const dropped: { id: number; type: string; label: string }[] = [];
  let changed = 0;

  for (const a of actions) {
    if (!a || typeof a !== "object") { result.push(a); continue; }
    const refsFields: ("targetChapter" | "secondaryChapter")[] = ["targetChapter", "secondaryChapter"];
    let mutated = false;
    let invalid = false;
    const next: any = { ...a };
    for (const f of refsFields) {
      const v = Number(a[f]);
      if (!Number.isFinite(v)) continue;
      const nv = mapNum(v);
      if (nv === null) { invalid = true; break; }
      if (nv !== v) { next[f] = nv; mutated = true; }
    }
    if (!invalid && Array.isArray(a.sourceChapters)) {
      const remapped: number[] = [];
      for (const s of a.sourceChapters) {
        const v = Number(s);
        if (!Number.isFinite(v)) continue;
        const nv = mapNum(v);
        if (nv === null) { invalid = true; break; }
        remapped.push(nv);
        if (nv !== v) mutated = true;
      }
      if (!invalid && mutated) next.sourceChapters = remapped;
    }
    if (invalid) {
      dropped.push({
        id: Number(a.id),
        type: String(a.type || ""),
        label: String(a.targetLabel || `cap ${a.targetChapter}`),
      });
      continue;
    }
    if (mutated) {
      changed++;
      delete next.targetLabel; // texto con numeros viejos; la UI cae al numero remapeado
      const note = "[Fix237] Numeracion actualizada tras ejecutar otra accion administrativa.";
      if (typeof next.reason === "string" && !next.reason.includes("[Fix237]")) {
        next.reason = `${note} ${next.reason}`;
      }
      result.push(next);
    } else {
      result.push(a);
    }
  }
  return { actions: result, changed, dropped };
}
