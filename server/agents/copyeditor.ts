import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface CopyEditorInput {
  chapterContent: string;
  chapterNumber: number;
  chapterTitle: string;
  guiaEstilo?: string;
  targetLanguage?: string;
  // Sección "lexico_historico" del World Bible. Se usa para activar/desactivar
  // la corrección de anacronismos y para conocer la lista de términos
  // prohibidos específicos de la época declarada por el arquitecto.
  lexicoHistorico?: {
    epoca?: string;
    terminos_anacronicos_prohibidos?: string[];
    vocabulario_epoca_autorizado?: string[];
    registro_linguistico?: string;
    notas_voz_historica?: string;
  } | null;
}

export interface CopyEditorResult {
  texto_final: string;
  cambios_realizados: string;
  repeticiones_suavizadas?: string[];
  mejoras_fluidez?: string[];
  anacronismos_corregidos?: string[];
  cliches_ia_eliminados?: string[];
  idioma_detectado: string;
}

const LANGUAGE_EDITORIAL_RULES: Record<string, string> = {
  es: `
NORMAS EDITORIALES ESPAÑOL:
- DIÁLOGOS: Usar raya (—) para introducir diálogos. Ejemplo: —Hola —dijo María—. ¿Cómo estás?
- COMILLAS: Usar comillas angulares « » para citas textuales. Comillas inglesas " " solo para citas dentro de citas.
- PUNTUACIÓN: Los signos de interrogación y exclamación van al principio (¿?) y al final (?).
- NÚMEROS: Escribir con letras del uno al nueve, cifras del 10 en adelante.`,

  en: `
ENGLISH EDITORIAL STANDARDS:
- DIALOGUE: Use quotation marks for dialogue. Example: "Hello," said Mary. "How are you?"
- QUOTES: Use double quotes " " for dialogue and direct speech. Single quotes ' ' for quotes within quotes.
- PUNCTUATION: Periods and commas go inside quotation marks. Question marks and exclamation points go inside only if part of the quote.
- NUMBERS: Spell out one through nine, use numerals for 10 and above.
- CONTRACTIONS: Preserve natural contractions (don't, can't, won't) in dialogue.`,

  fr: `
NORMES ÉDITORIALES FRANÇAIS:
- DIALOGUES: Utiliser les guillemets français « » avec espaces insécables. Tiret cadratin (—) pour les incises.
- PONCTUATION: Espace insécable avant : ; ! ? et après « et avant ».
- NOMBRES: Écrire en lettres de un à neuf, chiffres à partir de 10.
- MAJUSCULES: Les noms de langues, nationalités s'écrivent en minuscules (français, anglais).`,

  de: `
DEUTSCHE REDAKTIONSSTANDARDS:
- DIALOGE: Anführungszeichen „..." oder »...« verwenden. Beispiel: „Hallo", sagte Maria.
- ZITATE: Doppelte Anführungszeichen für direkte Rede. Einfache ‚...' für Zitate im Zitat.
- KOMPOSITA: Bindestriche bei zusammengesetzten Wörtern korrekt verwenden.
- ZAHLEN: Eins bis neun ausschreiben, ab 10 Ziffern verwenden.`,

  it: `
NORME EDITORIALI ITALIANO (OBBLIGATORIO):
- DIALOGHI: Usare ESCLUSIVAMENTE il trattino lungo (—) per introdurre i dialoghi. MAI usare virgolette di nessun tipo ("", «», <<>>).
  Esempio corretto: —Ciao —disse Maria—. Come stai?
  Esempio SBAGLIATO: «Ciao» disse Maria. / "Ciao" disse Maria. / <<Ciao>> disse Maria.
- INCISI NEL DIALOGO: Il trattino lungo chiude l'inciso e ne apre un altro dopo l'attribuzione.
  Esempio: —Non so —rispose lui scrollando le spalle—. Forse domani.
- PUNTEGGIATURA: Il punto finale va DOPO il trattino di chiusura inciso, non dentro il dialogo.
- NUMERI: Scrivere in lettere da uno a nove, cifre da 10 in poi.
- ACCENTI: Attenzione agli accenti gravi (è, à) e acuti (é, perché).
- CONSISTENZA: Tutto il testo DEVE usare lo stesso sistema. Se trovi "«»", '""', o '<<>>', convertili TUTTI a trattini lunghi (—).`,

  pt: `
NORMAS EDITORIAIS PORTUGUÊS:
- DIÁLOGOS: Usar travessão (—) para introduzir diálogos. Exemplo: — Olá — disse Maria.
- ASPAS: Usar aspas curvas " " para citações. Aspas simples ' ' para citações dentro de citações.
- PONTUAÇÃO: Vírgula e ponto fora das aspas, exceto se fizerem parte da citação.
- NÚMEROS: Escrever por extenso de um a nove, algarismos a partir de 10.`,

  ca: `
NORMES EDITORIALS CATALÀ:
- DIÀLEGS: Usar guió llarg (—) per introduir diàlegs. Exemple: —Hola —va dir Maria—. Com estàs?
- COMETES: Usar cometes baixes « » per a citacions. Cometes altes " " per a citacions dins de citacions.
- PUNTUACIÓ: Els signes d'interrogació i exclamació van al principi (¿?) i al final (?).
- NÚMEROS: Escriure amb lletres de l'u al nou, xifres del 10 endavant.`,
};

const LANGUAGE_FLUENCY_RULES: Record<string, string> = {
  es: `
REGLAS DE FLUIDEZ ESPAÑOL:
- FRASES LARGAS: Dividir oraciones de más de 50 palabras. Usar punto y seguido o punto y coma.
- PRONOMBRES ARCAICOS: Evitar "él" al inicio de oración cuando el sujeto está claro. Preferir sujeto implícito.
- REPETICIONES: "su... su... su..." en secuencia suena mecánico. Variar con "el/la", posesivos alternativos o reformular.
- GERUNDIOS ENCADENADOS: Evitar más de 2 gerundios seguidos ("estando haciendo pensando").
- PASIVAS: Preferir voz activa cuando sea natural. "El libro fue escrito por María" → "María escribió el libro".
- LEÍSMO/LAÍSMO: Mantener uso correcto de le/la/lo según la región del texto.`,

  en: `
ENGLISH FLUENCY RULES:
- LONG SENTENCES: Break sentences over 40 words. Use periods or semicolons for natural pauses.
- PASSIVE VOICE: Prefer active voice. "The ball was thrown by John" → "John threw the ball".
- REPETITIONS: Avoid repeating the same word within 3 sentences. Use synonyms or pronouns.
- SENTENCE VARIETY: Mix short punchy sentences with longer ones for rhythm.
- AWKWARD CONSTRUCTIONS: Avoid "There is/There are" as sentence starters when possible.
- ADVERB PLACEMENT: Keep adverbs close to the verbs they modify.`,

  fr: `
RÈGLES DE FLUIDITÉ FRANÇAIS:
- PHRASES LONGUES: Diviser les phrases de plus de 50 mots. Utiliser le point-virgule ou les deux-points.
- PRONOMS FORMELS: Éviter "il/elle" au début de phrase si le sujet est clair du contexte.
- RÉPÉTITIONS: Varier le vocabulaire. "Il a dit... Il a fait... Il a pensé..." → utiliser des synonymes.
- PASSÉ SIMPLE vs PASSÉ COMPOSÉ: Maintenir la cohérence temporelle dans le récit.
- SUBJONCTIF: S'assurer de l'utilisation correcte du subjonctif après "que".
- LIAISONS: Veiller à la fluidité des liaisons entre les phrases.`,

  de: `
DEUTSCHE FLÜSSIGKEITSREGELN:
- LANGE SÄTZE: Sätze über 40 Wörter aufteilen. Punkt oder Semikolon für natürliche Pausen verwenden.
- PASSIV: Aktiv bevorzugen. "Das Buch wurde von Maria geschrieben" → "Maria schrieb das Buch".
- WORTSTELLUNG: Verb an zweiter Stelle im Hauptsatz beachten.
- WIEDERHOLUNGEN: Dasselbe Wort nicht innerhalb von 3 Sätzen wiederholen.
- KOMPOSITA: Lange zusammengesetzte Wörter wenn möglich aufteilen oder umschreiben.
- KONJUNKTIV: Korrekten Konjunktiv in indirekter Rede verwenden.`,

  it: `
REGOLE DI FLUIDITÀ ITALIANO:
- FRASI LUNGHE: Dividere le frasi oltre le 50 parole. Usare punto e virgola o due punti.
- PRONOMI ARCAICI: "Egli/Ella/Esso" sono troppo formali. Preferire "lui/lei" o il soggetto implicito.
- RIPETIZIONI RAVVICINATE: "archiviate in archivi", "sua... sua... sua..." suonano meccaniche. Variare il lessico.
- GERUNDI CONCATENATI: Evitare più di 2 gerundi consecutivi.
- PASSIVO: Preferire la forma attiva quando naturale.
- COERENZA TEMPORALE: Mantenere coerenza tra passato remoto, imperfetto e presente.
- INCISI: Non abusare di incisi troppo lunghi che spezzano il flusso narrativo.`,

  pt: `
REGRAS DE FLUIDEZ PORTUGUÊS:
- FRASES LONGAS: Dividir frases com mais de 50 palavras. Usar ponto e vírgula ou dois pontos.
- PRONOMES FORMAIS: Evitar "ele/ela" no início da frase quando o sujeito está claro.
- REPETIÇÕES: Variar o vocabulário. Evitar "seu... seu... seu..." em sequência.
- GERÚNDIOS: Evitar mais de 2 gerúndios consecutivos.
- VOZ PASSIVA: Preferir voz ativa quando natural.
- COLOCAÇÃO PRONOMINAL: Manter a próclise/mesóclise/ênclise correta.`,

  ca: `
REGLES DE FLUÏDESA CATALÀ:
- FRASES LLARGUES: Dividir oracions de més de 50 paraules. Usar punt i coma o dos punts.
- PRONOMS FEBLES: Col·locar correctament els pronoms febles (em, et, es, ens, us).
- REPETICIONS: Variar el vocabulari. Evitar "seu... seu... seu..." en seqüència.
- GERUNDIS: Evitar més de 2 gerundis consecutius.
- VEU PASSIVA: Preferir la veu activa quan sigui natural.
- ARTICLE PERSONAL: Usar "en/na" correctament amb noms propis.`,
};

const SYSTEM_PROMPT = `
Eres un editor literario senior con 20 años de experiencia en narrativa de ficción. Tu misión es transformar el borrador, eliminando cualquier rastro de escritura artificial o robótica, y dotándolo de una voz literaria profunda y orgánica.

TU OBJETIVO: Llevar el manuscrito a la PERFECCIÓN EDITORIAL (10/10).
Cada corrección que hagas debe eliminar COMPLETAMENTE el problema.
El resultado final NO debe tener ningún error editorial, estilístico ni de fluidez.

REGLA FUNDAMENTAL - NO TRADUCIR:
⚠️ NUNCA traduzcas el texto. Mantén SIEMPRE el idioma original del manuscrito. Tu trabajo es CORREGIR, HUMANIZAR y MEJORAR LA FLUIDEZ, no traducir.

═══════════════════════════════════════════════════════════════════
DIRECTRICES MAESTRAS DE HUMANIZACIÓN LITERARIA (PRIORIDAD MÁXIMA)
═══════════════════════════════════════════════════════════════════

1. VARIABILIDAD DE RITMO (SINTAXIS):
   - Rompe la monotonía mezclando oraciones largas y subordinadas con frases cortas y contundentes.
   - Evita que más de dos frases seguidas empiecen con el mismo sujeto o estructura.
   - Alterna construcciones para crear música en la prosa.

2. INMERSIÓN SENSORIAL EQUILIBRADA:
   - Sustituye adjetivos genéricos (misterioso, increíble, aterrador, fascinante) por detalles físicos específicos.
   - Si el personaje tiene miedo, NO digas "tenía miedo"; describe cómo se le pega la camisa de sudor a la espalda o el sabor a bilis en su garganta.
   - ⚠️ DETECTA Y ELIMINA REITERACIONES ATMOSFÉRICAS: Si el texto describe la misma atmósfera (calor, oscuridad, tensión, silencio, olores) varias veces en la misma escena, ELIMINA las repeticiones y deja solo la primera y más efectiva.
   - La atmósfera se establece UNA VEZ. Repetirla con sinónimos es igual de redundante.
   - Si hay más de un detalle sensorial por cada 3-4 párrafos en escenas de diálogo/acción, REDUCE al más impactante.

3. SUBTEXTO Y PSICOLOGÍA:
   - Los humanos rara vez dicen o piensan exactamente lo que sienten.
   - Añade capas de contradicción interna: que el personaje dude, se mienta a sí mismo.
   - Incluye detalles irrelevantes pero realistas que nota debido al estrés o la emoción.
   - La mente humana divaga; la prosa debe reflejarlo sutilmente.

4. ELIMINACIÓN DE CLICHÉS DE IA (PROHIBIDO USAR):
   - Palabras vetadas: "crucial", "enigmático", "fascinante", "un torbellino de emociones", "el destino de...", "desenterrar secretos", "repentinamente", "de repente", "sintió una oleada de".
   - Si una frase suena a "frase hecha", cámbiala por una observación original.
   - Los clichés delatan escritura artificial; cada imagen debe ser única.

5. SHOW, DON'T TELL (MUESTRA, NO CUENTES):
   - En lugar de narrar los hechos de forma externa, fíltralo todo a través de la percepción subjetiva del personaje.
   - La narración debe sentirse "sucia" y humana, no una crónica aséptica de eventos.
   - El lector debe inferir las emociones, no que se las digan.

═══════════════════════════════════════════════════════════════════
REGLAS DE INTERVENCIÓN TÉCNICA
═══════════════════════════════════════════════════════════════════

6. INTEGRIDAD TOTAL: Prohibido resumir o condensar. El volumen de palabras debe mantenerse o aumentar ligeramente.
6.b NARRATIVA DIEGÉTICA — META-REFERENCIAS PROHIBIDAS: La novela NO sabe que es una novela. ELIMINA o REESCRIBE cualquier mención dentro de la prosa a "el Capítulo X", "el cap. N", "el prólogo", "el epílogo", "la primera parte", "la segunda parte", "este capítulo", "el capítulo anterior", "más adelante en el libro", "en páginas anteriores" o cualquier referencia a la estructura del manuscrito. Si el texto evoca un suceso pasado y lo etiqueta con un número de capítulo, sustituye esa etiqueta por una referencia diegética interna a la ficción (lugar, personaje, fecha, suceso concreto: "aquella noche en la cripta", "lo que descubrió en Plasencia", "la última conversación con Vasco"). Esta corrección NO se considera traducción ni alteración de sentido: es restauración de la inmersión narrativa.
7. PRESERVAR IDIOMA: Mantén el texto en su idioma original. NO traduzcas bajo ninguna circunstancia.
8. PRESERVAR SENTIDO: El significado y la trama deben mantenerse intactos.
9. NORMAS TIPOGRÁFICAS: Aplica las normas editoriales del idioma detectado (diálogos, comillas, puntuación).
10. MAQUETADO: Devuelve el texto en Markdown limpio. Título en H1 (#).

PULIDO DE REPETICIONES (CRÍTICO):
11. DETECCIÓN DE FRASES REPETIDAS: Identifica expresiones, metáforas o descripciones que aparezcan más de una vez.
12. SUAVIZADO LÉXICO: Reemplaza instancias repetidas con sinónimos o reformulaciones EN EL MISMO IDIOMA.
13. SENSACIONES VARIADAS: Las descripciones de emociones deben ser diversas y específicas.

MEJORA DE FLUIDEZ NATURAL:
14. FRASES LARGAS: Divide oraciones de más de 50 palabras usando puntuación adecuada.
15. PRONOMBRES ARCAICOS: Elimina pronombres excesivamente formales.
16. CONSTRUCCIONES NATURALES: El texto debe sonar como lo escribiría un hablante nativo culto.
17. EVITAR REDUNDANCIAS: "archivados en archivos", "dijo diciendo" son errores a corregir.

═══════════════════════════════════════════════════════════════════
CORRECCIÓN DE ANACRONISMOS (BASADA EN LA ÉPOCA DECLARADA EN EL WORLD BIBLE)
═══════════════════════════════════════════════════════════════════

PASO 0 — LEE LA SECCIÓN "LÉXICO HISTÓRICO" QUE SE TE PASA EN EL CONTEXTO.
La época declarada por el arquitecto es la única referencia válida. NO uses
listas genéricas de tu propio criterio.

REGLAS DE ACTIVACIÓN:
- Si "epoca" comienza con "Contemporánea" / "Actualidad" / "Presente" o describe
  los últimos 30 años → NO TOQUES NADA por anacronismos. Devuelve la lista
  "anacronismos_corregidos" como [] y no hagas sustituciones léxicas de época.
- Si "epoca" describe un período histórico, futuro alternativo o mundo secundario
  con tecnología equivalente → ACTIVA la corrección con las reglas siguientes.
- Si "lexico_historico" no se te pasa o "epoca" está vacía → NO hagas
  correcciones de anacronismos (no tienes referencia segura). Limítate a las
  correcciones de estilo/fluidez.

CUANDO LA CORRECCIÓN ESTÁ ACTIVA:

18. TÉRMINOS PROHIBIDOS DECLARADOS: Si encuentras en el capítulo cualquiera
    de los términos de "terminos_anacronicos_prohibidos", sustitúyelos por la
    alternativa más cercana del "vocabulario_epoca_autorizado" o por una
    perífrasis natural de época. Documenta cada sustitución en
    "anacronismos_corregidos".

19. ANACRONISMOS INEQUÍVOCOS NO LISTADOS: Corrige también términos modernos
    obvios que el WB no haya listado pero que sean claramente posteriores a la
    época (ej: "ordenador" en una novela del s.XIX). Aplica solo cuando el
    anacronismo sea INDISCUTIBLE para esa época concreta.

20. NO TOQUES PALABRAS DUDOSAS: ante la duda, NO sustituyas. Mejor preservar
    una palabra cuestionable que introducir una corrección que rompa el sentido.
    Términos como "minuto", "reloj", "carbono" pueden ser válidos según la época;
    consúltalo con "epoca" antes de actuar.

21. NARRADOR vs DIÁLOGO:
    - En diálogos: rigor máximo. Los personajes solo hablan con su léxico.
    - En narración: si "registro_linguistico" o "notas_voz_historica" del WB
      sugieren un narrador moderno o voz contemporánea, mantén su léxico
      moderno cuando NO atribuya conocimiento moderno al personaje.

22. EXCEPCIÓN POR DISEÑO: si el WB declara explícitamente anacronismo
    deliberado (steampunk, ucronía, viaje en el tiempo, narrador omnisciente
    moderno), respeta esa decisión y NO corrijas.

SALIDA REQUERIDA (JSON):
{
  "texto_final": "El contenido completo del capítulo maquetado en Markdown (EN EL IDIOMA ORIGINAL)",
  "cambios_realizados": "Breve resumen de los ajustes técnicos hechos",
  "repeticiones_suavizadas": ["Lista de frases que fueron reformuladas para evitar repetición"],
  "mejoras_fluidez": ["Lista de mejoras de fluidez aplicadas (frases divididas, pronombres corregidos, etc.)"],
  "anacronismos_corregidos": ["Lista de anacronismos detectados y cómo se corrigieron (solo si aplica a ficción histórica)"],
  "cliches_ia_eliminados": ["Lista de clichés de IA sustituidos por expresiones originales"],
  "idioma_detectado": "código ISO del idioma (es, en, fr, de, it, pt, ca)"
}
`;

export class CopyEditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Estilista",
      role: "copyeditor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      // Bajado de 8192 → 4096: pasa de reasoning_effort="max" a "high".
      // El umbral en base-agent.ts es >=8192 → "max". El Estilista solo pule
      // (comas, repeticiones, ritmo, ortotipografía) — pensar exhaustivamente
      // para correcciones mecánicas era desperdicio. Ahorra 3-5 min/cap garantizados.
      thinkingBudget: 4096,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: CopyEditorInput): Promise<AgentResponse & { result?: CopyEditorResult }> {
    const styleGuideSection = input.guiaEstilo 
      ? `\n    GUÍA DE ESTILO DEL AUTOR:\n    ${input.guiaEstilo}\n    \n    Respeta la voz y estilo definidos en la guía mientras aplicas las correcciones técnicas.\n`
      : "";

    const detectedLang = input.targetLanguage || "es";
    const languageRules = LANGUAGE_EDITORIAL_RULES[detectedLang] || LANGUAGE_EDITORIAL_RULES["en"] || "";
    const fluencyRules = LANGUAGE_FLUENCY_RULES[detectedLang] || LANGUAGE_FLUENCY_RULES["en"] || "";

    // Bloque de léxico histórico: solo se incluye si el arquitecto declaró
    // una época. Si está vacío o ausente, el copyeditor sabe (por las reglas
    // del prompt) que no debe tocar nada por anacronismos.
    let lexicoSection = "";
    const lh = input.lexicoHistorico;
    if (lh && (lh.epoca || (lh.terminos_anacronicos_prohibidos && lh.terminos_anacronicos_prohibidos.length > 0))) {
      const epoca = lh.epoca?.trim() || "(no declarada)";
      const prohibidos = lh.terminos_anacronicos_prohibidos || [];
      const autorizados = lh.vocabulario_epoca_autorizado || [];
      const registro = lh.registro_linguistico?.trim() || "";
      const notas = lh.notas_voz_historica?.trim() || "";

      lexicoSection = `
    ═══════════════════════════════════════════════════════════════════
    LÉXICO HISTÓRICO DEL PROYECTO (FUENTE ÚNICA DE VERDAD PARA ANACRONISMOS)
    ═══════════════════════════════════════════════════════════════════
    ÉPOCA DECLARADA: ${epoca}
    ${prohibidos.length > 0 ? `\n    TÉRMINOS ANACRÓNICOS PROHIBIDOS (sustituir si aparecen):\n    ${prohibidos.map(t => `- ${t}`).join("\n    ")}` : ""}
    ${autorizados.length > 0 ? `\n    VOCABULARIO DE ÉPOCA AUTORIZADO (preferir como sustituto):\n    ${autorizados.slice(0, 30).join(", ")}` : ""}
    ${registro ? `\n    REGISTRO LINGÜÍSTICO: ${registro}` : ""}
    ${notas ? `\n    NOTAS DE VOZ HISTÓRICA: ${notas}` : ""}

    Aplica las reglas de "CORRECCIÓN DE ANACRONISMOS" del system prompt usando
    EXCLUSIVAMENTE los datos de arriba. Si la época indica "Contemporánea" /
    "Actualidad" / los últimos 30 años → NO toques nada por anacronismos.
    ═══════════════════════════════════════════════════════════════════
`;
    }

    const prompt = `
    ⚠️ INSTRUCCIÓN CRÍTICA: NO TRADUCIR. Mantén el texto en su idioma original.
    
    IDIOMA DETECTADO DEL MANUSCRITO: ${detectedLang.toUpperCase()}
    
    ${languageRules}
    
    ${fluencyRules}
    ${lexicoSection}
    Por favor, toma el siguiente texto y aplícale el protocolo de Corrección de Élite, Maquetado para Ebook y MEJORA DE FLUIDEZ NATURAL.
    
    IMPORTANTE: 
    - El texto debe permanecer en ${detectedLang.toUpperCase()}. NO lo traduzcas a español ni a ningún otro idioma.
    - Mejora la fluidez para que suene NATURAL en ${detectedLang.toUpperCase()}, como lo escribiría un autor nativo.
    - MANTÉN EL SENTIDO Y LA EXTENSIÓN del texto original.
    ${styleGuideSection}
    CAPÍTULO ${input.chapterNumber}: ${input.chapterTitle}
    
    ${input.chapterContent}
    
    Asegúrate de que:
    - Apliques las NORMAS EDITORIALES del idioma ${detectedLang.toUpperCase()} (ver arriba)
    - Apliques las REGLAS DE FLUIDEZ del idioma ${detectedLang.toUpperCase()} (ver arriba)
    - El formato Markdown sea impecable
    - El título esté formateado correctamente
    - No omitas ninguna escena ni reduzcas el contenido
    - Las frases largas (+50 palabras) se dividan correctamente
    - Los pronombres arcaicos se modernicen
    - El texto suene natural para un hablante nativo
    - ⚠️ NO TRADUZCAS el texto. Mantén el idioma original.
    
    Responde ÚNICAMENTE con el JSON estructurado.
    `;

    const response = await this.generateContent(prompt);
    
    try {
      const result = repairJson(response.content) as CopyEditorResult;
      return { ...response, result };
    } catch (e) {
      console.error("[CopyEditor] Failed to parse JSON response");
    }

    return { 
      ...response, 
      result: { 
      texto_final: `# Capítulo ${input.chapterNumber}: ${input.chapterTitle}\n\n${input.chapterContent}`,
      cambios_realizados: "Sin cambios adicionales",
      idioma_detectado: detectedLang
      } 
    };
  }
}
