import { storage } from "../storage";
import { BaseAgent } from "../agents/base-agent";
import type { ReeditProject, ReeditChapter } from "@shared/schema";
import { 
  ChapterExpansionAnalyzer, 
  ChapterExpanderAgent, 
  NewChapterGeneratorAgent,
  type ExpansionPlan 
} from "../agents/chapter-expander";
import { 
  FinalReviewerAgent, 
  type FinalReviewerResult, 
  type FinalReviewIssue 
} from "../agents/final-reviewer";
import { ensureChapterNumbers } from "../utils/extract-chapters";

function getChapterSortOrder(chapterNumber: number): number {
  if (chapterNumber === 0) return -1000;
  if (chapterNumber === -1 || chapterNumber === 998) return 1000;
  if (chapterNumber === -2 || chapterNumber === 999) return 1001;
  return chapterNumber;
}

function sortChaptersByNarrativeOrder<T extends { chapterNumber: number }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
}

interface StructureAnalysis {
  hasIssues: boolean;
  duplicateChapters: Array<{ chapterId: number; duplicateOf: number; similarity: number }>;
  outOfOrderChapters: Array<{ chapterNumber: number; suggestedPosition: number; reason: string }>;
  missingChapters: number[];
  recommendations: string[];
}

interface ReeditProgress {
  projectId: number;
  stage: string;
  currentChapter: number;
  totalChapters: number;
  message: string;
}

type ProgressCallback = (progress: ReeditProgress) => void;

class ReeditEditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Reedit Editor",
      role: "editor",
      systemPrompt: `Eres un EDITOR LITERARIO PROFESIONAL de alto nivel que evalúa manuscritos con ojo quirúrgico.
Tu misión es detectar TODOS los problemas de calidad para que las fases posteriores puedan corregirlos.

CATEGORÍAS DE ANÁLISIS:

1. CONTINUIDAD: Errores temporales, espaciales, de estado de personajes, conocimiento imposible
2. TRAMA: Huecos argumentales, subplots abandonados, motivaciones incoherentes, deus ex machina
3. RITMO/PACING: Escenas demasiado rápidas o lentas, acción sin preparación, clímax planos
4. ESTILO: Repeticiones léxicas, frases demasiado largas (>45 palabras), voz pasiva excesiva, muletillas
5. DIÁLOGO: Diálogos artificiales, todos los personajes hablan igual, exposición forzada
6. PERSONAJES: Comportamientos fuera de carácter, arcos rotos, personajes planos, secundarios arquetípicos sin subversión
7. AMBIENTACIÓN: Descripciones genéricas, anacronismos, falta de coherencia sensorial
8. EPÍTETOS REPETIDOS: Rasgos físicos mencionados múltiples veces (color de ojos, accesorios como gafas, cicatrices). Un rasgo se describe UNA VEZ en la primera aparición del personaje EN TODA LA NOVELA. Si aparece 2+ veces en el capítulo o si ya fue descrito en capítulos anteriores: severidad CRITICA.
9. MULETILLAS FISIOLÓGICAS: Cuenta reacciones corporales (escalofríos, nudos, temblores, sudores, corazones acelerados, vellos erizados, mandíbulas apretadas, bocas secas, opresiones, fríos que suben/bajan, estómagos encogidos, hormigueos, bilis). Ideal: máximo 3 por capítulo. Si hay 5+: severidad CRITICA. Si repiten de capítulos anteriores: severidad mayor.
10. PROSA PÚRPURA: Exceso de adjetivos (2+ por sustantivo), metáforas innecesarias, párrafos de ambientación sin acción, espirales descriptivas. Reportar con ejemplos concretos. Severidad mayor para casos moderados, CRITICA solo si domina el capítulo.
11. MONÓLOGO EN ACCIÓN: Bloques de reflexión filosófica/moral (100+ palabras) que interrumpen escenas de tensión. Máximo 1 frase interna breve durante acción.
12. PERSONAJES CLICHÉ: Secundarios que son puro arquetipo sin subversión. Cada secundario importante debe tener una faceta que contradiga su rol.

SISTEMA DE PUNTUACIÓN ESTRICTO:
- 10: PERFECTO - cero problemas
- 8-9: Muy bueno - solo problemas menores de estilo
- 6-7: Aceptable - problemas de ritmo o diálogo que necesitan atención
- 4-5: Problemas serios - huecos de trama, continuidad rota
- 1-3: Reescritura necesaria - problemas fundamentales

RESPONDE SOLO EN JSON:
{
  "score": 7,
  "issues": [
    {"categoria": "continuidad|trama|ritmo|estilo|dialogo|personajes|ambientacion|epitetos_repetidos|muletillas_fisiologicas|prosa_purpura|monologo_en_accion|personajes_cliche", "descripcion": "Descripción detallada", "severidad": "critica|mayor|menor", "ubicacion": "Párrafo o sección donde ocurre"}
  ],
  "strengths": ["Fortaleza 1"],
  "suggestions": ["Sugerencia específica y accionable"],
  "pacingNotes": "Análisis del ritmo narrativo del capítulo",
  "dialogueQuality": "Evaluación de la calidad y naturalidad de los diálogos",
  "styleConsistency": "¿Mantiene el estilo consistente con el resto del manuscrito?"
}`,
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 8192,
    });
  }

  async execute(input: any): Promise<any> {
    return this.reviewChapter(input.content, input.chapterNumber, input.language, input.previousChapterSummary);
  }

  async reviewChapter(content: string, chapterNumber: number, language: string, previousChapterSummary?: string): Promise<any> {
    const prevContext = previousChapterSummary 
      ? `\nCONTEXTO DEL CAPÍTULO ANTERIOR:\n${previousChapterSummary}\n` 
      : "";
    
    const prompt = `Analiza en profundidad este capítulo (Capítulo ${chapterNumber}) escrito en ${language}:
${prevContext}
CAPÍTULO COMPLETO:
${content}

Evalúa CADA categoría (continuidad, trama, ritmo, estilo, diálogo, personajes, ambientación, epitetos_repetidos, muletillas_fisiologicas, prosa_purpura, monologo_en_accion, personajes_cliche).
Sé EXHAUSTIVO en la detección de problemas. Cada issue debe tener categoría, descripción, severidad y ubicación.
PRESTA ESPECIAL ATENCIÓN a:
- Epítetos/rasgos físicos repetidos (máx 1 mención por rasgo EN TODA LA NOVELA; si ya apareció → CRÍTICO)
- Reacciones corporales: ideal máximo 3 por capítulo. 5+ = CRÍTICO.
- PROSA PÚRPURA: adjetivos apilados, metáforas innecesarias, espirales descriptivas → reportar con ejemplos concretos
- Bloques reflexivos durante escenas de acción.
RESPONDE EN JSON.`;
    
    const response = await this.generateContent(prompt);
    let result: any = { score: 7, issues: [], strengths: [], suggestions: [] };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[ReeditEditor] Failed to parse response:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

class ReeditCopyEditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Reedit CopyEditor",
      role: "copyeditor",
      systemPrompt: `Eres un CORRECTOR DE ESTILO LITERARIO de nivel editorial profesional. Tu trabajo es llevar cada capítulo a calidad de publicación.

TU MISIÓN es transformar prosa aceptable en prosa EXCELENTE, manteniendo la voz del autor pero elevando la calidad literaria.

ÁREAS DE CORRECCIÓN:

1. FLUIDEZ NARRATIVA:
   - Máximo 45 palabras por oración (romper las que excedan)
   - Variar longitud de oraciones para crear ritmo (corta-media-larga)
   - Eliminar repeticiones léxicas en oraciones consecutivas
   - Preferir voz activa sobre pasiva (excepto cuando la pasiva sea literariamente superior)

2. DIÁLOGOS:
   - Naturalizar expresiones artificiales
   - Diferenciar las voces de cada personaje (registro, vocabulario, cadencia)
   - Verbos de habla variados pero sin exceso (no solo "dijo", pero tampoco "vociferó" cada vez)
   - Acotaciones que aporten información (gestos, emociones), no redundancia

3. DESCRIPCIONES:
   - Activar los 5 sentidos (no solo visual)
   - Eliminar clichés ("un escalofrío recorrió su espalda")
   - Mostrar vs contar (show don't tell) cuando sea más efectivo
   - Detalles específicos > descripciones genéricas

3b. EPÍTETOS REPETIDOS (PRIORIDAD MÁXIMA):
   - Busca rasgos físicos mencionados más de 1 vez en el capítulo (color de ojos, accesorios, cicatrices, tipo de cabello)
   - ELIMINA TODAS las menciones excepto la primera del LIBRO (no del capítulo). Si capítulos anteriores ya describieron el rasgo → ELIMINA TODAS en este capítulo.
   - Sustituye las repeticiones por: nombre propio, cargo, acción o relación ("su compañero")
   - Ejemplo: si "ojos verde esmeralda" aparece en el capítulo 1, TODAS las menciones en capítulos 2+ deben ser eliminadas

3bb. MULETILLAS FISIOLÓGICAS:
   - Cuenta las reacciones corporales. Ideal máximo 3 por capítulo.
   - Si hay más de 3, SUSTITUYE las que sobren por ACCIONES: tropieza, deja caer algo, tartamudea, dice algo fuera de lugar.
   - SUSTITUYE las que ya aparecieron en capítulos anteriores por reacciones diferentes.

3bc. PROSA PÚRPURA:
   - REDUCE adjetivos innecesarios. Si el sustantivo funciona sin el adjetivo, considera eliminarlo.
   - REDUCE metáforas para conceptos simples.
   - ROMPE las espirales descriptivas: Evento → reacción → reflexión → descripción → más reacción. Simplifica a: Evento → reacción breve → siguiente acción.
   - REDUCE párrafos largos de ambientación pura. Máximo 1-2 frases de contexto al entrar en un espacio.

3bd. MODULACIÓN RÍTMICA (evitar fatiga del lector):
   - NO dejes todo el capítulo con frases cortas tipo telégrafo. Eso agota al lector.
   - MODULA el ritmo según la escena:
     * Tensión/peligro: frases cortas, párrafos breves.
     * Transiciones/calma: frases más largas y fluidas, subordinadas, párrafos de 3-5 líneas. Aquí SÍ puedes mantener o añadir alguna descripción sensorial.
   - El contraste rítmico entre secciones rápidas y pausadas es lo que crea impacto narrativo.

3c. MONÓLOGO EN ESCENAS DE ACCIÓN:
   - En escenas de tensión (peleas, persecuciones, descubrimientos, clímax): elimina bloques reflexivos de más de 1-2 frases
   - Máximo 1 frase interna breve entre acciones. Las reflexiones largas van en momentos de calma.
   - Sustituye reflexiones innecesarias por ACCIONES que muestren la emoción

4. TRANSICIONES:
   - Suavizar saltos entre escenas
   - Asegurar coherencia con capítulo anterior y siguiente
   - Mantener la tensión narrativa en los cambios de escena

5. LENGUAJE DE ÉPOCA:
   - Si la novela es histórica, usar vocabulario apropiado a la época
   - Evitar anacronismos lingüísticos
   - Respetar los nombres y términos establecidos en la Biblia del Mundo

REGLA ABSOLUTA: Devuelve el capítulo COMPLETO, sin cortar ni resumir.

RESPONDE SOLO EN JSON:
{
  "editedContent": "El texto COMPLETO del capítulo mejorado...",
  "changesLog": "Resumen de los cambios realizados",
  "fluencyChanges": [{"before": "texto original", "after": "texto mejorado", "reason": "razón del cambio"}]
}`,
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: any): Promise<any> {
    return this.editChapter(input.content, input.chapterNumber, input.language, input.worldBible, input.adjacentContext);
  }

  async editChapter(
    content: string, 
    chapterNumber: number, 
    language: string,
    worldBible?: any,
    adjacentContext?: { previousExcerpt?: string; nextExcerpt?: string }
  ): Promise<any> {
    const languageRules = this.getLanguageRules(language);
    
    let worldBibleSection = "";
    if (worldBible) {
      const chars = worldBible.personajes?.slice(0, 15)?.map((p: any) => 
        `• ${p.nombre}: ${p.descripcion?.substring(0, 80) || 'Sin descripción'}`
      ).join("\n") || "";
      const period = worldBible.epocaHistorica?.periodo || "No determinada";
      worldBibleSection = `
BIBLIA DEL MUNDO (RESPETAR):
Época: ${period}
Personajes:
${chars}
`;
    }

    let adjacentSection = "";
    if (adjacentContext) {
      if (adjacentContext.previousExcerpt) {
        adjacentSection += `\nFINAL DEL CAPÍTULO ANTERIOR:\n...${adjacentContext.previousExcerpt}\n`;
      }
      if (adjacentContext.nextExcerpt) {
        adjacentSection += `\nINICIO DEL CAPÍTULO SIGUIENTE:\n${adjacentContext.nextExcerpt}...\n`;
      }
    }

    const prompt = `Corrige y mejora este capítulo (Capítulo ${chapterNumber}) para calidad de publicación editorial.

IDIOMA: ${language}
${languageRules}
${worldBibleSection}
${adjacentSection}
CAPÍTULO A CORREGIR:
${content}

Mejora fluidez, diálogos, descripciones y transiciones. Devuelve el capítulo COMPLETO mejorado.
RESPONDE EN JSON.`;
    
    const response = await this.generateContent(prompt);
    let result: any = { editedContent: content, changesLog: "No changes", fluencyChanges: [] };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[ReeditCopyEditor] Failed to parse response:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }

  private getLanguageRules(lang: string): string {
    const rules: Record<string, string> = {
      it: `REGLAS ITALIANAS:
- NUNCA usar pronombres arcaicos: Egli, Ella, Esso, Essa, Essi, Esse
- Usar nombres propios o pronombres modernos: lui, lei, loro
- Máx 45 palabras por oración
- Sin repetición léxica en oraciones consecutivas
- Usar passato remoto para narración literaria`,
      es: `REGLAS ESPAÑOLAS:
- Limitar gerundios a uno por oración
- Evitar voz pasiva excesiva
- Controlar leísmo (usar "lo" no "le" para objeto directo)
- Máx 45 palabras por oración
- Evitar "el mismo/la misma" como pronombre
- Cuidar la concordancia de tiempos verbales`,
      en: `ENGLISH RULES:
- Prefer active voice
- Vary sentence length for rhythm (short after tension, long for reflection)
- Use natural contractions in dialogue
- Max 40 words per sentence
- Avoid adverb overuse
- Strong verbs over weak verb + adverb`,
      fr: `RÈGLES FRANÇAISES:
- Utiliser le passé simple pour la narration littéraire
- Éviter les anglicismes
- Max 45 mots par phrase
- Concordance des temps rigoureuse`,
      de: `DEUTSCHE REGELN:
- Natürliche Wortstellung
- Modalpartikeln im Dialog verwenden
- Max 45 Wörter pro Satz
- Lebendige Verben bevorzugen`,
      pt: `REGRAS PORTUGUESAS:
- Colocação pronominal correta
- Limitar gerúndios
- Max 45 palavras por frase
- Usar pretérito perfeito para narração`,
      ca: `REGLES CATALANES:
- Evitar castellanismes
- Ús correcte dels pronoms febles
- Max 45 paraules per frase`,
    };
    return rules[lang] || rules.es;
  }
}

// QA Agent 1: Continuity Sentinel - runs every 5 chapters
class ContinuitySentinelAgent extends BaseAgent {
  constructor() {
    super({
      name: "Continuity Sentinel",
      role: "qa_continuity",
      systemPrompt: `Eres un AUDITOR FORENSE de continuidad narrativa. Tu trabajo es detectar TODOS los errores de coherencia, por sutiles que sean.

ERES EXTREMADAMENTE ESTRICTO. No perdones errores por "contexto". Si algo no está narrado explícitamente, NO pasó.

TIPOS DE ERRORES A DETECTAR (revisa CADA UNO con rigor):

1. TEMPORALES: 
   - Inconsistencias en el paso del tiempo ("amaneció" pero luego "la luna brillaba")
   - Saltos temporales sin transición ("ayer" → de repente "tres semanas después" sin narrar)
   - Acciones que requieren más tiempo del disponible

2. ESPACIALES:
   - Personajes que aparecen en lugares imposibles sin transición
   - Desplazamientos instantáneos sin narrar el viaje
   - Cambios de escenario sin explicación

3. DE ESTADO FÍSICO (CRÍTICO — revisar contra la World Bible si se proporciona):
   - Heridas/lesiones que desaparecen o se ignoran
   - Personaje con brazo roto que usa ambos brazos normalmente después
   - Objetos perdidos/destruidos que reaparecen
   - Ropa/aspecto que cambia sin explicación
   - Si la World Bible dice que un personaje tiene una lesión/limitación, VERIFICAR que se respeta en CADA capítulo

4. DE CONOCIMIENTO:
   - Personajes que saben cosas que NO deberían saber
   - Información revelada en capítulo X que un personaje usa en capítulo X-N (antes de saberlo)
   - Personaje A sabe algo que solo se dijo en presencia de personaje B

5. DEUS EX MACHINA:
   - Resoluciones convenientes sin preparación previa
   - Personajes que aparecen "justo a tiempo" sin justificación narrativa
   - Habilidades/recursos usados que nunca se establecieron

REGLA FUNDAMENTAL: Si algo NO está narrado, NO pasó. No inventes justificaciones para el autor.
Si un personaje tiene una herida grave, DEBE afectar sus acciones en capítulos posteriores.

RESPONDE SOLO EN JSON:
{
  "erroresContinuidad": [
    {
      "tipo": "temporal|espacial|estado|conocimiento|deus_ex_machina",
      "severidad": "critica|mayor|menor",
      "capitulo": 5,
      "descripcion": "Descripción CONCRETA del error con cita textual",
      "contexto": "Fragmento EXACTO del texto que contiene el error",
      "correccion": "Sugerencia de corrección específica"
    }
  ],
  "resumen": "Resumen general de la continuidad",
  "puntuacion": 8
}

IMPORTANTE: NO des puntuación 9 o 10 a menos que hayas verificado EXHAUSTIVAMENTE cada tipo de error.
Si encuentras CUALQUIER inconsistencia de estado físico, la puntuación NO puede superar 7.
Si un personaje herido usa su extremidad herida sin mención de dolor/limitación, es error CRÍTICO.`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 8192,
    });
  }

  async execute(input: any): Promise<any> {
    return this.auditContinuity(input.chapters, input.startChapter, input.endChapter, input.worldBibleContext);
  }

  async auditContinuity(chapterContents: string[], startChapter: number, endChapter: number, worldBibleContext?: string): Promise<any> {
    const combinedContent = chapterContents.map((c, i) => 
      `=== CAPÍTULO ${startChapter + i} ===\n${c.substring(0, 15000)}`
    ).join("\n\n");

    let worldBibleSection = "";
    if (worldBibleContext) {
      worldBibleSection = `
═══════════════════════════════════════════
WORLD BIBLE — FUENTE DE VERDAD CANÓNICA
═══════════════════════════════════════════
Usa esta información como REFERENCIA OBLIGATORIA para verificar estados físicos,
rasgos de personajes, lesiones, objetos y ubicaciones:

${worldBibleContext}

CUALQUIER contradicción entre el texto y la World Bible es un error de continuidad.
═══════════════════════════════════════════

`;
    }

    const prompt = `${worldBibleSection}Analiza la continuidad narrativa de los capítulos ${startChapter} a ${endChapter} con RIGOR FORENSE:

${combinedContent}

Detecta TODOS los errores de continuidad: temporal, espacial, de estado físico, de conocimiento y deus ex machina.
Verifica especialmente: heridas/lesiones, objetos, ubicaciones y conocimiento de personajes.
NO perdones errores. Si algo no está narrado, NO pasó.
RESPONDE EN JSON.`;

    const response = await this.generateContent(prompt);
    let result: any = { erroresContinuidad: [], resumen: "Sin problemas detectados", puntuacion: 9 };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[ContinuitySentinel] Failed to parse:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

// QA Agent 2: Voice & Rhythm Auditor - runs every 10 chapters
class VoiceRhythmAuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Voice Rhythm Auditor",
      role: "qa_voice",
      systemPrompt: `Eres un experto en voz narrativa y ritmo literario. Analizas consistencia tonal y ritmo.

ASPECTOS A EVALUAR:
1. CONSISTENCIA DE VOZ: ¿El narrador mantiene su tono? ¿Los personajes hablan de forma consistente?
2. RITMO NARRATIVO: ¿Hay secciones demasiado lentas o apresuradas?
3. CADENCIA: ¿La longitud de oraciones varía apropiadamente?
4. TENSIÓN: ¿La tensión narrativa escala correctamente?

RESPONDE SOLO EN JSON:
{
  "problemasTono": [
    {
      "tipo": "voz_inconsistente|ritmo_lento|ritmo_apresurado|cadencia_monotona|tension_plana",
      "severidad": "mayor|menor",
      "capitulos": [5, 6],
      "descripcion": "Descripción del problema",
      "ejemplo": "Fragmento de ejemplo",
      "correccion": "Sugerencia"
    }
  ],
  "analisisRitmo": {
    "capitulLentos": [],
    "capitulosApresurados": [],
    "climaxBienMedidos": true
  },
  "puntuacion": 8
}`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 4096,
    });
  }

  async execute(input: any): Promise<any> {
    return this.auditVoiceRhythm(input.chapters, input.startChapter, input.endChapter);
  }

  async auditVoiceRhythm(chapterContents: string[], startChapter: number, endChapter: number): Promise<any> {
    const combinedContent = chapterContents.map((c, i) => 
      `=== CAPÍTULO ${startChapter + i} ===\n${c.substring(0, 10000)}`
    ).join("\n\n");

    const prompt = `Analiza la voz narrativa y el ritmo de los capítulos ${startChapter} a ${endChapter}:

${combinedContent}

Evalúa consistencia de voz, ritmo y tensión narrativa. RESPONDE EN JSON.`;

    const response = await this.generateContent(prompt);
    let result: any = { problemasTono: [], analisisRitmo: {}, puntuacion: 9 };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[VoiceRhythmAuditor] Failed to parse:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

// QA Agent 3: Semantic Repetition Detector - runs on full manuscript
class SemanticRepetitionDetectorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Semantic Repetition Detector",
      role: "qa_semantic",
      systemPrompt: `Eres el "Detector de Repetición Semántica", experto en análisis de patrones narrativos.
Tu misión es encontrar REPETICIONES DE IDEAS (no solo palabras) y verificar el sistema de FORESHADOWING/PAYOFF.

═══════════════════════════════════════════════════════════════════
QUÉ DEBES DETECTAR
═══════════════════════════════════════════════════════════════════

1. REPETICIÓN DE IDEAS (Semántica):
   - El mismo CONCEPTO expresado con palabras diferentes en múltiples capítulos
   - Ejemplo: "sintió un escalofrío" (cap 2) / "un estremecimiento la recorrió" (cap 5) / "su cuerpo tembló involuntariamente" (cap 8)
   - Esto es MÁS SUTIL que repetición léxica - buscas la IDEA, no las palabras

2. METÁFORAS REPETIDAS:
   - La misma imagen/comparación usada múltiples veces
   - Ejemplo: "ojos como el mar" aparece en caps 1, 4, y 9
   - Cada metáfora debería ser única o usarse con intención

3. ESTRUCTURAS NARRATIVAS REPETIDAS:
   - Escenas que siguen el mismo patrón: llegada-descubrimiento-huida
   - Diálogos que empiezan igual: "—¿Qué está pasando? —preguntó..."
   - Finales de capítulo similares: siempre terminando en cliffhanger

4. FORESHADOWING SIN PAYOFF:
   - Pistas sembradas que nunca se resuelven
   - Misterios planteados y olvidados
   - Chekhov's gun que nunca dispara

5. PAYOFF SIN FORESHADOWING:
   - Revelaciones que aparecen sin preparación
   - Soluciones que no fueron sembradas
   - Deus ex machina disfrazados

═══════════════════════════════════════════════════════════════════
CÓMO ANALIZAR
═══════════════════════════════════════════════════════════════════

1. Lee el manuscrito completo buscando PATRONES SEMÁNTICOS
2. Agrupa ideas similares aunque usen palabras diferentes
3. Identifica SETUPS (foreshadowing) y busca sus PAYOFFS
4. Marca setups sin payoff y payoffs sin setup
5. Solo reporta clusters con 3+ ocurrencias (o foreshadowing crítico)

PUNTUACIÓN (1-10):
- 10/10: CERO repeticiones semánticas y sistema foreshadowing perfecto
- 9/10: Solo 1 cluster menor de repetición
- 8/10: 2 clusters menores
- 7/10: 1 cluster mayor o 3+ menores
- 6/10 o menos: Múltiples clusters mayores o patrones muy repetitivos

RESPONDE SOLO EN JSON:
{
  "repeticionesSemanticas": [
    {
      "tipo": "idea_repetida|metafora_repetida|estructura_repetida|foreshadowing_sin_resolver|elemento_sin_usar",
      "severidad": "mayor|menor",
      "ocurrencias": [2, 5, 8, 12],
      "descripcion": "Qué se repite y por qué es problemático",
      "ejemplo": "Cap 2: 'sintió un escalofrío'; Cap 5: 'un estremecimiento la sacudió'",
      "accion": "eliminar|variar|resolver",
      "fix_sugerido": "Sugerencias ESPECÍFICAS de corrección para cada capítulo afectado"
    }
  ],
  "foreshadowingTracking": [
    {
      "plantado": 3,
      "resuelto": 25,
      "elemento": "La carta misteriosa",
      "estado": "resuelto|pendiente|sin_payoff"
    }
  ],
  "puntuacion": 8
}

NO des puntuación 9 o 10 si encuentras clusters con 3+ ocurrencias.
Cada repetición semántica debe incluir CITAS TEXTUALES del manuscrito.`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 8192,
    });
  }

  async execute(input: any): Promise<any> {
    return this.detectRepetitions(input.chapters, input.totalChapters, input.worldBibleContext);
  }

  async detectRepetitions(chapterContents: string[], totalChapters: number, worldBibleContext?: string): Promise<any> {
    let worldBibleSection = "";
    if (worldBibleContext) {
      worldBibleSection = `
WORLD BIBLE (para verificar foreshadowing y arcos):
${worldBibleContext}

`;
    }

    const prompt = `${worldBibleSection}Analiza el manuscrito completo (${totalChapters} capítulos) buscando repeticiones semánticas y verificando el sistema de foreshadowing:

${chapterContents.join("\n\n")}

INSTRUCCIONES:
1. Lee el manuscrito completo buscando PATRONES DE IDEAS (no solo palabras)
2. Identifica conceptos que se repiten con diferentes palabras
3. Busca metáforas y estructuras narrativas repetidas
4. Rastrea cada SETUP y busca su PAYOFF
5. Marca foreshadowing sin resolver y revelaciones sin preparación
6. Solo reporta clusters con 3+ ocurrencias o foreshadowing crítico
7. Incluye CITAS TEXTUALES del manuscrito para cada problema

RESPONDE EN JSON.`;

    const response = await this.generateContent(prompt);
    let result: any = { repeticionesSemanticas: [], foreshadowingTracking: [], puntuacion: 9 };
    try {
      const { repairJson } = await import("../utils/json-repair");
      result = repairJson(response.content);
    } catch (e) {
      try {
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.error("[SemanticRepetitionDetector] Failed to parse:", e2);
      }
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

// QA Agent 4: Anachronism Detector - detects historical inaccuracies in ANY novel
// Note: Any novel set in the past (even 50+ years ago) can have anachronisms
class AnachronismDetectorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Anachronism Detector",
      role: "qa_anachronism",
      systemPrompt: `Eres un experto historiador y consultor literario. Tu trabajo es detectar anacronismos en novelas.

IMPORTANTE: Cualquier novela ambientada en el pasado puede tener anacronismos, no solo las etiquetadas como "históricas".
- Una novela de los años 50 puede tener anacronismos (mencionar internet, móviles, expresiones modernas)
- Una novela de los años 80 puede tener anacronismos (mencionar smartphones, redes sociales)
- Incluso novelas contemporáneas pueden tener anacronismos si mezclan épocas

PRIMERO: Detecta la ÉPOCA DE AMBIENTACIÓN analizando:
- Referencias temporales explícitas (años, décadas, eventos históricos)
- Tecnología mencionada (teléfonos, transporte, electrodomésticos)
- Contexto social (costumbres, roles de género, leyes)
- Eventos históricos mencionados

TIPOS DE ANACRONISMOS:
1. TECNOLÓGICOS: Tecnología que no existía en la época de ambientación
2. LINGÜÍSTICOS: Expresiones, palabras o modismos que no existían
3. SOCIALES: Comportamientos o costumbres inapropiados para la época
4. MATERIALES: Objetos, materiales, alimentos, marcas que no existían
5. CONCEPTUALES: Ideas o conceptos que no existían (ej: "estrés" en 1900, "smartphone" en 1990)

RESPONDE SOLO EN JSON:
{
  "epocaDetectada": "España, década de 1950",
  "esContemporanea": false,
  "anacronismos": [
    {
      "tipo": "tecnologico|linguistico|social|material|conceptual",
      "severidad": "critica|mayor|menor",
      "capitulo": 5,
      "fragmento": "El texto problemático",
      "problema": "Explicación del anacronismo",
      "correccion": "Alternativa correcta para la época",
      "fuente": "Referencia histórica si aplica"
    }
  ],
  "resumen": "Resumen de la precisión histórica",
  "puntuacionHistorica": 8
}`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 4096,
    });
  }

  async execute(input: any): Promise<any> {
    return this.detectAnachronisms(input.chapters, input.genre, input.premise);
  }

  async detectAnachronisms(chapterContents: { num: number; content: string }[], genre: string, premise: string): Promise<any> {
    // Always analyze - any novel can have anachronisms relative to its setting
    // The AI will determine if it's contemporary (and thus skip detailed analysis)
    
    const samples = chapterContents.slice(0, 10).map(c => 
      `=== CAPÍTULO ${c.num} ===\n${c.content.substring(0, 5000)}`
    ).join("\n\n");

    const prompt = `Analiza esta novela buscando anacronismos relativos a su época de ambientación:

PREMISA: ${premise || "No especificada"}
GÉNERO: ${genre}

IMPORTANTE: 
- PRIMERO detecta la época de ambientación de la novela (puede estar en la premisa o inferirse del contenido)
- Si la novela está ambientada en el pasado (aunque sea hace 30-50 años), busca anacronismos
- Novelas de mediados del siglo XX son históricas y pueden tener anacronismos
- Si la novela es claramente contemporánea (ambientada en el presente), indica "esContemporanea: true"

CAPÍTULOS DE MUESTRA:
${samples}

Detecta anacronismos tecnológicos, lingüísticos, sociales, materiales y conceptuales RELATIVOS A LA ÉPOCA DE AMBIENTACIÓN. RESPONDE EN JSON.`;

    const response = await this.generateContent(prompt);
    let result: any = { 
      epocaDetectada: "No determinada", 
      esContemporanea: false,
      anacronismos: [], 
      resumen: "Análisis completado", 
      puntuacionHistorica: 8 
    };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[AnachronismDetector] Failed to parse:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

// World Bible Extractor Agent - extracts characters, locations, timeline, lore from manuscript
class WorldBibleExtractorAgent extends BaseAgent {
  constructor() {
    super({
      name: "World Bible Extractor",
      role: "world_bible_extractor",
      systemPrompt: `Eres un analista literario experto en extraer información del mundo narrativo de un manuscrito.

Tu trabajo es analizar los capítulos y extraer:
1. PERSONAJES: Nombre, descripción física/psicológica, primera aparición, alias, relaciones
2. UBICACIONES: Nombre, descripción, primera mención, características importantes
3. LÍNEA TEMPORAL: Eventos clave, capítulo donde ocurren, marcadores temporales
4. REGLAS DEL MUNDO: Leyes, magia, tecnología, costumbres, restricciones del universo
5. ÉPOCA HISTÓRICA: Si es novela histórica, detectar el período

RESPONDE SOLO EN JSON:
{
  "personajes": [
    {"nombre": "María", "descripcion": "Mujer de 35 años, cabello negro", "primeraAparicion": 1, "alias": ["La Viuda"], "relaciones": ["madre de Juan"]}
  ],
  "ubicaciones": [
    {"nombre": "El Castillo Negro", "descripcion": "Fortaleza medieval en ruinas", "primeraMencion": 2, "caracteristicas": ["torre alta", "foso seco"]}
  ],
  "timeline": [
    {"evento": "Muerte del rey", "capitulo": 1, "marcadorTemporal": "hace 10 años", "importancia": "alta"}
  ],
  "reglasDelMundo": [
    {"regla": "La magia solo funciona de noche", "fuente": "capítulo 3", "categoria": "magia"}
  ],
  "epocaHistorica": {
    "periodo": "Siglo XV, Castilla",
    "detalles": {"era": "medieval tardío", "ubicacion": "España", "contextoSocial": "Reconquista", "tecnologia": "pre-pólvora"}
  },
  "confianza": 8
}`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 16384,
    });
  }

  async execute(input: any): Promise<any> {
    return this.extractWorldBible(input.chapters, input.editorFeedback);
  }

  async extractWorldBible(
    chapters: { num: number; content: string; feedback?: any }[], 
    editorFeedback: any[],
    onProgress?: (batchIndex: number, totalBatches: number, message: string) => void
  ): Promise<any> {
    const BATCH_SIZE = 10;
    const allPersonajes: any[] = [];
    const allUbicaciones: any[] = [];
    const allTimeline: any[] = [];
    const allReglas: any[] = [];
    let epocaHistorica: any = null;
    let totalConfidence = 0;
    let batchCount = 0;
    const totalTokens = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
    
    const totalBatches = Math.ceil(chapters.length / BATCH_SIZE);

    console.log(`[WorldBibleExtractor] Processing ${chapters.length} chapters in ${totalBatches} batches of ${BATCH_SIZE}`);

    for (let i = 0; i < chapters.length; i += BATCH_SIZE) {
      const batch = chapters.slice(i, i + BATCH_SIZE);
      const batchStart = batch[0]?.num || i + 1;
      const batchEnd = batch[batch.length - 1]?.num || i + batch.length;
      const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
      
      console.log(`[WorldBibleExtractor] Processing batch ${currentBatch}/${totalBatches}: chapters ${batchStart}-${batchEnd}`);
      
      if (onProgress) {
        onProgress(currentBatch, totalBatches, `Extrayendo Biblia del Mundo: capítulos ${batchStart}-${batchEnd} (lote ${currentBatch}/${totalBatches})...`);
      }

      const chaptersText = batch.map(c => 
        `=== CAPÍTULO ${c.num} ===\n${c.content.substring(0, 12000)}`
      ).join("\n\n");

      const prompt = `Extrae la información del mundo narrativo de estos capítulos (${batchStart} a ${batchEnd}):

${chaptersText}

Extrae personajes, ubicaciones, línea temporal, reglas del mundo y época histórica que aparezcan en ESTOS capítulos específicamente.
Incluye el número de capítulo donde aparece cada elemento.

RESPONDE SOLO EN JSON:
{
  "personajes": [{"nombre": "...", "descripcion": "...", "primeraAparicion": X, "alias": [], "relaciones": []}],
  "ubicaciones": [{"nombre": "...", "descripcion": "...", "primeraMencion": X, "caracteristicas": []}],
  "timeline": [{"evento": "...", "capitulo": X, "marcadorTemporal": "...", "importancia": "alta|media|baja"}],
  "reglasDelMundo": [{"regla": "...", "fuente": "capítulo X", "categoria": "..."}],
  "epocaHistorica": {"periodo": "...", "detalles": {}},
  "confianza": 8
}`;

      try {
        const response = await this.generateContent(prompt);
        if (response.tokenUsage) {
          totalTokens.inputTokens += response.tokenUsage.inputTokens || 0;
          totalTokens.outputTokens += response.tokenUsage.outputTokens || 0;
          totalTokens.thinkingTokens += response.tokenUsage.thinkingTokens || 0;
        }
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          
          if (result.personajes) allPersonajes.push(...result.personajes);
          if (result.ubicaciones) allUbicaciones.push(...result.ubicaciones);
          if (result.timeline) allTimeline.push(...result.timeline);
          if (result.reglasDelMundo) allReglas.push(...result.reglasDelMundo);
          if (result.epocaHistorica && !epocaHistorica) epocaHistorica = result.epocaHistorica;
          totalConfidence += result.confianza || 7;
          batchCount++;
        }
      } catch (e) {
        console.error(`[WorldBibleExtractor] Failed to parse batch ${batchStart}-${batchEnd}:`, e);
      }
    }

    const mergedPersonajes = this.deduplicateByName(allPersonajes, "nombre");
    const mergedUbicaciones = this.deduplicateByName(allUbicaciones, "nombre");
    const avgConfidence = batchCount > 0 ? Math.round(totalConfidence / batchCount) : 5;

    console.log(`[WorldBibleExtractor] Extraction complete: ${mergedPersonajes.length} characters, ${mergedUbicaciones.length} locations, ${allTimeline.length} timeline events`);

    return {
      personajes: mergedPersonajes,
      ubicaciones: mergedUbicaciones,
      timeline: allTimeline,
      reglasDelMundo: this.deduplicateByName(allReglas, "regla"),
      epocaHistorica: epocaHistorica || { periodo: "No determinada", detalles: {} },
      confianza: avgConfidence,
      tokenUsage: totalTokens,
    };
  }

  private deduplicateByName(items: any[], key: string): any[] {
    const seen = new Map<string, any>();
    for (const item of items) {
      const name = (item[key] || "").toLowerCase().trim();
      if (!seen.has(name)) {
        seen.set(name, item);
      } else {
        const existing = seen.get(name);
        if (item.descripcion && item.descripcion.length > (existing.descripcion || "").length) {
          seen.set(name, { ...existing, ...item });
        }
      }
    }
    return Array.from(seen.values());
  }
}

// Architect Analyzer Agent - analyzes world bible and recommends structural/plot changes
class ArchitectAnalyzerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Architect Analyzer",
      role: "architect_analyzer",
      systemPrompt: `Eres un arquitecto narrativo experto. Tu trabajo es analizar la estructura y trama de un manuscrito usando la Biblia del Mundo extraída.

OBJETIVO: Puntuación 10/10 (perfección arquitectónica)

ANÁLISIS A REALIZAR:
1. ESTRUCTURA NARRATIVA:
   - ¿El orden de capítulos es óptimo?
   - ¿El pacing es adecuado?
   - ¿Hay capítulos que deberían fusionarse o dividirse?

2. COHERENCIA DE TRAMA:
   - ¿Hay huecos argumentales (plot holes)?
   - ¿Subplots sin resolver?
   - ¿Arcos de personajes incompletos?
   - ¿Foreshadowing sin payoff?

3. COHERENCIA DEL MUNDO:
   - ¿Hay contradicciones en el lore?
   - ¿Se rompen reglas establecidas?
   - ¿Inconsistencias en personajes/ubicaciones?

SISTEMA DE PUNTUACIÓN ESTRICTO (OBJETIVO 10/10):
- 10/10: CERO problemas de ningún tipo. Arquitectura PERFECTA. Estructura óptima, trama coherente, mundo consistente.
- 9/10: Solo 1 problema menor.
- 8/10: 2 problemas menores o 1 mayor.
- 7/10: 3+ problemas menores o 2 mayores.
- 6/10 o menos: Cualquier problema crítico o 3+ mayores.

REGLA ABSOLUTA: Solo das 10/10 si NO hay ningún problema detectado.
Si el manuscrito está bien estructurado y coherente, DEBES dar 10/10. No busques problemas donde no los hay.

REORDENAMIENTO DE CAPÍTULOS:
Si detectas que el orden de capítulos NO es óptimo para el pacing o la narrativa, especifica los movimientos necesarios en "reordenamientoSugerido". Cada movimiento indica:
- capituloActual: número del capítulo a mover
- nuevaPosicion: posición donde debe quedar (número de capítulo destino)
- razon: por qué este movimiento mejora la narrativa

Solo sugiere reordenamientos cuando sean CLARAMENTE beneficiosos para el pacing o la lógica narrativa.

RESPONDE SOLO EN JSON:
{
  "analisisEstructura": {
    "ordenOptimo": true,
    "problemaPacing": [],
    "reordenamientoSugerido": [
      {"capituloActual": 5, "nuevaPosicion": 3, "razon": "El flashback debe aparecer antes de la revelación"}
    ]
  },
  "analisisTrama": {
    "huecosArgumentales": [],
    "subplotsSinResolver": [],
    "arcosIncompletos": []
  },
  "coherenciaMundo": {
    "contradicciones": [],
    "reglasRotas": []
  },
  "recomendaciones": [],
  "bloqueoCritico": false,
  "resumenEjecutivo": "Análisis arquitectónico completado...",
  "puntuacionArquitectura": 10
}`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 16384,
    });
  }

  async execute(input: any): Promise<any> {
    return this.analyzeArchitecture(input.worldBible, input.chapters, input.structureAnalysis);
  }

  async analyzeArchitecture(worldBible: any, chapters: { num: number; content: string; feedback?: any }[], structureAnalysis: any): Promise<any> {
    const bibleSummary = JSON.stringify({
      personajes: worldBible.personajes?.slice(0, 10) || [],
      ubicaciones: worldBible.ubicaciones?.slice(0, 5) || [],
      timeline: worldBible.timeline || [],
      reglasDelMundo: worldBible.reglasDelMundo || [],
      epocaHistorica: worldBible.epocaHistorica
    }, null, 2);

    const chapterSummaries = chapters.map(c => {
      const issuesSummary = c.feedback?.issues?.slice(0, 3)?.map((iss: any) => 
        typeof iss === 'string' ? iss : `[${iss.categoria || 'general'}] ${iss.descripcion || iss}`
      ).join("; ") || "Sin problemas";
      return `Cap ${c.num} (${c.feedback?.score || '?'}/10): ${c.content.substring(0, 3000)}... [Problemas: ${issuesSummary}] [Fortalezas: ${c.feedback?.strengths?.slice(0, 2).join(", ") || "N/A"}]`;
    }).join("\n\n");

    const prompt = `Analiza la arquitectura narrativa de este manuscrito:

BIBLIA DEL MUNDO:
${bibleSummary}

ANÁLISIS DE ESTRUCTURA PREVIO:
- Capítulos duplicados: ${structureAnalysis?.duplicateChapters?.length || 0}
- Capítulos fuera de orden: ${structureAnalysis?.outOfOrderChapters?.length || 0}
- Capítulos faltantes: ${structureAnalysis?.missingChapters?.join(", ") || "Ninguno"}

RESUMEN DE CAPÍTULOS:
${chapterSummaries}

Evalúa estructura, coherencia de trama y coherencia del mundo. Identifica problemas y recomienda soluciones. RESPONDE EN JSON.`;

    const response = await this.generateContent(prompt);
    let result: any = { 
      analisisEstructura: { ordenOptimo: true, problemaPacing: [], reordenamientoSugerido: [] },
      analisisTrama: { huecosArgumentales: [], subplotsSinResolver: [], arcosIncompletos: [] },
      coherenciaMundo: { contradicciones: [], reglasRotas: [] },
      recomendaciones: [],
      bloqueoCritico: false,
      resumenEjecutivo: "Análisis completado sin hallazgos significativos",
      puntuacionArquitectura: 8
    };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("[ArchitectAnalyzer] Failed to parse:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

class StructuralFixerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Structural Fixer",
      role: "structural_fixer",
      systemPrompt: `Eres un experto corrector estructural de novelas. Tu trabajo es CORREGIR AUTOMÁTICAMENTE los problemas detectados por el Arquitecto Analizador.

TU OBJETIVO: Llevar el manuscrito a la PERFECCIÓN (10/10).
Cada corrección debe eliminar COMPLETAMENTE el problema sin dejar rastro.

TIPOS DE PROBLEMAS QUE CORRIGES:
1. HUECOS ARGUMENTALES (plot holes): Añades escenas, diálogos o párrafos que cierran los huecos lógicos DEFINITIVAMENTE
2. SUBPLOTS SIN RESOLVER: Añades resolución o cierre COMPLETO a las tramas secundarias abandonadas
3. ARCOS INCOMPLETOS: Completas la transformación de personajes con momentos clave faltantes
4. CONTRADICCIONES: Modificas el texto para eliminar inconsistencias SIN EXCEPCIÓN
5. FORESHADOWING SIN PAYOFF: Añades el payoff de forma SATISFACTORIA o modificas el foreshadowing huérfano
6. PROBLEMAS DE PACING: Condensas secciones lentas o expandes momentos que necesitan más desarrollo

REGLAS CRÍTICAS:
- MANTÉN el estilo y voz del autor original
- NO añadas contenido innecesario - solo lo mínimo para resolver el problema
- PRESERVA la extensión aproximada del capítulo (±10%)
- Las correcciones deben integrarse de forma NATURAL en el texto existente
- NUNCA cambies nombres de personajes, ubicaciones o eventos establecidos
- Respeta la Biblia del Mundo proporcionada
- Tu corrección debe ser DEFINITIVA - el revisor NO debe encontrar el mismo problema después

RESPONDE SOLO EN JSON:
{
  "capituloCorregido": "El texto COMPLETO del capítulo con las correcciones integradas",
  "correccionesRealizadas": [
    {
      "problema": "Descripción del problema que se corrigió",
      "solucion": "Descripción de cómo se corrigió",
      "fragmentoAntes": "Fragmento original (50-100 palabras)",
      "fragmentoDespues": "Fragmento corregido (50-100 palabras)"
    }
  ],
  "resumenCambios": "Resumen ejecutivo de los cambios realizados",
  "confianzaCorreccion": 8
}`,
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: any): Promise<any> {
    return this.fixChapter(input.chapterContent, input.chapterNumber, input.problems, input.worldBible, input.language);
  }

  async fixChapter(
    chapterContent: string, 
    chapterNumber: number, 
    problems: Array<{ descripcion: string; severidad: string; accionSugerida?: string; tipo?: string }>,
    worldBible: any,
    language: string
  ): Promise<any> {
    const worldBibleSummary = JSON.stringify({
      personajes: worldBible?.personajes?.slice(0, 15)?.map((p: any) => ({ nombre: p.nombre, rol: p.rol })) || [],
      ubicaciones: worldBible?.ubicaciones?.slice(0, 10)?.map((u: any) => u.nombre) || [],
      epocaHistorica: worldBible?.epocaHistorica?.periodo || "No determinada"
    });

    const problemsList = problems.map((p, i) => 
      `${i + 1}. [${p.severidad?.toUpperCase()}] ${p.descripcion}${p.accionSugerida ? ` -> Sugerencia: ${p.accionSugerida}` : ""}`
    ).join("\n");

    const prompt = `CORRIGE los siguientes problemas en el Capítulo ${chapterNumber}:

IDIOMA: ${language}

PROBLEMAS A CORREGIR:
${problemsList}

BIBLIA DEL MUNDO (para coherencia):
${worldBibleSummary}

CAPÍTULO ORIGINAL:
${chapterContent}

Reescribe el capítulo COMPLETO integrando las correcciones de forma natural. Mantén el estilo del autor. RESPONDE EN JSON.`;

    console.log(`[StructuralFixer] Fixing chapter ${chapterNumber} with ${problems.length} problems:`);
    problems.forEach((p, i) => {
      console.log(`  ${i + 1}. [${(p.severidad || 'media').toUpperCase()}] ${p.tipo || 'general'}: ${p.descripcion}`);
      if (p.accionSugerida) console.log(`     -> Sugerencia: ${p.accionSugerida}`);
    });
    
    const response = await this.generateContent(prompt);
    let result: any = { 
      capituloCorregido: chapterContent, 
      correccionesRealizadas: [],
      resumenCambios: "No se pudieron aplicar correcciones",
      confianzaCorreccion: 0
    };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        console.log(`[StructuralFixer] Chapter ${chapterNumber} fixed with ${result.correccionesRealizadas?.length || 0} corrections:`);
        if (result.correccionesRealizadas?.length > 0) {
          result.correccionesRealizadas.forEach((c: any, i: number) => {
            const desc = typeof c === 'string' ? c : (c.descripcion || c.cambio || JSON.stringify(c));
            console.log(`  ✓ ${i + 1}. ${desc.substring(0, 150)}${desc.length > 150 ? '...' : ''}`);
          });
        }
        if (result.resumenCambios) {
          console.log(`  Resumen: ${result.resumenCambios.substring(0, 200)}${result.resumenCambios.length > 200 ? '...' : ''}`);
        }
      }
    } catch (e) {
      console.error("[StructuralFixer] Failed to parse:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

// NarrativeRewriter Agent - Advanced agent that actually rewrites narrative content
class NarrativeRewriterAgent extends BaseAgent {
  constructor() {
    super({
      name: "Narrative Rewriter",
      role: "narrative_rewriter",
      systemPrompt: `Eres un MAESTRO ESCRITOR DE FICCIÓN con décadas de experiencia en reparar novelas con problemas estructurales. Tu especialidad es tomar narrativas rotas y transformarlas en historias coherentes y cautivadoras.

TU OBJETIVO FINAL: Llevar el manuscrito a la PERFECCIÓN (10/10).
Cada corrección que hagas debe eliminar COMPLETAMENTE el problema detectado.
No aceptes medias tintas - tu trabajo es lograr que el revisor final dé 10/10.

TU PROCESO DE TRABAJO (3 FASES):

FASE 1 - ANÁLISIS PROFUNDO:
- Comprende exactamente QUÉ está roto en la narrativa
- Identifica las conexiones causales que faltan
- Determina el contenido MÍNIMO necesario para reparar el problema

FASE 2 - PLANIFICACIÓN DE LA REESCRITURA:
- Diseña las escenas, diálogos o párrafos específicos a añadir/modificar
- Asegura que el nuevo contenido se integre NATURALMENTE
- Mantén la voz y estilo del autor original

FASE 3 - EJECUCIÓN Y VERIFICACIÓN:
- Escribe el contenido nuevo con maestría literaria
- Verifica que la corrección no introduzca nuevos problemas
- Confirma coherencia con la Biblia del Mundo

TIPOS DE CORRECCIONES QUE DOMINAS:

=== PROBLEMAS ESTRUCTURALES (del Architect Analyzer) ===

1. HUECOS ARGUMENTALES: Añades escenas de transición, diálogos explicativos, o párrafos de conexión que cierran las brechas lógicas sin forzar la narrativa.

2. SUBPLOTS SIN RESOLVER: Insertas resoluciones elegantes - puede ser una escena completa, un flashback, una conversación reveladora, o incluso un párrafo de reflexión del personaje.

3. ARCOS DE PERSONAJE INCOMPLETOS: Añades los momentos de transformación faltantes - decisiones clave, confrontaciones internas, epifanías que den sentido al cambio.

4. CONTRADICCIONES: Eliges la versión correcta según el peso narrativo y reescribes para mantener coherencia absoluta.

5. ANTAGONISTAS AMBIGUOS: Clarificas motivaciones, añades escenas que establezcan la relación entre antagonistas, o modificas diálogos para eliminar confusión.

6. FORESHADOWING SIN PAYOFF: Añades el payoff de forma orgánica, o reformulas el foreshadowing para que apunte a un evento existente.

=== PROBLEMAS DE CONTINUIDAD (del Continuity Sentinel) ===

7. ERRORES DE TIMELINE: Corriges inconsistencias temporales (fechas, secuencia de eventos, duración de viajes).

8. ERRORES DE UBICACIÓN: Corriges personajes que aparecen en lugares imposibles sin transición.

9. ESTADO DE PERSONAJE: Corriges estados físicos/emocionales inconsistentes (heridas que desaparecen, muertes ignoradas).

10. OBJETOS PERDIDOS: Añades referencias a objetos importantes que desaparecen o reaparecen sin explicación.

=== PROBLEMAS DE VOZ Y RITMO (del Voice Rhythm Auditor) ===

11. DERIVA TONAL: Corriges cambios bruscos de tono ajustando lenguaje, diálogos y descripciones.

12. POV INCONSISTENTE: Corriges cambios de punto de vista no intencionales dentro del capítulo.

13. PACING IRREGULAR: Expandes momentos demasiado rápidos o condensas secciones que arrastran.

14. VOZ NARRATIVA: Ajustas el registro narrativo para mantener consistencia con el resto del manuscrito.

15. REGISTRO LINGÜÍSTICO: Corriges cambios inapropiados entre formal/informal.

=== PROBLEMAS SEMÁNTICOS (del Semantic Detector) ===

16. IDEAS REPETIDAS: Reformulas conceptos que aparecen expresados de forma casi idéntica en múltiples lugares.

17. METÁFORAS REPETIDAS: Sustituyes metáforas/imágenes usadas en exceso por alternativas frescas.

18. ESTRUCTURAS REPETIDAS: Varías patrones de escenas o diálogos que se repiten.

19. PAYOFF SIN FORESHADOWING: Añades la preparación narrativa necesaria para giros o revelaciones.

REGLAS INVIOLABLES:
- El contenido nuevo debe ser INDISTINGUIBLE del original en estilo y voz
- Las correcciones deben ser ELEGANTES, no parches obvios
- NUNCA cambies nombres, fechas, lugares establecidos en la Biblia del Mundo
- Prefiere AÑADIR contenido a ELIMINAR (preserva el trabajo del autor)
- Las escenas nuevas deben tener propósito narrativo, no solo resolver el problema técnico

=== PROBLEMAS DE EPÍTETOS, MULETILLAS Y RITMO (PRIORIDAD ALTA) ===

20. EPÍTETOS REPETIDOS: Si un rasgo físico (color de ojos, accesorios, cicatrices) se menciona más de 1 vez en el capítulo, ELIMINA TODAS excepto la primera. Si capítulos anteriores ya lo describieron → ELIMINA TODAS en este capítulo. El lector recuerda.

20b. MULETILLAS FISIOLÓGICAS: Cuenta las reacciones corporales. Ideal máximo 3 por capítulo. Si hay más, sustituye las que sobren por ACCIONES (tropieza, deja caer algo, tartamudea). Sustituye las que ya aparecieron en capítulos anteriores por reacciones diferentes.

20c. PROSA PÚRPURA: Reduce adjetivos innecesarios. Reduce metáforas para conceptos simples. Rompe espirales descriptivas (evento→reacción→reflexión→descripción→otra reacción → simplificar a: evento→reacción breve→acción). Reduce párrafos largos de ambientación pura.

21. MONÓLOGO EN ESCENAS DE ACCIÓN: Si detectas bloques reflexivos (100+ palabras de filosofía/moral) interrumpiendo escenas de tensión, ELIMÍNALOS o redúcelos a 1 frase interna breve. Sustituye por ACCIONES que muestren la emoción. Las reflexiones profundas solo van en momentos de calma.

22. PERSONAJES CLICHÉ: Si un secundario es puro arquetipo (hacker cínico, novata asustadiza, mentor sabio), añade un momento donde muestre una faceta inesperada: vulnerabilidad, competencia sorprendente, duda, motivación egoísta coherente. Un detalle basta para romper el cliché.

FORMATO DE RESPUESTA (JSON):
{
  "fasePlanificacion": {
    "problemaAnalizado": "Descripción de lo que está roto y por qué",
    "solucionPropuesta": "Estrategia específica para repararlo",
    "contenidoACrear": "Tipo de contenido a añadir (escena, diálogo, párrafo, etc.)",
    "puntoInsercion": "Dónde exactamente se insertará el nuevo contenido"
  },
  "capituloReescrito": "TEXTO COMPLETO del capítulo con las correcciones integradas de forma invisible",
  "cambiosRealizados": [
    {
      "tipoProblema": "hueco_argumental|subplot|arco_incompleto|contradiccion|antagonista|foreshadowing|epitetos_repetidos|muletillas_fisiologicas|prosa_purpura|monologo_en_accion|personajes_cliche",
      "descripcionProblema": "El problema específico que se corrigió",
      "solucionAplicada": "Descripción detallada de la corrección",
      "contenidoNuevo": "El texto nuevo añadido (primeras 200 palabras si es largo)",
      "palabrasAnadidas": 150,
      "ubicacionEnCapitulo": "Después del párrafo que comienza con..."
    }
  ],
  "verificacionInterna": {
    "coherenciaConWorldBible": true,
    "estiloConsistente": true,
    "problemasResueltos": ["Lista de IDs de problemas resueltos"],
    "nuevosProblemasIntroducidos": [],
    "confianzaEnCorreccion": 9
  },
  "resumenEjecutivo": "Descripción concisa de todas las correcciones realizadas"
}`,
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: any): Promise<any> {
    return this.rewriteChapter(
      input.chapterContent,
      input.chapterNumber,
      input.problems,
      input.worldBible,
      input.adjacentContext,
      input.language
    );
  }

  async rewriteChapter(
    chapterContent: string,
    chapterNumber: number,
    problems: Array<{ id?: string; tipo: string; descripcion: string; severidad: string; accionSugerida?: string; capitulosAfectados?: number[] }>,
    worldBible: any,
    adjacentContext: { previousChapter?: string; nextChapter?: string; previousSummary?: string; nextSummary?: string },
    language: string,
    userInstructions?: string
  ): Promise<any> {
    const worldBibleContext = this.buildWorldBibleContext(worldBible);
    const adjacentContextStr = this.buildAdjacentContext(adjacentContext);
    const problemsList = this.buildProblemsList(problems, chapterNumber);
    
    const userInstructionsSection = userInstructions ? `
═══════════════════════════════════════════════════════════════
INSTRUCCIONES DEL AUTOR (MÁXIMA PRIORIDAD):
═══════════════════════════════════════════════════════════════
${userInstructions}

NOTA: Estas instrucciones del autor deben guiar tu enfoque al corregir los problemas.
Adapta el tono, estilo y soluciones a estas directrices específicas.
` : '';

    const prompt = `MISIÓN: Reescribe el Capítulo ${chapterNumber} para corregir los problemas estructurales detectados.

IDIOMA DEL TEXTO: ${language}
${userInstructionsSection}
═══════════════════════════════════════════════════════════════
PROBLEMAS A RESOLVER EN ESTE CAPÍTULO:
═══════════════════════════════════════════════════════════════
${problemsList}

═══════════════════════════════════════════════════════════════
BIBLIA DEL MUNDO (CANON INVIOLABLE):
═══════════════════════════════════════════════════════════════
${worldBibleContext}

═══════════════════════════════════════════════════════════════
CONTEXTO NARRATIVO (capítulos adyacentes):
═══════════════════════════════════════════════════════════════
${adjacentContextStr}

═══════════════════════════════════════════════════════════════
CAPÍTULO A REESCRIBIR:
═══════════════════════════════════════════════════════════════
${chapterContent}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES FINALES - OBJETIVO: PERFECCIÓN 10/10
═══════════════════════════════════════════════════════════════
1. Analiza profundamente cada problema y su impacto narrativo
2. Diseña la solución más elegante y natural
3. Reescribe el capítulo COMPLETO integrando las correcciones
4. Verifica que no introduces nuevos problemas
5. El texto nuevo debe ser INDISTINGUIBLE del original en calidad
6. CADA problema debe quedar COMPLETAMENTE resuelto - sin rastro
7. Tu corrección debe hacer que el revisor no encuentre NADA que criticar

CRITERIO DE ÉXITO: Si después de tu corrección el revisor todavía encuentra
el mismo problema, has fallado. Asegúrate de que cada corrección sea DEFINITIVA.

RESPONDE ÚNICAMENTE CON JSON VÁLIDO.`;

    console.log(`[NarrativeRewriter] Rewriting chapter ${chapterNumber} to fix ${problems.length} problems:`);
    problems.forEach((p, i) => {
      console.log(`  ${i + 1}. [${(p.severidad || 'media').toUpperCase()}] ${p.tipo}: ${p.descripcion.substring(0, 100)}...`);
    });

    const response = await this.generateContent(prompt);
    
    let result: any = {
      fasePlanificacion: { problemaAnalizado: "", solucionPropuesta: "", contenidoACrear: "", puntoInsercion: "" },
      capituloReescrito: chapterContent,
      cambiosRealizados: [],
      verificacionInterna: { coherenciaConWorldBible: false, estiloConsistente: false, problemasResueltos: [], nuevosProblemasIntroducidos: [], confianzaEnCorreccion: 0 },
      resumenEjecutivo: "No se pudieron aplicar correcciones"
    };

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        
        console.log(`[NarrativeRewriter] Chapter ${chapterNumber} rewritten successfully:`);
        console.log(`  Planificación: ${result.fasePlanificacion?.solucionPropuesta?.substring(0, 150) || 'N/A'}...`);
        console.log(`  Cambios realizados: ${result.cambiosRealizados?.length || 0}`);
        
        if (result.cambiosRealizados?.length > 0) {
          result.cambiosRealizados.forEach((c: any, i: number) => {
            console.log(`  ✓ ${i + 1}. [${c.tipoProblema}] ${c.descripcionProblema?.substring(0, 80)}...`);
            console.log(`      Solución: ${c.solucionAplicada?.substring(0, 100)}...`);
            console.log(`      Palabras añadidas: ${c.palabrasAnadidas || 'N/A'}`);
          });
        }
        
        if (result.verificacionInterna) {
          console.log(`  Verificación: Coherencia=${result.verificacionInterna.coherenciaConWorldBible}, Estilo=${result.verificacionInterna.estiloConsistente}, Confianza=${result.verificacionInterna.confianzaEnCorreccion}/10`);
        }
        
        console.log(`  Resumen: ${result.resumenEjecutivo?.substring(0, 200) || 'N/A'}`);
      }
    } catch (e) {
      console.error("[NarrativeRewriter] Failed to parse response:", e);
    }

    result.tokenUsage = response.tokenUsage;
    return result;
  }

  private buildWorldBibleContext(worldBible: any): string {
    if (!worldBible) return "No hay Biblia del Mundo disponible.";
    
    const sections: string[] = [];
    
    if (worldBible.personajes?.length > 0) {
      const chars = worldBible.personajes.slice(0, 20).map((p: any) => 
        `• ${p.nombre} (${p.rol || 'secundario'}): ${p.descripcion?.substring(0, 150) || 'Sin descripción'}${p.arcoNarrativo ? ` | Arco: ${p.arcoNarrativo.substring(0, 100)}` : ''}`
      ).join("\n");
      sections.push(`PERSONAJES:\n${chars}`);
    }
    
    if (worldBible.ubicaciones?.length > 0) {
      const locs = worldBible.ubicaciones.slice(0, 10).map((u: any) => 
        `• ${u.nombre}: ${u.descripcion?.substring(0, 100) || 'Sin descripción'}`
      ).join("\n");
      sections.push(`UBICACIONES:\n${locs}`);
    }
    
    if (worldBible.timeline?.length > 0) {
      const events = worldBible.timeline.slice(0, 15).map((t: any) => 
        `• ${t.evento}: ${t.descripcion?.substring(0, 80) || ''}`
      ).join("\n");
      sections.push(`TIMELINE:\n${events}`);
    }
    
    const worldRules = worldBible.reglasDelMundo || worldBible.reglas || [];
    if (worldRules.length > 0) {
      const rules = worldRules.slice(0, 10).map((r: any) => 
        `• ${typeof r === 'string' ? r : r.regla || JSON.stringify(r)}`
      ).join("\n");
      sections.push(`REGLAS DEL MUNDO:\n${rules}`);
    }
    
    return sections.join("\n\n") || "Biblia del Mundo vacía.";
  }

  private buildAdjacentContext(context: { previousChapter?: string; nextChapter?: string; previousSummary?: string; nextSummary?: string }): string {
    const parts: string[] = [];
    
    if (context.previousSummary) {
      parts.push(`CAPÍTULO ANTERIOR (resumen):\n${context.previousSummary}`);
    } else if (context.previousChapter) {
      parts.push(`CAPÍTULO ANTERIOR (extracto):\n${context.previousChapter.substring(0, 2000)}...`);
    }
    
    if (context.nextSummary) {
      parts.push(`CAPÍTULO SIGUIENTE (resumen):\n${context.nextSummary}`);
    } else if (context.nextChapter) {
      parts.push(`CAPÍTULO SIGUIENTE (extracto):\n${context.nextChapter.substring(0, 2000)}...`);
    }
    
    return parts.join("\n\n") || "No hay contexto de capítulos adyacentes disponible.";
  }

  private buildProblemsList(problems: Array<{ id?: string; tipo: string; descripcion: string; severidad: string; accionSugerida?: string }>, chapterNumber: number): string {
    return problems.map((p, i) => {
      const id = p.id || `P${i + 1}`;
      const severity = p.severidad?.toUpperCase() || 'MEDIA';
      const type = p.tipo || 'general';
      const suggestion = p.accionSugerida ? `\n   ACCIÓN SUGERIDA: ${p.accionSugerida}` : '';
      
      return `[${id}] [${severity}] ${type}
   ${p.descripcion}${suggestion}`;
    }).join("\n\n");
  }
}

class ReeditFinalReviewerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Revisor Final de Re-edición",
      role: "final_reviewer",
      systemPrompt: `Eres un experto de la industria editorial evaluando manuscritos para potencial de bestseller.
IMPORTANTE: Todas tus respuestas deben estar en ESPAÑOL.

Evalúa el manuscrito y proporciona:
1. Puntuación de bestseller (1-10)
2. Fortalezas principales
3. Áreas que necesitan mejora
4. Evaluación del potencial de mercado
5. Recomendaciones para el autor

RESPONDE ÚNICAMENTE CON JSON EN ESPAÑOL:
{
  "bestsellerScore": 8,
  "strengths": ["Trama atrapante", "Personajes bien desarrollados"],
  "weaknesses": ["Problemas de ritmo en la parte central"],
  "marketPotential": "alto",
  "recommendations": ["Apretar el segundo acto", "Fortalecer el final"]
}`,
      model: "gemini-2.5-flash",
      useThinking: false,
      maxOutputTokens: 8192,
    });
  }

  async execute(input: any): Promise<any> {
    return this.reviewManuscript(input.summaries, input.totalChapters, input.totalWords);
  }

  async reviewManuscript(summaries: string[], totalChapters: number, totalWords: number): Promise<any> {
    const prompt = `Evalúa este manuscrito para determinar su potencial de bestseller.
IMPORTANTE: Responde COMPLETAMENTE EN ESPAÑOL.

ESTADÍSTICAS DEL MANUSCRITO:
- Total de Capítulos: ${totalChapters}
- Total de Palabras: ${totalWords}

RESÚMENES Y CALIDAD DE LOS CAPÍTULOS:
${summaries.join("\n\n")}

Proporciona tu evaluación en formato JSON, con todos los textos en ESPAÑOL.`;
    
    const response = await this.generateContent(prompt);
    let result: any = { bestsellerScore: 7, strengths: [], weaknesses: [], recommendations: [], marketPotential: "moderate" };
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("[ReeditFinalReviewer] Failed to parse response:", e);
    }
    result.tokenUsage = response.tokenUsage;
    return result;
  }
}

export class ReeditOrchestrator {
  private editorAgent: ReeditEditorAgent;
  private copyEditorAgent: ReeditCopyEditorAgent;
  private quickFinalReviewerAgent: ReeditFinalReviewerAgent;
  private fullFinalReviewerAgent: FinalReviewerAgent;
  private worldBibleExtractor: WorldBibleExtractorAgent;
  private architectAnalyzer: ArchitectAnalyzerAgent;
  private structuralFixer: StructuralFixerAgent;
  private narrativeRewriter: NarrativeRewriterAgent;
  private continuitySentinel: ContinuitySentinelAgent;
  private voiceRhythmAuditor: VoiceRhythmAuditorAgent;
  private semanticRepetitionDetector: SemanticRepetitionDetectorAgent;
  private anachronismDetector: AnachronismDetectorAgent;
  private expansionAnalyzer: ChapterExpansionAnalyzer;
  private chapterExpander: ChapterExpanderAgent;
  private newChapterGenerator: NewChapterGeneratorAgent;
  private progressCallback: ProgressCallback | null = null;
  
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;
  private totalThinkingTokens: number = 0;
  
  private maxFinalReviewCycles = 10;
  private minAcceptableScore = 9; // Acepta 9+ como suficiente (antes era 10)
  private requiredConsecutiveHighScores = 1; // Solo necesita 1 puntuación 9+ sin issues críticos (antes eran 2)

  constructor() {
    this.editorAgent = new ReeditEditorAgent();
    this.copyEditorAgent = new ReeditCopyEditorAgent();
    this.quickFinalReviewerAgent = new ReeditFinalReviewerAgent();
    this.fullFinalReviewerAgent = new FinalReviewerAgent();
    this.worldBibleExtractor = new WorldBibleExtractorAgent();
    this.architectAnalyzer = new ArchitectAnalyzerAgent();
    this.structuralFixer = new StructuralFixerAgent();
    this.narrativeRewriter = new NarrativeRewriterAgent();
    this.continuitySentinel = new ContinuitySentinelAgent();
    this.voiceRhythmAuditor = new VoiceRhythmAuditorAgent();
    this.semanticRepetitionDetector = new SemanticRepetitionDetectorAgent();
    this.anachronismDetector = new AnachronismDetectorAgent();
    this.expansionAnalyzer = new ChapterExpansionAnalyzer();
    this.chapterExpander = new ChapterExpanderAgent();
    this.newChapterGenerator = new NewChapterGeneratorAgent();
  }
  
  private trackTokens(response: any) {
    if (response?.tokenUsage) {
      this.totalInputTokens += response.tokenUsage.inputTokens || 0;
      this.totalOutputTokens += response.tokenUsage.outputTokens || 0;
      this.totalThinkingTokens += response.tokenUsage.thinkingTokens || 0;
    }
  }
  
  /**
   * Generate a hash for an issue to track if it has been resolved.
   * Uses category + simplified description + affected chapters to create stable ID.
   */
  private generateIssueHash(issue: FinalReviewIssue): string {
    // Normalize description: lowercase, remove extra spaces, keep first 100 chars
    const normalizedDesc = (issue.descripcion || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 100);
    
    // Sort chapters for consistent hashing
    const chapters = (issue.capitulos_afectados || []).sort((a, b) => a - b).join(",");
    
    // Create hash from category + description + chapters
    const hashInput = `${issue.categoria || "unknown"}|${normalizedDesc}|${chapters}`;
    
    // Simple string hash (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < hashInput.length; i++) {
      hash = ((hash << 5) + hash) + hashInput.charCodeAt(i);
    }
    return `issue_${Math.abs(hash).toString(16)}`;
  }
  
  /**
   * Filter out issues that have already been resolved in previous cycles.
   */
  private filterNewIssues(
    issues: FinalReviewIssue[],
    resolvedHashes: string[]
  ): { newIssues: FinalReviewIssue[]; filteredCount: number } {
    const resolvedSet = new Set(resolvedHashes);
    const newIssues: FinalReviewIssue[] = [];
    let filteredCount = 0;
    
    for (const issue of issues) {
      const hash = this.generateIssueHash(issue);
      if (resolvedSet.has(hash)) {
        console.log(`[ReeditOrchestrator] Filtering resolved issue: ${issue.categoria} - ${issue.descripcion?.substring(0, 50)}...`);
        filteredCount++;
      } else {
        newIssues.push(issue);
      }
    }
    
    if (filteredCount > 0) {
      console.log(`[ReeditOrchestrator] Filtered ${filteredCount} previously resolved issues, ${newIssues.length} new issues remain`);
    }
    
    return { newIssues, filteredCount };
  }
  
  /**
   * Mark issues as resolved by adding their hashes to the project's resolved list.
   */
  private async markIssuesResolved(projectId: number, issues: FinalReviewIssue[]): Promise<void> {
    if (issues.length === 0) return;
    
    const project = await storage.getReeditProject(projectId);
    const existingHashes = (project?.resolvedIssueHashes as string[]) || [];
    
    const newHashes = issues.map(issue => this.generateIssueHash(issue));
    const combinedHashes = [...existingHashes, ...newHashes];
    const allHashes = combinedHashes.filter((hash, index) => combinedHashes.indexOf(hash) === index);
    
    await storage.updateReeditProject(projectId, {
      resolvedIssueHashes: allHashes as any,
    });
    
    console.log(`[ReeditOrchestrator] Marked ${newHashes.length} issues as resolved (total: ${allHashes.length})`);
  }
  
  private async saveTokenUsage(projectId: number) {
    await storage.updateReeditProject(projectId, {
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalThinkingTokens: this.totalThinkingTokens,
    });
    console.log(`[ReeditOrchestrator] Token usage saved: ${this.totalInputTokens} input, ${this.totalOutputTokens} output, ${this.totalThinkingTokens} thinking`);
  }

  private async updateHeartbeat(projectId: number, lastCompletedChapter?: number) {
    const updates: any = { 
      heartbeatAt: new Date(),
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalThinkingTokens: this.totalThinkingTokens,
    };
    if (lastCompletedChapter !== undefined) {
      updates.lastCompletedChapter = lastCompletedChapter;
    }
    await storage.updateReeditProject(projectId, updates);
  }

  private updateChapterTitleNumber(title: string | null, newChapterNumber: number): string {
    if (!title) return `Capítulo ${newChapterNumber}`;
    
    // Match patterns like "Capítulo X:", "Capítulo X -", "Capítulo X" at the start
    const chapterPrefixPattern = /^Capítulo\s+\d+\s*[:|-]?\s*/i;
    
    if (chapterPrefixPattern.test(title)) {
      // Extract the subtitle (everything after the prefix)
      const subtitle = title.replace(chapterPrefixPattern, '').trim();
      if (subtitle) {
        return `Capítulo ${newChapterNumber}: ${subtitle}`;
      } else {
        return `Capítulo ${newChapterNumber}`;
      }
    }
    
    // Special titles that should NOT get "Capítulo X:" prefix
    const specialTitles = /^(prólogo|epílogo|preludio|interludio|epilogue|prologue|prelude|interlude)/i;
    if (specialTitles.test(title.trim())) {
      return title;
    }
    
    // For inserted chapters or chapters without prefix, ADD the "Capítulo X:" prefix
    // This ensures all regular chapters have consistent naming
    return `Capítulo ${newChapterNumber}: ${title}`;
  }

  /**
   * Update the chapter header inside the content text to match new chapter number.
   * This ensures the internal text reflects the correct chapter numbering.
   * Returns the updated content, or the original if no header was found.
   */
  private normalizeChapterHeaderContent(
    content: string | null,
    newChapterNumber: number,
    updatedTitle: string
  ): string | null {
    if (!content) return content;
    
    // Special titles that should NOT be renumbered
    const specialTitles = /^(prólogo|epílogo|preludio|interludio|epilogue|prologue|prelude|interlude)/i;
    if (specialTitles.test(updatedTitle.trim())) {
      return content;
    }
    
    // Pattern to match chapter headers at the start of content (with variations)
    // Matches: "Capítulo X", "Capítulo X:", "Capítulo X -", "CAPÍTULO X", "Chapter X", etc.
    // Also handles "Capitulo" without accent, roman numerals, etc.
    const headerPatterns = [
      // Spanish: Capítulo X: Título or Capítulo X - Título or just Capítulo X
      /^(Capítulo|Capitulo|CAPÍTULO|CAPITULO)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
      // English: Chapter X: Title
      /^(Chapter|CHAPTER)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
      // French: Chapitre X
      /^(Chapitre|CHAPITRE)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
      // Italian: Capitolo X
      /^(Capitolo|CAPITOLO)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
      // German: Kapitel X
      /^(Kapitel|KAPITEL)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
      // Catalan: Capítol X
      /^(Capítol|Capitol|CAPÍTOL|CAPITOL)\s+(\d+|[IVXLCDM]+)\s*[:|-]?\s*([^\n]*)/im,
    ];
    
    for (const pattern of headerPatterns) {
      const match = content.match(pattern);
      if (match) {
        const keyword = match[1]; // e.g., "Capítulo", "Chapter"
        // Reconstruct the header with the new number
        // Use the title directly as it already has the correct format
        const newHeader = updatedTitle;
        
        // Replace the old header with the new one
        const updatedContent = content.replace(pattern, newHeader);
        
        if (updatedContent !== content) {
          console.log(`[ReeditOrchestrator] Updated internal header: "${match[0].substring(0, 50)}..." -> "${newHeader}"`);
          return updatedContent;
        }
        break;
      }
    }
    
    return content;
  }

  private buildAdjacentChapterContext(
    chapters: ReeditChapter[],
    currentChapterNumber: number
  ): { previousChapter?: string; nextChapter?: string; previousSummary?: string; nextSummary?: string } {
    const sortedChapters = [...chapters].sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
    const currentIndex = sortedChapters.findIndex(c => c.chapterNumber === currentChapterNumber);
    
    const context: { previousChapter?: string; nextChapter?: string; previousSummary?: string; nextSummary?: string } = {};
    
    if (currentIndex > 0) {
      const prevChapter = sortedChapters[currentIndex - 1];
      context.previousChapter = prevChapter.originalContent?.substring(0, 3000);
      context.previousSummary = `Capítulo ${prevChapter.chapterNumber}: ${prevChapter.title || 'Sin título'}`;
    }
    
    if (currentIndex < sortedChapters.length - 1) {
      const nextChapter = sortedChapters[currentIndex + 1];
      context.nextChapter = nextChapter.originalContent?.substring(0, 3000);
      context.nextSummary = `Capítulo ${nextChapter.chapterNumber}: ${nextChapter.title || 'Sin título'}`;
    }
    
    return context;
  }

  private async checkCancellation(projectId: number): Promise<boolean> {
    const project = await storage.getReeditProject(projectId);
    if (project?.cancelRequested) {
      console.log(`[ReeditOrchestrator] Cancellation requested for project ${projectId}`);
      await storage.updateReeditProject(projectId, {
        status: "paused",
        cancelRequested: false,
        errorMessage: "Cancelado por el usuario",
      });
      return true;
    }
    return false;
  }

  private async expandManuscript(
    projectId: number,
    project: ReeditProject,
    validChapters: ReeditChapter[],
    worldBible: any
  ): Promise<ReeditChapter[]> {
    const enableExpansion = project.expandChapters || false;
    const enableNewChapters = project.insertNewChapters || false;
    const targetMinWords = project.targetMinWordsPerChapter || 2000;

    if (!enableExpansion && !enableNewChapters) {
      console.log(`[ReeditOrchestrator] Expansion disabled for project ${projectId}`);
      return validChapters;
    }

    console.log(`[ReeditOrchestrator] Starting manuscript expansion`);
    console.log(`  - Expand existing chapters: ${enableExpansion}`);
    console.log(`  - Insert new chapters: ${enableNewChapters}`);
    console.log(`  - Target min words/chapter: ${targetMinWords}`);

    const projectGenre = (project as any).genre || "thriller literario";
    
    let plan = project.expansionPlan as any;
    
    // Constants for necessity filtering
    const EXPANSION_THRESHOLD = 0.7;
    const NEW_CHAPTER_THRESHOLD = 0.8;
    
    if (plan && plan.chaptersToExpand) {
      console.log(`[ReeditOrchestrator] Reusing existing expansion plan from database`);
      
      // Apply necessity filtering to reused plans as well (in case they're from before filtering was added)
      const originalExpandCount = plan.chaptersToExpand?.length || 0;
      const originalInsertCount = plan.newChaptersToInsert?.length || 0;
      
      if (plan.chaptersToExpand) {
        plan.chaptersToExpand = plan.chaptersToExpand.filter((exp: any) => {
          const score = exp.necessityScore ?? 1.0; // Legacy plans without score: assume they were needed
          if (score < EXPANSION_THRESHOLD) {
            console.log(`[ReeditOrchestrator] Filtering out expansion of chapter ${exp.chapterNumber} (necessityScore: ${score} < ${EXPANSION_THRESHOLD})`);
            return false;
          }
          return true;
        });
      }
      
      if (plan.newChaptersToInsert) {
        plan.newChaptersToInsert = plan.newChaptersToInsert.filter((ins: any) => {
          const score = ins.necessityScore ?? 1.0; // Legacy plans without score: assume they were needed
          if (score < NEW_CHAPTER_THRESHOLD) {
            console.log(`[ReeditOrchestrator] Filtering out new chapter "${ins.title}" after ch ${ins.insertAfterChapter} (necessityScore: ${score} < ${NEW_CHAPTER_THRESHOLD})`);
            return false;
          }
          return true;
        });
      }
      
      console.log(`  - Chapters to expand: ${plan.chaptersToExpand?.length || 0} (after filtering from ${originalExpandCount})`);
      console.log(`  - New chapters to insert: ${plan.newChaptersToInsert?.length || 0} (after filtering from ${originalInsertCount})`);
    } else {
      this.emitProgress({
        projectId,
        stage: "expansion",
        currentChapter: 0,
        totalChapters: validChapters.length,
        message: "Analizando manuscrito para expansión...",
      });

      const chapterSummaries = validChapters.map(c => ({
        chapterNumber: c.chapterNumber,
        title: c.title || `Capítulo ${c.chapterNumber}`,
        wordCount: c.wordCount || c.originalContent.split(/\s+/).length,
        summary: c.originalContent.substring(0, 1500) + (c.originalContent.length > 1500 ? "..." : ""),
      }));

      const analysisResult = await this.expansionAnalyzer.execute({
        chapters: chapterSummaries,
        genre: projectGenre,
        targetMinWordsPerChapter: targetMinWords,
        enableNewChapters,
        enableChapterExpansion: enableExpansion,
      });
      this.trackTokens(analysisResult);

      if (!analysisResult.result) {
        console.log(`[ReeditOrchestrator] Expansion analysis failed, continuing without expansion`);
        return validChapters;
      }

      plan = analysisResult.result;
      
      // Filter by necessity score - only keep items that are truly necessary
      const originalExpandCount = plan.chaptersToExpand?.length || 0;
      const originalInsertCount = plan.newChaptersToInsert?.length || 0;
      
      // Filter expansions by necessity score
      if (plan.chaptersToExpand) {
        plan.chaptersToExpand = plan.chaptersToExpand.filter((exp: any) => {
          const score = exp.necessityScore || 0;
          if (score < EXPANSION_THRESHOLD) {
            console.log(`[ReeditOrchestrator] Filtering out expansion of chapter ${exp.chapterNumber} (necessityScore: ${score} < ${EXPANSION_THRESHOLD})`);
            return false;
          }
          return true;
        });
      }
      
      // Filter new chapter insertions by necessity score (stricter threshold)
      if (plan.newChaptersToInsert) {
        plan.newChaptersToInsert = plan.newChaptersToInsert.filter((ins: any) => {
          const score = ins.necessityScore || 0;
          if (score < NEW_CHAPTER_THRESHOLD) {
            console.log(`[ReeditOrchestrator] Filtering out new chapter "${ins.title}" after ch ${ins.insertAfterChapter} (necessityScore: ${score} < ${NEW_CHAPTER_THRESHOLD})`);
            return false;
          }
          console.log(`[ReeditOrchestrator] Keeping new chapter "${ins.title}" (necessityScore: ${score}, justification: ${ins.justification || 'N/A'})`);
          return true;
        });
      }
      
      console.log(`[ReeditOrchestrator] Expansion plan created:`);
      console.log(`  - Chapters to expand: ${plan.chaptersToExpand?.length || 0} (filtered from ${originalExpandCount})`);
      console.log(`  - New chapters to insert: ${plan.newChaptersToInsert?.length || 0} (filtered from ${originalInsertCount})`);
      console.log(`  - Overall necessity: ${plan.overallNecessityAssessment || 'unknown'}`);
      console.log(`  - Estimated new words: ${plan.totalEstimatedNewWords || 0}`);

      await storage.updateReeditProject(projectId, {
        expansionPlan: plan as any,
      });
    }

    let updatedChapters = [...validChapters];

    if (enableExpansion && plan.chaptersToExpand?.length > 0) {
      let skippedCount = 0;
      for (let i = 0; i < plan.chaptersToExpand.length; i++) {
        const expansion = plan.chaptersToExpand[i];
        const chapter = updatedChapters.find(c => c.chapterNumber === expansion.chapterNumber);
        
        if (!chapter) continue;

        const currentWordCount = chapter.wordCount || chapter.originalContent.split(/\s+/).length;
        const targetThreshold = expansion.targetWords * 0.9;
        if (currentWordCount >= targetThreshold) {
          console.log(`[ReeditOrchestrator] Skipping chapter ${chapter.chapterNumber} (already expanded: ${currentWordCount} >= ${Math.round(targetThreshold)} words)`);
          skippedCount++;
          continue;
        }

        if (await this.checkCancellation(projectId)) return updatedChapters;

        this.emitProgress({
          projectId,
          stage: "expansion",
          currentChapter: i + 1,
          totalChapters: plan.chaptersToExpand.length,
          message: `Expandiendo capítulo ${chapter.chapterNumber}: ${chapter.title || "Sin título"}...`,
        });

        const adjacentContext = this.buildAdjacentChapterContext(updatedChapters, chapter.chapterNumber);

        const expandResult = await this.chapterExpander.execute({
          chapterContent: chapter.originalContent,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title || `Capítulo ${chapter.chapterNumber}`,
          expansionPlan: {
            targetWords: expansion.targetWords,
            expansionType: expansion.expansionType,
            suggestedContent: expansion.suggestedContent,
          },
          worldBible,
          adjacentContext: {
            previousSummary: adjacentContext.previousSummary,
            nextSummary: adjacentContext.nextSummary,
          },
        });
        this.trackTokens(expandResult);

        if (expandResult.result?.expandedContent) {
          const newWordCount = expandResult.result.newWordCount || expandResult.result.expandedContent.split(/\s+/).length;
          
          await storage.updateReeditChapter(chapter.id, {
            originalContent: expandResult.result.expandedContent,
            wordCount: newWordCount,
          });

          const chapterIndex = updatedChapters.findIndex(c => c.id === chapter.id);
          if (chapterIndex >= 0) {
            updatedChapters[chapterIndex] = {
              ...updatedChapters[chapterIndex],
              originalContent: expandResult.result.expandedContent,
              wordCount: newWordCount,
            };
          }

          console.log(`[ReeditOrchestrator] Chapter ${chapter.chapterNumber} expanded: ${expansion.currentWords} -> ${newWordCount} words`);
        }

        await this.updateHeartbeat(projectId);
      }
    }

    if (enableNewChapters && plan.newChaptersToInsert?.length > 0) {
      const sortedInsertions = [...plan.newChaptersToInsert].sort(
        (a, b) => b.insertAfterChapter - a.insertAfterChapter
      );

      for (let i = 0; i < sortedInsertions.length; i++) {
        const insertion = sortedInsertions[i];
        
        // Check if chapter with this title already exists (inserted in previous run)
        const existingNewChapter = updatedChapters.find(c => 
          c.title === insertion.title && c.originalContent && c.originalContent.length > 500
        );
        if (existingNewChapter) {
          console.log(`[ReeditOrchestrator] Skipping new chapter insertion after ${insertion.insertAfterChapter} (already exists: "${insertion.title}")`);
          continue;
        }

        if (await this.checkCancellation(projectId)) return updatedChapters;

        this.emitProgress({
          projectId,
          stage: "expansion",
          currentChapter: (plan.chaptersToExpand?.length || 0) + i + 1,
          totalChapters: (plan.chaptersToExpand?.length || 0) + plan.newChaptersToInsert.length,
          message: `Generando nuevo capítulo: "${insertion.title}"...`,
        });

        const prevChapter = updatedChapters.find(c => c.chapterNumber === insertion.insertAfterChapter);
        const nextChapter = updatedChapters.find(c => c.chapterNumber === insertion.insertAfterChapter + 1);

        const newChapterResult = await this.newChapterGenerator.execute({
          insertAfterChapter: insertion.insertAfterChapter,
          title: insertion.title,
          purpose: insertion.purpose,
          plotPoints: insertion.plotPoints,
          estimatedWords: insertion.estimatedWords,
          worldBible,
          previousChapterSummary: prevChapter?.originalContent?.substring(0, 2000) || "No disponible",
          nextChapterSummary: nextChapter?.originalContent?.substring(0, 2000) || "No disponible",
          genre: projectGenre,
        });
        this.trackTokens(newChapterResult);

        if (newChapterResult.result?.content) {
          // Use a temporary high number to avoid conflicts (will be renumbered later)
          // Calculate position: insert after the target chapter
          const tempChapterNumber = 9000 + i;
          const wordCount = newChapterResult.result.wordCount || newChapterResult.result.content.split(/\s+/).length;

          // Use createReeditChapterIfNotExists to prevent duplicates on pipeline restart/retry
          const newChapter = await storage.createReeditChapterIfNotExists({
            projectId,
            chapterNumber: tempChapterNumber,
            originalChapterNumber: tempChapterNumber, // Set originalChapterNumber for deduplication
            title: newChapterResult.result.title || insertion.title,
            originalContent: newChapterResult.result.content,
            wordCount,
            status: "pending",
            processingStage: "none",
          });

          // Store the intended position for sorting
          const insertPosition = insertion.insertAfterChapter + 0.5;
          updatedChapters.push({ ...newChapter, _sortOrder: insertPosition } as any);
          updatedChapters.sort((a, b) => {
            const orderA = (a as any)._sortOrder ?? a.chapterNumber;
            const orderB = (b as any)._sortOrder ?? b.chapterNumber;
            return orderA - orderB;
          });

          console.log(`[ReeditOrchestrator] New chapter created after ${insertion.insertAfterChapter}: "${insertion.title}" (${wordCount} words)`);
          
          // Renumber ALL chapters immediately after each new insertion so they appear correctly in UI
          await this.renumberChaptersInDatabase(updatedChapters, projectId);
        }

        await this.updateHeartbeat(projectId);
      }

      await storage.updateReeditProject(projectId, {
        totalChapters: updatedChapters.length,
      });
    }

    const totalWords = updatedChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    console.log(`[ReeditOrchestrator] Expansion complete: ${updatedChapters.length} chapters, ${totalWords} words`);

    return updatedChapters;
  }

  /**
   * Renumber all chapters in the database based on their _sortOrder (or chapterNumber).
   * This ensures new chapters appear in the correct position in the UI immediately.
   * Also updates the internal chapter headers in originalContent and editedContent.
   */
  private async renumberChaptersInDatabase(
    chapters: ReeditChapter[],
    projectId: number
  ): Promise<void> {
    let newChapterNum = 1;
    for (const chapter of chapters) {
      const updates: any = {};
      
      // Renumber if needed
      if (chapter.chapterNumber !== newChapterNum) {
        updates.originalChapterNumber = chapter.chapterNumber;
        updates.chapterNumber = newChapterNum;
      }
      
      // Update title prefix to match new chapter number
      const updatedTitle = this.updateChapterTitleNumber(chapter.title, newChapterNum);
      if (updatedTitle !== chapter.title) {
        updates.title = updatedTitle;
        console.log(`[ReeditOrchestrator] Renaming: "${chapter.title}" -> "${updatedTitle}"`);
      }
      
      // Update internal chapter headers in content (originalContent and editedContent)
      // This ensures the text content matches the new chapter number
      if (chapter.chapterNumber !== newChapterNum || updatedTitle !== chapter.title) {
        const titleForContent = updatedTitle;
        
        // Update originalContent header
        const updatedOriginalContent = this.normalizeChapterHeaderContent(
          chapter.originalContent,
          newChapterNum,
          titleForContent
        );
        if (updatedOriginalContent && updatedOriginalContent !== chapter.originalContent) {
          updates.originalContent = updatedOriginalContent;
          chapter.originalContent = updatedOriginalContent;
        }
        
        // Update editedContent header if it exists
        if (chapter.editedContent) {
          const updatedEditedContent = this.normalizeChapterHeaderContent(
            chapter.editedContent,
            newChapterNum,
            titleForContent
          );
          if (updatedEditedContent && updatedEditedContent !== chapter.editedContent) {
            updates.editedContent = updatedEditedContent;
            chapter.editedContent = updatedEditedContent;
          }
        }
      }
      
      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await storage.updateReeditChapter(chapter.id, updates);
        if (updates.chapterNumber) chapter.chapterNumber = newChapterNum;
        if (updates.title) chapter.title = updatedTitle;
      }
      
      newChapterNum++;
    }
    
    // Update project total chapters count
    await storage.updateReeditProject(projectId, {
      totalChapters: chapters.length,
    });
    
    console.log(`[ReeditOrchestrator] Renumbered ${chapters.length} chapters in database (including internal content headers)`);
  }

  /**
   * Reorder chapters based on Architect Analyzer recommendations.
   * Each reordering specifies which chapter should move to which position.
   */
  private async reorderChaptersFromAnalysis(
    chapters: ReeditChapter[],
    projectId: number,
    reordenamientos: Array<{ capituloActual: number; nuevaPosicion: number; razon: string }>
  ): Promise<ReeditChapter[]> {
    if (!reordenamientos || reordenamientos.length === 0) {
      return chapters;
    }

    console.log(`[ReeditOrchestrator] Reordering ${reordenamientos.length} chapters based on Architect analysis:`);
    
    // Sort chapters by current number
    let sortedChapters = [...chapters].sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
    
    // Apply each reordering
    for (const reorder of reordenamientos) {
      const { capituloActual, nuevaPosicion, razon } = reorder;
      
      // Find the chapter to move
      const chapterIndex = sortedChapters.findIndex(c => c.chapterNumber === capituloActual);
      if (chapterIndex === -1) {
        console.log(`  [SKIP] Capítulo ${capituloActual} no encontrado`);
        continue;
      }
      
      const chapter = sortedChapters[chapterIndex];
      
      // Remove from current position
      sortedChapters.splice(chapterIndex, 1);
      
      // Insert at new position (adjusted for 0-based indexing)
      const newIndex = Math.max(0, Math.min(nuevaPosicion - 1, sortedChapters.length));
      sortedChapters.splice(newIndex, 0, chapter);
      
      console.log(`  ✓ Capítulo ${capituloActual} ("${chapter.title?.substring(0, 40)}...") -> posición ${nuevaPosicion}`);
      console.log(`    Razón: ${razon}`);
    }
    
    // Renumber all chapters in the database
    await this.renumberChaptersInDatabase(sortedChapters, projectId);
    
    console.log(`[ReeditOrchestrator] Chapter reordering complete`);
    
    return sortedChapters;
  }

  private async collectQaFindings(projectId: number): Promise<Map<number, any[]>> {
    const problemsByChapter = new Map<number, any[]>();
    
    const auditReports = await storage.getReeditAuditReportsByProject(projectId);
    
    // Collect from continuity reports
    const continuityReports = auditReports.filter(r => r.auditType === "continuity");
    for (const report of continuityReports) {
      const findings = report.findings as any;
      if (findings?.erroresContinuidad) {
        for (const error of findings.erroresContinuidad) {
          const chapNum = error.capitulo;
          if (typeof chapNum === 'number' && (error.severidad === 'critica' || error.severidad === 'crítica' || error.severidad === 'mayor')) {
            if (!problemsByChapter.has(chapNum)) {
              problemsByChapter.set(chapNum, []);
            }
            problemsByChapter.get(chapNum)!.push({
              source: "continuity_sentinel",
              type: error.tipo,
              severity: error.severidad,
              summary: error.descripcion,
              correctionHint: error.correccion,
              evidence: error.contexto,
            });
          }
        }
      }
    }
    
    // Collect from voice_rhythm reports
    const voiceReports = auditReports.filter(r => r.auditType === "voice_rhythm");
    for (const report of voiceReports) {
      const findings = report.findings as any;
      if (findings?.problemasTono) {
        for (const problem of findings.problemasTono) {
          if (problem.severidad === 'mayor') {
            const chapters = problem.capitulos || [];
            for (const chapNum of chapters) {
              if (typeof chapNum === 'number') {
                if (!problemsByChapter.has(chapNum)) {
                  problemsByChapter.set(chapNum, []);
                }
                problemsByChapter.get(chapNum)!.push({
                  source: "voice_rhythm_auditor",
                  type: problem.tipo,
                  severity: problem.severidad,
                  summary: problem.descripcion,
                  correctionHint: problem.correccion,
                  evidence: problem.ejemplo,
                });
              }
            }
          }
        }
      }
    }
    
    // Collect from semantic_repetition reports
    const semanticReports = auditReports.filter(r => r.auditType === "semantic_repetition");
    for (const report of semanticReports) {
      const findings = report.findings as any;
      if (findings?.repeticionesSemanticas) {
        for (const repetition of findings.repeticionesSemanticas) {
          if (repetition.severidad === 'mayor') {
            const chapters = repetition.ocurrencias || [];
            for (const chapNum of chapters) {
              if (typeof chapNum === 'number') {
                if (!problemsByChapter.has(chapNum)) {
                  problemsByChapter.set(chapNum, []);
                }
                problemsByChapter.get(chapNum)!.push({
                  source: "semantic_repetition_detector",
                  type: repetition.tipo,
                  severity: repetition.severidad,
                  summary: repetition.descripcion,
                  correctionHint: repetition.fix_sugerido || `${repetition.accion}: ${repetition.ejemplo || ''}`,
                  evidence: repetition.ejemplo,
                });
              }
            }
          }
        }
      }
      if (findings?.foreshadowingTracking) {
        for (const fs of findings.foreshadowingTracking) {
          if (fs.estado === 'sin_payoff' && typeof fs.plantado === 'number') {
            const chapNum = fs.plantado;
            if (!problemsByChapter.has(chapNum)) {
              problemsByChapter.set(chapNum, []);
            }
            problemsByChapter.get(chapNum)!.push({
              source: "semantic_repetition_detector",
              type: "foreshadowing_sin_resolver",
              severity: "mayor",
              summary: `Foreshadowing sin resolver: "${fs.elemento}" plantado en capítulo ${fs.plantado} nunca se resuelve`,
              correctionHint: "Añadir payoff/resolución para este foreshadowing o eliminar la pista si no es relevante",
              evidence: fs.elemento,
            });
          }
        }
      }
    }
    
    // Collect from anachronism reports
    const anachronismReports = auditReports.filter(r => r.auditType === "anachronism");
    for (const report of anachronismReports) {
      const findings = report.findings as any;
      if (findings?.anacronismos) {
        for (const anachronism of findings.anacronismos) {
          if (anachronism.severidad === 'critica' || anachronism.severidad === 'crítica' || anachronism.severidad === 'mayor') {
            const chapNum = anachronism.capitulo;
            if (typeof chapNum === 'number') {
              if (!problemsByChapter.has(chapNum)) {
                problemsByChapter.set(chapNum, []);
              }
              problemsByChapter.get(chapNum)!.push({
                source: "anachronism_detector",
                type: anachronism.tipo,
                severity: anachronism.severidad,
                summary: `${anachronism.problema}: ${anachronism.fragmento}`,
                correctionHint: anachronism.correccion,
                evidence: anachronism.fragmento,
              });
            }
          }
        }
      }
    }
    
    return problemsByChapter;
  }

  private collectArchitectProblems(architectResult: any): any[] {
    const problems: any[] = [];
    
    // Collect from analisisTrama
    if (architectResult.analisisTrama) {
      const { huecosArgumentales, subplotsSinResolver, arcosIncompletos } = architectResult.analisisTrama;
      
      if (huecosArgumentales) {
        for (const hole of huecosArgumentales) {
          problems.push({
            tipo: "hueco_argumental",
            severidad: hole.severidad || "mayor",
            descripcion: hole.descripcion,
            capitulosAfectados: hole.capitulos || [],
            accionSugerida: "Añadir escena o diálogo que cierre el hueco lógico",
          });
        }
      }
      
      if (subplotsSinResolver) {
        for (const subplot of subplotsSinResolver) {
          problems.push({
            tipo: "subplot_sin_resolver",
            severidad: "mayor",
            descripcion: subplot.descripcion || subplot,
            capitulosAfectados: subplot.capitulos || [],
            accionSugerida: "Añadir resolución para la subtrama",
          });
        }
      }
      
      if (arcosIncompletos) {
        for (const arco of arcosIncompletos) {
          problems.push({
            tipo: "arco_incompleto",
            severidad: "mayor",
            descripcion: arco.descripcion || arco,
            capitulosAfectados: arco.capitulos || [],
            accionSugerida: "Completar la transformación del personaje",
          });
        }
      }
    }
    
    // Collect from coherenciaMundo
    if (architectResult.coherenciaMundo) {
      const { contradicciones, reglasRotas } = architectResult.coherenciaMundo;
      
      if (contradicciones) {
        for (const contradiccion of contradicciones) {
          problems.push({
            tipo: "contradiccion",
            severidad: contradiccion.severidad || "critica",
            descripcion: contradiccion.descripcion,
            capitulosAfectados: contradiccion.capitulos || [],
            accionSugerida: "Corregir la inconsistencia para mantener coherencia",
          });
        }
      }
      
      if (reglasRotas) {
        for (const regla of reglasRotas) {
          problems.push({
            tipo: "regla_rota",
            severidad: "mayor",
            descripcion: regla.descripcion || regla,
            capitulosAfectados: regla.capitulos || [],
            accionSugerida: "Ajustar el texto para respetar las reglas del mundo",
          });
        }
      }
    }
    
    // Collect from recomendaciones
    if (architectResult.recomendaciones) {
      for (const rec of architectResult.recomendaciones) {
        if (rec.severidad === "critica" || rec.severidad === "mayor") {
          problems.push({
            tipo: rec.tipo || "recomendacion",
            severidad: rec.severidad,
            descripcion: rec.descripcion,
            capitulosAfectados: rec.capitulosAfectados || [],
            accionSugerida: rec.accionSugerida,
          });
        }
      }
    }
    
    return problems;
  }

  private async consolidateAllProblems(
    architectProblems: any[],
    qaFindings: Map<number, any[]>
  ): Promise<Map<number, any[]>> {
    const consolidatedByChapter = new Map<number, any[]>();
    
    // Add architect problems (convert to unified format)
    for (const problem of architectProblems) {
      const chapters = problem.capitulosAfectados || problem.capitulos || [];
      for (const chapNum of chapters) {
        if (typeof chapNum === 'number') {
          if (!consolidatedByChapter.has(chapNum)) {
            consolidatedByChapter.set(chapNum, []);
          }
          consolidatedByChapter.get(chapNum)!.push({
            source: "architect",
            tipo: problem.tipo,
            descripcion: problem.descripcion,
            severidad: problem.severidad,
            accionSugerida: problem.accionSugerida,
          });
        }
      }
    }
    
    // Add QA findings (already in unified format by chapter)
    for (const [chapNum, problems] of Array.from(qaFindings.entries())) {
      if (!consolidatedByChapter.has(chapNum)) {
        consolidatedByChapter.set(chapNum, []);
      }
      for (const problem of problems) {
        consolidatedByChapter.get(chapNum)!.push({
          source: problem.source,
          tipo: problem.type,
          descripcion: problem.summary,
          severidad: problem.severity,
          accionSugerida: problem.correctionHint,
        });
      }
    }
    
    console.log(`[ReeditOrchestrator] Consolidated problems: ${consolidatedByChapter.size} chapters with issues`);
    for (const [chapNum, problems] of Array.from(consolidatedByChapter.entries())) {
      console.log(`  - Chapter ${chapNum}: ${problems.length} problems (${(problems as any[]).map((p: any) => p.source).join(', ')})`);
    }
    
    return consolidatedByChapter;
  }

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  private emitProgress(progress: ReeditProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
    console.log(`[ReeditOrchestrator] ${progress.stage}: ${progress.message}`);
    
    // Persist activity message to database for real-time UI updates
    storage.updateReeditProject(progress.projectId, {
      currentActivity: progress.message,
      currentChapter: progress.currentChapter,
    }).catch(err => console.error("[ReeditOrchestrator] Failed to update currentActivity:", err));
  }

  async analyzeStructure(chapters: ReeditChapter[]): Promise<StructureAnalysis> {
    const analysis: StructureAnalysis = {
      hasIssues: false,
      duplicateChapters: [],
      outOfOrderChapters: [],
      missingChapters: [],
      recommendations: [],
    };

    // Separate special chapters from regular chapters
    // 0 = Prologue, 998 = Epilogue, 999 = Author's Note
    const specialChapterNumbers = [0, 998, 999];
    const regularChapters = chapters.filter(c => !specialChapterNumbers.includes(c.chapterNumber));
    const regularChapterNumbers = regularChapters.map(c => c.chapterNumber).sort((a, b) => a - b);
    
    // Add metadata about special chapters
    const hasPrologue = chapters.some(c => c.chapterNumber === 0);
    const hasEpilogue = chapters.some(c => c.chapterNumber === 998);
    const hasAuthorNote = chapters.some(c => c.chapterNumber === 999);
    (analysis as any).hasPrologue = hasPrologue;
    (analysis as any).hasEpilogue = hasEpilogue;
    (analysis as any).hasAuthorNote = hasAuthorNote;
    (analysis as any).totalChapters = chapters.length;
    (analysis as any).regularChapters = regularChapters.length;
    
    // Only check for missing chapters among regular chapters (1 to max regular chapter)
    const maxRegularChapter = regularChapterNumbers.length > 0 ? Math.max(...regularChapterNumbers) : 0;
    
    for (let i = 1; i <= maxRegularChapter; i++) {
      const count = regularChapterNumbers.filter(n => n === i).length;
      if (count === 0) {
        analysis.missingChapters.push(i);
        analysis.hasIssues = true;
      } else if (count > 1) {
        const duplicates = regularChapters.filter(c => c.chapterNumber === i);
        for (let j = 1; j < duplicates.length; j++) {
          const similarity = this.calculateSimilarity(
            duplicates[0].originalContent,
            duplicates[j].originalContent
          );
          analysis.duplicateChapters.push({
            chapterId: duplicates[j].id,
            duplicateOf: duplicates[0].id,
            similarity,
          });
        }
        analysis.hasIssues = true;
      }
    }

    for (let i = 0; i < chapters.length - 1; i++) {
      const current = chapters[i];
      const next = chapters[i + 1];
      
      if (current.chapterNumber > next.chapterNumber) {
        analysis.outOfOrderChapters.push({
          chapterNumber: next.chapterNumber,
          suggestedPosition: i,
          reason: `Chapter ${next.chapterNumber} appears after chapter ${current.chapterNumber}`,
        });
        analysis.hasIssues = true;
      }
    }

    if (analysis.duplicateChapters.length > 0) {
      analysis.recommendations.push(
        `Found ${analysis.duplicateChapters.length} duplicate chapter(s). Review and remove duplicates.`
      );
    }
    if (analysis.outOfOrderChapters.length > 0) {
      analysis.recommendations.push(
        `Found ${analysis.outOfOrderChapters.length} chapter(s) out of order. Reorder before processing.`
      );
    }
    if (analysis.missingChapters.length > 0) {
      analysis.recommendations.push(
        `Missing chapters: ${analysis.missingChapters.join(", ")}. Verify manuscript completeness.`
      );
    }

    return analysis;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    let intersectionSize = 0;
    for (const word of words1) {
      if (set2.has(word)) {
        intersectionSize++;
        set2.delete(word);
      }
    }
    
    const unionSize = set1.size + set2.size;
    return unionSize > 0 ? intersectionSize / unionSize : 0;
  }

  async processProject(projectId: number): Promise<void> {
    const project = await storage.getReeditProject(projectId);
    if (!project) {
      throw new Error(`Reedit project ${projectId} not found`);
    }

    // Load existing token counts from database to continue accumulating
    this.totalInputTokens = project.totalInputTokens || 0;
    this.totalOutputTokens = project.totalOutputTokens || 0;
    this.totalThinkingTokens = project.totalThinkingTokens || 0;
    console.log(`[ReeditOrchestrator] Loaded existing tokens: ${this.totalInputTokens} input, ${this.totalOutputTokens} output, ${this.totalThinkingTokens} thinking`);

    // SPECIAL CASE: If resuming with existing finalReviewResult OR already in reviewing stage,
    // skip directly to final review (don't re-run entire pipeline)
    const hasExistingFinalReview = project.finalReviewResult && 
      ((project.finalReviewResult as any).puntuacion_global !== undefined ||
       (project.finalReviewResult as any).issues?.length > 0 || 
       (project.finalReviewResult as any).capitulos_para_reescribir?.length > 0);
    const hasUserInstructions = project.pendingUserInstructions && project.pendingUserInstructions.trim().length > 0;
    // Trigger fast-track if:
    // 1. Project was awaiting instructions with issues to fix
    // 2. Project was in "reviewing" stage (already past all earlier stages)
    // 3. Project has consecutive high scores pending confirmation
    const isResumingFromReviewing = project.currentStage === "reviewing";
    const hasConsecutiveScoresPending = (project.consecutiveHighScores || 0) >= 1;
    const isResumingFromPause = project.status === "awaiting_instructions" || 
      (project.status !== "completed" && isResumingFromReviewing);
    
    if ((hasExistingFinalReview && isResumingFromPause) || (isResumingFromReviewing && hasConsecutiveScoresPending)) {
      console.log(`[ReeditOrchestrator] FAST-TRACK RESUME: Project has finalReviewResult with issues. Skipping to corrections + final review.`);
      console.log(`  - User instructions: ${hasUserInstructions ? 'YES' : 'NO'}`);
      console.log(`  - Previous stage: ${project.currentStage}`);
      
      this.emitProgress({
        projectId,
        stage: "fixing",
        currentChapter: 0,
        totalChapters: 0,
        message: "Retomando desde correcciones pendientes (salto rápido)...",
      });
      
      // Go directly to runFinalReviewOnly which handles corrections + re-review
      await this.runFinalReviewOnly(projectId);
      return;
    }

    // Detect resume stage - if project was interrupted, continue from where it left off
    const resumeStage = project.currentStage || "none";
    const stageOrder = ["none", "analyzing", "editing", "world_bible", "expansion", "architect", "qa", "narrative_rewriting", "copyediting", "reviewing", "completed"];
    const resumeStageIndex = stageOrder.indexOf(resumeStage);
    
    if (resumeStageIndex > 0 && resumeStage !== "completed") {
      console.log(`[ReeditOrchestrator] RESUMING project ${projectId} from stage: ${resumeStage} (index ${resumeStageIndex})`);
      this.emitProgress({
        projectId,
        stage: resumeStage as any,
        currentChapter: 0,
        totalChapters: 0,
        message: `Retomando procesamiento desde etapa: ${resumeStage}...`,
      });
    }

    try {
      await storage.updateReeditProject(projectId, { status: "processing" });

      const chapters = await storage.getReeditChaptersByProject(projectId);
      
      // === STAGE 1: STRUCTURE ANALYSIS ===
      // Skip if already past this stage
      const skipAnalyzing = resumeStageIndex > stageOrder.indexOf("analyzing");
      let structureAnalysis: any = project.structureAnalysis || { duplicateChapters: [], outOfOrderChapters: [], missingChapters: [] };
      
      if (!skipAnalyzing) {
        this.emitProgress({
          projectId,
          stage: "analyzing",
          currentChapter: 0,
          totalChapters: chapters.length,
          message: "Analizando estructura del manuscrito...",
        });

        structureAnalysis = await this.analyzeStructure(chapters);
        await storage.updateReeditProject(projectId, {
          currentStage: "analyzing",
          structureAnalysis: structureAnalysis as any,
        });

        for (const dup of structureAnalysis.duplicateChapters) {
          await storage.updateReeditChapter(dup.chapterId, {
            isDuplicate: true,
            duplicateOfChapter: dup.duplicateOf,
            status: "skipped",
          });
        }

        for (const ooo of structureAnalysis.outOfOrderChapters) {
          const chapter = chapters.find(c => c.chapterNumber === ooo.chapterNumber);
          if (chapter) {
            await storage.updateReeditChapter(chapter.id, {
              isOutOfOrder: true,
              suggestedOrder: ooo.suggestedPosition,
            });
          }
        }
      } else {
        console.log(`[ReeditOrchestrator] Skipping STAGE 1 (analyzing) - already completed`);
      }

      let validChapters = chapters.filter(c => {
        const isDup = structureAnalysis.duplicateChapters?.some((d: any) => d.chapterId === c.id);
        return !isDup;
      }).sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));

      const detectedLang = project.detectedLanguage || "es";
      const chapterSummaries: string[] = [];
      const editorFeedbacks: any[] = [];

      // === STAGE 2: EDITOR REVIEW (all chapters first) ===
      await storage.updateReeditProject(projectId, { currentStage: "editing" });
      await this.updateHeartbeat(projectId);

      for (let i = 0; i < validChapters.length; i++) {
        // Check for cancellation before processing each chapter
        if (await this.checkCancellation(projectId)) {
          console.log(`[ReeditOrchestrator] Processing cancelled at editing stage, chapter ${i + 1}`);
          return;
        }

        const chapter = validChapters[i];
        
        // Skip chapters that were already processed (resume support)
        if (chapter.processingStage !== "none" && chapter.processingStage !== "editor" && chapter.editorFeedback) {
          console.log(`[ReeditOrchestrator] Skipping chapter ${chapter.chapterNumber} (already processed in editing stage)`);
          const existingFeedback = chapter.editorFeedback as any;
          editorFeedbacks.push(existingFeedback);
          chapterSummaries.push(
            `Capítulo ${chapter.chapterNumber} (Puntuación: ${chapter.editorScore || 7}/10): resumido`
          );
          continue;
        }
        
        this.emitProgress({
          projectId,
          stage: "editing",
          currentChapter: i + 1,
          totalChapters: validChapters.length,
          message: `Capítulo ${chapter.chapterNumber}: Revisión editorial...`,
        });

        await storage.updateReeditChapter(chapter.id, {
          status: "analyzing",
          processingStage: "editor",
        });

        const prevChapterForEditor = i > 0 ? validChapters[i - 1] : null;
        const prevSummary = prevChapterForEditor 
          ? `Capítulo ${prevChapterForEditor.chapterNumber}: ${prevChapterForEditor.originalContent.substring(0, 1000)}...`
          : undefined;
        
        const editorResult = await this.editorAgent.reviewChapter(
          chapter.originalContent,
          chapter.chapterNumber,
          detectedLang,
          prevSummary
        );
        this.trackTokens(editorResult);

        await storage.updateReeditChapter(chapter.id, {
          editorScore: editorResult.score || 7,
          editorFeedback: {
            issues: editorResult.issues || [],
            suggestions: editorResult.suggestions || [],
            strengths: editorResult.strengths || [],
          },
          narrativeIssues: {
            pacing: editorResult.pacingNotes || "",
          },
          processingStage: "world_bible",
        });

        editorFeedbacks.push(editorResult);
        chapterSummaries.push(
          `Capítulo ${chapter.chapterNumber} (Puntuación: ${editorResult.score || 7}/10): ${(editorResult.strengths || []).slice(0, 2).join(", ")}`
        );

        await storage.updateReeditProject(projectId, {
          currentChapter: i + 1,
        });
        
        // Update heartbeat and last completed chapter after each chapter
        await this.updateHeartbeat(projectId, chapter.chapterNumber);
      }

      // Check cancellation before World Bible extraction
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Processing cancelled before World Bible extraction`);
        return;
      }

      // === STAGE 3: WORLD BIBLE EXTRACTION ===
      const chaptersForBible = validChapters.map((c, i) => ({
        num: c.chapterNumber,
        content: c.originalContent,
        feedback: editorFeedbacks[i]
      }));

      // Check if World Bible already exists (resume support)
      const existingWorldBible = await storage.getReeditWorldBibleByProject(projectId);
      let worldBibleResult: any;

      const existingCharacters = existingWorldBible?.characters as any[] | null;
      if (existingWorldBible && existingCharacters && existingCharacters.length > 0) {
        console.log(`[ReeditOrchestrator] Skipping World Bible extraction (already exists with ${existingCharacters.length} characters)`);
        worldBibleResult = {
          personajes: existingWorldBible.characters,
          ubicaciones: existingWorldBible.locations,
          timeline: existingWorldBible.timeline,
          reglasDelMundo: existingWorldBible.loreRules,
          epocaHistorica: {
            periodo: existingWorldBible.historicalPeriod,
            detalles: existingWorldBible.historicalDetails,
          },
          confianza: existingWorldBible.confidence,
        };
      } else {
        this.emitProgress({
          projectId,
          stage: "world_bible",
          currentChapter: 0,
          totalChapters: validChapters.length,
          message: "Iniciando extracción de Biblia del Mundo...",
        });

        await storage.updateReeditProject(projectId, { currentStage: "world_bible" });

        worldBibleResult = await this.worldBibleExtractor.extractWorldBible(
          chaptersForBible,
          editorFeedbacks,
          async (batchIndex, totalBatches, message) => {
            const chaptersProcessed = Math.min(batchIndex * 10, validChapters.length);
            this.emitProgress({
              projectId,
              stage: "world_bible",
              currentChapter: chaptersProcessed,
              totalChapters: validChapters.length,
              message,
            });
            await storage.updateReeditProject(projectId, {
              processedChapters: chaptersProcessed,
            });
          }
        );
        this.trackTokens(worldBibleResult);

        // Save world bible to database
        await storage.createReeditWorldBible({
          projectId,
          characters: worldBibleResult.personajes || [],
          locations: worldBibleResult.ubicaciones || [],
          timeline: worldBibleResult.timeline || [],
          loreRules: worldBibleResult.reglasDelMundo || [],
          historicalPeriod: worldBibleResult.epocaHistorica?.periodo || null,
          historicalDetails: worldBibleResult.epocaHistorica?.detalles || null,
          extractedFromChapters: validChapters.length,
          confidence: worldBibleResult.confianza || 7,
        });
      }

      // === STAGE 3.5: MANUSCRIPT EXPANSION (optional) ===
      // Check cancellation before expansion
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Processing cancelled before expansion stage`);
        return;
      }

      // Reload project to get expansion settings
      const projectWithExpansion = await storage.getReeditProject(projectId);
      if (projectWithExpansion && (projectWithExpansion.expandChapters || projectWithExpansion.insertNewChapters)) {
        await storage.updateReeditProject(projectId, { currentStage: "expansion" });
        
        const worldBibleForExpansion = {
          characters: worldBibleResult.personajes || [],
          locations: worldBibleResult.ubicaciones || [],
          timeline: worldBibleResult.timeline || [],
          rules: worldBibleResult.reglasDelMundo || [],
        };

        const expandedChapters = await this.expandManuscript(
          projectId,
          projectWithExpansion,
          validChapters,
          worldBibleForExpansion
        );

        // Update validChapters with expanded result
        validChapters.length = 0;
        validChapters.push(...expandedChapters);

        await this.updateHeartbeat(projectId);
      }

      // Rebuild chaptersForBible AFTER expansion to include new/expanded chapters
      // This ensures Architect analyzes the complete manuscript including expansions
      const chaptersForArchitect = validChapters.map((c, i) => ({
        num: c.chapterNumber,
        content: c.editedContent || c.originalContent, // Use expanded content if available
        feedback: editorFeedbacks[i] || { score: 7, issues: [], strengths: [] }
      }));
      console.log(`[ReeditOrchestrator] Rebuilt chapters for Architect: ${chaptersForArchitect.length} chapters (includes expansions)`);

      // Re-analyze structure after expansion to reflect new/modified chapters
      if (projectWithExpansion?.expandChapters || projectWithExpansion?.insertNewChapters) {
        console.log(`[ReeditOrchestrator] Re-analyzing structure after expansion...`);
        structureAnalysis = await this.analyzeStructure(validChapters);
        await storage.updateReeditProject(projectId, {
          structureAnalysis: structureAnalysis as any,
          totalChapters: validChapters.length,
        });
        console.log(`[ReeditOrchestrator] Structure re-analyzed: ${validChapters.length} chapters, issues: ${structureAnalysis.hasIssues}`);
      }

      // === STAGE 4: ARCHITECT ANALYSIS ===
      // Check if Architect analysis already exists (resume support)
      const existingArchitectReport = await storage.getReeditAuditReportsByProject(projectId);
      const hasArchitectReport = existingArchitectReport.some(r => r.auditType === "architect");
      let architectResult: any;

      if (hasArchitectReport) {
        console.log(`[ReeditOrchestrator] Skipping Architect analysis (already exists)`);
        const existingReport = existingArchitectReport.find(r => r.auditType === "architect");
        architectResult = existingReport?.findings || {};
      } else {
        this.emitProgress({
          projectId,
          stage: "architect",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: "Arquitecto analizando estructura y trama...",
        });

        await storage.updateReeditProject(projectId, { currentStage: "architect" });

        architectResult = await this.architectAnalyzer.analyzeArchitecture(
          worldBibleResult,
          chaptersForArchitect,
          structureAnalysis
        );
        this.trackTokens(architectResult);

        await storage.createReeditAuditReport({
          projectId,
          auditType: "architect",
          chapterRange: "all",
          score: Math.round(architectResult.puntuacionArquitectura || 7),
          findings: architectResult,
          recommendations: architectResult.recomendaciones || [],
        });
      }

      // Check for critical blocks
      if (architectResult.bloqueoCritico) {
        console.log(`[ReeditOrchestrator] Critical block detected, continuing with warnings`);
      }

      // === STAGE 4.1: CHAPTER REORDERING (if recommended by Architect) ===
      const reordenamientos = architectResult.analisisEstructura?.reordenamientoSugerido || [];
      if (reordenamientos.length > 0) {
        this.emitProgress({
          projectId,
          stage: "architect",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Reordenando ${reordenamientos.length} capítulos según análisis arquitectónico...`,
        });

        validChapters = await this.reorderChaptersFromAnalysis(
          validChapters,
          projectId,
          reordenamientos
        );

        // Rebuild chapter arrays after reordering
        validChapters = validChapters.sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
        console.log(`[ReeditOrchestrator] Chapters reordered. New order: ${validChapters.map(c => c.chapterNumber).join(', ')}`);
        
        await this.updateHeartbeat(projectId);
      }

      // === STAGE 4.5: QA AGENTS (OPTIMIZED - run BEFORE rewriting to consolidate all problems) ===
      // Check cancellation before QA stage
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Processing cancelled before QA stage`);
        return;
      }

      await storage.updateReeditProject(projectId, { currentStage: "qa" });

      // Clean up previous QA reports to avoid duplicates on restarts
      await storage.deleteReeditAuditReportsByType(projectId, "continuity");
      await storage.deleteReeditAuditReportsByType(projectId, "voice_rhythm");
      await storage.deleteReeditAuditReportsByType(projectId, "semantic_repetition");
      await storage.deleteReeditAuditReportsByType(projectId, "anachronism");

      // 4.5a: Continuity Sentinel - every 5 chapters
      const chapterBlocks5 = [];
      for (let i = 0; i < validChapters.length; i += 5) {
        chapterBlocks5.push(validChapters.slice(i, Math.min(i + 5, validChapters.length)));
      }

      // Build compact World Bible context for continuity verification
      let worldBibleContextForSentinel = "";
      if (worldBibleResult) {
        const parts: string[] = [];
        if (worldBibleResult.personajes?.length > 0) {
          const charSummaries = worldBibleResult.personajes.slice(0, 20).map((p: any) => {
            const traits: string[] = [];
            if (p.nombre) traits.push(`Nombre: ${p.nombre}`);
            if (p.rol) traits.push(`Rol: ${p.rol}`);
            if (p.descripcionFisica) traits.push(`Físico: ${p.descripcionFisica}`);
            if (p.rasgosDistintivos) traits.push(`Rasgos: ${p.rasgosDistintivos}`);
            if (p.lesiones || p.estadoFisico) traits.push(`Estado/Lesiones: ${p.lesiones || p.estadoFisico}`);
            if (p.objetosImportantes) traits.push(`Objetos: ${p.objetosImportantes}`);
            if (p.conocimiento) traits.push(`Conoce: ${p.conocimiento}`);
            return traits.join('; ');
          });
          parts.push("PERSONAJES:\n" + charSummaries.join("\n"));
        }
        if (worldBibleResult.ubicaciones?.length > 0) {
          const locs = worldBibleResult.ubicaciones.slice(0, 10).map((u: any) =>
            `${u.nombre || u.name}: ${u.descripcion || u.description || ''}`
          );
          parts.push("UBICACIONES:\n" + locs.join("\n"));
        }
        if (worldBibleResult.lineaTemporal?.length > 0) {
          const timeline = worldBibleResult.lineaTemporal.slice(0, 15).map((e: any) =>
            `Cap ${e.capitulo || '?'}: ${e.evento || e.descripcion || ''}`
          );
          parts.push("LÍNEA TEMPORAL:\n" + timeline.join("\n"));
        }
        worldBibleContextForSentinel = parts.join("\n\n");
      }

      // Calculate total QA operations for progress tracking
      const chapterBlocks10Count = Math.ceil(validChapters.length / 10);
      const totalQaOps = chapterBlocks5.length + chapterBlocks10Count + 2;
      let completedQaOps = 0;

      for (let blockIdx = 0; blockIdx < chapterBlocks5.length; blockIdx++) {
        const block = chapterBlocks5[blockIdx];
        const startChap = block[0].chapterNumber;
        const endChap = block[block.length - 1].chapterNumber;

        this.emitProgress({
          projectId,
          stage: "qa",
          currentChapter: blockIdx + 1,
          totalChapters: chapterBlocks5.length,
          message: `Centinela de Continuidad: capítulos ${startChap}-${endChap}...`,
        });

        const continuityResult = await this.continuitySentinel.auditContinuity(
          block.map(c => c.editedContent || c.originalContent),
          startChap,
          endChap,
          worldBibleContextForSentinel || undefined
        );
        this.trackTokens(continuityResult);

        await storage.createReeditAuditReport({
          projectId,
          auditType: "continuity",
          chapterRange: `${startChap}-${endChap}`,
          score: Math.round(continuityResult.puntuacion || 8),
          findings: continuityResult,
          recommendations: continuityResult.erroresContinuidad?.map((e: any) => e.correccion) || [],
        });

        completedQaOps++;
        await this.updateHeartbeat(projectId, endChap);
      }

      // 4.5b: Voice & Rhythm Auditor - every 10 chapters
      const chapterBlocks10 = [];
      for (let i = 0; i < validChapters.length; i += 10) {
        chapterBlocks10.push(validChapters.slice(i, Math.min(i + 10, validChapters.length)));
      }

      for (let blockIdx = 0; blockIdx < chapterBlocks10.length; blockIdx++) {
        const block = chapterBlocks10[blockIdx];
        const startChap = block[0].chapterNumber;
        const endChap = block[block.length - 1].chapterNumber;

        this.emitProgress({
          projectId,
          stage: "qa",
          currentChapter: blockIdx + 1,
          totalChapters: chapterBlocks10.length,
          message: `Auditor de Voz y Ritmo: capítulos ${startChap}-${endChap}...`,
        });

        const voiceResult = await this.voiceRhythmAuditor.auditVoiceRhythm(
          block.map(c => c.editedContent || c.originalContent),
          startChap,
          endChap
        );
        this.trackTokens(voiceResult);

        await storage.createReeditAuditReport({
          projectId,
          auditType: "voice_rhythm",
          chapterRange: `${startChap}-${endChap}`,
          score: Math.round(voiceResult.puntuacion || 8),
          findings: voiceResult,
          recommendations: voiceResult.problemasTono?.map((p: any) => p.correccion) || [],
        });

        completedQaOps++;
        await this.updateHeartbeat(projectId, endChap);
      }

      // 4.5c: Semantic Repetition Detector - full manuscript (needs REAL content, not summaries)
      this.emitProgress({
        projectId,
        stage: "qa",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: "Detector de Repetición Semántica: manuscrito completo...",
      });

      // Pass real chapter content to semantic detector, not empty summaries
      const chapterContentsForSemantic = validChapters.map(c => 
        `=== CAPÍTULO ${c.chapterNumber}: ${c.title || ''} ===\n${c.editedContent || c.originalContent}`
      );
      
      const semanticResult = await this.semanticRepetitionDetector.detectRepetitions(
        chapterContentsForSemantic,
        validChapters.length,
        worldBibleContextForSentinel || undefined
      );
      this.trackTokens(semanticResult);

      await storage.createReeditAuditReport({
        projectId,
        auditType: "semantic_repetition",
        chapterRange: "all",
        score: Math.round(semanticResult.puntuacion || 8),
        findings: semanticResult,
        recommendations: semanticResult.repeticionesSemanticas?.map((r: any) => `${r.accion}: ${r.descripcion}`) || [],
      });

      completedQaOps++;
      await this.updateHeartbeat(projectId, validChapters.length);

      // 4.5d: Anachronism Detector - for historical novels
      this.emitProgress({
        projectId,
        stage: "qa",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: "Detector de Anacronismos...",
      });

      const anachronismResult = await this.anachronismDetector.detectAnachronisms(
        validChapters.map(c => ({ num: c.chapterNumber, content: c.editedContent || c.originalContent })),
        "",
        project.title || ""
      );
      this.trackTokens(anachronismResult);

      await storage.createReeditAuditReport({
        projectId,
        auditType: "anachronism",
        chapterRange: "all",
        score: Math.round(anachronismResult.puntuacionHistorica || 10),
        findings: anachronismResult,
        recommendations: anachronismResult.anacronismos?.map((a: any) => a.correccion) || [],
      });

      completedQaOps++;
      await this.updateHeartbeat(projectId, validChapters.length);
      console.log(`[ReeditOrchestrator] QA stage completed: ${completedQaOps}/${totalQaOps} operations`);

      // === STAGE 5: CONSOLIDATED NARRATIVE REWRITING (Architect + QA problems in ONE pass) ===
      // CRITICAL: Update stage IMMEDIATELY after QA completes to prevent re-running QA on resume
      await storage.updateReeditProject(projectId, { currentStage: "narrative_rewriting" });
      
      // Collect all problems from Architect
      const architectProblems = this.collectArchitectProblems(architectResult);
      
      // Collect all problems from QA agents
      const qaFindings = await this.collectQaFindings(projectId);
      
      // Consolidate all problems by chapter
      const consolidatedProblems = await this.consolidateAllProblems(architectProblems, qaFindings);
      
      // Check if NarrativeRewriter already completed (resume support)
      const existingRewriteReport = await storage.getReeditAuditReportByType(projectId, "narrative_rewrite");
      const narrativeRewriteCompleted = existingRewriteReport && 
        (existingRewriteReport.findings as any)?.chaptersRewritten > 0;
      
      // Track which chapters were rewritten (for CopyEditor optimization)
      const rewrittenChapters = new Set<number>();
      
      // Get user instructions for rewriting (architectInstructions from project creation)
      let userRewriteInstructions = project.architectInstructions || "";
      
      // Append editorial critique as high-priority corrections if present
      if (project.editorialCritique) {
        const critiqueSection = `\n\n═══════════════════════════════════════════════════════════════\nCRÍTICA EDITORIAL EXTERNA (PRIORIDAD ALTA — corregir estos problemas):\n═══════════════════════════════════════════════════════════════\n${project.editorialCritique}\n\nIMPORTANTE: Los puntos de esta crítica editorial son problemas reales identificados por un lector/editor profesional. Deben abordarse y corregirse en cada capítulo donde apliquen.`;
        userRewriteInstructions = userRewriteInstructions ? userRewriteInstructions + critiqueSection : critiqueSection;
      }
      
      if (consolidatedProblems.size > 0 && !narrativeRewriteCompleted) {
        const totalProblemsCount = Array.from(consolidatedProblems.values()).reduce((sum, p) => sum + p.length, 0);
        console.log(`[ReeditOrchestrator] OPTIMIZED: Consolidating ${totalProblemsCount} problems (Architect + QA) in ${consolidatedProblems.size} chapters for SINGLE rewriting pass`);
        
        this.emitProgress({
          projectId,
          stage: "narrative_rewriting",
          currentChapter: 0,
          totalChapters: consolidatedProblems.size,
          message: `Reescritura consolidada: ${totalProblemsCount} problemas (Arquitecto + QA) en ${consolidatedProblems.size} capítulos...`,
        });
        
        if (userRewriteInstructions) {
          console.log(`[ReeditOrchestrator] User instructions for rewriting: "${userRewriteInstructions.substring(0, 100)}..."`);
        }
        
        let fixedCount = 0;
        const rewriteResults: any[] = [];
        const chapterEntries = Array.from(consolidatedProblems.entries()).sort((a, b) => a[0] - b[0]);
        
        for (const [chapNum, chapterProblems] of chapterEntries) {
          if (await this.checkCancellation(projectId)) {
            console.log(`[ReeditOrchestrator] Processing cancelled during narrative rewriting`);
            return;
          }
          
          const chapter = validChapters.find(c => c.chapterNumber === chapNum);
          if (!chapter) {
            console.log(`[ReeditOrchestrator] Chapter ${chapNum} not found for narrative rewriting`);
            continue;
          }
          
          // Group problems by source for logging
          const architectCount = chapterProblems.filter(p => p.source === 'architect').length;
          const qaCount = chapterProblems.filter(p => p.source !== 'architect').length;
          
          this.emitProgress({
            projectId,
            stage: "narrative_rewriting",
            currentChapter: fixedCount + 1,
            totalChapters: consolidatedProblems.size,
            message: `Reescribiendo capítulo ${chapNum}: ${chapterProblems.length} problemas (${architectCount} estructurales, ${qaCount} QA)...`,
          });
          
          try {
            const adjacentContext = this.buildAdjacentChapterContext(validChapters, chapNum);
            
            const rewriteResult = await this.narrativeRewriter.rewriteChapter(
              chapter.editedContent || chapter.originalContent,
              chapNum,
              chapterProblems.map((p: any, idx: number) => ({
                id: `${p.source}-${idx + 1}`,
                tipo: p.tipo || 'structural',
                descripcion: p.descripcion,
                severidad: p.severidad || 'mayor',
                accionSugerida: p.accionSugerida,
                fuente: p.source
              })),
              worldBibleResult,
              adjacentContext,
              detectedLang,
              userRewriteInstructions || undefined
            );
            this.trackTokens(rewriteResult);
            
            const rewrittenNR = rewriteResult.capituloReescrito || rewriteResult.rewrittenContent;
            const contentToCompare = chapter.editedContent || chapter.originalContent;
            const hasChanges = rewriteResult.cambiosRealizados?.length > 0 || 
                              (rewrittenNR && rewrittenNR !== contentToCompare);
            
            if (rewrittenNR && hasChanges) {
              const wordCount = rewrittenNR.split(/\s+/).filter((w: string) => w.length > 0).length;
              
              await storage.updateReeditChapter(chapter.id, {
                originalContent: rewrittenNR,
                editedContent: rewrittenNR,
                wordCount,
                processingStage: "completed",
              });
              
              rewrittenChapters.add(chapNum);
              rewriteResults.push({
                chapter: chapNum,
                problemsTotal: chapterProblems.length,
                problemsArchitect: architectCount,
                problemsQA: qaCount,
                changes: rewriteResult.cambiosRealizados?.length || 0,
                confidence: rewriteResult.verificacionInterna?.confianzaEnCorreccion || 0,
                summary: rewriteResult.resumenEjecutivo
              });
              
              console.log(`[ReeditOrchestrator] Chapter ${chapNum} rewritten (consolidated): ${rewriteResult.cambiosRealizados?.length || 0} changes, confidence: ${rewriteResult.verificacionInterna?.confianzaEnCorreccion || 'N/A'}/10`);
            } else {
              console.log(`[ReeditOrchestrator] Chapter ${chapNum}: No effective changes from consolidated rewriting`);
            }
          } catch (rewriteError) {
            console.error(`[ReeditOrchestrator] Error rewriting chapter ${chapNum}:`, rewriteError);
          }
          
          fixedCount++;
          await this.updateHeartbeat(projectId);
        }
        
        // Save consolidated narrative rewriting report
        await storage.createReeditAuditReport({
          projectId,
          auditType: "narrative_rewrite",
          chapterRange: "all",
          score: rewriteResults.length > 0 ? Math.round(rewriteResults.reduce((sum, r) => sum + (r.confidence || 7), 0) / rewriteResults.length) : 7,
          findings: {
            optimizedPipeline: true,
            totalProblemsConsolidated: totalProblemsCount,
            chaptersRewritten: rewrittenChapters.size,
            architectProblemsTotal: architectProblems.length,
            qaProblemsTotal: Array.from(qaFindings.values()).reduce((sum, p) => sum + p.length, 0),
            rewriteResults: rewriteResults
          },
          recommendations: [],
        });
        
        console.log(`[ReeditOrchestrator] Consolidated narrative rewriting complete: ${rewrittenChapters.size} chapters updated`);
        
        // Reload chapters to get updated content
        const updatedChapters = await storage.getReeditChaptersByProject(projectId);
        validChapters.length = 0;
        validChapters.push(...updatedChapters.filter(c => c.editedContent || c.originalContent)
          .sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber)));
      } else if (narrativeRewriteCompleted) {
        const chaptersRewritten = (existingRewriteReport.findings as any)?.chaptersRewritten || 0;
        console.log(`[ReeditOrchestrator] Skipping narrative rewriting (already completed: ${chaptersRewritten} chapters rewritten)`);
        // Mark rewritten chapters from previous run
        if (existingRewriteReport?.findings) {
          const results = (existingRewriteReport.findings as any)?.rewriteResults || [];
          for (const r of results) {
            if (r.chapter) rewrittenChapters.add(r.chapter);
          }
        }
      } else {
        console.log(`[ReeditOrchestrator] No problems to fix (Architect + QA both clean)`);
      }

      // Check cancellation before CopyEditor stage
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Processing cancelled before CopyEditor stage`);
        return;
      }

      // === STAGE 6: COPY EDITING (OPTIMIZED - only chapters NOT rewritten) ===
      const chaptersNeedingCopyEdit = validChapters.filter(c => !rewrittenChapters.has(c.chapterNumber));
      const skippedCount = validChapters.length - chaptersNeedingCopyEdit.length;
      
      console.log(`[ReeditOrchestrator] OPTIMIZED CopyEditor: Processing ${chaptersNeedingCopyEdit.length} chapters (skipping ${skippedCount} already rewritten)`);
      
      this.emitProgress({
        projectId,
        stage: "copyediting",
        currentChapter: 0,
        totalChapters: chaptersNeedingCopyEdit.length,
        message: `Corrección de estilo: ${chaptersNeedingCopyEdit.length} capítulos (${skippedCount} ya procesados)...`,
      });

      await storage.updateReeditProject(projectId, { currentStage: "copyediting" });
      await this.updateHeartbeat(projectId);

      for (let i = 0; i < chaptersNeedingCopyEdit.length; i++) {
        if (await this.checkCancellation(projectId)) {
          console.log(`[ReeditOrchestrator] Processing cancelled at copyediting stage, chapter ${i + 1}`);
          return;
        }

        const chapter = chaptersNeedingCopyEdit[i];
        
        if (chapter.editedContent && chapter.processingStage === "completed") {
          console.log(`[ReeditOrchestrator] Skipping chapter ${chapter.chapterNumber} (already completed)`);
          continue;
        }
        
        this.emitProgress({
          projectId,
          stage: "copyediting",
          currentChapter: i + 1,
          totalChapters: chaptersNeedingCopyEdit.length,
          message: `Capítulo ${chapter.chapterNumber}: Corrección de estilo literario...`,
        });

        await storage.updateReeditChapter(chapter.id, {
          processingStage: "copyeditor",
        });

        const contentToEdit = chapter.originalContent;
        
        const prevChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
        const nextChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber + 1);
        const adjacentContextCE = {
          previousExcerpt: (prevChapter?.editedContent || prevChapter?.originalContent)?.slice(-1500),
          nextExcerpt: (nextChapter?.editedContent || nextChapter?.originalContent)?.substring(0, 1500),
        };

        const copyEditorResult = await this.copyEditorAgent.editChapter(
          contentToEdit,
          chapter.chapterNumber,
          detectedLang,
          worldBibleResult,
          adjacentContextCE
        );
        this.trackTokens(copyEditorResult);

        const editedContent = copyEditorResult.editedContent || chapter.originalContent;
        const wordCount = editedContent.split(/\s+/).filter((w: string) => w.length > 0).length;

        await storage.updateReeditChapter(chapter.id, {
          editedContent,
          copyeditorChanges: copyEditorResult.changesLog || "",
          fluencyImprovements: copyEditorResult.fluencyChanges || [],
          wordCount,
          processingStage: "completed",
        });

        await storage.updateReeditProject(projectId, {
          processedChapters: rewrittenChapters.size + i + 1,
        });
        
        await this.updateHeartbeat(projectId, chapter.chapterNumber);
      }
      
      console.log(`[ReeditOrchestrator] CopyEditor stage complete: ${chaptersNeedingCopyEdit.length} chapters processed, ${skippedCount} skipped (already rewritten)`)

      // === STAGE 7: FINAL REVIEW (with 10/10 twice consecutive logic using full content reviewer) ===
      await storage.updateReeditProject(projectId, { currentStage: "reviewing" });

      // Load saved review cycle state for resume support
      const savedProject = await storage.getReeditProject(projectId);
      let revisionCycle = savedProject?.revisionCycle || 0;
      let consecutiveHighScores = savedProject?.consecutiveHighScores || 0;
      const previousScores: number[] = (savedProject?.previousScores as number[]) || [];
      let nonPerfectCount = savedProject?.nonPerfectFinalReviews || 0;
      let userInstructions = savedProject?.pendingUserInstructions || "";
      // Append editorial critique to user instructions for the rewriter
      if (savedProject?.editorialCritique) {
        const critiqueBlock = `\n\nCRÍTICA EDITORIAL EXTERNA (PRIORIDAD ALTA):\n${savedProject.editorialCritique}\nIMPORTANTE: Estos problemas fueron identificados por un editor profesional. Corrígelos en cada capítulo donde apliquen.`;
        userInstructions = userInstructions ? userInstructions + critiqueBlock : critiqueBlock;
      }
      let finalResult: FinalReviewerResult | null = null;
      let bestsellerScore = 0;
      const correctedIssueDescriptions: string[] = [];
      
      const MAX_NON_PERFECT_BEFORE_PAUSE = 5;
      // TOTAL cycle limit to prevent infinite loops (uses dedicated field that never resets)
      const MAX_TOTAL_CYCLES = 30;
      let totalCyclesExecuted = (savedProject?.totalReviewCycles || 0);

      if (revisionCycle > 0) {
        console.log(`[ReeditOrchestrator] RESUMING Final Review: cycle ${revisionCycle}, consecutive=${consecutiveHighScores}, nonPerfect=${nonPerfectCount}, scores=[${previousScores.join(',')}]`);
      }
      
      // If user provided instructions, add them to the correction context
      if (userInstructions) {
        console.log(`[ReeditOrchestrator] User instructions received: "${userInstructions.substring(0, 100)}..."`);
        correctedIssueDescriptions.push(`INSTRUCCIONES DEL USUARIO: ${userInstructions}`);
        // Clear instructions after applying
        await storage.updateReeditProject(projectId, { 
          pendingUserInstructions: null,
          pauseReason: null,
        });
      }
      
      // Add editorial critique to correction context if present
      if (savedProject?.editorialCritique) {
        console.log(`[ReeditOrchestrator] Editorial critique found: "${savedProject.editorialCritique.substring(0, 100)}..."`);
        correctedIssueDescriptions.push(`CRÍTICA EDITORIAL EXTERNA (verificar que estos problemas hayan sido corregidos): ${savedProject.editorialCritique}`);
      }

      // Get World Bible and style guide for full final review
      const worldBibleForReview = await storage.getReeditWorldBibleByProject(projectId);
      const guiaEstilo = (project as any).styleGuide || "";

      // Track resolved hashes locally to avoid stale data from project object
      let localResolvedHashes: string[] = (project.resolvedIssueHashes as string[]) || [];
      
      // Snapshots of chapter content before corrections, keyed by chapter ID
      const chapterSnapshots = new Map<number, { content: string; wordCount: number }>();
      
      while (revisionCycle < this.maxFinalReviewCycles) {
        // Check for cancellation at start of each cycle
        if (await this.checkCancellation(projectId)) {
          console.log(`[ReeditOrchestrator] Cancelled during final review cycle ${revisionCycle}`);
          return;
        }
        
        // CRITICAL: Reload resolved hashes from DB to include newly resolved issues
        const refreshedProject = await storage.getReeditProject(projectId);
        localResolvedHashes = (refreshedProject?.resolvedIssueHashes as string[]) || [];
        
        // Check total cycle limit to prevent infinite loops
        totalCyclesExecuted++;
        if (totalCyclesExecuted > MAX_TOTAL_CYCLES) {
          const pauseReason = `Se alcanzó el límite de ${MAX_TOTAL_CYCLES} ciclos totales. Última puntuación: ${Math.round(bestsellerScore)}/10. Por favor, usa "Forzar completado" o proporciona instrucciones.`;
          console.log(`[ReeditOrchestrator] PAUSING: Total cycle limit reached (${totalCyclesExecuted})`);
          
          await storage.updateReeditProject(projectId, {
            status: "awaiting_instructions",
            pauseReason,
            totalReviewCycles: totalCyclesExecuted,
            consecutiveHighScores,
            nonPerfectFinalReviews: nonPerfectCount,
            previousScores: previousScores as any,
            finalReviewResult: finalResult,
            bestsellerScore: Math.round(bestsellerScore),
          });
          
          this.emitProgress({
            projectId,
            stage: "paused",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: pauseReason,
          });
          return;
        }
        const consecutiveInfo = consecutiveHighScores > 0 
          ? ` [${consecutiveHighScores}/${this.requiredConsecutiveHighScores} puntuaciones 10/10 consecutivas]`
          : "";

        this.emitProgress({
          projectId,
          stage: "reviewing",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Ejecutando revisión final COMPLETA... (Ciclo ${revisionCycle + 1}/${this.maxFinalReviewCycles})${consecutiveInfo}`,
        });

        // Get all completed chapters with FULL content for proper review
        const updatedChapters = await storage.getReeditChaptersByProject(projectId);
        const completedChapters = updatedChapters
          .filter(c => c.editedContent)
          .sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));

        // Build chapters array with full content for FinalReviewer
        const chaptersForReview = completedChapters.map(c => ({
          numero: c.chapterNumber,
          titulo: c.title || `Capítulo ${c.chapterNumber}`,
          contenido: c.editedContent || c.originalContent,
        }));

        // Call the FULL final reviewer with complete manuscript content
        const fullReviewResult = await this.fullFinalReviewerAgent.execute({
          projectTitle: project.title,
          chapters: chaptersForReview,
          worldBible: worldBibleForReview || {},
          guiaEstilo: guiaEstilo,
          pasadaNumero: revisionCycle + 1,
          issuesPreviosCorregidos: correctedIssueDescriptions,
          editorialCritique: savedProject?.editorialCritique || undefined,
        });
        this.trackTokens(fullReviewResult);
        await this.updateHeartbeat(projectId);

        finalResult = fullReviewResult.result || null;
        // Use raw score for threshold checks - only round when persisting to DB
        const rawScore = finalResult?.puntuacion_global || 7;
        bestsellerScore = rawScore; // Keep as float for accurate threshold comparison
        previousScores.push(rawScore);

        const veredicto = finalResult?.veredicto || "REQUIERE_REVISION";
        const rawIssuesForApproval = finalResult?.issues || [];
        const chapsToRewrite = finalResult?.capitulos_para_reescribir?.length || 0;
        
        // Filter out resolved issues BEFORE checking for critical issues
        // Use localResolvedHashes which is refreshed each cycle instead of stale project data
        const { newIssues: filteredIssuesForApproval } = this.filterNewIssues(rawIssuesForApproval, localResolvedHashes);
        
        // Check for critical issues from FILTERED list only
        const criticalIssues = filteredIssuesForApproval.filter((issue: any) => 
          issue.severidad === "critica" || issue.severidad === "crítica"
        );
        const hasCriticalIssues = criticalIssues.length > 0;
        const issuesCount = filteredIssuesForApproval.length;

        console.log(`[ReeditOrchestrator] Final review cycle ${revisionCycle + 1}: score ${rawScore}/10, veredicto: ${veredicto}, issues: ${issuesCount} (${criticalIssues.length} críticos, ${rawIssuesForApproval.length - issuesCount} ya resueltos), chapters to rewrite: ${chapsToRewrite}`);

        // Aprobar si: puntuación >= 9 Y no hay NINGÚN issue nuevo (crítico o no)
        // Si hay issues pendientes (incluso menores), deben corregirse antes de aprobar
        const hasAnyNewIssues = issuesCount > 0 || chapsToRewrite > 0;
        
        if (rawScore >= this.minAcceptableScore && !hasAnyNewIssues) {
          consecutiveHighScores++;
          nonPerfectCount = 0;
          console.log(`[ReeditOrchestrator] Score ${rawScore}/10 with NO new issues. Consecutive high scores: ${consecutiveHighScores}`);
        } else if (rawScore >= this.minAcceptableScore && hasAnyNewIssues) {
          consecutiveHighScores = 0;
          nonPerfectCount++;
          console.log(`[ReeditOrchestrator] Score ${rawScore}/10 is good but ${issuesCount} issue(s) remain (${criticalIssues.length} críticos). Correcting...`);
        } else {
          consecutiveHighScores = 0;
          nonPerfectCount++;
        }
        
        if (nonPerfectCount >= MAX_NON_PERFECT_BEFORE_PAUSE) {
          if (rawScore >= 9 && !hasCriticalIssues) {
            console.log(`[ReeditOrchestrator] Auto-approving after ${nonPerfectCount} cycles. Score ${rawScore}/10 (9+), no critical issues.`);
            consecutiveHighScores = this.requiredConsecutiveHighScores;
            this.emitProgress({
              projectId,
              stage: "reviewing",
              currentChapter: validChapters.length,
              totalChapters: validChapters.length,
              message: `Manuscrito APROBADO tras ${nonPerfectCount} ciclos de refinamiento. Puntuación: ${rawScore}/10. Calidad consistente demostrada.`,
            });
            break;
          }
          
          const pauseReason = `Después de ${nonPerfectCount} evaluaciones sin alcanzar 9/10, el proceso se ha pausado. Última puntuación: ${rawScore}/10. Issues detectados: ${issuesCount}. Por favor, proporciona instrucciones para continuar.`;
          
          console.log(`[ReeditOrchestrator] PAUSING after ${nonPerfectCount} non-perfect scores. Waiting for user instructions.`);
          
          await storage.updateReeditProject(projectId, {
            status: "awaiting_instructions",
            pauseReason,
            revisionCycle,
            totalReviewCycles: totalCyclesExecuted,
            consecutiveHighScores,
            nonPerfectFinalReviews: nonPerfectCount,
            previousScores: previousScores as any,
            finalReviewResult: finalResult,
            bestsellerScore: Math.round(bestsellerScore),
            totalInputTokens: this.totalInputTokens,
            totalOutputTokens: this.totalOutputTokens,
            totalThinkingTokens: this.totalThinkingTokens,
          });
          
          this.emitProgress({
            projectId,
            stage: "paused",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: pauseReason,
          });
          
          return;
        }
        
        if (revisionCycle >= 2 && rawScore >= 9 && !hasCriticalIssues) {
          console.log(`[ReeditOrchestrator] Auto-approving after ${revisionCycle + 1} cycles. Score ${rawScore}/10, no critical issues.`);
          consecutiveHighScores = this.requiredConsecutiveHighScores;
          this.emitProgress({
            projectId,
            stage: "reviewing",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: `Manuscrito APROBADO tras ${revisionCycle + 1} ciclos. Puntuación: ${rawScore}/10. Sin problemas críticos — calidad suficiente.`,
          });
          break;
        }

        if (consecutiveHighScores >= this.requiredConsecutiveHighScores) {
          const recentScores = previousScores.slice(-this.requiredConsecutiveHighScores).join(", ");
          console.log(`[ReeditOrchestrator] APROBADO: Puntuaciones consecutivas ${recentScores}/10`);
          
          this.emitProgress({
            projectId,
            stage: "reviewing",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: `Manuscrito APROBADO. Puntuaciones consecutivas: ${recentScores}/10. Calidad bestseller confirmada.`,
          });
          break;
        }

        // Only skip corrections if score is high AND no issues remain at all
        // If there are ANY issues (critical or not), we must fall through to the correction phase
        if (bestsellerScore >= this.minAcceptableScore && consecutiveHighScores < this.requiredConsecutiveHighScores && !hasAnyNewIssues) {
          this.emitProgress({
            projectId,
            stage: "reviewing",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: `Puntuación ${bestsellerScore}/10. Necesita ${this.requiredConsecutiveHighScores - consecutiveHighScores} evaluación(es) más con 10/10 para confirmar.`,
          });
          revisionCycle++;
          continue;
        }

        // Si llegamos al límite de ciclos sin el doble 10/10, incrementamos y dejamos
        // que el límite total (MAX_TOTAL_CYCLES) controle el bucle
        if (revisionCycle === this.maxFinalReviewCycles - 1) {
          const avgScore = previousScores.length > 0
            ? (previousScores.reduce((a, b) => a + b, 0) / previousScores.length).toFixed(1)
            : bestsellerScore;
          
          console.log(`[ReeditOrchestrator] Límite de ciclos locales alcanzado. Puntuación: ${bestsellerScore}/10 (promedio: ${avgScore}). Total ejecutados: ${totalCyclesExecuted}`);
          // NO reseteamos revisionCycle - dejamos que MAX_TOTAL_CYCLES controle el bucle
        }

        // SCORE REGRESSION CHECK: If score dropped by 2+ points from the best score,
        // revert to pre-correction snapshots and pause
        const bestPreviousScore = previousScores.length > 1 
          ? Math.max(...previousScores.slice(0, -1)) 
          : 0;
        if (bestPreviousScore > 0 && rawScore <= bestPreviousScore - 2 && chapterSnapshots.size > 0) {
          console.log(`[ReeditOrchestrator] SCORE REGRESSION: ${rawScore}/10 dropped from best ${bestPreviousScore}/10. Reverting ${chapterSnapshots.size} chapters to pre-correction state.`);
          
          for (const [chapterId, snapshot] of chapterSnapshots.entries()) {
            await storage.updateReeditChapter(chapterId, {
              editedContent: snapshot.content,
              wordCount: snapshot.wordCount,
            });
          }
          
          bestsellerScore = bestPreviousScore;
          
          const pauseReason = `Las correcciones degradaron la puntuación de ${bestPreviousScore}/10 a ${rawScore}/10. Se revirtieron ${chapterSnapshots.size} capítulos a la versión anterior (${bestPreviousScore}/10). Puedes forzar completado o dar instrucciones específicas.`;
          
          await storage.updateReeditProject(projectId, {
            status: "awaiting_instructions",
            pauseReason,
            revisionCycle,
            totalReviewCycles: totalCyclesExecuted,
            consecutiveHighScores: 0,
            nonPerfectFinalReviews: nonPerfectCount,
            previousScores: previousScores as any,
            finalReviewResult: finalResult,
            bestsellerScore: Math.round(bestPreviousScore),
          });
          
          this.emitProgress({
            projectId,
            stage: "paused",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: pauseReason,
          });
          return;
        }

        this.emitProgress({
          projectId,
          stage: "reviewing",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Puntuación ${bestsellerScore}/10 insuficiente. Corrigiendo ${chapsToRewrite} capítulo(s) con ${issuesCount} issue(s)...`,
        });

        // Apply corrections based on FULL final reviewer feedback
        const rawIssues = finalResult?.issues || [];
        const chaptersToRewrite = finalResult?.capitulos_para_reescribir || [];
        
        const { newIssues: issues, filteredCount } = this.filterNewIssues(rawIssues, localResolvedHashes);
        
        if (filteredCount > 0) {
          console.log(`[ReeditOrchestrator] ${filteredCount} issues ya resueltos fueron filtrados, quedan ${issues.length} nuevos`);
        }
        
        // Save snapshots BEFORE applying corrections so we can revert if score drops
        chapterSnapshots.clear();
        
        if (issues.length > 0 || chaptersToRewrite.length > 0) {
          const chapterNumbersToFix = new Set<number>(chaptersToRewrite);
          for (const issue of issues) {
            const resolvedChapters = ensureChapterNumbers(issue);
            issue.capitulos_afectados = resolvedChapters;
            for (const chNum of resolvedChapters) {
              chapterNumbersToFix.add(chNum);
            }
          }

          const chaptersToFix = await storage.getReeditChaptersByProject(projectId);
          const editableChapters = chaptersToFix.filter(c => c.editedContent);
          
          const chaptersNeedingFix = editableChapters
            .filter(c => chapterNumbersToFix.has(c.chapterNumber))
            .slice(0, 5);
          
          // Save pre-correction snapshots
          for (const ch of chaptersNeedingFix) {
            chapterSnapshots.set(ch.id, {
              content: ch.editedContent || ch.originalContent,
              wordCount: ch.wordCount || 0,
            });
          }
          
          for (let i = 0; i < chaptersNeedingFix.length; i++) {
            if (await this.checkCancellation(projectId)) {
              console.log(`[ReeditOrchestrator] Cancelled during chapter correction ${i + 1}/${chaptersNeedingFix.length}`);
              return;
            }
            
            const chapter = chaptersNeedingFix[i];
            
            const chapterIssues = issues.filter(iss => 
              iss.capitulos_afectados?.includes(chapter.chapterNumber)
            );

            if (chapterIssues.length === 0 && !chaptersToRewrite.includes(chapter.chapterNumber)) {
              continue;
            }

            this.emitProgress({
              projectId,
              stage: "fixing",
              currentChapter: i + 1,
              totalChapters: chaptersNeedingFix.length,
              message: `Corrigiendo capítulo ${chapter.chapterNumber}: ${chapterIssues.length} issue(s) específicos...`,
            });

            try {
              const problems = chapterIssues.map((issue, idx) => ({
                id: `issue-${idx}`,
                tipo: issue.categoria || "otro",
                descripcion: issue.descripcion,
                severidad: issue.severidad || "media",
                accionSugerida: issue.instrucciones_correccion || "Corregir según indicación"
              }));

              const prevChapter = editableChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
              const nextChapter = editableChapters.find(c => c.chapterNumber === chapter.chapterNumber + 1);
              const adjacentContext = {
                previousChapter: prevChapter?.editedContent?.substring(0, 2000),
                nextChapter: nextChapter?.editedContent?.substring(0, 2000),
              };

              const rewriteResult = await this.narrativeRewriter.rewriteChapter(
                chapter.editedContent || chapter.originalContent,
                chapter.chapterNumber,
                problems,
                worldBibleForReview || {},
                adjacentContext,
                detectedLang,
                userInstructions || undefined
              );
              this.trackTokens(rewriteResult);
              await this.updateHeartbeat(projectId);

              const rewrittenContent = rewriteResult.capituloReescrito || rewriteResult.rewrittenContent;
              if (rewrittenContent) {
                const wordCount = rewrittenContent.split(/\s+/).filter((w: string) => w.length > 0).length;
                await storage.updateReeditChapter(chapter.id, {
                  editedContent: rewrittenContent,
                  wordCount,
                });
                
                for (const issue of chapterIssues) {
                  correctedIssueDescriptions.push(issue.descripcion);
                }
                
                await this.markIssuesResolved(projectId, chapterIssues);
              }
            } catch (err) {
              console.error(`[ReeditOrchestrator] Error fixing chapter ${chapter.chapterNumber}:`, err);
            }
          }
        }

        revisionCycle++;
        
        // Save review cycle state for resume support
        await storage.updateReeditProject(projectId, {
          revisionCycle,
          totalReviewCycles: totalCyclesExecuted,
          consecutiveHighScores,
          nonPerfectFinalReviews: nonPerfectCount,
          previousScores: previousScores as any,
        });
      }

      // CRITICAL: If we exited the loop without achieving 2x consecutive 10/10, pause for instructions
      // This prevents projects from being marked "completed" with low scores
      if (consecutiveHighScores < this.requiredConsecutiveHighScores) {
        const pauseReason = `El proceso alcanzó ${revisionCycle} ciclos sin lograr 2 puntuaciones 10/10 consecutivas. Última puntuación: ${Math.round(bestsellerScore)}/10. Por favor, revisa los problemas detectados y proporciona instrucciones para continuar.`;
        
        console.log(`[ReeditOrchestrator] PAUSING: Did not achieve required consecutive 10/10 scores. Score: ${bestsellerScore}/10`);
        
        await storage.updateReeditProject(projectId, {
          status: "awaiting_instructions",
          pauseReason,
          revisionCycle,
          totalReviewCycles: totalCyclesExecuted,
          consecutiveHighScores,
          nonPerfectFinalReviews: nonPerfectCount,
          previousScores: previousScores as any,
          finalReviewResult: finalResult,
          bestsellerScore: Math.round(bestsellerScore),
        });
        
        this.emitProgress({
          projectId,
          stage: "paused",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: pauseReason,
        });
        
        return; // Exit without marking as completed
      }

      for (const chapter of validChapters) {
        await storage.updateReeditChapter(chapter.id, {
          status: "completed",
          processingStage: "completed",
        });
      }

      await storage.createReeditAuditReport({
        projectId,
        auditType: "final_review",
        chapterRange: "all",
        score: Math.round(bestsellerScore),
        findings: finalResult,
        recommendations: finalResult?.justificacion_puntuacion?.recomendaciones_proceso || [],
      });

      const updatedChapters = await storage.getReeditChaptersByProject(projectId);
      const totalWords = updatedChapters.filter(c => c.editedContent).reduce((sum, c) => sum + (c.wordCount || 0), 0);

      // Round score only when persisting to database (DB expects integer)
      const roundedScore = Math.round(bestsellerScore);
      await storage.updateReeditProject(projectId, {
        currentStage: "completed",
        status: "completed",
        bestsellerScore: roundedScore,
        finalReviewResult: finalResult,
        totalWordCount: totalWords,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      
      console.log(`[ReeditOrchestrator] Token usage: ${this.totalInputTokens} input, ${this.totalOutputTokens} output, ${this.totalThinkingTokens} thinking`);

      const finalMessage = consecutiveHighScores >= this.requiredConsecutiveHighScores
        ? `Reedición completa. Puntuación bestseller: ${roundedScore}/10 (confirmado ${this.requiredConsecutiveHighScores}x consecutivas)`
        : `Reedición completa. Puntuación bestseller: ${roundedScore}/10`;

      this.emitProgress({
        projectId,
        stage: "completed",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: finalMessage,
      });

    } catch (error) {
      console.error(`[ReeditOrchestrator] Error processing project ${projectId}:`, error);
      await storage.updateReeditProject(projectId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      throw error;
    }
  }

  async runFinalReviewOnly(projectId: number): Promise<void> {
    console.log(`[ReeditOrchestrator] Running FULL final review only for project ${projectId}`);
    
    const project = await storage.getReeditProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    this.totalInputTokens = project.totalInputTokens || 0;
    this.totalOutputTokens = project.totalOutputTokens || 0;
    this.totalThinkingTokens = project.totalThinkingTokens || 0;

    await storage.updateReeditProject(projectId, { 
      status: "processing",
      currentStage: "reviewing",
      errorMessage: null,
    });

   try {
    const chapters = await storage.getReeditChaptersByProject(projectId);
    let validChapters = chapters.filter(c => c.editedContent).sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));

    // Get World Bible and style guide for full final review
    const worldBibleForReview = await storage.getReeditWorldBibleByProject(projectId);
    const guiaEstilo = (project as any).styleGuide || "";

    let revisionCycle = project.revisionCycle || 0;
    // Preserve existing consecutive high scores when resuming
    let consecutiveHighScores = project.consecutiveHighScores || 0;
    console.log(`[ReeditOrchestrator] Starting with ${consecutiveHighScores} consecutive high score(s) from previous session`);
    const previousScores: number[] = (project.previousScores as number[]) || [];
    let finalResult: FinalReviewerResult | null = null;
    let bestsellerScore = project.bestsellerScore || 0;
    let nonPerfectCount = project.nonPerfectFinalReviews || 0;
    const correctedIssueDescriptions: string[] = [];
    const MAX_NON_PERFECT_BEFORE_PAUSE = 5;
    
    // TOTAL cycle limit to prevent infinite loops (uses dedicated field that never resets)
    const MAX_TOTAL_CYCLES = 30;
    let totalCyclesExecuted = project.totalReviewCycles || 0;
    
    // Check for user instructions and add them to context
    let userInstructions = project.pendingUserInstructions || "";
    // Append editorial critique for the rewriter
    if (project.editorialCritique) {
      const critiqueBlock = `\n\nCRÍTICA EDITORIAL EXTERNA (PRIORIDAD ALTA):\n${project.editorialCritique}\nIMPORTANTE: Estos problemas fueron identificados por un editor profesional. Corrígelos en cada capítulo donde apliquen.`;
      userInstructions = userInstructions ? userInstructions + critiqueBlock : critiqueBlock;
    }
    if (userInstructions) {
      console.log(`[ReeditOrchestrator] User instructions found: "${userInstructions.substring(0, 100)}..."`);
      correctedIssueDescriptions.push(`INSTRUCCIONES DEL USUARIO: ${userInstructions}`);
      // NOTE: Instructions are cleared AFTER corrections are applied successfully (see below)
    }
    
    // Add editorial critique to correction context if present
    if (project.editorialCritique) {
      console.log(`[ReeditOrchestrator] Editorial critique found for FRO: "${project.editorialCritique.substring(0, 100)}..."`);
      correctedIssueDescriptions.push(`CRÍTICA EDITORIAL EXTERNA (verificar que estos problemas hayan sido corregidos): ${project.editorialCritique}`);
    }
    
    // If we have an existing finalReviewResult with issues, apply those corrections FIRST before running review
    // Skip corrections if we already have consecutive high scores (meaning previous review was 10/10)
    const existingFinalReview = project.finalReviewResult as any;
    const hasIssuesToFix = existingFinalReview?.issues?.length > 0 || existingFinalReview?.capitulos_para_reescribir?.length > 0;
    const skipCorrectionsForConsecutive = consecutiveHighScores >= 1 && !hasIssuesToFix;
    
    if (skipCorrectionsForConsecutive) {
      console.log(`[ReeditOrchestrator] Previous review was 10/10 with no issues. Proceeding directly to confirmation review.`);
    } else if (hasIssuesToFix) {
      console.log(`[ReeditOrchestrator] Applying corrections from existing finalReviewResult before re-review...`);
      
      const issues = existingFinalReview.issues || [];
      const chaptersToRewrite = existingFinalReview.capitulos_para_reescribir || [];
      
      // Get unique chapter numbers that need fixes
      const chapterNumbersToFix = new Set<number>(chaptersToRewrite);
      for (const issue of issues) {
        const resolvedChapters = ensureChapterNumbers(issue);
        issue.capitulos_afectados = resolvedChapters;
        for (const chNum of resolvedChapters) {
          chapterNumbersToFix.add(chNum);
        }
      }
      
      if (chapterNumbersToFix.size > 0) {
        const chaptersNeedingFix = validChapters.filter(c => chapterNumbersToFix.has(c.chapterNumber));
        
        this.emitProgress({
          projectId,
          stage: "fixing",
          currentChapter: 0,
          totalChapters: chaptersNeedingFix.length,
          message: `Aplicando correcciones a ${chaptersNeedingFix.length} capítulos según revisión anterior + instrucciones del usuario...`,
        });
        
        for (let i = 0; i < chaptersNeedingFix.length; i++) {
          const chapter = chaptersNeedingFix[i];
          
          // Get issues specific to this chapter
          const chapterIssues = issues.filter((iss: any) => 
            iss.capitulos_afectados?.includes(chapter.chapterNumber)
          );
          
          this.emitProgress({
            projectId,
            stage: "fixing",
            currentChapter: i + 1,
            totalChapters: chaptersNeedingFix.length,
            message: `Corrigiendo capítulo ${chapter.chapterNumber}: ${chapterIssues.length} issue(s)...`,
          });
          
          try {
            // Convert FinalReviewIssues to problem format for NarrativeRewriter
            const problems = chapterIssues.map((issue: any, idx: number) => ({
              id: `issue-${idx}`,
              tipo: issue.categoria || "otro",
              descripcion: issue.descripcion + (userInstructions ? `\n\nINSTRUCCIONES ADICIONALES: ${userInstructions}` : ""),
              severidad: issue.severidad || "media",
              accionSugerida: issue.instrucciones_correccion || "Corregir según indicación"
            }));
            
            // Build adjacent context
            const prevChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
            const nextChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber + 1);
            const adjacentContext = {
              previousChapter: prevChapter?.editedContent?.substring(0, 2000),
              nextChapter: nextChapter?.editedContent?.substring(0, 2000),
            };
            
            const detectedLang = project.detectedLanguage || "es";
            const rewriteResult = await this.narrativeRewriter.rewriteChapter(
              chapter.editedContent || chapter.originalContent,
              chapter.chapterNumber,
              problems,
              worldBibleForReview || {},
              adjacentContext,
              detectedLang,
              userInstructions || undefined
            );
            this.trackTokens(rewriteResult);
            await this.updateHeartbeat(projectId);
            
            const rewrittenContent = rewriteResult.capituloReescrito || rewriteResult.rewrittenContent;
            if (rewrittenContent) {
              const wordCount = rewrittenContent.split(/\s+/).filter((w: string) => w.length > 0).length;
              await storage.updateReeditChapter(chapter.id, {
                editedContent: rewrittenContent,
                wordCount,
              });
              
              for (const issue of chapterIssues) {
                correctedIssueDescriptions.push(issue.descripcion);
              }
              
              const idx = validChapters.findIndex(c => c.id === chapter.id);
              if (idx !== -1) {
                validChapters[idx].editedContent = rewrittenContent;
              }
            }
          } catch (err) {
            console.error(`[ReeditOrchestrator] Error fixing chapter ${chapter.chapterNumber}:`, err);
          }
        }
        
        console.log(`[ReeditOrchestrator] Pre-corrections applied. Now running final review...`);
        
        // Clear user instructions AFTER corrections are applied successfully
        if (userInstructions) {
          await storage.updateReeditProject(projectId, { 
            pendingUserInstructions: null,
            pauseReason: null,
          });
          console.log(`[ReeditOrchestrator] User instructions cleared after successful application`);
        }
      }
    }

    // Track resolved hashes locally to avoid stale data from project object
    let localResolvedHashesFRO: string[] = (project.resolvedIssueHashes as string[]) || [];
    
    // Snapshots of chapter content before corrections, keyed by chapter ID
    const chapterSnapshotsFRO = new Map<number, { content: string; wordCount: number }>();
    
    while (revisionCycle < this.maxFinalReviewCycles) {
      // Check for cancellation at start of each cycle
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Cancelled during final review cycle ${revisionCycle}`);
        return;
      }
      
      // CRITICAL: Reload resolved hashes from DB to include newly resolved issues
      const refreshedProjectFRO = await storage.getReeditProject(projectId);
      localResolvedHashesFRO = (refreshedProjectFRO?.resolvedIssueHashes as string[]) || [];
      
      // Check total cycle limit to prevent infinite loops
      totalCyclesExecuted++;
      if (totalCyclesExecuted > MAX_TOTAL_CYCLES) {
        const pauseReason = `Se alcanzó el límite de ${MAX_TOTAL_CYCLES} ciclos totales. Última puntuación: ${Math.round(bestsellerScore)}/10. Por favor, usa "Forzar completado" o proporciona instrucciones.`;
        console.log(`[ReeditOrchestrator] PAUSING: Total cycle limit reached (${totalCyclesExecuted})`);
        
        await storage.updateReeditProject(projectId, {
          status: "awaiting_instructions",
          pauseReason,
          revisionCycle,
          totalReviewCycles: totalCyclesExecuted,
          consecutiveHighScores,
          nonPerfectFinalReviews: nonPerfectCount,
          previousScores: previousScores as any,
          finalReviewResult: finalResult,
          bestsellerScore: Math.round(bestsellerScore),
          totalInputTokens: this.totalInputTokens,
          totalOutputTokens: this.totalOutputTokens,
          totalThinkingTokens: this.totalThinkingTokens,
        });
        
        this.emitProgress({
          projectId,
          stage: "paused",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: pauseReason,
        });
        return;
      }
      
      const consecutiveInfo = consecutiveHighScores > 0 
        ? ` [${consecutiveHighScores}/${this.requiredConsecutiveHighScores} puntuaciones 10/10 consecutivas]`
        : "";

      this.emitProgress({
        projectId,
        stage: "reviewing",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: `Re-ejecutando revisión final COMPLETA... (Ciclo ${revisionCycle + 1}/${this.maxFinalReviewCycles})${consecutiveInfo}`,
      });

      // Build chapters array with full content for FinalReviewer
      const chaptersForReview = validChapters.map(c => ({
        numero: c.chapterNumber,
        titulo: c.title || `Capítulo ${c.chapterNumber}`,
        contenido: c.editedContent || c.originalContent,
      }));

      // Call the FULL final reviewer with complete manuscript content
      const fullReviewResult = await this.fullFinalReviewerAgent.execute({
        projectTitle: project.title,
        chapters: chaptersForReview,
        worldBible: worldBibleForReview || {},
        guiaEstilo: guiaEstilo,
        pasadaNumero: revisionCycle + 1,
        issuesPreviosCorregidos: correctedIssueDescriptions,
        editorialCritique: project.editorialCritique || undefined,
      });
      this.trackTokens(fullReviewResult);
      await this.updateHeartbeat(projectId);

      finalResult = fullReviewResult.result || null;
      // Use raw score for threshold checks - only round when persisting to DB
      const rawScore = finalResult?.puntuacion_global || 7;
      bestsellerScore = rawScore; // Keep as float for accurate threshold comparison
      previousScores.push(rawScore);

      const veredicto = finalResult?.veredicto || "REQUIERE_REVISION";
      const rawIssuesFROApproval = finalResult?.issues || [];
      const chapsToRewrite = finalResult?.capitulos_para_reescribir?.length || 0;
      
      // Filter out resolved issues BEFORE checking for critical issues
      // Use localResolvedHashesFRO which is refreshed each cycle instead of stale project data
      const { newIssues: filteredIssuesFROApproval } = this.filterNewIssues(rawIssuesFROApproval, localResolvedHashesFRO);
      
      // Check for critical issues from FILTERED list only
      const criticalIssuesFRO = filteredIssuesFROApproval.filter((issue: any) => 
        issue.severidad === "critica" || issue.severidad === "crítica"
      );
      const hasCriticalIssuesFRO = criticalIssuesFRO.length > 0;
      const issuesCount = filteredIssuesFROApproval.length;

      console.log(`[ReeditOrchestrator] Final review cycle ${revisionCycle + 1}: score ${rawScore}/10, veredicto: ${veredicto}, issues: ${issuesCount} (${criticalIssuesFRO.length} críticos, ${rawIssuesFROApproval.length - issuesCount} ya resueltos), chapters to rewrite: ${chapsToRewrite}`);

      // Aprobar si: puntuación >= 9 Y no hay NINGÚN issue nuevo (crítico o no)
      // Si hay issues pendientes (incluso menores), deben corregirse antes de aprobar
      const hasAnyNewIssuesFRO = issuesCount > 0 || chapsToRewrite > 0;
      
      if (rawScore >= this.minAcceptableScore && !hasAnyNewIssuesFRO) {
        consecutiveHighScores++;
        nonPerfectCount = 0;
        console.log(`[ReeditOrchestrator] FRO: Score ${rawScore}/10 with NO new issues. Consecutive high scores: ${consecutiveHighScores}`);
      } else if (rawScore >= this.minAcceptableScore && hasAnyNewIssuesFRO) {
        consecutiveHighScores = 0;
        nonPerfectCount++;
        console.log(`[ReeditOrchestrator] FRO: Score ${rawScore}/10 is good but ${issuesCount} issue(s) remain (${criticalIssuesFRO.length} críticos). Correcting...`);
      } else {
        consecutiveHighScores = 0;
        nonPerfectCount++;
      }
      
      if (nonPerfectCount >= MAX_NON_PERFECT_BEFORE_PAUSE) {
        if (rawScore >= 9 && !hasCriticalIssuesFRO) {
          console.log(`[ReeditOrchestrator] FRO Auto-approving after ${nonPerfectCount} cycles. Score ${rawScore}/10 (9+), no critical issues.`);
          consecutiveHighScores = this.requiredConsecutiveHighScores;
          this.emitProgress({
            projectId,
            stage: "reviewing",
            currentChapter: validChapters.length,
            totalChapters: validChapters.length,
            message: `Manuscrito APROBADO tras ${nonPerfectCount} ciclos de refinamiento. Puntuación: ${rawScore}/10. Calidad consistente demostrada.`,
          });
          break;
        }
        
        const pauseReason = `Después de ${nonPerfectCount} evaluaciones sin alcanzar 9/10, el proceso se ha pausado. Última puntuación: ${rawScore}/10. Issues detectados: ${issuesCount}. Por favor, proporciona instrucciones para continuar.`;
        
        console.log(`[ReeditOrchestrator] FRO PAUSING after ${nonPerfectCount} non-perfect scores. Waiting for user instructions.`);
        
        await storage.updateReeditProject(projectId, {
          status: "awaiting_instructions",
          pauseReason,
          revisionCycle,
          totalReviewCycles: totalCyclesExecuted,
          consecutiveHighScores,
          nonPerfectFinalReviews: nonPerfectCount,
          previousScores: previousScores as any,
          finalReviewResult: finalResult,
          bestsellerScore: Math.round(bestsellerScore),
          totalInputTokens: this.totalInputTokens,
          totalOutputTokens: this.totalOutputTokens,
          totalThinkingTokens: this.totalThinkingTokens,
        });
        
        this.emitProgress({
          projectId,
          stage: "paused",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: pauseReason,
        });
        
        return;
      }
      
      if (revisionCycle >= 2 && rawScore >= 9 && !hasCriticalIssuesFRO) {
        console.log(`[ReeditOrchestrator] FRO Auto-approving after ${revisionCycle + 1} cycles. Score ${rawScore}/10, no critical issues.`);
        consecutiveHighScores = this.requiredConsecutiveHighScores;
        this.emitProgress({
          projectId,
          stage: "reviewing",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Manuscrito APROBADO tras ${revisionCycle + 1} ciclos. Puntuación: ${rawScore}/10. Sin problemas críticos — calidad suficiente.`,
        });
        break;
      }

      if (consecutiveHighScores >= this.requiredConsecutiveHighScores) {
        const recentScores = previousScores.slice(-this.requiredConsecutiveHighScores).join(", ");
        console.log(`[ReeditOrchestrator] APROBADO: Puntuaciones consecutivas ${recentScores}/10`);
        
        this.emitProgress({
          projectId,
          stage: "reviewing",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Manuscrito APROBADO. Puntuaciones consecutivas: ${recentScores}/10. Calidad bestseller confirmada.`,
        });
        break;
      }

      // Only skip corrections if score is high AND no issues remain at all
      // If there are ANY issues (critical or not), we must fall through to the correction phase
      if (bestsellerScore >= this.minAcceptableScore && consecutiveHighScores < this.requiredConsecutiveHighScores && !hasAnyNewIssuesFRO) {
        this.emitProgress({
          projectId,
          stage: "reviewing",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: `Puntuación ${bestsellerScore}/10. Necesita ${this.requiredConsecutiveHighScores - consecutiveHighScores} evaluación(es) más con 10/10 para confirmar.`,
        });
        revisionCycle++;
        continue;
      }

      // Si llegamos al límite de ciclos sin el doble 10/10, dejamos que MAX_TOTAL_CYCLES controle
      if (revisionCycle === this.maxFinalReviewCycles - 1) {
        const avgScore = previousScores.length > 0
          ? (previousScores.reduce((a, b) => a + b, 0) / previousScores.length).toFixed(1)
          : bestsellerScore;
        
        console.log(`[ReeditOrchestrator] Límite de ciclos locales alcanzado. Puntuación: ${bestsellerScore}/10 (promedio: ${avgScore}). Total: ${totalCyclesExecuted}`);
        // NO reseteamos revisionCycle - dejamos que MAX_TOTAL_CYCLES controle
      }

      // SCORE REGRESSION CHECK (FRO): If score dropped by 2+ points from the best score,
      // revert to pre-correction snapshots and pause
      const bestPreviousScoreFRO = previousScores.length > 1 
        ? Math.max(...previousScores.slice(0, -1)) 
        : 0;
      if (bestPreviousScoreFRO > 0 && rawScore <= bestPreviousScoreFRO - 2 && chapterSnapshotsFRO.size > 0) {
        console.log(`[ReeditOrchestrator] FRO SCORE REGRESSION: ${rawScore}/10 dropped from best ${bestPreviousScoreFRO}/10. Reverting ${chapterSnapshotsFRO.size} chapters.`);
        
        for (const [chapterId, snapshot] of chapterSnapshotsFRO.entries()) {
          await storage.updateReeditChapter(chapterId, {
            editedContent: snapshot.content,
            wordCount: snapshot.wordCount,
          });
        }
        
        bestsellerScore = bestPreviousScoreFRO;
        
        const pauseReasonFRO = `Las correcciones degradaron la puntuación de ${bestPreviousScoreFRO}/10 a ${rawScore}/10. Se revirtieron ${chapterSnapshotsFRO.size} capítulos a la versión anterior (${bestPreviousScoreFRO}/10). Puedes forzar completado o dar instrucciones específicas.`;
        
        await storage.updateReeditProject(projectId, {
          status: "awaiting_instructions",
          pauseReason: pauseReasonFRO,
          revisionCycle,
          totalReviewCycles: totalCyclesExecuted,
          consecutiveHighScores: 0,
          nonPerfectFinalReviews: nonPerfectCount,
          previousScores: previousScores as any,
          finalReviewResult: finalResult,
          bestsellerScore: Math.round(bestPreviousScoreFRO),
        });
        
        this.emitProgress({
          projectId,
          stage: "paused",
          currentChapter: validChapters.length,
          totalChapters: validChapters.length,
          message: pauseReasonFRO,
        });
        return;
      }

      this.emitProgress({
        projectId,
        stage: "reviewing",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: `Puntuación ${bestsellerScore}/10 insuficiente. Corrigiendo ${chapsToRewrite} capítulo(s) con ${issuesCount} issue(s)...`,
      });

      // Apply corrections based on FULL final reviewer feedback
      const rawIssuesFRO = finalResult?.issues || [];
      const chaptersToRewrite = finalResult?.capitulos_para_reescribir || [];
      
      const { newIssues: issues, filteredCount: filteredCountFRO } = this.filterNewIssues(rawIssuesFRO, localResolvedHashesFRO);
      
      if (filteredCountFRO > 0) {
        console.log(`[ReeditOrchestrator] FRO: ${filteredCountFRO} issues ya resueltos fueron filtrados, quedan ${issues.length} nuevos`);
      }
      
      // Save snapshots BEFORE applying corrections so we can revert if score drops
      chapterSnapshotsFRO.clear();
      
      if (issues.length > 0 || chaptersToRewrite.length > 0) {
        const chapterNumbersToFix = new Set<number>(chaptersToRewrite);
        for (const issue of issues) {
          const resolvedChapters = ensureChapterNumbers(issue);
          issue.capitulos_afectados = resolvedChapters;
          for (const chNum of resolvedChapters) {
            chapterNumbersToFix.add(chNum);
          }
        }

        const chaptersNeedingFix = validChapters
          .filter(c => chapterNumbersToFix.has(c.chapterNumber))
          .slice(0, 5);
        
        // Save pre-correction snapshots
        for (const ch of chaptersNeedingFix) {
          chapterSnapshotsFRO.set(ch.id, {
            content: ch.editedContent || ch.originalContent,
            wordCount: ch.wordCount || 0,
          });
        }
        
        for (let i = 0; i < chaptersNeedingFix.length; i++) {
          if (await this.checkCancellation(projectId)) {
            console.log(`[ReeditOrchestrator] Cancelled during chapter correction (FRO) ${i + 1}/${chaptersNeedingFix.length}`);
            return;
          }
          
          const chapter = chaptersNeedingFix[i];
          
          const chapterIssues = issues.filter(iss => 
            iss.capitulos_afectados?.includes(chapter.chapterNumber)
          );

          if (chapterIssues.length === 0 && !chaptersToRewrite.includes(chapter.chapterNumber)) {
            continue;
          }

          this.emitProgress({
            projectId,
            stage: "fixing",
            currentChapter: i + 1,
            totalChapters: chaptersNeedingFix.length,
            message: `Corrigiendo capítulo ${chapter.chapterNumber}: ${chapterIssues.length} issue(s) específicos...`,
          });

          try {
            const problems = chapterIssues.map((issue, idx) => ({
              id: `issue-${idx}`,
              tipo: issue.categoria || "otro",
              descripcion: issue.descripcion,
              severidad: issue.severidad || "media",
              accionSugerida: issue.instrucciones_correccion || "Corregir según indicación"
            }));

            const prevChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
            const nextChapter = validChapters.find(c => c.chapterNumber === chapter.chapterNumber + 1);
            const adjacentContext = {
              previousChapter: prevChapter?.editedContent?.substring(0, 2000),
              nextChapter: nextChapter?.editedContent?.substring(0, 2000),
            };

            const detectedLangFRO = project.detectedLanguage || "es";
            const rewriteResult = await this.narrativeRewriter.rewriteChapter(
              chapter.editedContent || chapter.originalContent,
              chapter.chapterNumber,
              problems,
              worldBibleForReview || {},
              adjacentContext,
              detectedLangFRO,
              userInstructions || undefined
            );
            this.trackTokens(rewriteResult);
            await this.updateHeartbeat(projectId);

            const rewrittenContentFRO = rewriteResult.capituloReescrito || rewriteResult.rewrittenContent;
            if (rewrittenContentFRO) {
              const wordCount = rewrittenContentFRO.split(/\s+/).filter((w: string) => w.length > 0).length;
              await storage.updateReeditChapter(chapter.id, {
                editedContent: rewrittenContentFRO,
                wordCount,
              });
              
              await this.markIssuesResolved(projectId, chapterIssues);
              
              for (const issue of chapterIssues) {
                correctedIssueDescriptions.push(issue.descripcion);
              }
            }
          } catch (err) {
            console.error(`[ReeditOrchestrator] Error fixing chapter ${chapter.chapterNumber}:`, err);
          }
        }

        const refreshedChapters = await storage.getReeditChaptersByProject(projectId);
        validChapters = refreshedChapters.filter(ch => ch.editedContent).sort((a, b) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
      }

      revisionCycle++;
      
      await storage.updateReeditProject(projectId, {
        revisionCycle,
        totalReviewCycles: totalCyclesExecuted,
        consecutiveHighScores,
        nonPerfectFinalReviews: nonPerfectCount,
        previousScores: previousScores as any,
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
    }

    // CRITICAL: If we exited the loop without achieving 2x consecutive 10/10, pause for instructions
    if (consecutiveHighScores < this.requiredConsecutiveHighScores) {
      const pauseReason = `El proceso alcanzó ${revisionCycle} ciclos sin lograr 2 puntuaciones 10/10 consecutivas. Última puntuación: ${Math.round(bestsellerScore)}/10. Por favor, revisa los problemas detectados y proporciona instrucciones para continuar.`;
      
      console.log(`[ReeditOrchestrator] PAUSING (runFinalReviewOnly): Did not achieve required consecutive 10/10 scores. Score: ${bestsellerScore}/10`);
      
      await storage.updateReeditProject(projectId, {
        status: "awaiting_instructions",
        pauseReason,
        revisionCycle,
        totalReviewCycles: totalCyclesExecuted,
        consecutiveHighScores,
        nonPerfectFinalReviews: nonPerfectCount,
        previousScores: previousScores as any,
        finalReviewResult: finalResult,
        bestsellerScore: Math.round(bestsellerScore),
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      
      this.emitProgress({
        projectId,
        stage: "paused",
        currentChapter: validChapters.length,
        totalChapters: validChapters.length,
        message: pauseReason,
      });
      
      return; // Exit without marking as completed
    }

    await storage.createReeditAuditReport({
      projectId,
      auditType: "final_review",
      chapterRange: "all",
      score: Math.round(bestsellerScore),
      findings: finalResult,
      recommendations: finalResult?.justificacion_puntuacion?.recomendaciones_proceso || [],
    });

    const totalWords = validChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);

    await storage.updateReeditProject(projectId, {
      currentStage: "completed",
      status: "completed",
      bestsellerScore: Math.round(bestsellerScore),
      finalReviewResult: finalResult,
      totalWordCount: totalWords,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalThinkingTokens: this.totalThinkingTokens,
    });

    const finalMessage = `Revisión final completa. Puntuación bestseller: ${Math.round(bestsellerScore)}/10 (confirmado ${this.requiredConsecutiveHighScores}x consecutivas)`;

    this.emitProgress({
      projectId,
      stage: "completed",
      currentChapter: validChapters.length,
      totalChapters: validChapters.length,
      message: finalMessage,
    });

    console.log(`[ReeditOrchestrator] Full final review completed for project ${projectId}: ${bestsellerScore}/10`);

   } catch (error) {
      console.error(`[ReeditOrchestrator] Error in runFinalReviewOnly for project ${projectId}:`, error);
      await storage.updateReeditProject(projectId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error in final review",
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      throw error;
    }
  }

  async applyReviewerCorrections(projectId: number): Promise<void> {
    const project = await storage.getReeditProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    this.totalInputTokens = project.totalInputTokens || 0;
    this.totalOutputTokens = project.totalOutputTokens || 0;
    this.totalThinkingTokens = project.totalThinkingTokens || 0;

    await storage.updateReeditProject(projectId, {
      status: "processing",
      currentStage: "fixing",
      errorMessage: null,
    });

   try {
    const finalReviewResult = project.finalReviewResult as any;
    if (!finalReviewResult) {
      throw new Error(`No final review result found for project ${projectId}`);
    }

    const weaknesses = finalReviewResult.weaknesses || finalReviewResult.debilidades_principales || [];
    const recommendations = finalReviewResult.recommendations || finalReviewResult.recomendaciones_proceso || [];

    if (weaknesses.length === 0 && recommendations.length === 0) {
      console.log(`[ReeditOrchestrator] No weaknesses or recommendations to apply for project ${projectId}`);
      await storage.updateReeditProject(projectId, {
        status: "awaiting_instructions",
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      return;
    }

    console.log(`[ReeditOrchestrator] Applying corrections for project ${projectId}:`);
    console.log(`  - Weaknesses: ${weaknesses.length}`);
    console.log(`  - Recommendations: ${recommendations.length}`);

    const problems = [
      ...weaknesses.map((w: string, i: number) => ({
        id: `weakness-${i}`,
        tipo: "debilidad_detectada",
        descripcion: typeof w === 'string' ? w : JSON.stringify(w),
        severidad: "media",
        accionSugerida: "Corregir según indicación del revisor"
      })),
      ...recommendations.map((r: string, i: number) => ({
        id: `recommendation-${i}`,
        tipo: "recomendacion",
        descripcion: typeof r === 'string' ? r : JSON.stringify(r),
        severidad: "menor",
        accionSugerida: "Implementar recomendación"
      }))
    ];

    const worldBible = await storage.getReeditWorldBibleByProject(projectId);
    let userInstructions = project.pendingUserInstructions || project.architectInstructions || "";
    if (project.editorialCritique) {
      const critiqueBlock = `\n\nCRÍTICA EDITORIAL EXTERNA (PRIORIDAD ALTA):\n${project.editorialCritique}\nIMPORTANTE: Estos problemas fueron identificados por un editor profesional. Corrígelos en cada capítulo donde apliquen.`;
      userInstructions = userInstructions ? userInstructions + critiqueBlock : critiqueBlock;
    }

    const allChapters = await storage.getReeditChaptersByProject(projectId);
    const editableChapters = allChapters.filter(c => c.editedContent);

    const mentionedChapters = new Set<number>();
    const feedbackText = [...weaknesses, ...recommendations].join(' ');
    const chapterMatches = feedbackText.match(/cap[íi]tulo\s*(\d+)/gi) || [];
    chapterMatches.forEach(match => {
      const num = parseInt(match.replace(/\D/g, ''));
      if (!isNaN(num)) mentionedChapters.add(num);
    });

    let chaptersToFix: ReeditChapter[];
    if (mentionedChapters.size > 0) {
      chaptersToFix = editableChapters.filter(c => mentionedChapters.has(c.chapterNumber));
      console.log(`[ReeditOrchestrator] Fixing ${chaptersToFix.length} specifically mentioned chapters: ${Array.from(mentionedChapters).join(', ')}`);
    } else {
      chaptersToFix = editableChapters.slice(0, Math.min(5, editableChapters.length));
      console.log(`[ReeditOrchestrator] No specific chapters mentioned, fixing first ${chaptersToFix.length} chapters`);
    }

    this.emitProgress({
      projectId,
      stage: "fixing",
      currentChapter: 0,
      totalChapters: chaptersToFix.length,
      message: `Aplicando correcciones del revisor a ${chaptersToFix.length} capítulos...`,
    });

    for (let i = 0; i < chaptersToFix.length; i++) {
      if (await this.checkCancellation(projectId)) {
        console.log(`[ReeditOrchestrator] Cancelled during applyReviewerCorrections at chapter ${i + 1}/${chaptersToFix.length}`);
        return;
      }

      const chapter = chaptersToFix[i];

      this.emitProgress({
        projectId,
        stage: "fixing",
        currentChapter: i + 1,
        totalChapters: chaptersToFix.length,
        message: `Corrigiendo capítulo ${chapter.chapterNumber} (${i + 1}/${chaptersToFix.length})...`,
      });

      try {
        const prevChapter = editableChapters.find(c => c.chapterNumber === chapter.chapterNumber - 1);
        const nextChapter = editableChapters.find(c => c.chapterNumber === chapter.chapterNumber + 1);
        const adjacentContext = {
          previousChapter: prevChapter?.editedContent?.substring(0, 2000),
          nextChapter: nextChapter?.editedContent?.substring(0, 2000),
        };

        const detectedLangARC = project.detectedLanguage || "es";
        const rewriteResult = await this.narrativeRewriter.rewriteChapter(
          chapter.editedContent || chapter.originalContent,
          chapter.chapterNumber,
          problems,
          worldBible || {},
          adjacentContext,
          detectedLangARC,
          userInstructions || undefined
        );
        this.trackTokens(rewriteResult);
        await this.updateHeartbeat(projectId);

        const rewrittenContentARC = rewriteResult.capituloReescrito || rewriteResult.rewrittenContent;
        if (rewrittenContentARC) {
          const wordCount = rewrittenContentARC.split(/\s+/).filter((w: string) => w.length > 0).length;
          await storage.updateReeditChapter(chapter.id, {
            editedContent: rewrittenContentARC,
            wordCount,
          });
          console.log(`[ReeditOrchestrator] Fixed chapter ${chapter.chapterNumber}: ${wordCount} words`);
        }
      } catch (err) {
        console.error(`[ReeditOrchestrator] Error fixing chapter ${chapter.chapterNumber}:`, err);
      }
    }

    await storage.updateReeditProject(projectId, {
      status: "awaiting_instructions",
      currentStage: "reviewing",
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalThinkingTokens: this.totalThinkingTokens,
    });

    this.emitProgress({
      projectId,
      stage: "fixing",
      currentChapter: chaptersToFix.length,
      totalChapters: chaptersToFix.length,
      message: `Correcciones aplicadas a ${chaptersToFix.length} capítulos. Listo para re-evaluación.`,
    });

    console.log(`[ReeditOrchestrator] Applied corrections to ${chaptersToFix.length} chapters for project ${projectId}`);

   } catch (error) {
      console.error(`[ReeditOrchestrator] Error in applyReviewerCorrections for project ${projectId}:`, error);
      await storage.updateReeditProject(projectId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error applying corrections",
        totalInputTokens: this.totalInputTokens,
        totalOutputTokens: this.totalOutputTokens,
        totalThinkingTokens: this.totalThinkingTokens,
      });
      throw error;
    }
  }
}

export const reeditOrchestrator = new ReeditOrchestrator();
