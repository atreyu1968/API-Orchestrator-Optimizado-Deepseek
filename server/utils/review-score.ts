// [Fix75] Helper neutro para parsear el bloque de puntuación /10 que emiten
// el Lector Beta y el Holístico. Vive aquí (no en uno de los dos agentes)
// para que ninguno tenga que importar del otro y se evite acoplamiento.
//
// Formato esperado en el texto del informe:
//   <!-- {KEY}_INICIO -->
//   ```json
//   { "puntuacion_global": 7, "justificacion": "..." }
//   ```
//   <!-- {KEY}_FIN -->
//
// Devuelve el entero 1..10 clampado, o null si no se encontró el bloque o
// el JSON no era válido. Nunca lanza.

import { repairJson } from "./json-repair";

// [Fix271] Parse tolerante de un bloque JSON entre marcadores: si JSON.parse
// falla (bloque cortado por techo de salida o con defectos menores), cae a
// repairJson() — que ya devuelve OBJETO parseado, nunca envolver en JSON.parse.
// Lanza si tampoco es reparable (los callers ya envuelven en try/catch).
function parseBlockJson(jsonText: string): any {
  try {
    return JSON.parse(jsonText);
  } catch {
    return repairJson(jsonText);
  }
}

export function extractScoreFromMarkers(text: string, key: string): number | null {
  try {
    const startMarker = `<!-- ${key}_INICIO -->`;
    const endMarker = `<!-- ${key}_FIN -->`;
    const s = text.indexOf(startMarker);
    if (s === -1) return null;
    const e = text.indexOf(endMarker, s + startMarker.length);
    if (e === -1 || e <= s) return null;
    const inner = text.slice(s + startMarker.length, e);
    const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = (fenced ? fenced[1] : inner).trim();
    if (!jsonText) return null;
    const parsed = parseBlockJson(jsonText);
    const raw = parsed?.puntuacion_global;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(Math.max(1, Math.min(10, n)));
  } catch {
    return null;
  }
}

// [Fix75] Cuenta cuántas entradas hay en el primer bloque
// INSTRUCCIONES_AUTOAPLICABLES del informe. Devuelve -1 si no se pudo
// parsear (señal de "no podemos enforce, dejar pasar"); 0 si el bloque
// existe pero el array está vacío; N si hay N entradas. Se usa para
// detectar Beta-reader devolviendo `{"instrucciones":[]}` y forzar un
// reintento con prompt reforzado.
export function countAutoInstructions(text: string): number {
  try {
    const startMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO -->";
    const endMarker = "<!-- INSTRUCCIONES_AUTOAPLICABLES_FIN -->";
    const s = text.indexOf(startMarker);
    if (s === -1) return -1;
    const e = text.indexOf(endMarker, s + startMarker.length);
    if (e === -1 || e <= s) return -1;
    const inner = text.slice(s + startMarker.length, e);
    const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonText = (fenced ? fenced[1] : inner).trim();
    if (!jsonText) return -1;
    const parsed = parseBlockJson(jsonText);
    const arr = parsed?.instrucciones;
    if (!Array.isArray(arr)) return -1;
    return arr.length;
  } catch {
    return -1;
  }
}

// [Fix76] Veredicto por cada acción administrativa pendiente (delete_chapter,
// merge_chapters, etc.) que el Holístico/Beta verifica tras leer el manuscrito
// completo. Vive aquí (utils) para que ambos agentes lo compartan sin
// acoplarse.
//
// Formato esperado en el texto del informe:
//   <!-- VEREDICTO_ADMIN_ACCIONES_INICIO -->
//   ```json
//   { "veredictos": [
//       { "id": 12, "veredicto": "apply",         "motivo": "..." },
//       { "id": 13, "veredicto": "keep_pending",  "motivo": "..." },
//       { "id": 14, "veredicto": "discard",       "motivo": "..." }
//   ] }
//   ```
//   <!-- VEREDICTO_ADMIN_ACCIONES_FIN -->
//
// Devuelve array vacío si no se encontró el bloque o el JSON era inválido.
// Nunca lanza. Filtra entradas con id no numérico o veredicto desconocido.
export type AdminActionVerdict = {
  id: number;
  verdict: "apply" | "keep_pending" | "discard";
  motivo: string;
};

export function extractAdminActionVerdicts(text: string): AdminActionVerdict[] {
  const startMarker = "<!-- VEREDICTO_ADMIN_ACCIONES_INICIO -->";
  const endMarker = "<!-- VEREDICTO_ADMIN_ACCIONES_FIN -->";
  const s = text.indexOf(startMarker);
  if (s === -1) return [];
  const e = text.indexOf(endMarker, s + startMarker.length);
  if (e === -1 || e <= s) return [];
  const inner = text.slice(s + startMarker.length, e);
  const fenced = inner.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = (fenced ? fenced[1] : inner).trim();
  if (!jsonText) return [];

  // [Fix76] Parser tolerante: si JSON.parse falla por defectos menores
  // (comas finales, comillas tipográficas, fences anidados), intentamos
  // saneados básicos antes de rendirnos a "no verdicts". Esto evita que un
  // pequeño defecto del modelo amplifique discrepancias y bloquee la
  // verificación desatendida.
  let parsed: any = null;
  const candidates: string[] = [
    jsonText,
    jsonText.replace(/,(\s*[}\]])/g, "$1"),
    jsonText.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/,(\s*[}\]])/g, "$1"),
  ];
  for (const c of candidates) {
    try { parsed = JSON.parse(c); break; } catch { /* try next */ }
  }
  // [Fix271] Último recurso: repairJson() (devuelve objeto parseado) para
  // bloques cortados por techo de salida o con defectos que los saneados
  // básicos no cubren.
  if (!parsed) {
    try { parsed = repairJson(jsonText); } catch { return []; }
  }
  if (!parsed) return [];

  const arr = parsed?.veredictos;
  if (!Array.isArray(arr)) return [];

  // [Fix76] Dedupe por id: si el modelo emite el mismo id dos veces (p.ej.
  // por copy-paste del prompt), nos quedamos con el ÚLTIMO veredicto. El
  // último suele reflejar la decisión final del modelo tras razonar.
  const byId = new Map<number, AdminActionVerdict>();
  for (const item of arr) {
    const idRaw = item?.id;
    const id = typeof idRaw === "number" ? idRaw : Number(idRaw);
    if (!Number.isFinite(id)) continue;
    const v = String(item?.veredicto || "").trim().toLowerCase();
    if (v !== "apply" && v !== "keep_pending" && v !== "discard") continue;
    const motivo = String(item?.motivo || "").trim().slice(0, 600);
    byId.set(id, { id, verdict: v as AdminActionVerdict["verdict"], motivo });
  }
  return Array.from(byId.values());
}
