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
    const parsed = JSON.parse(jsonText);
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
    const parsed = JSON.parse(jsonText);
    const arr = parsed?.instrucciones;
    if (!Array.isArray(arr)) return -1;
    return arr.length;
  } catch {
    return -1;
  }
}
