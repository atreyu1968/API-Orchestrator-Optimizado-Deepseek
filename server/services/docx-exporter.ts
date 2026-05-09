import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
} from "docx";
import type { Project, Chapter, Pseudonym, ProjectBackMatter, BookCatalogEntry } from "@shared/schema";
import { generateBackMatterDocxParagraphs } from "./back-matter-generator";
import { stripMetaChapterHeader } from "../utils/strip-chapter-header";

interface ManuscriptData {
  project: Project;
  chapters: Chapter[];
  pseudonym?: Pseudonym | null;
  prologue?: Chapter | null;
  epilogue?: Chapter | null;
  authorNote?: Chapter | null;
  backMatter?: ProjectBackMatter | null;
  backMatterBooks?: BookCatalogEntry[];
}

interface GenericChapter {
  chapterNumber: number;
  title?: string | null;
  content: string;
}

interface GenericManuscriptData {
  title: string;
  authorName?: string;
  genre?: string;
  tone?: string;
  language?: string;
  chapters: GenericChapter[];
  backMatter?: ProjectBackMatter | null;
  backMatterBooks?: BookCatalogEntry[];
  authorWebsiteUrl?: string | null;
}

export async function generateManuscriptDocx(data: ManuscriptData): Promise<Buffer> {
  const { project, chapters, pseudonym, prologue, epilogue, authorNote, backMatter, backMatterBooks } = data;

  const authorName = pseudonym?.name || "Anónimo";
  const children: Paragraph[] = [];

  // Bloque título + autor centrado al inicio (sin página dedicada — la portada
  // como tal la gestiona KDP). Va seguido de un salto de página y luego el
  // contenido empieza por el prólogo o el primer capítulo.
  children.push(
    new Paragraph({ children: [new TextRun({ text: "", break: 3 })] }),
    new Paragraph({
      text: project.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      text: authorName,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      style: "author",
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  if (prologue && prologue.content) {
    children.push(
      new Paragraph({
        text: "Prólogo",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, prologue.content);
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  const regularChapters = chapters
    .filter(c => c.chapterNumber > 0 && c.status === "completed")
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  for (const chapter of regularChapters) {
    const chapterTitle = chapter.title 
      ? `Capítulo ${chapter.chapterNumber}: ${chapter.title}`
      : `Capítulo ${chapter.chapterNumber}`;

    children.push(
      new Paragraph({
        text: chapterTitle,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );

    if (chapter.content) {
      addContentParagraphs(children, chapter.content);
    }

    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  if (epilogue && epilogue.content) {
    children.push(
      new Paragraph({
        text: "Epílogo",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, epilogue.content);
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    );
  }

  if (authorNote && authorNote.content) {
    children.push(
      new Paragraph({
        text: "Nota del Autor",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, authorNote.content);
  }

  if (backMatter && backMatterBooks) {
    const bmParagraphs = generateBackMatterDocxParagraphs(backMatter, backMatterBooks, "es", pseudonym?.websiteUrl);
    children.push(...bmParagraphs);
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Georgia",
            size: 24,
          },
          paragraph: {
            spacing: {
              line: 360,
              after: 200,
            },
            indent: {
              firstLine: convertInchesToTwip(0.5),
            },
          },
        },
        {
          id: "author",
          name: "Author",
          basedOn: "Normal",
          run: {
            font: "Georgia",
            size: 28,
            italics: true,
          },
        },
        {
          id: "metadata",
          name: "Metadata",
          basedOn: "Normal",
          run: {
            font: "Georgia",
            size: 22,
            color: "666666",
          },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Georgia",
            size: 32,
            bold: true,
          },
          paragraph: {
            spacing: {
              before: 480,
              after: 240,
            },
          },
        },
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Georgia",
            size: 56,
            bold: true,
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: project.title,
                    font: "Georgia",
                    size: 20,
                    italics: true,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Georgia",
                    size: 20,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

function removeStyleGuideContamination(content: string): string {
  let cleaned = content;
  
  const styleGuidePatterns = [
    /^#+ *Literary Style Guide[^\n]*\n[\s\S]*?(?=^#+ *(?:CHAPTER|Chapter|Prologue|Epilogue|Author['']?s? Note)\b|\n---\n|$)/gm,
    /^#+ *Writing Guide[^\n]*\n[\s\S]*?(?=^#+ *(?:CHAPTER|Chapter|Prologue|Epilogue|Author['']?s? Note)\b|\n---\n|$)/gm,
    /^#+ *The Master of[^\n]*\n[\s\S]*?(?=^#+ *(?:CHAPTER|Chapter|Prologue|Epilogue|Author['']?s? Note)\b|\n---\n|$)/gm,
    /^#+ *Guía de Estilo[^\n]*\n[\s\S]*?(?=^#+ *(?:CAPÍTULO|Capítulo|Prólogo|Epílogo|Nota del Autor)\b|\n---\n|$)/gmi,
    /^#+ *Guía de Escritura[^\n]*\n[\s\S]*?(?=^#+ *(?:CAPÍTULO|Capítulo|Prólogo|Epílogo|Nota del Autor)\b|\n---\n|$)/gmi,
    /^###+ *Checklist[^\n]*\n[\s\S]*?(?=^#{1,2} *(?:CHAPTER|Chapter|CAPÍTULO|Capítulo|Prologue|Prólogo|Epilogue|Epílogo)\b|\n---\n|$)/gmi,
    /\n---\n[\s\S]*?(?:Style Guide|Guía de Estilo|Writing Guide|Guía de Escritura)[\s\S]*?\n---\n/gi,
  ];
  
  for (const pattern of styleGuidePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  const metaSectionPatterns = [
    /^#+ *\d+\. *(?:Narrative Architecture|Character Construction|Central Themes|Language and Stylistic|Tone and Atmosphere)[^\n]*\n[\s\S]*?(?=^#+ *(?:CHAPTER|Chapter|CAPÍTULO|Capítulo|Prologue|Prólogo)\b|$)/gmi,
  ];
  
  for (const pattern of metaSectionPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned.trim();
}

function splitLongParagraphs(content: string): string {
  const blocks = content.split(/\n\n+/);
  const result: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const hasDialogue = /\n\s*[—«\u201C"]/.test(trimmed) || /^[—«\u201C"]/.test(trimmed);

    if (trimmed.length < 600 && !hasDialogue) {
      result.push(trimmed);
      continue;
    }

    const lines = trimmed.split('\n');
    const subResult: string[] = [];
    let currentNarrative: string[] = [];

    const flushNarrative = () => {
      if (currentNarrative.length === 0) return;
      const text = currentNarrative.join(' ');
      currentNarrative = [];
      if (text.length < 600) {
        subResult.push(text);
        return;
      }
      const sentences = text.match(/[^.!?…]+[.!?…]+["»"'\u201D]?\s*/g);
      if (!sentences || sentences.length <= 3) {
        subResult.push(text);
        return;
      }
      const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
      const remainder = text.slice(matchedLength).trim();
      let chunk = '';
      let sentenceCount = 0;
      for (const sentence of sentences) {
        chunk += sentence;
        sentenceCount++;
        if (sentenceCount >= 3 && chunk.length >= 400) {
          subResult.push(chunk.trim());
          chunk = '';
          sentenceCount = 0;
        }
      }
      if (remainder) {
        chunk += ' ' + remainder;
      }
      if (chunk.trim()) {
        if (subResult.length > 0 && chunk.trim().length < 150) {
          subResult[subResult.length - 1] += ' ' + chunk.trim();
        } else {
          subResult.push(chunk.trim());
        }
      }
    };

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('—') || t.startsWith('«') || t.startsWith('\u201C') || t.startsWith('"')) {
        flushNarrative();
        subResult.push(t);
      } else {
        currentNarrative.push(t);
      }
    }
    flushNarrative();

    result.push(...subResult);
  }

  return result.join('\n\n');
}

function addContentParagraphs(children: Paragraph[], content: string): void {
  let cleanedContent = content;
  const continuityMarker = "---CONTINUITY_STATE---";
  const markerIndex = cleanedContent.indexOf(continuityMarker);
  if (markerIndex !== -1) {
    cleanedContent = cleanedContent.substring(0, markerIndex).trim();
  }
  
  cleanedContent = removeStyleGuideContamination(cleanedContent);
  // Defensa: si el cuerpo del capítulo arranca con la cabecera repetida
  // ("Capítulo N: Título"), bórrala antes de partir en párrafos.
  cleanedContent = stripMetaChapterHeader(cleanedContent);
  cleanedContent = splitLongParagraphs(cleanedContent);
  
  const paragraphs = cleanedContent.split(/\n\n+/);
  
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed && !trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }
  }
}

export async function generateGenericManuscriptDocx(data: GenericManuscriptData): Promise<Buffer> {
  const { title, authorName, genre, tone, language, chapters, backMatter, backMatterBooks, authorWebsiteUrl } = data;

  const labels: Record<string, { prologue: string; epilogue: string; authorNote: string; chapter: string }> = {
    es: { prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota del Autor", chapter: "Capítulo" },
    en: { prologue: "Prologue", epilogue: "Epilogue", authorNote: "Author's Note", chapter: "Chapter" },
    fr: { prologue: "Prologue", epilogue: "Épilogue", authorNote: "Note de l'Auteur", chapter: "Chapitre" },
    de: { prologue: "Prolog", epilogue: "Epilog", authorNote: "Anmerkung des Autors", chapter: "Kapitel" },
    it: { prologue: "Prologo", epilogue: "Epilogo", authorNote: "Nota dell'Autore", chapter: "Capitolo" },
    pt: { prologue: "Prólogo", epilogue: "Epílogo", authorNote: "Nota do Autor", chapter: "Capítulo" },
    ca: { prologue: "Pròleg", epilogue: "Epíleg", authorNote: "Nota de l'Autor", chapter: "Capítol" },
  };
  const l = labels[language || "es"] || labels.es;

  const getSortOrder = (n: number) => n === 0 ? -1000 : n === -1 ? 1000 : n === -2 ? 1001 : n;
  const sorted = [...chapters].sort((a, b) => getSortOrder(a.chapterNumber) - getSortOrder(b.chapterNumber));

  const prologue = sorted.find(c => c.chapterNumber === 0);
  const epilogue = sorted.find(c => c.chapterNumber === -1);
  const authorNoteChapter = sorted.find(c => c.chapterNumber === -2);
  const regularChapters = sorted.filter(c => c.chapterNumber > 0 && c.chapterNumber < 900);

  const children: Paragraph[] = [];
  void genre; void tone;

  // Bloque título + autor centrado al inicio (consistente con EPUB). Sin
  // página dedicada de portada — la portada visual la gestiona KDP.
  children.push(
    new Paragraph({ children: [new TextRun({ text: "", break: 3 })] }),
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );
  if (authorName) {
    children.push(
      new Paragraph({
        text: authorName,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        style: "author",
      }),
    );
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  if (prologue && prologue.content) {
    children.push(
      new Paragraph({
        text: prologue.title || l.prologue,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, prologue.content);
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  for (const chapter of regularChapters) {
    const chapterTitle = chapter.title
      ? `${l.chapter} ${chapter.chapterNumber}: ${chapter.title}`
      : `${l.chapter} ${chapter.chapterNumber}`;

    children.push(
      new Paragraph({
        text: chapterTitle,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, chapter.content);
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  if (epilogue && epilogue.content) {
    children.push(
      new Paragraph({
        text: epilogue.title || l.epilogue,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, epilogue.content);
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  if (authorNoteChapter && authorNoteChapter.content) {
    children.push(
      new Paragraph({
        text: authorNoteChapter.title || l.authorNote,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );
    addContentParagraphs(children, authorNoteChapter.content);
  }

  if (backMatter && backMatterBooks) {
    const bmParagraphs = generateBackMatterDocxParagraphs(backMatter, backMatterBooks, language || "es", authorWebsiteUrl);
    children.push(...bmParagraphs);
  }

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Georgia", size: 24 },
          paragraph: {
            spacing: { line: 360, after: 200 },
            indent: { firstLine: convertInchesToTwip(0.5) },
          },
        },
        {
          id: "author",
          name: "Author",
          basedOn: "Normal",
          run: { font: "Georgia", size: 28, italics: true },
        },
        {
          id: "metadata",
          name: "Metadata",
          basedOn: "Normal",
          run: { font: "Georgia", size: 22, color: "666666" },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Georgia", size: 32, bold: true },
          paragraph: { spacing: { before: 480, after: 240 } },
        },
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Georgia", size: 56, bold: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: title, font: "Georgia", size: 20, italics: true }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], font: "Georgia", size: 20 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
