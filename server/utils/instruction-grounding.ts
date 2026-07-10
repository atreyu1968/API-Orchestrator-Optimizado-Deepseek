// [Fix128] Revalidación de instrucciones contra el texto VIGENTE del capítulo
// ANTES de pasarlas al cirujano. En ciclos sucesivos del Revisor/Holístico/Beta,
// una nota puede citar literalmente un pasaje que YA fue modificado o eliminado
// por una iteración previa (instrucción "fantasma"). Si la mandamos al cirujano,
// este gasta una llamada y, peor, puede intentar reconstruir o "resolver" algo
// que ya no existe. Aquí detectamos ese caso comparando las CITAS LITERALES de la
// instrucción con el texto actual del capítulo.

// Normaliza para comparar: minúsculas, comillas unificadas, espacios colapsados.
// [Fix179] Ademas quita acentos (NFD + strip diacriticos) para que una cita con
// tilde distinta ("corazon"/"corazon") empareje. Es simetrico: cita y texto pasan
// por la misma normalizacion, asi que el matching sigue siendo fiable.
function normalizeForMatch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[«»“”„‟"]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// [Fix179] Detecta fragmentos que NO son prosa de la novela sino META-COMENTARIO
// del revisor colado entre comillas/parentesis (p.ej. "(cap 10, escena de la
// despensa) desactiva la gravedad..." o ". localizar la linea exacta..."). Estos
// nunca aparecen en la prosa, asi que si los tratamos como citas empujan la
// instruccion a "fantasma" y la descartan aunque el arreglo fuese valido. Los
// excluimos de las citas auditables. Una cita de prosa real de una novela romantica
// no arranca con puntuacion suelta ni contiene verbos-orden ni referencias a "cap N".
function isLikelyMetaFragment(frag: string): boolean {
  const f = (frag || "").trim();
  if (!f) return true;
  // Arranca con puntuacion de instruccion troceada: ")", ".", ",", "(", ":", ";"
  if (/^[)\.\,\(:;]/.test(f)) return true;
  const low = f.toLowerCase();
  // Referencia meta a capitulos/escenas/tecnica narrativa.
  if (/\bcap[íi]tulo?s?\.?\s*#?\s*\d/.test(low)) return true;
  if (/\b(escena|presente narrativo|punto de vista|voz narrativa|show,?\s*don'?t\s*tell|mostrar\s+en\s+lugar\s+de\s+contar)\b/.test(low)) return true;
  // Verbos-orden tipicos de una instruccion editorial (no de dialogo/prosa).
  if (/\b(localizar|localiza|desactiva|desactivar|reescrib|reemplaz|sustituir?|sustituye|insertar?|inserta|eliminar?|elimina|suprimir?|suprime|a[ñn]adir?|a[ñn]ade|modificar?|modifica|convertir?|convierte|dividir?|divide|fusionar?|fusiona|acortar?|acorta|condensar?|condensa)\b/.test(low)) return true;
  return false;
}

// [Fix179] Comprueba si una cita aparece en el texto, tolerando puntos suspensivos:
// los revisores citan "inicio de la frase... final de la frase" omitiendo el centro.
// Un includes() directo falla; aqui partimos por la elipsis y exigimos que cada
// fragmento aparezca EN ORDEN (sin solaparse). Solo aplica si hay >=2 partes de
// longitud suficiente, para no relajar el matching de citas cortas.
function quotePresent(q: string, haystack: string): boolean {
  if (haystack.includes(q)) return true;
  const parts = q.split(/\s*(?:\u2026|\.{3,})\s*/).map(p => p.trim()).filter(p => p.length >= 15);
  if (parts.length >= 2) {
    let idx = 0;
    for (const p of parts) {
      const found = haystack.indexOf(p, idx);
      if (found === -1) return false;
      idx = found + p.length;
    }
    return true;
  }
  return false;
}

// Extrae fragmentos citados entre comillas («…», "…", “…”, '…') de longitud
// suficiente como para considerarse una cita de prosa (no una palabra suelta ni
// un nombre propio). Devuelve los fragmentos normalizados.
const MIN_QUOTE_LEN = 30;

export function extractLiteralQuotes(instruction: string): string[] {
  const text = instruction || "";
  const out: string[] = [];
  // Captura entre pares de comillas tipográficas o rectas y entre apóstrofes.
  const patterns = [
    /«([^»]{1,2000})»/g,
    /“([^”]{1,2000})”/g,
    /"([^"]{1,2000})"/g,
    /'([^']{30,2000})'/g, // apóstrofes solo si ya son largos (evita contracciones)
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const frag = (m[1] || "").trim();
      // [Fix179] Descarta el meta-comentario colado entre comillas: no es prosa
      // auditable, solo generaba falsos "fantasma".
      if (frag.length >= MIN_QUOTE_LEN && !isLikelyMetaFragment(frag)) {
        out.push(normalizeForMatch(frag));
      }
    }
  }
  return out;
}

export interface GroundingResult {
  // true = la instrucción se puede aplicar (o no se puede auditar por citas).
  grounded: boolean;
  // Citas largas encontradas en la instrucción.
  quotes: string[];
  // Citas que NO aparecen en el texto vigente del capítulo.
  missing: string[];
}

// Decide si una instrucción cita prosa que ya no existe en el capítulo.
// - Si no hay citas largas → grounded:true (no auditable por citas, dejamos pasar).
// - Si hay citas y AL MENOS UNA aparece en el texto → grounded:true.
// - Si hay citas y NINGUNA aparece → grounded:false (instrucción fantasma).
export function groundInstructionInChapter(instruction: string, chapterText: string): GroundingResult {
  const quotes = extractLiteralQuotes(instruction);
  if (quotes.length === 0) {
    return { grounded: true, quotes, missing: [] };
  }
  const haystack = normalizeForMatch(chapterText);
  // [Fix179] quotePresent tolera puntos suspensivos ("inicio... final").
  const missing = quotes.filter(q => !quotePresent(q, haystack));
  const anyPresent = missing.length < quotes.length;
  return { grounded: anyPresent, quotes, missing };
}

// [Fix131] Extrae el conjunto de capítulos que una reseña (Holístico/Beta/Revisor)
// SIGUE marcando como problemáticos a partir de su prosa. Los revisores escriben
// los defectos como "Cap N — [problema]" / "capítulo N", así que un capítulo que
// NO aparece aquí tiene sus defectos cerrados en esta iteración. Se usa para la
// reversión selectiva: al revertir por regresión, solo restauramos los capítulos
// que la reseña vigente todavía señala, conservando las correcciones válidas de
// los capítulos ya limpios. Prólogo = 0, epílogo = -1, nota del autor = -2.
export function extractFlaggedChapters(text: string): Set<number> {
  const set = new Set<number>();
  if (!text) return set;
  const re = /\bcap(?:[íi]tulo)?s?\.?\s*#?\s*(\d{1,4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 5000) set.add(n);
  }
  if (/\bpr[óo]logo\b/i.test(text)) set.add(0);
  if (/\bep[íi]logo\b/i.test(text)) set.add(-1);
  if (/\bnota\s+del\s+autor\b/i.test(text)) set.add(-2);
  return set;
}
