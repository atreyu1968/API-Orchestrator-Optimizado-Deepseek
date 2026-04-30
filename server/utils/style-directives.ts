/**
 * Extrae directivas narrativas estructuradas del texto libre de la guía de estilo.
 *
 * Las guías se almacenan como blobs de texto. Esto causa que la voz narrativa
 * (POV, persona, tiempo verbal) se diluya en el prompt y sea ignorada por los
 * modelos. Esta utilidad detecta esos parámetros con regex y los expone como
 * un bloque DESTACADO que se prepende a los prompts de Architect/Ghostwriter/
 * FinalReviewer, garantizando atención del modelo.
 *
 * Filosofía: conservadora. Si la guía es ambigua y no detectamos POV con
 * confianza, devolvemos detected=false y no inyectamos nada (mejor no
 * meter ruido que inyectar una directiva equivocada).
 */

export type Pov = "first" | "third" | "second" | "dual_first" | "dual_third" | "mixed";
export type Tense = "present" | "past";
export type NarratorType = "omnisciente" | "limitado" | "testigo";

export interface StyleDirectives {
  detected: boolean;
  pov?: Pov;
  povCharacters?: string[];
  narratorType?: NarratorType;
  tense?: Tense;
  humanText?: string;
}

export function extractStyleDirectives(rawGuide: string | undefined | null): StyleDirectives {
  if (!rawGuide || typeof rawGuide !== "string" || !rawGuide.trim()) {
    return { detected: false };
  }

  const text = rawGuide.toLowerCase();

  // Test con guarda de negación: rechaza matches precedidos en ~25 caracteres
  // por palabras como "evita", "no", "sin", "prohibido", "nunca". Evita que
  // una guía que dice "evitar narración dual" termine activando dual=true.
  const testWithNegationGuard = (re: RegExp): boolean => {
    const matches = Array.from(text.matchAll(re));
    if (matches.length === 0) return false;
    return matches.some(m => {
      const start = m.index ?? 0;
      const ctxBefore = text.slice(Math.max(0, start - 30), start);
      return !/\b(evit[ae]r?|prohibid[oa]s?|no\s+(uses?|usar|emplear|emplees?)|nunca\s+(uses?|usar)|sin\s+(usar|emplear)|jam[aá]s)\s*$/.test(ctxBefore);
    });
  };

  const hasFirst = testWithNegationGuard(/\b(primera\s+persona|1[aª]?\s*persona)\b/g);
  const hasThird = testWithNegationGuard(/\b(tercera\s+persona|3[aª]?\s*persona|narrador\s+(omnisciente|limitado|testigo|en\s+tercera))\b/g);
  const hasSecond = testWithNegationGuard(/\b(segunda\s+persona|2[aª]?\s*persona)\b/g);

  const isDual = testWithNegationGuard(/\b(narraci[oó]n\s+dual|narrador\s+dual|pov\s+dual|doble\s+pov|alternando\s+(el\s+|los\s+)?povs?|povs?\s+alternantes?|cap[ií]tulos?\s+alternantes?|pov\s+de\s+[ée]l\s+y\s+pov\s+de\s+ella|pov\s+de\s+ella\s+y\s+pov\s+de\s+[ée]l)\b/g);

  let narratorType: NarratorType | undefined;
  if (/\bnarrador\s+omnisciente\b/.test(text)) narratorType = "omnisciente";
  else if (/\bnarrador\s+limitado\b/.test(text)) narratorType = "limitado";
  else if (/\bnarrador\s+testigo\b/.test(text)) narratorType = "testigo";

  // Extracción de personajes POV con preservación de case original.
  // Patrones: "POV de Dante", "perspectiva de Elena", "punto de vista de Dante".
  // Filtra pronombres (él/ella) — son indicadores de dualidad pero no nombres.
  const povCharacters: string[] = [];
  const namePattern = /(?:POV|perspectiva|punto\s+de\s+vista)\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,30})\b/g;
  for (const m of rawGuide.matchAll(namePattern)) {
    const name = m[1];
    if (!name) continue;
    const lower = name.toLowerCase();
    // Descarta pronombres y artículos que pudieran colarse.
    if (["el", "él", "ella", "ellos", "ellas", "la", "lo", "los", "las", "un", "una"].includes(lower)) continue;
    if (!povCharacters.some(p => p.toLowerCase() === lower)) {
      povCharacters.push(name);
    }
  }

  let tense: Tense | undefined;
  if (/\b(tiempo|verbo|verbos?)\s+(en\s+)?presente\b|\ben\s+presente\b|\bnarrad[oa]\s+en\s+presente\b/.test(text)) {
    tense = "present";
  } else if (/\b(tiempo|verbo|verbos?)\s+(en\s+)?pasado\b|\ben\s+pasado\b|\bpret[eé]rito\s+(perfecto|imperfecto|indefinido)?\b|\bnarrad[oa]\s+en\s+pasado\b/.test(text)) {
    tense = "past";
  }

  let pov: Pov | undefined;
  if (hasFirst && isDual) pov = "dual_first";
  else if (hasThird && isDual) pov = "dual_third";
  else if (hasFirst && hasThird) pov = "mixed";
  else if (hasFirst) pov = "first";
  else if (hasThird) pov = "third";
  else if (hasSecond) pov = "second";

  if (!pov) return { detected: false };

  // Construir texto humano-legible que se inyectará en los prompts.
  const parts: string[] = [];
  const charsList = povCharacters.length >= 2
    ? povCharacters.slice(0, 4).join(" y ")
    : "";

  if (pov === "dual_first") {
    parts.push(`PRIMERA PERSONA con NARRACIÓN DUAL${charsList ? ` (alternando entre ${charsList})` : " (alternando entre dos POVs)"}`);
  } else if (pov === "dual_third") {
    parts.push(`TERCERA PERSONA con NARRACIÓN DUAL${charsList ? ` (alternando entre ${charsList})` : " (alternando entre dos POVs)"}`);
  } else if (pov === "first") {
    parts.push(`PRIMERA PERSONA${povCharacters.length === 1 ? ` (POV de ${povCharacters[0]})` : ""}`);
  } else if (pov === "third") {
    const flavor = narratorType ? ` (narrador ${narratorType})` : "";
    parts.push(`TERCERA PERSONA${flavor}`);
  } else if (pov === "second") {
    parts.push(`SEGUNDA PERSONA`);
  } else if (pov === "mixed") {
    parts.push(`MIXTA — la guía menciona tanto primera como tercera persona; respeta lo que indique la guía completa para cada capítulo`);
  }

  if (tense === "present") parts.push("Tiempo verbal: PRESENTE");
  else if (tense === "past") parts.push("Tiempo verbal: PASADO");

  return {
    detected: true,
    pov,
    povCharacters: povCharacters.length ? povCharacters : undefined,
    narratorType,
    tense,
    humanText: parts.join(". "),
  };
}

/** Bloque listo para prepender al prompt del Architect. */
export function buildArchitectDirectiveBlock(d: StyleDirectives): string {
  if (!d.detected || !d.humanText) return "";
  const isDual = d.pov === "dual_first" || d.pov === "dual_third";
  const dualNote = isDual
    ? `\n\nPLANIFICACIÓN OBLIGATORIA POR NARRACIÓN DUAL: en la escaleta marca explícitamente desde qué POV narra cada capítulo. Usa el campo "titulo" o el primer beat con prefijo (ej: "POV ${d.povCharacters?.[0] || "Personaje A"}: ..." / "POV ${d.povCharacters?.[1] || "Personaje B"}: ..."). Distribuye los POVs de forma equilibrada y deliberada según la dinámica de la trama. NO planifiques capítulos con POV ambiguo o sin marcar.`
    : "";
  return `
    ═══════════════════════════════════════════════════════════════════
    🎯 VOZ NARRATIVA CANÓNICA DE LA NOVELA (NO NEGOCIABLE) 🎯
    ═══════════════════════════════════════════════════════════════════
    ${d.humanText}.

    Esta directiva se ha extraído de la guía de estilo y es CANON del proyecto. Toda la escaleta debe planificarse asumiendo esta voz narrativa.${dualNote}
    ═══════════════════════════════════════════════════════════════════
`;
}

/** Bloque listo para prepender al prompt del Ghostwriter. */
export function buildGhostwriterDirectiveBlock(d: StyleDirectives): string {
  if (!d.detected || !d.humanText) return "";
  const isDual = d.pov === "dual_first" || d.pov === "dual_third";
  return `
    ═══════════════════════════════════════════════════════════════════
    🎯 VOZ NARRATIVA CANÓNICA (INVIOLABLE) 🎯
    ═══════════════════════════════════════════════════════════════════
    ${d.humanText}.

    ESCRIBE TODO EL CAPÍTULO en esta voz narrativa, sin excepciones, sin transiciones a otra persona/tiempo dentro del capítulo. Si tu instinto te empuja a otra persona narrativa o a otro tiempo verbal, ANULA ese instinto: la voz NO se negocia jamás.${isDual ? `\n\n    NARRACIÓN DUAL: este capítulo concretamente está narrado desde un ÚNICO POV. Si el título del capítulo o la escaleta indican qué POV te toca, respétalo a rajatabla. Si no se indica, usa el POV del personaje protagonista de la escena. NUNCA mezcles dos POVs dentro del mismo capítulo.` : ""}
    ═══════════════════════════════════════════════════════════════════
`;
}

/** Bloque listo para prepender al prompt del Final Reviewer. */
export function buildFinalReviewerDirectiveBlock(d: StyleDirectives): string {
  if (!d.detected || !d.humanText) return "";
  return `
    ═══════════════════════════════════════════════════════════════════
    🎯 VOZ NARRATIVA CANÓNICA DEL PROYECTO 🎯
    ═══════════════════════════════════════════════════════════════════
    ${d.humanText}.

    USO COMO REFERENCIA DE REVISIÓN:
    - Si TODOS los capítulos están en una voz DIFERENTE a la canónica → emite UN ÚNICO issue de severidad CRÍTICA con categoría "trama" describiendo el problema globalmente. NO pidas conversión cap-a-cap (la cirugía no puede arreglar eso y queda PROHIBIDO solicitarla).
    - Si UN capítulo concreto se desvía aisladamente de la voz canónica → repórtalo como issue de severidad MAYOR con observación textual de que el usuario debería regenerar ese capítulo manualmente. NUNCA pidas reescritura quirúrgica del capítulo entero.
    - Si la voz se respeta → no inventes problemas de POV.
    ═══════════════════════════════════════════════════════════════════
`;
}
