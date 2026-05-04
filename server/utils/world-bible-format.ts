/**
 * [Fix15] Utilidades compartidas para presentar el World Bible a los agentes
 * que escriben prosa nueva o sugieren reescrituras (Cirujano de Texto,
 * Reestructurador, ChapterExpander, SeriesThreadFixer) y a los revisores
 * cuya aprobación dispara reescrituras (Editor, FinalReviewer, ContinuitySentinel).
 *
 * Antes cada agente truncaba el JSON.stringify del WB a N caracteres o
 * `slice(0, N)` los personajes, perdiendo nombres canónicos en proyectos con
 * elenco grande y permitiendo que el modelo inventara variantes.
 *
 * Estas helpers garantizan que TODOS los nombres aparezcan en el prompt antes
 * de truncar nada secundario.
 */

function safeArr<T>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

interface CharacterTraits {
  ojos?: string;
  cabello?: string;
  altura?: string;
  estatura?: string;
  edad?: string;
  edad_aparente?: string;
  rasgos_distintivos?: string[];
  rasgosDistintivos?: string[];
}

function formatCharacterAppearance(ap: CharacterTraits | undefined): string {
  if (!ap || typeof ap !== "object") return "";
  const t: string[] = [];
  if (ap.ojos) t.push(`ojos ${ap.ojos}`);
  if (ap.cabello) t.push(`cabello ${ap.cabello}`);
  if (ap.altura || ap.estatura) t.push(`altura ${ap.altura || ap.estatura}`);
  if (ap.edad || ap.edad_aparente) t.push(`edad ${ap.edad || ap.edad_aparente}`);
  const rd = safeArr<string>(ap.rasgos_distintivos || ap.rasgosDistintivos);
  if (rd.length) t.push(`rasgos: ${rd.join(", ")}`);
  return t.join(" | ");
}

/**
 * Bloque compacto de NOMBRES CANÓNICOS para inyectar al inicio del prompt
 * de cualquier agente. Lista TODOS los personajes (sin truncar) con alias y
 * apariencia inmutable. Si no hay personajes, devuelve "".
 */
export function buildCanonNamesBlock(worldBible: any): string {
  if (!worldBible || typeof worldBible !== "object") return "";
  const personajes = safeArr<any>(worldBible.personajes || worldBible.characters);
  if (personajes.length === 0) return "";

  const lines: string[] = [
    "═══════════════════════════════════════════════════════════════════",
    `🔒 NOMBRES CANÓNICOS DE PERSONAJES (${personajes.length}) — CANON INVIOLABLE`,
    "═══════════════════════════════════════════════════════════════════",
    "Estos son los nombres, alias y rasgos físicos OFICIALES. Cualquier prosa",
    "nueva, parche o sugerencia DEBE usar EXACTAMENTE estos nombres. NO inventes",
    "variantes, diminutivos no listados, rasgos físicos distintos ni edades",
    "incompatibles. Reporta o evita cualquier desviación.",
    "",
  ];
  for (const c of personajes) {
    if (!c) continue;
    const nombre = c.nombre || c.name || "?";
    const rol = c.rol || c.role || "";
    const aliases = safeArr<string>(c.alias || c.nombre_alias || c.aliases);
    const traits = formatCharacterAppearance(c.apariencia_inmutable || c.aparienciaInmutable);
    const mod = safeArr<string>(c.modismos_habla || c.modismos);
    let line =
      `  ▸ ${nombre}` +
      (rol ? ` (${rol})` : "") +
      (aliases.length ? ` [alias: ${aliases.join(", ")}]` : "");
    if (traits) line += ` — ${traits}`;
    if (mod.length) line += ` 🗣️ modismos: ${mod.join(", ")}`;
    lines.push(line);
  }
  lines.push("═══════════════════════════════════════════════════════════════════");
  return lines.join("\n");
}
