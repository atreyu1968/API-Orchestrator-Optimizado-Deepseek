// [Fix17] Muestreo estratégico del manuscrito para reducir tokens en ~85%
// Threshold 60.000 chars: si supera, extrae 25k inicio + 20k medio + 15k final.

const SAMPLING_THRESHOLD = 60_000;
const HEAD_SIZE = 25_000;
const MIDDLE_SIZE = 20_000;
const TAIL_SIZE = 15_000;

export interface SampledManuscript {
  text: string;
  wasSampled: boolean;
  originalLength: number;
  sampledLength: number;
}

export function sampleManuscript(fullText: string): SampledManuscript {
  const original = (fullText || "").trim();
  const originalLength = original.length;

  if (originalLength <= SAMPLING_THRESHOLD) {
    return {
      text: original,
      wasSampled: false,
      originalLength,
      sampledLength: originalLength,
    };
  }

  const head = original.slice(0, HEAD_SIZE);
  const middleStart = Math.max(HEAD_SIZE, Math.floor(originalLength / 2 - MIDDLE_SIZE / 2));
  const middle = original.slice(middleStart, middleStart + MIDDLE_SIZE);
  const tail = original.slice(originalLength - TAIL_SIZE);

  const text =
    "=== INICIO DEL MANUSCRITO ===\n" + head +
    "\n\n=== SECCIÓN MEDIA DEL MANUSCRITO ===\n" + middle +
    "\n\n=== FINAL DEL MANUSCRITO ===\n" + tail;

  return {
    text,
    wasSampled: true,
    originalLength,
    sampledLength: text.length,
  };
}

export function joinChaptersForSampling(
  chapters: Array<{ chapterNumber?: number | null; title?: string | null; content?: string | null; editedContent?: string | null; originalContent?: string | null }>
): string {
  if (!Array.isArray(chapters) || chapters.length === 0) return "";
  const ordered = [...chapters].sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  return ordered.map(ch => {
    const body = ch.content || ch.editedContent || ch.originalContent || "";
    if (!body || body.trim().length === 0) return "";
    const header = `\n\n--- Capítulo ${ch.chapterNumber || "?"}${ch.title ? `: ${ch.title}` : ""} ---\n`;
    return header + body;
  }).filter(Boolean).join("");
}
