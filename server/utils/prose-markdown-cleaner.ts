// [Fix198] Limpieza determinista de Markdown residual en la prosa.
// El exportador (epub/docx) NO interpreta **negrita** / __subrayado__ / *cursiva*
// como formato: salen LITERALES en el ebook. Este limpiador quita los pares de
// marcadores de forma conservadora e idempotente, SIN tocar:
//   - lineas-separador de escena ("***", "* * *", "---", etc.)
//   - cabeceras markdown ("# ...", "## ...")
// Solo se eliminan pares COMPLETOS dentro de una misma linea; un asterisco
// suelto o desparejado se deja tal cual.

function isSeparatorOrHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  // Separadores de escena: solo asteriscos/guiones/guiones-bajos y espacios.
  if (/^[\*\-_\s]+$/.test(t)) return true;
  return false;
}

function cleanLine(line: string): string {
  let out = line;
  // Pares **x** y __x__ (no-greedy, sin cruzar el marcador dentro).
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "$1");
  out = out.replace(/__([^_\n]+?)__/g, "$1");
  // Pares *x* en la misma linea (tras quitar los dobles). Exigimos que el
  // contenido no empiece/termine en espacio para no comerse multiplicaciones
  // ni asteriscos decorativos sueltos.
  out = out.replace(/\*([^*\n]+?)\*/g, (m, inner: string) => {
    if (!inner || /^\s|\s$/.test(inner)) return m;
    return inner;
  });
  return out;
}

/** Limpia marcadores Markdown de enfasis en la prosa. Idempotente. */
export function cleanProseMarkdown(content: string): string {
  if (!content) return content;
  if (!/[\*_]/.test(content)) return content;
  const lines = content.split("\n");
  let changed = false;
  const out = lines.map((line) => {
    if (isSeparatorOrHeaderLine(line)) return line;
    const cleaned = cleanLine(line);
    if (cleaned !== line) changed = true;
    return cleaned;
  });
  return changed ? out.join("\n") : content;
}

/** true si el contenido tiene marcadores de enfasis limpiables. */
export function hasProseMarkdown(content: string): boolean {
  return cleanProseMarkdown(content) !== content;
}
