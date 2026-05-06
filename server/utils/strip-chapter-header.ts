// Defensa contra "Narrator Header Leakage": el Ghostwriter, a veces, repite la
// cabecera del capítulo dentro de la prosa ("Capítulo 2: El Contrato de Esencia"
// como primera línea del cuerpo). Como el formateador de ebook prepende su
// propio "## Capítulo N: Título", el resultado final muestra el título dos
// veces. Esta utilidad sanea la apertura del texto eliminando líneas iniciales
// que sean claramente cabeceras meta (con o sin `#`, con o sin separador, con
// o sin guion largo / negrita markdown), parando en cuanto encuentra prosa real.
//
// Diseño:
//   - Opera línea a línea desde el inicio.
//   - Una línea es "cabecera meta" SOLO si la línea ENTERA coincide con el
//     patrón (anchored ^...$). Esto evita falsos positivos como "Capítulo
//     cerrado, no hay vuelta atrás" (prosa) o "El capítulo segundo de su vida".
//   - Patrón (a) — Capítulo / Cap. / Chapter requiere número arábigo o romano
//     OBLIGATORIO. Separador (`:` `.` `-` `—`) y resto del título OPCIONAL,
//     así atrapa también "Capítulo 22" desnudo.
//   - Patrón (b) — Prólogo / Epílogo / Nota del autor / Author's Note / Parte
//     no requiere número (Parte sí lo requiere para no matar prosa "parte de").
//   - Acepta prefijos: whitespace, `#` markdown, guion largo/bullet, asteriscos.
//   - Repite mientras la siguiente línea siga siendo cabecera (a veces aparecen
//     2 cabeceras seguidas, p. ej. la del exportador + la del Ghostwriter).

const META_HEADER_LINE = new RegExp(
  "^[\\s\\u00A0]*" +                              // leading whitespace
    "(?:#{1,6}\\s*)?" +                           // optional markdown heading hashes
    "[—\\-•*]?[\\s\\u00A0]*" +                    // optional bullet/dash
    "\\*{0,2}[\\s\\u00A0]*" +                     // optional bold opener
    "(?:" +
      // (a) Capítulo / Cap. / Chapter + número (obligatorio) + opcional separador y título
      "(?:Cap[íi]tulo|Cap\\.|Chapter)\\s+(?:\\d+|[IVXLCDM]+)\\b(?:\\s*[:.\\-—][^\\n]*)?" +
    "|" +
      // (b) Prólogo / Epílogo / Nota del autor / Author's Note / Parte
      "(?:Pr[óo]logo|Prologue|Ep[íi]logo|Epilogue|Nota\\s+(?:del?|de)\\s+autor|Author'?s?\\s+Note" +
        "|Parte\\s+(?:\\d+|[IVXLCDM]+|primera|segunda|tercera|cuarta|quinta|sexta|s[ée]ptima|octava|novena|d[ée]cima|[uú]ltima)" +
      ")(?:\\s*[:.\\-—][^\\n]*)?" +
    ")" +
    "[\\s\\u00A0]*\\*{0,2}[\\s\\u00A0]*$",        // optional trailing bold + whitespace
  "i"
);

/**
 * Elimina líneas iniciales que sean cabeceras meta del capítulo. Conserva la
 * prosa intacta. Es idempotente y seguro de aplicar varias veces (en el
 * Ghostwriter al guardar, y en el exportador al formatear).
 */
export function stripMetaChapterHeader(text: string): string {
  if (!text) return text;
  const lines = text.split("\n");
  let i = 0;
  let stripped = false;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (META_HEADER_LINE.test(line)) {
      lines[i] = "";
      stripped = true;
      i++;
      continue;
    }
    break;
  }
  if (!stripped) return text;
  return lines.join("\n").replace(/^[\s\u00A0\n]+/, "");
}
