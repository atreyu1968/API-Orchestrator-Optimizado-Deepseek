// [Fix17] Sanitización HTML para descripciones KDP.
// Quita tags no permitidos Y todos los atributos (incluidos event handlers como onclick/onmouseover).

const ALLOWED_TAGS = new Set(["b","i","u","em","strong","br","p","h4","h5","h6","ul","ol","li","hr"]);
const FORBIDDEN_PHRASES: RegExp[] = [
  /buy\s+now/gi, /click\s+here/gi, /scroll\s+up/gi,
  /compra\s+ahora/gi, /haz\s+clic/gi, /añadir\s+al\s+carrito/gi, /desplaza\s+hacia\s+arriba/gi,
  /best\s*seller/gi, /bestseller/gi, /número\s+1/gi, /#1/g, /★+/g, /⭐+/g,
  /\bgratis\b/gi, /\bfree\b/gi, /oferta\s+limitada/gi, /por\s+tiempo\s+limitado/gi,
  /apple\s+books/gi, /\bkobo\b/gi, /barnes\s*&\s*noble/gi, /\bkindle\b/gi, /\bipad\b/gi, /\baudible\b/gi,
];

export function sanitizeKdpHtml(html: string): string {
  if (!html) return "";
  // Eliminar bloques peligrosos completos
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // Procesar tags: dejar solo nombre limpio si está permitido, sin atributos.
  out = out.replace(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (mt, tag) => {
    const t = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    const closing = mt.startsWith("</");
    const selfClosing = /\/\s*>$/.test(mt) || t === "br" || t === "hr";
    return closing ? `</${t}>` : (selfClosing ? `<${t}/>` : `<${t}>`);
  });
  return out;
}

export function sanitizeKdpDescription(html: string): string {
  let out = sanitizeKdpHtml(html);
  for (const re of FORBIDDEN_PHRASES) out = out.replace(re, "");
  out = out.replace(/[ \t]{2,}/g, " ").trim();
  if (out.length > 4000) out = out.slice(0, 4000);
  return out;
}
