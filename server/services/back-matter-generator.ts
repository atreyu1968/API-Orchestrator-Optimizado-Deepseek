import type { BookCatalogEntry, ProjectBackMatter } from "@shared/schema";
import { Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } from "docx";

const REVIEW_TEXTS: Record<string, { title: string; body: (authorName: string) => string; amazonCta: string; goodreadsCta: string }> = {
  es: {
    title: "¿Te ha gustado este libro?",
    body: (authorName) =>
      `Gracias por leer este libro. Si has disfrutado de la historia, te agradecería enormemente que dedicaras un momento a dejar una reseña en Amazon o Goodreads. Tu opinión sincera, por breve que sea, ayuda a otros lectores a descubrir este libro y me permite seguir escribiendo las historias que amas.\n\nCada reseña marca la diferencia. ¡Gracias por tu apoyo!\n\n— ${authorName}`,
    amazonCta: "Deja tu reseña en Amazon",
    goodreadsCta: "Puntúa en Goodreads",
  },
  en: {
    title: "Did you enjoy this book?",
    body: (authorName) =>
      `Thank you for reading this book. If you enjoyed the story, I would greatly appreciate it if you could take a moment to leave a review on Amazon or Goodreads. Your honest opinion, however brief, helps other readers discover this book and allows me to keep writing the stories you love.\n\nEvery review makes a difference. Thank you for your support!\n\n— ${authorName}`,
    amazonCta: "Leave your review on Amazon",
    goodreadsCta: "Rate on Goodreads",
  },
  fr: {
    title: "Avez-vous aimé ce livre ?",
    body: (authorName) =>
      `Merci d'avoir lu ce livre. Si vous avez apprécié l'histoire, je vous serais très reconnaissant de prendre un moment pour laisser un avis sur Amazon ou Goodreads. Votre opinion sincère, aussi brève soit-elle, aide d'autres lecteurs à découvrir ce livre et me permet de continuer à écrire les histoires que vous aimez.\n\nChaque avis fait la différence. Merci de votre soutien !\n\n— ${authorName}`,
    amazonCta: "Laissez votre avis sur Amazon",
    goodreadsCta: "Notez sur Goodreads",
  },
  de: {
    title: "Hat Ihnen dieses Buch gefallen?",
    body: (authorName) =>
      `Vielen Dank, dass Sie dieses Buch gelesen haben. Wenn Ihnen die Geschichte gefallen hat, wäre ich Ihnen sehr dankbar, wenn Sie sich einen Moment Zeit nehmen würden, um eine Rezension auf Amazon oder Goodreads zu hinterlassen. Ihre ehrliche Meinung, so kurz sie auch sein mag, hilft anderen Lesern, dieses Buch zu entdecken, und ermöglicht es mir, weiterhin die Geschichten zu schreiben, die Sie lieben.\n\nJede Rezension macht einen Unterschied. Danke für Ihre Unterstützung!\n\n— ${authorName}`,
    amazonCta: "Hinterlassen Sie Ihre Rezension auf Amazon",
    goodreadsCta: "Bewerten Sie auf Goodreads",
  },
  it: {
    title: "Ti è piaciuto questo libro?",
    body: (authorName) =>
      `Grazie per aver letto questo libro. Se hai apprezzato la storia, ti sarei molto grato se dedicassi un momento a lasciare una recensione su Amazon o Goodreads. La tua opinione sincera, per quanto breve, aiuta altri lettori a scoprire questo libro e mi permette di continuare a scrivere le storie che ami.\n\nOgni recensione fa la differenza. Grazie per il tuo supporto!\n\n— ${authorName}`,
    amazonCta: "Lascia la tua recensione su Amazon",
    goodreadsCta: "Valuta su Goodreads",
  },
  pt: {
    title: "Gostou deste livro?",
    body: (authorName) =>
      `Obrigado por ler este livro. Se gostou da história, ficaria muito grato se dedicasse um momento para deixar uma resenha na Amazon ou Goodreads. A sua opinião sincera, por breve que seja, ajuda outros leitores a descobrir este livro e permite-me continuar a escrever as histórias que ama.\n\nCada resenha faz a diferença. Obrigado pelo seu apoio!\n\n— ${authorName}`,
    amazonCta: "Deixe a sua resenha na Amazon",
    goodreadsCta: "Avalie no Goodreads",
  },
};

const ALSO_BY_TITLES: Record<string, (authorName: string) => string> = {
  es: (name) => `También de ${name}`,
  en: (name) => `Also by ${name}`,
  fr: (name) => `Également de ${name}`,
  de: (name) => `Auch von ${name}`,
  it: (name) => `Anche di ${name}`,
  pt: (name) => `Também de ${name}`,
};

const WEBSITE_CTA_TEXTS: Record<string, string> = {
  es: "Descubre todos mis libros en mi web:",
  en: "Discover all my books on my website:",
  fr: "Découvrez tous mes livres sur mon site :",
  de: "Entdecken Sie alle meine Bücher auf meiner Website:",
  it: "Scopri tutti i miei libri sul mio sito:",
  pt: "Descubra todos os meus livros no meu site:",
};

const ABOUT_AUTHOR_TITLES: Record<string, string> = {
  es: "Sobre el Autor",
  en: "About the Author",
  fr: "À propos de l'auteur",
  de: "Über den Autor",
  it: "L'autore",
  pt: "Sobre o Autor",
};

export function generateBackMatterMarkdown(
  config: ProjectBackMatter,
  selectedBooks: BookCatalogEntry[],
  language: string = "es",
  authorWebsiteUrl?: string | null
): string {
  const lines: string[] = [];
  const lang = language in REVIEW_TEXTS ? language : "es";

  if (config.enableReviewRequest) {
    const texts = REVIEW_TEXTS[lang];
    const authorName = config.reviewAuthorName || "El Autor";
    lines.push("---");
    lines.push("");
    lines.push(`## ${texts.title}`);
    lines.push("");
    lines.push(texts.body(authorName));
    lines.push("");

    if (config.reviewAmazonUrl) {
      lines.push(`**[${texts.amazonCta}](${config.reviewAmazonUrl})**`);
      lines.push("");
    }
    if (config.reviewGoodreadsUrl) {
      lines.push(`**[${texts.goodreadsCta}](${config.reviewGoodreadsUrl})**`);
      lines.push("");
    }
  }

  if (config.enableAlsoBy && selectedBooks.length > 0) {
    const authorName = config.reviewAuthorName || "El Autor";
    const getTitle = ALSO_BY_TITLES[lang] || ALSO_BY_TITLES.es;
    const sectionTitle = config.alsoByTitle || getTitle(authorName);

    lines.push("---");
    lines.push("");
    lines.push(`## ${sectionTitle}`);
    lines.push("");

    for (const book of selectedBooks) {
      lines.push(`### ${book.title}`);
      lines.push("");
      if (book.synopsis) {
        lines.push(book.synopsis);
        lines.push("");
      }
      if (book.isKindleUnlimited) {
        const kuText = lang === "en" ? "*Available on Kindle Unlimited*" : "*Disponible en Kindle Unlimited*";
        lines.push(kuText);
        lines.push("");
      }
    }

    if (authorWebsiteUrl) {
      const ctaText = WEBSITE_CTA_TEXTS[lang] || WEBSITE_CTA_TEXTS.es;
      lines.push("");
      lines.push(`**${ctaText}**`);
      lines.push(`**[${authorWebsiteUrl}](${authorWebsiteUrl})**`);
      lines.push("");
    }
  }

  if (config.enableAuthorPage && config.authorPageBio) {
    const aboutTitle = ABOUT_AUTHOR_TITLES[lang] || ABOUT_AUTHOR_TITLES.es;
    lines.push("---");
    lines.push("");
    lines.push(`## ${aboutTitle}`);
    lines.push("");
    lines.push(config.authorPageBio);
    lines.push("");
    if (authorWebsiteUrl) {
      lines.push(`**[${authorWebsiteUrl}](${authorWebsiteUrl})**`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function generateBackMatterDocxParagraphs(
  config: ProjectBackMatter,
  selectedBooks: BookCatalogEntry[],
  language: string = "es",
  authorWebsiteUrl?: string | null
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lang = language in REVIEW_TEXTS ? language : "es";

  if (config.enableReviewRequest) {
    const texts = REVIEW_TEXTS[lang];
    const authorName = config.reviewAuthorName || "El Autor";

    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

    paragraphs.push(
      new Paragraph({
        text: texts.title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );

    const bodyParagraphs = texts.body(authorName).split("\n").filter(l => l.trim());
    for (const line of bodyParagraphs) {
      if (line.startsWith("—")) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 200, after: 200 },
            children: [new TextRun({ text: line, italics: true, font: "Georgia", size: 24 })],
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: line, font: "Georgia", size: 24 })],
          })
        );
      }
    }

    if (config.reviewAmazonUrl) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: texts.amazonCta, bold: true, font: "Georgia", size: 24 })],
        })
      );
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: config.reviewAmazonUrl, font: "Georgia", size: 20, color: "0066CC" })],
        })
      );
    }

    if (config.reviewGoodreadsUrl) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: texts.goodreadsCta, bold: true, font: "Georgia", size: 24 })],
        })
      );
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: config.reviewGoodreadsUrl, font: "Georgia", size: 20, color: "0066CC" })],
        })
      );
    }
  }

  if (config.enableAlsoBy && selectedBooks.length > 0) {
    const authorName = config.reviewAuthorName || "El Autor";
    const getTitle = ALSO_BY_TITLES[lang] || ALSO_BY_TITLES.es;
    const sectionTitle = config.alsoByTitle || getTitle(authorName);

    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

    paragraphs.push(
      new Paragraph({
        text: sectionTitle,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );

    for (const book of selectedBooks) {
      paragraphs.push(
        new Paragraph({
          text: book.title,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 200 },
        })
      );

      if (book.synopsis) {
        const synopsisLines = book.synopsis.split("\n").filter(l => l.trim());
        for (const line of synopsisLines) {
          paragraphs.push(
            new Paragraph({
              spacing: { after: 150 },
              children: [new TextRun({ text: line, font: "Georgia", size: 22, italics: true })],
            })
          );
        }
      }

      if (book.isKindleUnlimited) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: lang === "en" ? "Available on Kindle Unlimited" : "Disponible en Kindle Unlimited",
                italics: true,
                font: "Georgia",
                size: 20,
                color: "FF9900",
              }),
            ],
          })
        );
      }

      paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
    }

    if (authorWebsiteUrl) {
      const ctaText = WEBSITE_CTA_TEXTS[lang] || WEBSITE_CTA_TEXTS.es;
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: ctaText, bold: true, font: "Georgia", size: 24 })],
        })
      );
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: authorWebsiteUrl, bold: true, font: "Georgia", size: 24, color: "0066CC" })],
        })
      );
    }
  }

  if (config.enableAuthorPage && config.authorPageBio) {
    const aboutTitle = ABOUT_AUTHOR_TITLES[lang] || ABOUT_AUTHOR_TITLES.es;

    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));

    paragraphs.push(
      new Paragraph({
        text: aboutTitle,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 },
      })
    );

    const bioLines = config.authorPageBio.split("\n").filter(l => l.trim());
    for (const line of bioLines) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: line, font: "Georgia", size: 24 })],
        })
      );
    }

    if (authorWebsiteUrl) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [new TextRun({ text: authorWebsiteUrl, bold: true, font: "Georgia", size: 24, color: "0066CC" })],
        })
      );
    }
  }

  return paragraphs;
}
