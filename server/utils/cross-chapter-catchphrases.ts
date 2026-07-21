// [Fix239] Detector determinista de frases-firma repetidas ENTRE capitulos
// (muletillas de imagen tipo "la luz del candil temblaba" que aparecen en
// muchos capitulos distintos). Los correctores por-capitulo no pueden verlas
// porque cada uno lee UN capitulo; este helper cuenta n-gramas normalizados
// en el manuscrito completo y devuelve las frases que aparecen en demasiados
// capitulos distintos, para inyectarlas como aviso al Corrector.

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al",
  "a", "en", "y", "o", "que", "se", "su", "sus", "con", "por", "para", "no",
  "le", "lo", "les", "mas", "como", "pero", "si", "ya", "habia", "era", "fue",
  "es", "ha", "han", "sin", "sobre", "entre", "hacia", "desde", "cuando",
  "donde", "muy", "todo", "toda", "todos", "todas", "esa", "ese", "esta",
  "este", "aquel", "aquella", "me", "te", "nos", "mi", "tu",
]);

function normalizeForNgrams(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zñ\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0);
}

export interface CatchphraseHit {
  frase: string;
  capitulos: number[];
}

// contents: capitulos con su numero y texto. minChapters: umbral de capitulos
// DISTINTOS en los que debe aparecer el n-grama para considerarse muletilla.
export function detectCrossChapterCatchphrases(
  contents: Array<{ chapterNumber: number; content: string }>,
  minChapters = 4,
  maxResults = 12,
): CatchphraseHit[] {
  if (contents.length < minChapters) return [];

  // n-gramas de 4 a 6 palabras; exigimos >=2 palabras de contenido (no stopwords)
  const map = new Map<string, Set<number>>();
  for (const { chapterNumber, content } of contents) {
    const words = normalizeForNgrams(content);
    const seenInChapter = new Set<string>();
    for (let n = 4; n <= 6; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        let contentWords = 0;
        for (const w of gram) if (!STOPWORDS.has(w)) contentWords++;
        if (contentWords < 2) continue;
        const key = gram.join(" ");
        if (seenInChapter.has(key)) continue;
        seenInChapter.add(key);
        let set = map.get(key);
        if (!set) { set = new Set(); map.set(key, set); }
        set.add(chapterNumber);
      }
    }
  }

  // candidatos que superan el umbral, ordenados por (num caps, longitud)
  const candidates = [...map.entries()]
    .filter(([, caps]) => caps.size >= minChapters)
    .map(([frase, caps]) => ({ frase, capitulos: [...caps].sort((a, b) => a - b) }))
    .sort((a, b) => b.capitulos.length - a.capitulos.length || b.frase.length - a.frase.length);

  // dedupe: dos candidatos son variantes de la MISMA muletilla si comparten
  // una secuencia de 3+ palabras (las ventanas deslizantes generan n-gramas
  // solapados de la misma frase) y la cobertura del nuevo no aporta caps
  const shareRun = (a: string, b: string): boolean => {
    const wa = a.split(" ");
    const bPadded = ` ${b} `;
    for (let i = 0; i + 3 <= wa.length; i++) {
      // fronteras de token: evita fusionar candidatos por colision de substring
      if (bPadded.includes(` ${wa.slice(i, i + 3).join(" ")} `)) return true;
    }
    return false;
  };
  const chosen: CatchphraseHit[] = [];
  for (const cand of candidates) {
    const redundant = chosen.some(c =>
      shareRun(cand.frase, c.frase) &&
      cand.capitulos.every(n => c.capitulos.includes(n))
    );
    if (!redundant) chosen.push(cand);
    if (chosen.length >= maxResults) break;
  }
  return chosen;
}
