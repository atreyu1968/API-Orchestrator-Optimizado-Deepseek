import JSZip from "jszip";
import type { Project, Chapter, Pseudonym, Publisher, ProjectBackMatter, BookCatalogEntry } from "@shared/schema";
import { stripMetaChapterHeader } from "../utils/strip-chapter-header";

export interface EpubGenericChapter {
  chapterNumber: number;
  title?: string | null;
  content: string;
}

export type EpubStyleId = "classic" | "modern" | "romance" | "minimal";

export const EPUB_STYLE_OPTIONS: { id: EpubStyleId; label: string; description: string }[] = [
  { id: "classic",  label: "Clásico",      description: "Serif tradicional (Georgia), capitulares, portada con título grande." },
  { id: "modern",   label: "Moderno",      description: "Sans-serif (Helvetica), sin capitulares, título en mayúsculas." },
  { id: "romance",  label: "Romance",      description: "Garamond elegante, título en cursiva, adornos florales entre escenas." },
  { id: "minimal",  label: "Minimalista",  description: "Limpio y compacto, espaciado reducido, sin capitulares ni adornos." },
];

export interface EpubGenericData {
  title: string;
  authorName?: string;
  language?: string;
  genre?: string;
  publisher?: Publisher | null;
  authorWebsiteUrl?: string | null;
  authorBio?: string | null;
  chapters: EpubGenericChapter[];
  backMatter?: ProjectBackMatter | null;
  backMatterBooks?: BookCatalogEntry[];
  styleId?: EpubStyleId;
}

export interface EpubProjectData {
  project: Project;
  chapters: Chapter[];
  pseudonym?: Pseudonym | null;
  prologue?: Chapter | null;
  epilogue?: Chapter | null;
  authorNote?: Chapter | null;
  publisher?: Publisher | null;
  backMatter?: ProjectBackMatter | null;
  backMatterBooks?: BookCatalogEntry[];
  styleId?: EpubStyleId;
}

interface EpubLabels {
  prologue: string; epilogue: string; authorNote: string; chapter: string;
  titlePage: string; copyright: string; toc: string;
  reviewTitle: string; reviewBody: (a: string) => string;
  aboutAuthorTitle: string; aboutAuthorWebCta: string;
  alsoByTitle: (a: string) => string;
  copyrightDefault: (a: string, year: number) => string;
  copyrightFiction: string;
  copyrightReproduction: string;
  publishedBy: (n: string) => string;
}

const LANG_LABELS: Record<string, EpubLabels> = {
  es: {
    prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota del Autor", chapter: "Capítulo",
    titlePage: "Portada", copyright: "Copyright", toc: "Índice",
    reviewTitle: "Una nota del autor",
    reviewBody: (a) => `Si has llegado hasta aquí, gracias por leer esta historia. Si te ha gustado, una reseña honesta en Amazon ayuda enormemente a que otros lectores la descubran. No es necesario que sea larga: una o dos frases con tu opinión sincera son más que suficientes.\n\n— ${a}`,
    aboutAuthorTitle: "Sobre el autor",
    aboutAuthorWebCta: "Conoce el resto de mis obras en mi web:",
    alsoByTitle: (a) => `También de ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Todos los derechos reservados.`,
    copyrightFiction: "Esta obra es ficción. Cualquier parecido con personas reales, vivas o fallecidas, o con hechos reales es pura coincidencia.",
    copyrightReproduction: "Ninguna parte de esta publicación puede ser reproducida, almacenada o transmitida en cualquier forma o por cualquier medio sin la autorización previa por escrito del titular de los derechos.",
    publishedBy: (n) => `Publicado por ${n}`,
  },
  en: {
    prologue: "Prologue", epilogue: "Epilogue", authorNote: "Author's Note", chapter: "Chapter",
    titlePage: "Title Page", copyright: "Copyright", toc: "Contents",
    reviewTitle: "A note from the author",
    reviewBody: (a) => `If you've made it this far, thank you for reading this story. If you enjoyed it, an honest review on Amazon helps enormously to let other readers discover it. It doesn't need to be long — one or two sentences with your sincere opinion are more than enough.\n\n— ${a}`,
    aboutAuthorTitle: "About the author",
    aboutAuthorWebCta: "Discover the rest of my work on my website:",
    alsoByTitle: (a) => `Also by ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. All rights reserved.`,
    copyrightFiction: "This is a work of fiction. Any resemblance to real persons, living or dead, or actual events is purely coincidental.",
    copyrightReproduction: "No part of this publication may be reproduced, stored or transmitted in any form or by any means without the prior written permission of the rights holder.",
    publishedBy: (n) => `Published by ${n}`,
  },
  fr: {
    prologue: "Prologue", epilogue: "Épilogue", authorNote: "Note de l'Auteur", chapter: "Chapitre",
    titlePage: "Page de titre", copyright: "Copyright", toc: "Sommaire",
    reviewTitle: "Un mot de l'auteur",
    reviewBody: (a) => `Si vous êtes arrivé jusqu'ici, merci d'avoir lu cette histoire. Si elle vous a plu, un avis honnête sur Amazon aide énormément à la faire découvrir. Il n'a pas besoin d'être long : une ou deux phrases avec votre opinion sincère suffisent largement.\n\n— ${a}`,
    aboutAuthorTitle: "À propos de l'auteur",
    aboutAuthorWebCta: "Découvrez le reste de mes œuvres sur mon site :",
    alsoByTitle: (a) => `Du même auteur, ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Tous droits réservés.`,
    copyrightFiction: "Cette œuvre est une fiction. Toute ressemblance avec des personnes réelles, vivantes ou décédées, ou avec des faits réels est purement fortuite.",
    copyrightReproduction: "Aucune partie de cette publication ne peut être reproduite, stockée ou transmise sous quelque forme ou par quelque moyen que ce soit sans l'autorisation écrite préalable du titulaire des droits.",
    publishedBy: (n) => `Publié par ${n}`,
  },
  de: {
    prologue: "Prolog", epilogue: "Epilog", authorNote: "Anmerkung des Autors", chapter: "Kapitel",
    titlePage: "Titelseite", copyright: "Copyright", toc: "Inhalt",
    reviewTitle: "Eine Notiz vom Autor",
    reviewBody: (a) => `Wenn Sie es bis hierher geschafft haben, danke, dass Sie diese Geschichte gelesen haben. Wenn sie Ihnen gefallen hat, hilft eine ehrliche Rezension auf Amazon enorm dabei, dass andere Leser sie entdecken. Sie muss nicht lang sein — ein oder zwei Sätze mit Ihrer ehrlichen Meinung reichen völlig aus.\n\n— ${a}`,
    aboutAuthorTitle: "Über den Autor",
    aboutAuthorWebCta: "Entdecken Sie meine weiteren Werke auf meiner Website:",
    alsoByTitle: (a) => `Weitere Werke von ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Alle Rechte vorbehalten.`,
    copyrightFiction: "Dieses Werk ist eine Fiktion. Jede Ähnlichkeit mit realen Personen, lebend oder verstorben, oder mit tatsächlichen Ereignissen ist rein zufällig.",
    copyrightReproduction: "Kein Teil dieser Veröffentlichung darf ohne vorherige schriftliche Genehmigung des Rechteinhabers in irgendeiner Form oder durch irgendwelche Mittel reproduziert, gespeichert oder übertragen werden.",
    publishedBy: (n) => `Veröffentlicht von ${n}`,
  },
  it: {
    prologue: "Prologo", epilogue: "Epilogo", authorNote: "Nota dell'Autore", chapter: "Capitolo",
    titlePage: "Frontespizio", copyright: "Copyright", toc: "Indice",
    reviewTitle: "Una nota dell'autore",
    reviewBody: (a) => `Se sei arrivato fin qui, grazie per aver letto questa storia. Se ti è piaciuta, una recensione onesta su Amazon aiuta enormemente altri lettori a scoprirla. Non deve essere lunga: una o due frasi con la tua opinione sincera sono più che sufficienti.\n\n— ${a}`,
    aboutAuthorTitle: "Sull'autore",
    aboutAuthorWebCta: "Scopri il resto delle mie opere sul mio sito:",
    alsoByTitle: (a) => `Dello stesso autore, ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Tutti i diritti riservati.`,
    copyrightFiction: "Questa opera è frutto della fantasia. Ogni riferimento a persone realmente esistenti, vive o defunte, o a fatti realmente accaduti è puramente casuale.",
    copyrightReproduction: "Nessuna parte di questa pubblicazione può essere riprodotta, memorizzata o trasmessa in alcuna forma o con alcun mezzo senza la previa autorizzazione scritta del titolare dei diritti.",
    publishedBy: (n) => `Pubblicato da ${n}`,
  },
  pt: {
    prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota do Autor", chapter: "Capítulo",
    titlePage: "Folha de rosto", copyright: "Copyright", toc: "Sumário",
    reviewTitle: "Uma nota do autor",
    reviewBody: (a) => `Se chegou até aqui, obrigado por ler esta história. Se gostou, uma resenha honesta na Amazon ajuda enormemente outros leitores a descobri-la. Não precisa ser longa: uma ou duas frases com a sua opinião sincera são mais que suficientes.\n\n— ${a}`,
    aboutAuthorTitle: "Sobre o autor",
    aboutAuthorWebCta: "Descubra o resto da minha obra no meu site:",
    alsoByTitle: (a) => `Também de ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Todos os direitos reservados.`,
    copyrightFiction: "Esta obra é uma ficção. Qualquer semelhança com pessoas reais, vivas ou falecidas, ou com factos reais é pura coincidência.",
    copyrightReproduction: "Nenhuma parte desta publicação pode ser reproduzida, armazenada ou transmitida de qualquer forma ou por qualquer meio sem a autorização prévia por escrito do titular dos direitos.",
    publishedBy: (n) => `Publicado por ${n}`,
  },
  ca: {
    prologue: "Pròleg", epilogue: "Epíleg", authorNote: "Nota de l'Autor", chapter: "Capítol",
    titlePage: "Portada", copyright: "Copyright", toc: "Índex",
    reviewTitle: "Una nota de l'autor",
    reviewBody: (a) => `Si has arribat fins aquí, gràcies per llegir aquesta història. Si t'ha agradat, una ressenya honesta a Amazon ajuda enormement que altres lectors la descobreixin. No cal que sigui llarga: una o dues frases amb la teva opinió sincera són més que suficients.\n\n— ${a}`,
    aboutAuthorTitle: "Sobre l'autor",
    aboutAuthorWebCta: "Descobreix la resta de les meves obres al meu lloc web:",
    alsoByTitle: (a) => `També de ${a}`,
    copyrightDefault: (a, y) => `© ${y} ${a}. Tots els drets reservats.`,
    copyrightFiction: "Aquesta obra és ficció. Qualsevol semblança amb persones reals, vives o mortes, o amb fets reals és pura coincidència.",
    copyrightReproduction: "Cap part d'aquesta publicació pot ser reproduïda, emmagatzemada o transmesa de cap forma ni per cap mitjà sense l'autorització prèvia per escrit del titular dels drets.",
    publishedBy: (n) => `Publicat per ${n}`,
  },
};

function getLabels(lang: string | undefined) {
  return LANG_LABELS[lang || "es"] || LANG_LABELS.es;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "id";
}

function uuidv4Fallback(): string {
  // Deterministic-enough random uuid, no crypto needed.
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const arr = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  const h = arr.map(hex).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface ParsedDataUrl {
  mediaType: string;
  ext: string;
  buffer: Buffer;
}

function parseDataUrl(dataUrl: string | null | undefined): ParsedDataUrl | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mediaType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  const ext = extMap[mediaType] || "png";
  return { mediaType, ext, buffer };
}

function paragraphsToHtml(rawContent: string, opts: { dropCap?: boolean } = {}): string {
  let cleaned = rawContent || "";
  const continuityMarker = "---CONTINUITY_STATE---";
  const idx = cleaned.indexOf(continuityMarker);
  if (idx !== -1) cleaned = cleaned.substring(0, idx).trim();
  cleaned = stripMetaChapterHeader(cleaned);

  const paragraphs = cleaned.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0 && !p.startsWith("# "));
  if (paragraphs.length === 0) return "";

  const out: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = escapeHtml(paragraphs[i]);
    if (i === 0 && opts.dropCap) {
      // [Fix59] Si el primer párrafo abre con un guion de diálogo (— – -) o
      // con una raya/guion largo, NO aplicar drop-cap: el guion quedaría
      // flotando antes del drop-cap y se vería roto. En su lugar, marcar el
      // párrafo como `first-para` para suprimir el sangrado pero conservar
      // tipografía normal (estándar editorial: capítulos que abren con
      // diálogo no llevan capitular).
      const trimmed = p.trimStart();
      const opensWithDialogue = /^[—–-]/.test(trimmed);
      if (!opensWithDialogue) {
        const m = p.match(/^([\s"«¡¿]*)(\S)(.*)$/s);
        if (m) {
          out.push(`<p class="first-para">${m[1]}<span class="drop-cap">${m[2]}</span>${m[3]}</p>`);
          continue;
        }
      } else {
        out.push(`<p class="first-para">${p}</p>`);
        continue;
      }
    }
    out.push(`<p>${p}</p>`);
  }
  return out.join("\n");
}

function buildContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function buildStylesCss(styleId: EpubStyleId = "classic"): string {
  // Common rules shared across all themes
  const common = `@charset "UTF-8";
@namespace epub "http://www.idpf.org/2007/ops";

body { line-height: 1.5; margin: 0 1em; color: #111; }
h1, h2, h3 { font-weight: bold; text-align: center; page-break-after: avoid; break-after: avoid-page; }
/* [Fix59] Cada capítulo arranca en página nueva (estándar editorial). */
.chapter-body h1 { page-break-before: always; break-before: page; }
/* [Fix59] El número del capítulo va encima del título en línea separada y a menor tamaño. */
/* [Fix59] color #222 (no #555) para que se lea bien en e-ink Kindle (Paperwhite/Oasis); el tracking amplio mantiene el aire visual del rótulo. */
.chapter-body h1 .chapter-num { display: block; font-size: 0.65em; font-weight: normal; letter-spacing: 0.22em; text-transform: uppercase; color: #222; margin-bottom: 0.7em; }
.chapter-body h1 .chapter-name { display: block; }
p.first-para, p.no-indent, .center p { text-indent: 0; }
.center { text-align: center; }
.title-page { text-align: center; padding-top: 22%; }
.title-page .publisher-logo { margin-top: 3em; text-align: center; }
.title-page .publisher-logo img { max-width: 120px; max-height: 120px; width: auto; height: auto; display: inline-block; }
.copyright { font-size: 0.9em; line-height: 1.6; padding: 2em 0; }
.copyright p { text-indent: 0; text-align: left; margin-bottom: 0.6em; }
nav#toc ol { list-style-type: none; padding: 0; }
nav#toc li { margin: 0.4em 0; }
nav#toc a { text-decoration: none; color: #222; }
.review-page p, .author-page p { text-indent: 0; margin-bottom: 0.8em; }
.also-by ul { list-style-type: none; padding: 0; text-align: center; }
.also-by li { margin: 0.5em 0; font-style: italic; }
hr.section-break { border: none; text-align: center; margin: 1.2em 0; }
`;

  const themes: Record<EpubStyleId, string> = {
    classic: `body { font-family: Georgia, "Times New Roman", serif; }
h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; }
/* [Fix59] margin-top más pequeño porque el page-break-before crea ya el aire
 * superior; margin-bottom más generoso para separar bien del primer párrafo. */
h1 { font-size: 1.6em; margin: 4em 0 2.5em 0; }
h2 { font-size: 1.3em; margin: 1.5em 0 0.8em 0; }
p { text-indent: 1.5em; margin: 0 0 0.4em 0; text-align: justify; }
.title-page h1.book-title { font-size: 2.2em; margin-bottom: 0.2em; }
.title-page h2.author { font-size: 1.2em; font-weight: normal; font-style: italic; margin-top: 1em; }
.drop-cap { float: left; font-size: 4.2em; line-height: 0.85; padding-right: 0.08em; padding-top: 0.05em; font-weight: bold; }
hr.section-break:before { content: "\\2756 \\00A0 \\2756 \\00A0 \\2756"; color: #555; }
`,
    modern: `body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
h1, h2, h3 { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: 0.04em; }
h1 { font-size: 1.5em; margin: 4em 0 2.8em 0; text-transform: uppercase; }
h2 { font-size: 1.2em; margin: 1.5em 0 0.8em 0; }
p { text-indent: 0; margin: 0 0 0.9em 0; text-align: left; }
.title-page h1.book-title { font-size: 2em; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4em; font-weight: 700; }
.title-page h2.author { font-size: 1em; font-weight: 400; font-style: normal; margin-top: 1.2em; text-transform: uppercase; letter-spacing: 0.15em; color: #444; }
.drop-cap { float: none; font-size: 1em; font-weight: bold; padding: 0; }
hr.section-break:before { content: "\\2014 \\00A0 \\2014 \\00A0 \\2014"; color: #888; letter-spacing: 0.3em; }
`,
    romance: `body { font-family: "EB Garamond", Garamond, "Hoefler Text", "Times New Roman", serif; }
h1, h2, h3 { font-family: "EB Garamond", Garamond, "Hoefler Text", "Times New Roman", serif; font-weight: normal; }
h1 { font-size: 1.7em; margin: 4em 0 2.5em 0; font-style: italic; }
h2 { font-size: 1.3em; margin: 1.5em 0 0.8em 0; font-style: italic; }
p { text-indent: 1.6em; margin: 0 0 0.4em 0; text-align: justify; }
.title-page h1.book-title { font-size: 2.4em; font-style: italic; font-weight: normal; margin-bottom: 0.3em; }
.title-page h2.author { font-size: 1.15em; font-weight: normal; font-style: normal; margin-top: 1.4em; letter-spacing: 0.1em; text-transform: uppercase; color: #5a3a3a; }
.drop-cap { float: left; font-size: 4.6em; line-height: 0.85; padding-right: 0.1em; padding-top: 0.05em; font-weight: normal; font-style: italic; color: #5a3a3a; }
hr.section-break:before { content: "\\273F \\00A0 \\273F \\00A0 \\273F"; color: #a06868; }
`,
    minimal: `body { font-family: "Iowan Old Style", "Palatino", "Palatino Linotype", Georgia, serif; }
h1, h2, h3 { font-family: "Iowan Old Style", "Palatino", "Palatino Linotype", Georgia, serif; font-weight: normal; }
h1 { font-size: 1.3em; margin: 3em 0 2em 0; }
h2 { font-size: 1.1em; margin: 1.2em 0 0.6em 0; }
p { text-indent: 1.2em; margin: 0 0 0.25em 0; text-align: justify; }
.title-page h1.book-title { font-size: 1.7em; font-weight: normal; margin-bottom: 0.4em; }
.title-page h2.author { font-size: 1em; font-weight: normal; font-style: normal; margin-top: 1em; color: #555; }
.drop-cap { float: none; font-size: 1em; font-weight: normal; padding: 0; }
hr.section-break:before { content: "\\2022 \\00A0 \\2022 \\00A0 \\2022"; color: #999; }
`,
  };

  return common + themes[styleId];
}

function xhtmlPage(title: string, lang: string, bodyClass: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}" lang="${escapeXml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../css/styles.css"/>
</head>
<body class="${escapeXml(bodyClass)}">
${bodyHtml}
</body>
</html>`;
}

interface BuiltSection {
  filename: string;     // path inside OEBPS, e.g. "xhtml/ch-1.xhtml"
  id: string;           // OPF item id, e.g. "ch-1"
  title: string;        // for nav
  includeInToc: boolean;
}

export async function generateGenericManuscriptEpub(data: EpubGenericData): Promise<Buffer> {
  const lang = data.language || "es";
  const labels = getLabels(lang);
  const authorName = data.authorName || "Anónimo";
  const publisher = data.publisher || null;
  const publisherLogo = parseDataUrl(publisher?.logoDataUrl);
  const bookUuid = uuidv4Fallback();

  const styleId: EpubStyleId = data.styleId || "classic";
  const useDropCap = styleId === "classic" || styleId === "romance";

  const zip = new JSZip();
  // mimetype must be FIRST and STORED (uncompressed) per EPUB spec.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", buildContainerXml());
  zip.file("OEBPS/css/styles.css", buildStylesCss(styleId));

  if (publisherLogo) {
    zip.file(`OEBPS/image/publisher-logo.${publisherLogo.ext}`, publisherLogo.buffer);
  }

  const sections: BuiltSection[] = [];

  // 1. Copyright page (la portada y title page las gestiona KDP — empezamos
  // directamente por el copyright). El logo de la editorial, si existe,
  // se muestra pequeño centrado al inicio de esta página.
  const year = new Date().getFullYear();
  // [Fix56] El copyright SIEMPRE debe corresponder al autor del libro (su
  // pseudónimo), no al titular de la cuenta. La línea configurada en la
  // editorial (`publisher.copyrightLine`) se trata así:
  //   - Si contiene los placeholders `{author}` o `{year}`, se interpolan y
  //     reemplaza al copyright por defecto.
  //   - Si NO contiene `{author}`, se usa SOLO como pie editorial adicional
  //     (línea extra debajo) y el copyright principal se genera con el
  //     pseudónimo y el año en curso, evitando que el nombre real del titular
  //     filtre cuando el usuario haya guardado "© [su nombre]" en la editorial.
  const rawPublisherCopyright = publisher?.copyrightLine?.trim() || "";
  const hasAuthorPlaceholder = /\{author\}/i.test(rawPublisherCopyright);
  const hasYearPlaceholder = /\{year\}/i.test(rawPublisherCopyright);
  const interpolate = (s: string) => s
    .replace(/\{author\}/gi, authorName)
    .replace(/\{year\}/gi, String(year));
  const copyrightLine = hasAuthorPlaceholder
    ? interpolate(rawPublisherCopyright)
    : labels.copyrightDefault(authorName, year);
  const extraPublisherCopyrightLine = (rawPublisherCopyright && !hasAuthorPlaceholder)
    ? `<p>${escapeHtml(hasYearPlaceholder ? interpolate(rawPublisherCopyright) : rawPublisherCopyright)}</p>`
    : "";
  const publisherLine = publisher
    ? `<p>${escapeHtml(labels.publishedBy(publisher.name))}${publisher.websiteUrl ? ` &mdash; <a href="${escapeXml(publisher.websiteUrl)}">${escapeHtml(publisher.websiteUrl)}</a>` : ""}</p>`
    : "";
  const logoBlock = publisherLogo
    ? `<div class="publisher-logo" style="margin: 0 auto 1.5em auto; text-align:center;"><img src="../image/publisher-logo.${publisherLogo.ext}" alt="${escapeXml(publisher?.name || "")}" style="max-width:70px; max-height:70px; width:auto; height:auto; display:inline-block;"/></div>`
    : "";
  // Técnica del EPUB estándar Kindle: margin-top en em directamente en el
  // título empuja el contenido hacia abajo de forma fiable en cualquier visor.
  // Spacer divs y <br/> los colapsan algunos visores (Microsoft Edge EPUB).
  const logoBlockCentered = publisherLogo
    ? `<div style="text-align:center; margin-top: 4.8em;"><img src="../image/publisher-logo.${publisherLogo.ext}" alt="${escapeXml(publisher?.name || "")}" style="max-width:5em; max-height:5em; width:auto; height:auto; display:inline-block;"/></div>`
    : "";
  const titlePageBody = `
<div style="page-break-after: always; break-after: page;">
  <h1 class="book-title" style="text-align:center; text-indent:0; margin: 10em 10% 0 10%; font-size: 1.85em; line-height: 1.2em; letter-spacing: 0.05em;">${escapeHtml(data.title)}</h1>
  <h2 class="author" style="text-align:center; text-indent:0; margin: 1.8em 15% 0 15%; font-size: 1.4em; line-height: 1.2em; font-weight:normal; font-style:italic;">${escapeHtml(authorName)}</h2>
  ${logoBlockCentered}
</div>`;
  zip.file("OEBPS/xhtml/title.xhtml", xhtmlPage(labels.titlePage, lang, "title-page-body", titlePageBody));
  sections.push({ filename: "xhtml/title.xhtml", id: "title", title: labels.titlePage, includeInToc: false });

  // Página 2: copyright en página separada.
  const copyrightBody = `
<div class="copyright">
  <p>${escapeHtml(copyrightLine)}</p>
  ${extraPublisherCopyrightLine}
  ${publisherLine}
  <p>${escapeHtml(labels.copyrightFiction)}</p>
  <p>${escapeHtml(labels.copyrightReproduction)}</p>
</div>`;
  zip.file("OEBPS/xhtml/copyright.xhtml", xhtmlPage(labels.copyright, lang, "copyright-body", copyrightBody));
  sections.push({ filename: "xhtml/copyright.xhtml", id: "copyright", title: labels.copyright, includeInToc: false });

  // 3. Visible/interactive Table of Contents (placeholder — re-rendered with real
  // chapter links after sections are built, but reserved here so it appears in
  // reading order BEFORE the chapters).
  const tocPlaceholderIndex = sections.length;
  sections.push({ filename: "xhtml/nav.xhtml", id: "nav", title: labels.toc, includeInToc: false });

  // 4. Special chapters + regular chapters in narrative order
  const getSortOrder = (n: number) => (n === 0 ? -1000 : n === -1 ? 1_000_000 : n === -2 ? 1_000_001 : n);
  const sorted = [...data.chapters].sort((a, b) => getSortOrder(a.chapterNumber) - getSortOrder(b.chapterNumber));

  let chapterIndex = 0;
  for (const ch of sorted) {
    if (!ch.content || !ch.content.trim()) continue;
    chapterIndex++;
    const isPrologue = ch.chapterNumber === 0;
    const isEpilogue = ch.chapterNumber === -1;
    const isAuthorNote = ch.chapterNumber === -2;
    let heading: string;
    let id: string;
    // [Fix59] Heading en dos partes: el número va arriba pequeño y discreto
    // (`chapter-num`), y el subtítulo o "Capítulo N" abajo grande
    // (`chapter-name`). Para prólogo/epílogo/nota del autor se usa solo el
    // texto descriptivo en `chapter-name`. Tanto el ToC como el OPF/NCX siguen
    // usando `heading` plano (sin spans) para evitar markup en metadatos.
    let headingHtml: string;
    if (isPrologue) {
      heading = ch.title || labels.prologue;
      id = "prologue";
      headingHtml = `<span class="chapter-name">${escapeHtml(heading)}</span>`;
    } else if (isEpilogue) {
      heading = ch.title || labels.epilogue;
      id = "epilogue";
      headingHtml = `<span class="chapter-name">${escapeHtml(heading)}</span>`;
    } else if (isAuthorNote) {
      heading = ch.title || labels.authorNote;
      id = "author-note";
      headingHtml = `<span class="chapter-name">${escapeHtml(heading)}</span>`;
    } else {
      const numberLabel = `${labels.chapter} ${ch.chapterNumber}`;
      if (ch.title && ch.title.trim()) {
        heading = `${numberLabel}: ${ch.title}`;
        headingHtml = `<span class="chapter-num">${escapeHtml(numberLabel)}</span><span class="chapter-name">${escapeHtml(ch.title)}</span>`;
      } else {
        heading = numberLabel;
        headingHtml = `<span class="chapter-name">${escapeHtml(numberLabel)}</span>`;
      }
      id = `ch-${ch.chapterNumber}`;
    }
    const body = `
<h1>${headingHtml}</h1>
${paragraphsToHtml(ch.content, { dropCap: useDropCap })}`;
    const filename = `xhtml/${safeId(id)}.xhtml`;
    zip.file(`OEBPS/${filename}`, xhtmlPage(heading, lang, "chapter-body", body));
    sections.push({ filename, id: safeId(id), title: heading, includeInToc: true });
  }

  // 5. Back matter — review request (KDP-compliant: honest, no incentives, no star ratings)
  const reviewBody = `
<div class="review-page">
  <h1>${escapeHtml(labels.reviewTitle)}</h1>
  ${labels.reviewBody(authorName).split("\n\n").map(p => `<p>${escapeHtml(p)}</p>`).join("\n  ")}
</div>`;
  zip.file("OEBPS/xhtml/review-request.xhtml", xhtmlPage(labels.reviewTitle, lang, "review-body", reviewBody));
  sections.push({ filename: "xhtml/review-request.xhtml", id: "review-request", title: labels.reviewTitle, includeInToc: false });

  // 6. Back matter — about the author / web link / also-by
  const websiteUrl = data.authorWebsiteUrl;
  const alsoByBooks = data.backMatter?.enableAlsoBy && data.backMatterBooks ? data.backMatterBooks : [];
  if (websiteUrl || data.authorBio || alsoByBooks.length > 0) {
    const alsoByHtml = alsoByBooks.length > 0
      ? `<div class="also-by"><h2>${escapeHtml(labels.alsoByTitle(authorName))}</h2><ul>${alsoByBooks.map(b => `<li>${escapeHtml(b.title || "")}</li>`).join("")}</ul></div>`
      : "";
    const bioHtml = data.authorBio ? `<p>${escapeHtml(data.authorBio)}</p>` : "";
    const webHtml = websiteUrl
      ? `<p>${escapeHtml(labels.aboutAuthorWebCta)} <a href="${escapeXml(websiteUrl)}">${escapeHtml(websiteUrl)}</a></p>`
      : "";
    const authorBody = `
<div class="author-page">
  <h1>${escapeHtml(labels.aboutAuthorTitle)}</h1>
  ${bioHtml}
  ${webHtml}
  ${alsoByHtml}
</div>`;
    zip.file("OEBPS/xhtml/about-author.xhtml", xhtmlPage(labels.aboutAuthorTitle, lang, "author-body", authorBody));
    sections.push({ filename: "xhtml/about-author.xhtml", id: "about-author", title: labels.aboutAuthorTitle, includeInToc: false });
  }

  // 7. Navigation document (EPUB3 nav.xhtml) — also visible in spine as
  // interactive TOC page (registered earlier as sections[tocPlaceholderIndex]).
  void tocPlaceholderIndex;
  const navItems = sections
    .filter(s => s.includeInToc)
    .map(s => `      <li><a href="${escapeXml(s.filename.replace(/^xhtml\//, ""))}">${escapeHtml(s.title)}</a></li>`)
    .join("\n");
  const navBody = `
<nav epub:type="toc" id="toc">
  <h1>${escapeHtml(labels.toc)}</h1>
  <ol>
${navItems}
  </ol>
</nav>`;
  zip.file("OEBPS/xhtml/nav.xhtml", xhtmlPage(labels.toc, lang, "nav-body", navBody));

  // 7. NCX (EPUB2 fallback for older readers)
  const ncxNavPoints = sections
    .filter(s => s.includeInToc)
    .map((s, i) => `    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(s.title)}</text></navLabel>
      <content src="${escapeXml(s.filename.replace(/^xhtml\//, "xhtml/"))}"/>
    </navPoint>`)
    .join("\n");
  const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookUuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(data.title)}</text></docTitle>
  <navMap>
${ncxNavPoints}
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncxXml);

  // 8. content.opf
  const manifestItems: string[] = [];
  manifestItems.push(`    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);
  manifestItems.push(`    <item id="css" href="css/styles.css" media-type="text/css"/>`);
  if (publisherLogo) {
    const mt = publisherLogo.mediaType;
    manifestItems.push(`    <item id="img-publisher-logo" href="image/publisher-logo.${publisherLogo.ext}" media-type="${escapeXml(mt)}"/>`);
  }
  for (const s of sections) {
    // The nav section needs the EPUB3 `properties="nav"` marker so e-readers
    // recognize it both as the navigation document AND as a visible spine page.
    const props = s.id === "nav" ? ` properties="nav"` : "";
    manifestItems.push(`    <item id="${escapeXml(s.id)}" href="${escapeXml(s.filename)}" media-type="application/xhtml+xml"${props}/>`);
  }
  const spineItems = sections.map(s => `    <itemref idref="${escapeXml(s.id)}"/>`).join("\n");

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">urn:uuid:${bookUuid}</dc:identifier>
    <dc:title>${escapeXml(data.title)}</dc:title>
    <dc:creator>${escapeXml(authorName)}</dc:creator>
    <dc:language>${escapeXml(lang)}</dc:language>
    ${publisher ? `<dc:publisher>${escapeXml(publisher.name)}</dc:publisher>` : ""}
    ${data.genre ? `<dc:subject>${escapeXml(data.genre)}</dc:subject>` : ""}
    <dc:date>${new Date().toISOString().slice(0, 10)}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opf);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function generateManuscriptEpub(data: EpubProjectData): Promise<Buffer> {
  const { project, chapters, pseudonym, prologue, epilogue, authorNote, publisher, backMatter, backMatterBooks } = data;
  const allChapters: EpubGenericChapter[] = [];
  if (prologue?.content) allChapters.push({ chapterNumber: 0, title: prologue.title || null, content: prologue.content });
  for (const c of chapters.filter(c => c.chapterNumber > 0).sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    if (c.content) allChapters.push({ chapterNumber: c.chapterNumber, title: c.title || null, content: c.content });
  }
  if (epilogue?.content) allChapters.push({ chapterNumber: -1, title: epilogue.title || null, content: epilogue.content });
  if (authorNote?.content) allChapters.push({ chapterNumber: -2, title: authorNote.title || null, content: authorNote.content });

  return generateGenericManuscriptEpub({
    title: project.title,
    authorName: pseudonym?.name || undefined,
    language: "es",
    genre: project.genre || undefined,
    publisher,
    authorWebsiteUrl: pseudonym?.websiteUrl || null,
    authorBio: (pseudonym as any)?.bio || null,
    chapters: allChapters,
    backMatter,
    backMatterBooks,
    styleId: data.styleId,
  });
}
