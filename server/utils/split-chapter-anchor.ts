// [Fix215] Localizador del punto de corte para ejecutar acciones admin
// split_chapter automaticamente. La accion del traductor estructural incluye
// en su "reason" una cita literal del texto ancla (p.ej. "dividir justo antes
// del texto original 'La luz del atardecer...'"). Aqui extraemos esa cita y
// la localizamos en el capitulo con el mismo anclaje tolerante de 2 niveles
// del cirujano ([Fix212]): nivel 1 literal exacto; nivel 2 coincidencia
// NORMALIZADA (tildes/comillas/guiones/espacios) UNICA, con mapa de indices
// al texto real para cortar en la posicion correcta.

export interface AnchorResult {
  index: number;
  anchor: string;
  method: "literal" | "normalized";
}

export interface AnchorError {
  error: string;
}

// Extrae fragmentos entrecomillados del reason (comillas rectas y tipograficas).
export function extractAnchorCandidates(reason: string): string[] {
  const out: string[] = [];
  const patterns = [
    /'([^']{8,300})'/g,
    /"([^"]{8,300})"/g,
    /\u2018([^\u2019]{8,300})\u2019/g,
    /\u201c([^\u201d]{8,300})\u201d/g,
    /«([^»]{8,300})»/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(reason)) !== null) {
      // Quitar elipsis final (el reason suele truncar la cita con "...").
      const frag = m[1].replace(/(\.\.\.|\u2026)\s*$/, "").trim();
      if (frag.length >= 8) out.push(frag);
    }
  }
  // Mas larga primero: mas especifica, menos riesgo de ambiguedad.
  return out.sort((a, b) => b.length - a.length);
}

// Normaliza un caracter segun la convencion [Fix212].
function normChar(ch: string): string {
  let c = ch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/[«»\u201c\u201d\u201e\u201f"]/.test(c)) return '"';
  if (/[\u2018\u2019\u201a\u201b]/.test(c)) return "'";
  if (/[\u2013\u2014\u2015\u2012]/.test(c)) return "-";
  if (c === "\u2026") return "...";
  return c;
}

// Normaliza el texto manteniendo un mapa de indices al texto original.
function buildNormalizedWithMap(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = normChar(s[i]);
    if (/^\s$/.test(c)) {
      if (prevSpace) continue;
      c = " ";
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    for (const ch of c) {
      norm += ch;
      map.push(i);
    }
  }
  return { norm, map };
}

function normalizeAnchor(s: string): string {
  let out = "";
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = normChar(s[i]);
    if (/^\s$/.test(c)) {
      if (prevSpace) continue;
      c = " ";
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    out += c;
  }
  return out.trim();
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    if (count > 1) break;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return count;
}

// Busca el punto de corte: prueba cada candidato (mas largo primero) en dos
// niveles. Exige coincidencia UNICA en ambos niveles (0 o >1 -> siguiente
// candidato). Devuelve el indice REAL en `content` donde empieza el ancla.
export function findSplitAnchor(content: string, reason: string): AnchorResult | AnchorError {
  const candidates = extractAnchorCandidates(reason || "");
  if (candidates.length === 0) {
    return { error: "La accion no incluye ninguna cita del texto ancla entre comillas en su descripcion; no se puede localizar el punto de corte automaticamente." };
  }
  for (const anchor of candidates) {
    // Nivel 1: literal exacto.
    if (countOccurrences(content, anchor) === 1) {
      return { index: content.indexOf(anchor), anchor, method: "literal" };
    }
    // Nivel 2: normalizado unico con mapa de indices.
    const { norm, map } = buildNormalizedWithMap(content);
    const normAnchor = normalizeAnchor(anchor);
    if (normAnchor.length >= 8 && countOccurrences(norm, normAnchor) === 1) {
      const normIdx = norm.indexOf(normAnchor);
      return { index: map[normIdx], anchor, method: "normalized" };
    }
  }
  return { error: `No se encontro una coincidencia UNICA del texto ancla en el capitulo (candidatos probados: ${candidates.length}). Divide el capitulo manualmente y descarta la tarjeta.` };
}
