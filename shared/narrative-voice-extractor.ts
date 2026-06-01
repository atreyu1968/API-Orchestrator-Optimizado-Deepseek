/**
 * [Fix114] Extractor mínimo de voz narrativa compartido cliente↔server.
 *
 * El cliente lo usa para auto-rellenar los selectores de "Voz narrativa
 * canónica" en `config-panel.tsx` en cuanto el usuario elige una guía de
 * estilo / guía extendida que ya contenga las instrucciones (POV + tiempo
 * verbal). Si la guía no tiene las pistas detectables, los selectores
 * quedan vacíos para que el usuario los fije a mano.
 *
 * El server tiene un extractor más rico en `server/utils/style-directives.ts`
 * con humanText, povCharacters, etc. Este módulo es solo el subconjunto
 * estrictamente necesario para la UI, y duplica la heurística de regex
 * adrede para mantenerse libre de imports server-only.
 */

export type ExtractedPov = "first" | "third" | "second" | "dual_first" | "dual_third";
export type ExtractedTense = "present" | "past";
export type ExtractedNarratorType = "omnisciente" | "limitado" | "testigo";

export interface ExtractedNarrativeVoice {
  detected: boolean;
  pov?: ExtractedPov;
  tense?: ExtractedTense;
  narratorType?: ExtractedNarratorType;
}

export function extractNarrativeVoiceFromGuide(
  rawGuide: string | undefined | null,
): ExtractedNarrativeVoice {
  if (!rawGuide || typeof rawGuide !== "string" || !rawGuide.trim()) {
    return { detected: false };
  }

  const text = rawGuide.toLowerCase();

  const testWithNegationGuard = (re: RegExp): boolean => {
    const matches = Array.from(text.matchAll(re));
    if (matches.length === 0) return false;
    return matches.some((m) => {
      const start = m.index ?? 0;
      const ctxBefore = text.slice(Math.max(0, start - 30), start);
      return !/\b(evit[ae]r?|prohibid[oa]s?|no\s+(uses?|usar|emplear|emplees?)|nunca\s+(uses?|usar)|sin\s+(usar|emplear)|jam[aá]s)\s*$/.test(
        ctxBefore,
      );
    });
  };

  const hasFirst = testWithNegationGuard(/\b(primera\s+persona|1[aª]?\s*persona|dual\s+primera)\b/g);
  const hasThird = testWithNegationGuard(
    /\b(tercera\s+persona|3[aª]?\s*persona|dual\s+tercera|narrador\s+(omnisciente|limitado|testigo|en\s+tercera))\b/g,
  );
  const hasSecond = testWithNegationGuard(/\b(segunda\s+persona|2[aª]?\s*persona)\b/g);
  const isDual = testWithNegationGuard(
    /\b(narraci[oó]n\s+dual|narrador\s+dual|pov\s+dual|doble\s+pov|dual\s+(primera|tercera)|alternando\s+(el\s+|los\s+)?povs?|povs?\s+alternantes?|cap[ií]tulos?\s+alternantes?|pov\s+de\s+[ée]l\s+y\s+pov\s+de\s+ella|pov\s+de\s+ella\s+y\s+pov\s+de\s+[ée]l)\b/g,
  );

  let narratorType: ExtractedNarratorType | undefined;
  if (/\bnarrador\s*:?\s*omnisciente\b/.test(text)) narratorType = "omnisciente";
  else if (/\bnarrador\s*:?\s*limitado\b/.test(text)) narratorType = "limitado";
  else if (/\bnarrador\s*:?\s*testigo\b/.test(text)) narratorType = "testigo";

  let tense: ExtractedTense | undefined;
  if (
    /\b(tiempo|verbo|verbos?)\s+(en\s+)?presente\b|\btiempo\s+verbal\s*:\s*presente\b|\ben\s+presente\b|\bnarrad[oa]\s+en\s+presente\b/.test(
      text,
    )
  ) {
    tense = "present";
  } else if (
    /\b(tiempo|verbo|verbos?)\s+(en\s+)?pasado\b|\btiempo\s+verbal\s*:\s*pasado\b|\ben\s+pasado\b|\bpret[eé]rito\s+(perfecto|imperfecto|indefinido)?\b|\bnarrad[oa]\s+en\s+pasado\b/.test(
      text,
    )
  ) {
    tense = "past";
  }

  let pov: ExtractedPov | undefined;
  if (hasFirst && isDual) pov = "dual_first";
  else if (hasThird && isDual) pov = "dual_third";
  else if (hasFirst && hasThird) {
    // Ambigüedad: la UI solo soporta voces puras. Preferimos no autorellenar
    // y dejar que el usuario decida explícitamente cuál es la canónica.
    return { detected: false };
  } else if (hasFirst) pov = "first";
  else if (hasThird) pov = "third";
  else if (hasSecond) pov = "second";

  if (!pov) return { detected: false };
  return { detected: true, pov, tense, narratorType };
}
