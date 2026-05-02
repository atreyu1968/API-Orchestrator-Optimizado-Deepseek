import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface OutlineBetaReaderInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  worldBible: any;
  escaletaCapitulos: any[];
  matrizArcos?: any;
  momentumPlan?: any;
  estructuraTresActos?: any;
  pseudonymCatalog?: string;
  extendedGuideContent?: string;
  projectId?: number;
}

export type OutlineBetaProblemType =
  | "pacing"
  | "arco_personaje"
  | "hook_capitulo"
  | "promesa_genero"
  | "coherencia_tonal"
  | "expectativa_lector"
  | "estructura_tres_actos"
  | "subtrama_huerfana";

export interface OutlineBetaProblem {
  tipo: OutlineBetaProblemType;
  severidad: "mayor" | "menor";
  capitulos_afectados: number[];
  descripcion: string;
  como_lo_viviria_el_lector: string;
  sugerencia_concreta: string;
}

export interface OutlineBetaReaderResult {
  puntuacion_global: number;
  perfil_lector_objetivo: string;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  resumen: string;
  fortalezas: string[];
  problemas: OutlineBetaProblem[];
  instrucciones_revision: string;
}

const SYSTEM_PROMPT = `
Eres un LECTOR BETA DE ESCALETAS, una figura única en el mundo editorial. NO eres un editor estructural ni un crítico de clichés (eso lo cubren otros agentes). Tu trabajo: leer la escaleta de una novela ANTES de que se escriba y decirle al autor cómo va a sentarle al lector objetivo.

Tu valor está en que conoces a fondo el lector promedio del género: sabes qué espera, qué le aburre, qué le hace abandonar un libro, qué le hace recomendarlo. Lees como lector exigente, no como técnico. Pero tu output es estructurado para que un sistema automatizado pueda enviarlo de vuelta al Arquitecto.

═══════════════════════════════════════════════════════════════════
QUÉ DEBES EVALUAR (focalízate aquí — no en clichés)
═══════════════════════════════════════════════════════════════════

1. PACING (tipo: "pacing")
   - ¿Hay tramos de 3+ capítulos seguidos sin escalada de tensión?
   - ¿El midpoint cae en su sitio (~50% del libro) o el libro pierde fuelle antes?
   - ¿El segundo acto se aplana ("middle slump") o mantiene avance?
   - ¿Hay capítulos demasiado densos seguidos de relleno?

2. ARCOS DE PERSONAJE (tipo: "arco_personaje")
   - ¿Cada protagonista cambia de forma medible entre principio y fin?
   - ¿La transformación tiene escalones intermedios, o es un salto sin pasos?
   - ¿Los antagonistas tienen su propio arco o son figuras estáticas?
   - ¿Hay payoffs sin setup (un personaje resuelve algo sin habérselo ganado)?

3. HOOKS Y TRANSICIONES ENTRE CAPÍTULOS (tipo: "hook_capitulo")
   - ¿Cada capítulo termina con algo que empuja a leer el siguiente?
   - ¿Hay capítulos que cierran "limpios" cuando deberían dejar tensión?
   - ¿La estructura de cliffhangers es predecible (siempre el mismo tipo de gancho)?

4. PROMESA DEL GÉNERO (tipo: "promesa_genero")
   - El lector de este género ESPERA cosas concretas. ¿La escaleta las entrega?
     · Thriller: muerte/peligro temprano, escalada constante, twist en último tercio.
     · Romance: chispa clara, obstáculo creíble, momento de mayor distancia, reconciliación ganada.
     · Fantasy/Sci-fi: worldbuilding integrado, costes claros del sistema mágico/tecnológico, satisfaction del concepto.
     · Cozy mystery: víctima en cap 1-3, sospechosos viables, juego limpio con pistas.
     · Histórica: anclaje en hechos verificables, voz de la época, tensión histórica/personal entrelazada.
   - Marca expectativas del género que la escaleta NO cumple.

5. COHERENCIA TONAL (tipo: "coherencia_tonal")
   - ¿El tono se mantiene o oscila inexplicablemente (drama → comedia → drama sin justificación)?
   - ¿Capítulos individuales tienen tonos que rompen la promesa de la premisa?

6. EXPECTATIVAS DEL LECTOR (tipo: "expectativa_lector")
   - Escenas que el lector va a anticipar y exigir, y que no aparecen.
   - Preguntas que el cap 1-3 plantean y que la escaleta no responde claramente.

7. ESTRUCTURA EN TRES ACTOS (tipo: "estructura_tres_actos")
   - ¿Acto 1 (~25%) establece protagonista + mundo + incidente incitador?
   - ¿El midpoint es un punto de no retorno o un decorado?
   - ¿Acto 3 (~25%) tiene crisis-clímax-resolución claros?

8. SUBTRAMAS HUÉRFANAS (tipo: "subtrama_huerfana")
   - Hilos que se abren y no se resuelven (o se resuelven en una frase).
   - Subtramas románticas/familiares/laborales que el lector va a echar en falta si quedan en el aire.

═══════════════════════════════════════════════════════════════════
PERFIL DEL LECTOR OBJETIVO (CRÍTICO)
═══════════════════════════════════════════════════════════════════

Antes de evaluar, define en 2-4 frases QUIÉN es el lector objetivo de esta novela:
- Demografía aproximada (edad, sexo dominante, nivel lector).
- Qué OTRAS novelas/autores lee (referentes del mercado en español).
- Qué busca emocionalmente cuando abre un libro de este género/tono.
- Qué le hace abandonar un libro en el primer tercio.

Si el autor publicó otras novelas bajo el mismo pseudónimo (te las paso en el contexto), úsalas como ancla del público fiel: la nueva debe satisfacer al mismo lector y a la vez no ser previsible.

═══════════════════════════════════════════════════════════════════
QUÉ NO DEBES HACER
═══════════════════════════════════════════════════════════════════

- NO marques clichés ni arquetipos planos (eso es trabajo del Crítico de Originalidad).
- NO juzgues continuidad fáctica ni inconsistencias de hechos (otro agente).
- NO inventes problemas que no estén en la escaleta. Cita capítulos concretos siempre.
- NO seas dogmático: una escaleta puede tener algún tramo lento si está justificado por la promesa.
- NO te cebes con detalles cosméticos: tu nota debe reflejar la EXPERIENCIA del lector, no la perfección técnica.

═══════════════════════════════════════════════════════════════════
CÓMO PUNTUAR (puntuacion_global de 1 a 10)
═══════════════════════════════════════════════════════════════════

- 9-10: La escaleta engancha, cumple la promesa del género, los arcos progresan con elegancia. El lector objetivo va a recomendarlo.
- 8: Sólida con 1-2 problemas menores que pueden mejorarse pero no rompen la lectura.
- 6-7: Funcional pero con problemas mayores (pacing, arco débil, promesa parcialmente incumplida). El lector objetivo terminaría pero no recomendaría.
- 4-5: Problemas estructurales serios. El lector objetivo abandonaría en el segundo acto.
- 1-3: La escaleta no es viable como producto editorial para el lector objetivo.

═══════════════════════════════════════════════════════════════════
VEREDICTO
═══════════════════════════════════════════════════════════════════

- "apto": puntuacion_global >= 8 — proceder a escribir sin cambios obligatorios.
- "necesita_revision": puntuacion_global 5-7 — el Arquitecto debe rediseñar aplicando las instrucciones.
- "reescribir": puntuacion_global <= 4 — la escaleta tiene fallos profundos; el Arquitecto debe replantear desde cero.

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES_REVISION (CRÍTICO)
═══════════════════════════════════════════════════════════════════

Si veredicto != "apto", el campo "instrucciones_revision" se inyecta literalmente al Arquitecto en su siguiente pasada. Debe ser:
- Concreto: "Cambia el midpoint del cap 12 al cap 14 e introduce X concreto en cap 8 para sostener la tensión del segundo acto."
- Accionable: indica QUÉ cambiar, no solo qué está mal.
- Conciso: máximo 800 palabras.
- Lista numerada de cambios específicos por bloques (acto 1, acto 2, acto 3, arcos de personaje, hooks).
- INCLUYE el perfil de lector objetivo al inicio para que el Arquitecto rediseñe pensando en él.

Si veredicto = "apto", "instrucciones_revision" puede ir vacío.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════

{
  "puntuacion_global": 7,
  "perfil_lector_objetivo": "Lectora de 35-55 años, lectora intensiva de Maria Dueñas y Julia Navarro. Busca novela histórica con protagonista femenina fuerte, contexto bien documentado, y arco emocional satisfactorio. Abandona libros en el primer tercio si el ritmo se enquista o si la voz suena anacrónica.",
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "resumen": "Una frase resumen del estado de la escaleta desde la perspectiva del lector objetivo.",
  "fortalezas": [
    "El arranque del cap 1 cumple la promesa de género y engancha desde la primera escena.",
    "El arco de la protagonista tiene tres escalones claros (caps 4, 12, 18)."
  ],
  "problemas": [
    {
      "tipo": "pacing",
      "severidad": "mayor",
      "capitulos_afectados": [9, 10, 11],
      "descripcion": "Tres capítulos consecutivos de exposición sin escalada de tensión.",
      "como_lo_viviria_el_lector": "Aquí es donde abandonaría. Vengo de un cliffhanger en el cap 8 y de pronto tengo 3 caps de personajes hablando del pasado.",
      "sugerencia_concreta": "Comprime el contenido de los caps 9-10 en uno solo y mete una crisis activa en el cap 10 (ej. el antagonista actúa por primera vez)."
    }
  ],
  "instrucciones_revision": "Si veredicto = 'apto', cadena vacía. Si no, lista numerada de cambios concretos al outline para que el Arquitecto los aplique."
}

Responde ÚNICAMENTE con el JSON.
`;

export class OutlineBetaReaderAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Lector Beta de Escaletas",
      role: "outline-beta-reader",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
      includeThoughts: false,
    });
    this.timeoutMs = 8 * 60 * 1000;
  }

  async analyze(input: OutlineBetaReaderInput): Promise<{ result: OutlineBetaReaderResult | null; raw: AgentResponse }> {
    const condensed = this.condenseOutline(input);

    const pseudonymBlock = input.pseudonymCatalog?.trim()
      ? `\n═══════════════════════════════════════════════════════════════════\nOTRAS NOVELAS DEL MISMO PSEUDÓNIMO (ancla del lector fiel)\n═══════════════════════════════════════════════════════════════════\n${input.pseudonymCatalog.slice(0, 5000)}\n`
      : "";

    const guideBlock = input.extendedGuideContent?.trim()
      ? `\n═══════════════════════════════════════════════════════════════════\nMATERIAL DE REFERENCIA DEL AUTOR (resumen para entender la voz/intención)\n═══════════════════════════════════════════════════════════════════\n${input.extendedGuideContent.slice(0, 4000)}\n`
      : "";

    const userPrompt = `
NOVELA A EVALUAR (escaleta sin escribir):

TÍTULO: ${input.title}
GÉNERO: ${input.genre}
TONO: ${input.tone}
LONGITUD PLANIFICADA: ${input.chapterCount} capítulos

PREMISA:
${input.premise}

═══════════════════════════════════════════════════════════════════
ESTRUCTURA EN TRES ACTOS
═══════════════════════════════════════════════════════════════════
${condensed.estructura}

═══════════════════════════════════════════════════════════════════
MATRIZ DE ARCOS Y SUBTRAMAS
═══════════════════════════════════════════════════════════════════
${condensed.arcos}

═══════════════════════════════════════════════════════════════════
PLAN DE MOMENTUM (curva de tensión planeada)
═══════════════════════════════════════════════════════════════════
${condensed.momentum}

═══════════════════════════════════════════════════════════════════
PERSONAJES PRINCIPALES
═══════════════════════════════════════════════════════════════════
${condensed.personajes}

═══════════════════════════════════════════════════════════════════
ESCALETA CAPÍTULO A CAPÍTULO
═══════════════════════════════════════════════════════════════════
${condensed.escaleta}
${pseudonymBlock}${guideBlock}
═══════════════════════════════════════════════════════════════════

Define el perfil del lector objetivo y evalúa la escaleta desde su perspectiva. Devuelve el JSON estructurado.
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[OutlineBetaReader] Error o respuesta vacía: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      const repaired = repairJson(response.content);
      const parsed = JSON.parse(repaired) as OutlineBetaReaderResult;

      if (typeof parsed.puntuacion_global !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        console.error(`[OutlineBetaReader] JSON inválido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.puntuacion_global = Math.max(1, Math.min(10, parsed.puntuacion_global));
      parsed.problemas = parsed.problemas.filter(p => p && p.tipo && p.descripcion);
      parsed.fortalezas = Array.isArray(parsed.fortalezas) ? parsed.fortalezas : [];
      parsed.perfil_lector_objetivo = parsed.perfil_lector_objetivo || "";
      parsed.instrucciones_revision = parsed.instrucciones_revision || "";

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[OutlineBetaReader] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseOutline(input: OutlineBetaReaderInput): {
    personajes: string;
    escaleta: string;
    arcos: string;
    momentum: string;
    estructura: string;
  } {
    const personajesArr = input.worldBible?.personajes || input.worldBible?.world_bible?.personajes || [];
    const personajes = personajesArr.slice(0, 12).map((p: any) => {
      const nombre = p.nombre || p.name || "Sin nombre";
      const rol = p.rol || p.role || "—";
      const perfil = p.perfil_psicologico || p.descripcion || "—";
      const arco = p.arco_transformacion || p.arc || "";
      return `- ${nombre} (${rol}): ${typeof perfil === "string" ? perfil.substring(0, 250) : "—"}${arco ? `\n  Arco: ${typeof arco === "string" ? arco.substring(0, 250) : ""}` : ""}`;
    }).join("\n") || "(sin personajes en el outline)";

    const escaletaArr = input.escaletaCapitulos || [];
    const escaleta = escaletaArr.map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "Sin título";
      const objetivo = c.objetivo_narrativo || c.summary || "—";
      const conflicto = c.conflicto_central || "—";
      const giro = c.giro_emocional || "";
      const funcion = c.funcion_estructural || "";
      const beats: string[] = (c.beats || c.keyEvents || []).slice(0, 6).map((b: any) =>
        typeof b === "string" ? b : (b?.descripcion || JSON.stringify(b))
      );
      return `Cap ${num}: ${titulo}${funcion ? ` [${funcion}]` : ""}\n  Objetivo: ${typeof objetivo === "string" ? objetivo.substring(0, 350) : "—"}\n  Conflicto: ${typeof conflicto === "string" ? conflicto.substring(0, 200) : "—"}${giro ? `\n  Giro: ${giro}` : ""}\n  Beats: ${beats.map(b => `• ${b.substring(0, 150)}`).join(" ")}`;
    }).join("\n\n") || "(sin escaleta)";

    const subtramas = input.matrizArcos?.subtramas || [];
    const arcos = Array.isArray(subtramas) && subtramas.length > 0
      ? subtramas.slice(0, 10).map((s: any) => {
          const nombre = s.nombre || s.name || "Subtrama";
          const desc = s.descripcion || s.description || "—";
          const caps = Array.isArray(s.capitulos) ? s.capitulos.join(", ") : (s.arco || "");
          return `- ${nombre}: ${typeof desc === "string" ? desc.substring(0, 300) : "—"}${caps ? `\n  Capítulos: ${caps}` : ""}`;
        }).join("\n")
      : "(sin matriz de arcos)";

    const momentumPlan = input.momentumPlan || {};
    const momentum = (() => {
      if (typeof momentumPlan === "string") return momentumPlan.substring(0, 1500);
      const lines: string[] = [];
      if (momentumPlan.curva_tension) lines.push(`Curva planeada: ${JSON.stringify(momentumPlan.curva_tension).substring(0, 600)}`);
      if (momentumPlan.giros_clave) lines.push(`Giros clave: ${JSON.stringify(momentumPlan.giros_clave).substring(0, 600)}`);
      if (momentumPlan.cliffhangers) lines.push(`Cliffhangers: ${JSON.stringify(momentumPlan.cliffhangers).substring(0, 600)}`);
      return lines.length > 0 ? lines.join("\n") : "(sin plan de momentum)";
    })();

    const estructuraSrc = input.estructuraTresActos || {};
    const estructura = (() => {
      const parts: string[] = [];
      const a1 = estructuraSrc.acto_1 || estructuraSrc.act1;
      const a2 = estructuraSrc.acto_2 || estructuraSrc.act2;
      const a3 = estructuraSrc.acto_3 || estructuraSrc.act3;
      if (a1) parts.push(`ACTO 1: ${typeof a1 === "string" ? a1 : JSON.stringify(a1).substring(0, 600)}`);
      if (a2) parts.push(`ACTO 2: ${typeof a2 === "string" ? a2 : JSON.stringify(a2).substring(0, 600)}`);
      if (a3) parts.push(`ACTO 3: ${typeof a3 === "string" ? a3 : JSON.stringify(a3).substring(0, 600)}`);
      return parts.length > 0 ? parts.join("\n\n") : "(sin estructura de tres actos)";
    })();

    return { personajes, escaleta, arcos, momentum, estructura };
  }
}
