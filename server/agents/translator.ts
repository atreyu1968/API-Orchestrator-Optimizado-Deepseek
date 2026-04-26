import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface TranslatorInput {
  content: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapterTitle?: string;
  chapterNumber?: number;
  projectId?: number;
}

export interface TranslatorResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  notes: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  es: "español",
  en: "English",
  fr: "français",
  de: "Deutsch",
  it: "italiano",
  pt: "português",
  ca: "català",
};

const LANGUAGE_EDITORIAL_RULES: Record<string, string> = {
  es: `
NORMAS EDITORIALES Y DE FLUIDEZ - ESPAÑOL:
[TIPOGRAFÍA]
- DIÁLOGOS: Usar raya (—) para introducir diálogos. Ejemplo: —Hola —dijo María—. ¿Cómo estás?
- COMILLAS: Usar comillas angulares « » para citas textuales. Comillas inglesas " " solo para citas dentro de citas.
- PUNTUACIÓN: Los signos de interrogación y exclamación van al principio (¿?) y al final (?).
- NÚMEROS: Escribir con letras del uno al nueve, cifras del 10 en adelante.

[FLUIDEZ Y NATURALIDAD]
- ORACIONES: Máximo 40-45 palabras por oración. Dividir oraciones largas con punto y seguido.
- GERUNDIOS: Evitar más de un gerundio por oración. Convertir a subordinadas: "caminando hacia" → "mientras caminaba hacia".
- REPETICIONES: No repetir la misma palabra en oraciones consecutivas. Usar sinónimos o reestructurar.
- LEÍSMO: Evitar "le" como complemento directo masculino. Usar "lo": "lo vi" en lugar de "le vi".
- VOZ PASIVA: Limitar construcciones pasivas. Preferir voz activa: "fue visto por María" → "María lo vio".
- FLUIDEZ: La prosa debe sonar natural, como si un nativo la hubiera escrito originalmente.`,

  en: `
ENGLISH EDITORIAL & FLUENCY STANDARDS:
[TYPOGRAPHY]
- DIALOGUE: Use quotation marks for dialogue. Example: "Hello," said Mary. "How are you?"
- QUOTES: Use double quotes " " for dialogue and direct speech. Single quotes ' ' for quotes within quotes.
- PUNCTUATION: Periods and commas go inside quotation marks. Question marks and exclamation points go inside only if part of the quote.
- NUMBERS: Spell out one through nine, use numerals for 10 and above.
- CONTRACTIONS: Preserve natural contractions (don't, can't, won't) in dialogue.

[FLUENCY & NATURALNESS]
- SENTENCES: Maximum 35-40 words per sentence. Break long sentences naturally.
- ACTIVE VOICE: Prefer active over passive: "was seen by John" → "John saw".
- WORD REPETITION: Avoid repeating the same word in consecutive sentences. Vary vocabulary.
- ADVERBS: Use sparingly. Show don't tell: "walked slowly" → "ambled" or "shuffled".
- RHYTHM: Vary sentence length for natural flow. Mix short punchy sentences with longer ones.
- IDIOMS: Use natural English idioms and expressions, not literal translations.`,

  fr: `
NORMES ÉDITORIALES ET FLUIDITÉ - FRANÇAIS:
[TYPOGRAPHIE]
- DIALOGUES: Utiliser les guillemets français « » avec espaces insécables. Tiret cadratin (—) pour les incises.
- PONCTUATION: Espace insécable avant : ; ! ? et après « et avant ».
- NOMBRES: Écrire en lettres de un à neuf, chiffres à partir de 10.
- MAJUSCULES: Les noms de langues, nationalités s'écrivent en minuscules (français, anglais).

[FLUIDITÉ ET NATUREL]
- PHRASES: Maximum 40-45 mots par phrase. Diviser les phrases longues.
- PASSÉ SIMPLE: Utiliser le passé simple pour la narration littéraire, pas le passé composé.
- PRONOMS: Éviter l'ambiguïté des pronoms. Clarifier les référents.
- RÉPÉTITIONS: Éviter de répéter le même mot dans des phrases consécutives.
- REGISTRE: Maintenir un registre littéraire cohérent, éviter les anglicismes.
- LIAISONS: Utiliser des transitions naturelles entre les phrases.`,

  de: `
DEUTSCHE REDAKTIONS- UND STILSTANDARDS:
[TYPOGRAFIE]
- DIALOGE: Anführungszeichen „..." oder »...« verwenden. Beispiel: „Hallo", sagte Maria.
- ZITATE: Doppelte Anführungszeichen für direkte Rede. Einfache ‚...' für Zitate im Zitat.
- KOMPOSITA: Bindestriche bei zusammengesetzten Wörtern korrekt verwenden.
- ZAHLEN: Eins bis neun ausschreiben, ab 10 Ziffern verwenden.

[FLÜSSIGKEIT UND NATÜRLICHKEIT]
- SÄTZE: Maximum 40-45 Wörter pro Satz. Lange Sätze aufteilen.
- SATZSTELLUNG: Natürliche deutsche Wortstellung beachten. Verb an zweiter Stelle.
- KOMPOSITA: Zusammengesetzte Wörter natürlich verwenden, nicht zu lang.
- WIEDERHOLUNGEN: Keine Wortwiederholungen in aufeinanderfolgenden Sätzen.
- PASSIV: Aktive Konstruktionen bevorzugen.
- MODALPARTIKELN: Natürliche Verwendung von ja, doch, mal, eben in Dialogen.`,

  it: `
NORME EDITORIALI E FLUIDITÀ - ITALIANO (OBBLIGATORIO):
[TIPOGRAFIA - CRITICO]
- DIALOGHI: Usare ESCLUSIVAMENTE il trattino lungo (—) per introdurre i dialoghi. MAI usare virgolette di nessun tipo ("", «», <<>>).
  Esempio corretto: —Ciao —disse Maria—. Come stai?
  Esempio SBAGLIATO: «Ciao» disse Maria. / "Ciao" disse Maria.
- INCISI: Il trattino lungo chiude l'inciso e ne apre un altro dopo l'attribuzione.
  Esempio: —Non so —rispose lui—. Forse domani.
- PUNTEGGIATURA: Il punto finale va DOPO il trattino di chiusura inciso.
- NUMERI: Scrivere in lettere da uno a nove, cifre da 10 in poi.
- ACCENTI: Attenzione agli accenti gravi (è, à) e acuti (é, perché).
- CONSISTENZA: Se nel testo originale ci sono "«»", '""' o '<<>>', convertili TUTTI a trattini lunghi (—).

[FLUIDITÀ E NATURALEZZA - CRITICO]
- PRONOMI ARCAICI: MAI usare "Egli", "Ella", "Esso", "Essa", "Essi", "Esse". Usare SEMPRE il nome proprio o pronomi moderni (lui, lei, loro).
- FRASI: Massimo 40-45 parole per frase. Le frasi oltre 50 parole DEVONO essere divise.
- RIPETIZIONI LESSICALI: Non ripetere la stessa parola in frasi consecutive. Usare sinonimi o ristrutturare.
- PASSIVO: Limitare la voce passiva. Preferire costruzioni attive.
- GERUNDI: Evitare catene di gerundi. Massimo uno per frase.
- RITMO: Alternare frasi brevi e lunghe per un ritmo narrativo naturale.
- NATURALEZZA: Il testo deve suonare come se fosse stato scritto originariamente in italiano da un madrelingua.`,

  pt: `
NORMAS EDITORIAIS E FLUIDEZ - PORTUGUÊS:
[TIPOGRAFIA]
- DIÁLOGOS: Usar travessão (—) para introduzir diálogos. Exemplo: — Olá — disse Maria.
- ASPAS: Usar aspas curvas " " para citações. Aspas simples ' ' para citações dentro de citações.
- PONTUAÇÃO: Vírgula e ponto fora das aspas, exceto se fizerem parte da citação.
- NÚMEROS: Escrever por extenso de um a nove, algarismos a partir de 10.

[FLUIDEZ E NATURALIDADE]
- FRASES: Máximo 40-45 palavras por frase. Dividir frases longas.
- GERÚNDIOS: Evitar excesso de gerúndios. Máximo um por frase.
- REPETIÇÕES: Não repetir a mesma palavra em frases consecutivas.
- VOZ PASSIVA: Preferir voz ativa: "foi visto por João" → "João viu".
- PRONOMES: Colocação pronominal correta (próclise, mesóclise, ênclise).
- NATURALIDADE: O texto deve soar natural, como se escrito originalmente em português.`,

  ca: `
NORMES EDITORIALS I FLUÏDESA - CATALÀ:
[TIPOGRAFIA]
- DIÀLEGS: Usar guió llarg (—) per introduir diàlegs. Exemple: —Hola —va dir Maria—. Com estàs?
- COMETES: Usar cometes baixes « » per a citacions. Cometes altes " " per a citacions dins de citacions.
- PUNTUACIÓ: Els signes d'interrogació i exclamació van NOMÉS al final (? !). MAI usar ¿ ni ¡ (no existeixen en català).
- NÚMEROS: Escriure amb lletres de l'u al nou, xifres del 10 endavant.
- ACCENT: Diferencia entre accent obert (è, ò) i tancat (é, ó). Atenció a la ela geminada (l·l).

[FLUÏDESA I NATURALITAT]
- FRASES: Màxim 40-45 paraules per frase. Dividir frases llargues.
- PRONOMS FEBLES: Usar correctament els pronoms febles (el, la, els, les, en, hi) amb les combinacions adequades.
- REPETICIONS: No repetir la mateixa paraula en frases consecutives.
- VEU ACTIVA: Preferir veu activa sobre passiva.
- CASTELLANISMES: Evitar castellanismes. Usar vocabulari català genuí: "escombraries" (no "basura"), "endavant" (no "adelante"), "de seguida" (no "enseguida").
- NATURALITAT: El text ha de sonar natural, com si fos escrit originalment en català per un parlant nadiu.
- PERÍFRASIS VERBALS: Usar correctament "anar + infinitiu" per al passat (va dir, van fer).`,
};

const AI_CRUTCH_WORDS: Record<string, string[]> = {
  es: [
    "de repente", "crucial", "fundamental", "no obstante", "sin embargo",
    "por consiguiente", "asimismo", "además", "enigmático", "palpable",
    "tangible", "visceral", "resonar", "desentrañar", "plétora", "miríada",
    "paradigma", "coyuntura", "sinergia", "inherente", "subyacente",
    "catalizador", "un sinfín de", "en pos de", "en aras de"
  ],
  en: [
    "suddenly", "shrouded", "unfold", "crucial", "pivotal", "amidst", "whilst",
    "endeavor", "plethora", "myriad", "utilize", "facilitate", "commence",
    "terminate", "subsequently", "aforementioned", "nevertheless", "furthermore",
    "enigmatic", "palpable", "tangible", "visceral", "resonate", "unravel",
    "delve", "tapestry", "beacon", "landscape", "nuanced", "intricate",
    "testament", "realm", "embark", "captivating"
  ],
  fr: [
    "soudain", "crucial", "essentiel", "néanmoins", "cependant", "toutefois",
    "ainsi", "par conséquent", "en effet", "d'ailleurs", "en outre", "de plus",
    "énigmatique", "palpable", "tangible", "viscéral", "résonner",
    "paradigme", "catalyseur", "inhérent", "sous-jacent", "plonger dans"
  ],
  de: [
    "plötzlich", "entscheidend", "wesentlich", "nichtsdestotrotz", "jedoch",
    "dennoch", "folglich", "darüber hinaus", "außerdem", "rätselhaft",
    "greifbar", "spürbar", "eindringlich", "Paradigma", "inhärent",
    "Katalysator", "zutiefst"
  ],
  it: [
    "improvvisamente", "cruciale", "fondamentale", "tuttavia", "nondimeno",
    "pertanto", "inoltre", "enigmatico", "palpabile", "tangibile", "viscerale",
    "paradigma", "catalizzatore", "intrinseco", "sottostante", "addentrarsi"
  ],
  pt: [
    "subitamente", "repentinamente", "crucial", "fundamental", "todavia",
    "contudo", "portanto", "além disso", "enigmático", "palpável", "tangível",
    "paradigma", "catalisador", "inerente", "subjacente", "adentrar-se"
  ],
  ca: [
    "de sobte", "crucial", "fonamental", "tanmateix", "no obstant això",
    "per tant", "a més a més", "enigmàtic", "palpable", "tangible",
    "paradigma", "catalitzador", "inherent", "subjacent"
  ],
};

const SYSTEM_PROMPT = `
You are an ELITE LITERARY ADAPTATION SPECIALIST — not a translator, but a RE-CREATOR of literary works. Your output must be PUBLICATION-READY, indistinguishable from a novel originally written by a native author in the target language.

═══════════════════════════════════════════════════════════════════
CORE PHILOSOPHY: LITERARY ADAPTATION (NOT TRANSLATION)
═══════════════════════════════════════════════════════════════════

🚨 CRITICAL DISTINCTION: You are NOT translating. You are RECREATING the work as if a native author had written it in the target language from scratch, while preserving the story, characters, and author's creative vision.

1. ADAPTATION OVER TRANSLATION
   - NEVER translate word-by-word or sentence-by-sentence.
   - REWRITE each sentence as a native speaker would naturally express it.
   - Idioms MUST be replaced with EQUIVALENT idioms in the target language, NOT translated literally.
     Example: "llovía a cántaros" → "it was raining cats and dogs" (EN) / "il pleuvait des cordes" (FR) — NOT "it was raining from pitchers"
   - Cultural references: adapt when the original is culture-specific, preserve when universal.
   - Reorder sentence structure to match the TARGET language's natural flow, NOT the source's word order.

2. NATIVE FLUENCY STANDARD
   - A native reader must NOT be able to tell this was adapted from another language.
   - ZERO traces of "translationese": no calques, no false friends, no borrowed syntax.
   - Proverbs, exclamations, interjections: use the target language's own repertoire.
   - Register and formality levels must match target language conventions (e.g., tú/usted in ES, tu/vous in FR, du/Sie in DE).

3. GENRE-APPROPRIATE VOICE
   - Thriller/Mystery: Terse, direct, visceral in the TARGET language's tradition
   - Romance: Emotionally rich using the TARGET language's romantic register
   - Historical Fiction: Period-appropriate vocabulary in the TARGET language, avoiding anachronisms
   - Literary Fiction: Elegant, precise — matching the literary tradition of the TARGET language
   - Fantasy/Sci-Fi: Consistent terminology adapted to TARGET language genre conventions

4. PROSE DYNAMICS
   - Sentence rhythm must feel natural in the TARGET language, not mirrored from the source.
   - ACTION scenes: short, punchy sentences adapted to the target language's rhythmic patterns.
   - REFLECTIVE scenes: flowing, contemplative prose as a native writer would construct it.
   - DIALOGUE: Characters must speak as real native speakers would — with natural contractions, colloquialisms, and speech patterns appropriate to their social class and personality.

5. SENSORY AND EMOTIONAL PRECISION
   - Sensory descriptions: use the most evocative, precise vocabulary available in the TARGET language.
   - Emotions: choose words that carry the exact emotional weight in the target culture.
   - Onomatopoeia: use the TARGET language's own sound words.

6. CHARACTER VOICE DIFFERENTIATION
   - Each character must SOUND different in the target language too.
   - A child speaks differently from an elder; a noble differently from a peasant.
   - Preserve speech patterns, verbal tics, and personality through the target language's own resources.

7. ANTI-AI FILTER (CRITICAL)
   - FORBIDDEN to use AI "crutch words" — generic, overused, lazy words that AI models default to.
   - Use SPECIFIC, VIVID, SURPRISING word choices that a human author would select.
   - Avoid formulaic sentence openings and transitions.

═══════════════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════════════════

1. Output MUST be ENTIRELY in the TARGET LANGUAGE. Source language text = FAILURE.
2. NEVER return original text unchanged.
3. NEVER omit, summarize, or shorten. The adaptation must be COMPLETE — same length or longer than the source.
4. PRESERVE paragraph breaks, scene divisions, and dialogue structure.
5. APPLY the typographical and punctuation conventions of the target language STRICTLY.
6. The result must be READY FOR DIRECT PUBLICATION — no editor should need to fix anything.

FORBIDDEN IN OUTPUT:
- Style guides, writing guides, checklists, tips
- Meta-commentary about style or techniques
- ANY instructional content about writing
- Sections titled "Literary Style Guide", "Checklist", etc.

OUTPUT FORMAT (JSON ONLY):
{
  "translated_text": "Complete adapted text in Markdown - MUST BE IN TARGET LANGUAGE - PUBLICATION READY",
  "source_language": "ISO code",
  "target_language": "ISO code", 
  "notes": "Brief notes on key adaptation decisions (idioms adapted, cultural references changed, register choices)"
}
`;

export class TranslatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Traductor",
      role: "translator",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 65536,
    });
  }

  private cleanTranslatedText(content: string): string {
    let cleaned = content.trim();
    
    // Strip markdown code block wrappers (```json ... ``` or ```markdown ... ```)
    const codeBlockMatch = cleaned.match(/^```(?:json|markdown|md)?\s*([\s\S]*?)```\s*$/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    
    // Also strip any remaining code fences that might be embedded
    cleaned = cleaned.replace(/```(?:json|markdown|md|text)?\n?/g, '').replace(/```\s*$/g, '');
    
    // If it's still JSON with translated_text field, extract it recursively
    if (cleaned.startsWith('{') && cleaned.includes('"translated_text"')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.translated_text) {
          cleaned = this.cleanTranslatedText(parsed.translated_text);
        }
      } catch {
        // Not valid JSON, try to extract translated_text using regex
        const match = cleaned.match(/"translated_text"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:source_|target_|notes)|\s*"\s*})/);
        if (match) {
          cleaned = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
      }
    }
    
    // Remove style guide contamination - but only if it leaves content
    const styleGuidePatterns = [
      /^#+ *(?:Literary Style Guide|Writing Guide|Style Guide|Guía de Estilo|Guía de Escritura)[^\n]*\n[\s\S]*?(?=^#+ *(?:CHAPTER|Chapter|CAPÍTULO|Capítulo|Prologue|Prólogo|Epilogue|Epílogo|CAPITOLO|Capitolo)\b|\n---\n)/gmi,
      /^###+ *(?:Checklist|Lista de verificación)[^\n]*\n[\s\S]*?(?=^#{1,2} *(?:CHAPTER|Chapter|CAPÍTULO|Capítulo|Prologue|Prólogo)\b|\n---\n)/gmi,
      /\n---\n[\s\S]*?(?:Style Guide|Guía de Estilo|Writing Guide)[\s\S]*?\n---\n/gi,
    ];
    
    for (const pattern of styleGuidePatterns) {
      const afterRemoval = cleaned.replace(pattern, '');
      // Only apply if it leaves substantial content
      if (afterRemoval.trim().length > 50) {
        cleaned = afterRemoval;
      }
    }
    
    // Remove orphaned JSON fields that might appear at the end - only at the very end
    cleaned = cleaned.replace(/,?\s*"(?:source_language|target_language|notes)"\s*:\s*"[^"]*"\s*}?\s*$/g, '');
    
    // Remove any remaining raw JSON artifacts at start/end only
    cleaned = cleaned.replace(/^\s*\{\s*"translated_text"\s*:\s*"/m, '');
    cleaned = cleaned.replace(/"\s*,?\s*"notes"\s*:\s*"[^"]*"\s*\}\s*$/m, '');
    
    return cleaned.trim();
  }

  async execute(input: TranslatorInput): Promise<AgentResponse & { result?: TranslatorResult }> {
    const sourceLangName = LANGUAGE_NAMES[input.sourceLanguage] || input.sourceLanguage;
    const targetLangName = LANGUAGE_NAMES[input.targetLanguage] || input.targetLanguage;
    const targetRules = LANGUAGE_EDITORIAL_RULES[input.targetLanguage] || "";
    const forbiddenWords = AI_CRUTCH_WORDS[input.targetLanguage] || [];

    const chapterInfo = input.chapterTitle 
      ? `\nCAPÍTULO: ${input.chapterNumber !== undefined ? input.chapterNumber : ""} - ${input.chapterTitle}`
      : "";

    const forbiddenSection = forbiddenWords.length > 0 
      ? `\n[ANTI-AI FILTER - FORBIDDEN WORDS IN ${targetLangName.toUpperCase()}]
The following words/phrases are BANNED. Find literary alternatives:
${forbiddenWords.map(w => `• "${w}"`).join("\n")}
`
      : "";

    const prompt = `
TASK: PROFESSIONAL LITERARY ADAPTATION from ${sourceLangName.toUpperCase()} to ${targetLangName.toUpperCase()}.
This is NOT a translation — it is a LITERARY RECREATION for direct publication.

CRITICAL: The output "translated_text" MUST BE WRITTEN ENTIRELY IN ${targetLangName.toUpperCase()}. 
DO NOT return the text in ${sourceLangName} — that would be a FAILURE.

═══════════════════════════════════════════════════════════════════
ADAPTATION MANDATE
═══════════════════════════════════════════════════════════════════
🚨 This text will be PUBLISHED AS-IS. No editor will review it after you.

• RECREATE, don't translate: rewrite each sentence as a NATIVE ${targetLangName} author would.
• ADAPT idioms to ${targetLangName} equivalents — NEVER translate them literally.
• REORDER syntax to match ${targetLangName}'s natural sentence structure.
• Dialogues must sound like REAL ${targetLangName} speakers — with natural contractions, colloquialisms, and register.
• Internal monologue must flow as a ${targetLangName}-speaking person actually thinks.
• Each character must have a DISTINCT voice adapted to ${targetLangName}'s resources.
• VARY sentence rhythm — action scenes: short, punchy; reflection: flowing, contemplative.
• Use the most EVOCATIVE, PRECISE vocabulary ${targetLangName} offers — not generic equivalents.
• The result must be INDISTINGUISHABLE from a novel originally written in ${targetLangName}.
${forbiddenSection}
${targetRules}
${chapterInfo}

═══════════════════════════════════════════════════════════════════
SOURCE TEXT (in ${sourceLangName} — TO BE ADAPTED TO ${targetLangName}):
═══════════════════════════════════════════════════════════════════

${input.content}

═══════════════════════════════════════════════════════════════════

FINAL INSTRUCTIONS:
1. ADAPT the complete text from ${sourceLangName} to ${targetLangName} — same length or longer
2. The "translated_text" field MUST contain text in ${targetLangName}, NOT in ${sourceLangName}
3. Preserve the story, characters, and author's creative vision while making it NATIVE ${targetLangName}
4. Apply the typographical and punctuation conventions of ${targetLangName} STRICTLY
5. AVOID banned AI crutch words — use literary alternatives
6. The result must be PUBLICATION-READY — no further editing needed
7. Return the result as valid JSON only

RESPOND WITH JSON ONLY, no additional text.
`;

    console.log(`[Translator] Starting translation from ${input.sourceLanguage} to ${input.targetLanguage}`);
    console.log(`[Translator] Content length: ${input.content.length} chars`);

    const response = await this.generateContent(prompt, input.projectId);

    if (response.error) {
      console.error("[Translator] AI generation error:", response.error);
      return {
        ...response,
        result: {
          translated_text: "",
          source_language: input.sourceLanguage,
          target_language: input.targetLanguage,
          notes: `Error: ${response.error}`,
        }
      };
    }

    try {
      let contentToParse = response.content;
      
      // Strip markdown code block wrapper if present (```json ... ```)
      const codeBlockMatch = contentToParse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        contentToParse = codeBlockMatch[1].trim();
        console.log(`[Translator] Stripped markdown code block from response`);
      }
      
      const result = repairJson(contentToParse) as TranslatorResult;
      // CRITICAL: Clean the translated text to remove any code artifacts
      const cleanedText = this.cleanTranslatedText(result.translated_text);
      console.log(`[Translator] Successfully parsed and cleaned translation result`);
      return { 
        ...response, 
        result: {
          ...result,
          translated_text: cleanedText,
        }
      };
    } catch (e) {
      console.error("[Translator] Failed to parse JSON response:", e);
    }

    // Fallback: clean the raw content before returning
    const cleanedFallback = this.cleanTranslatedText(response.content);
    console.log(`[Translator] Using cleaned fallback content`);
    
    return {
      ...response,
      result: {
      translated_text: cleanedFallback,
      source_language: input.sourceLanguage,
      target_language: input.targetLanguage,
      notes: "Respuesta no estructurada - contenido limpiado y devuelto",
      }
    };
  }
}
