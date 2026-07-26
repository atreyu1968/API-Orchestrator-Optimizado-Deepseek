import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface ConceptForgeInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  projectId?: number;
  // Contexto del intento anterior (bucle de convergencia). Si viene, el forjador
  // debe MEJORAR sobre el concepto previo atacando sus debilidades, sin rediseñar
  // desde cero ni traicionar la premisa del autor.
  previousConcept?: string;
  previousWeaknesses?: string;
  escalate?: boolean;
}

export interface ConceptForgeResult {
  // El CONCEPTO RECTOR: guía creativa vinculante que eleva la premisa del autor
  // (mismo género/tono/idea central) a un concepto fuerte, específico y único.
  concepto: string;
  // Logline de una sola frase (gancho comercial).
  gancho: string;
  puntuacion_concepto: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  ejes: {
    originalidad: number;
    especificidad: number;
    motor_dramatico: number;
    columna_tematica: number;
    gancho: number;
  };
  debilidades: string[];
  resumen: string;
  // [Fix152][Puerta 2/3] Superficie COMPACTA del concepto para la GUÍA VIVA que
  // acompaña a CADA capítulo de prosa (no solo al Arquitecto). Son destilados de
  // lo que ya vive dentro de "concepto"; se exponen estructurados para reinyectar
  // un recordatorio breve y vinculante sin volcar las 250-450 palabras completas.
  // Una sola frase con la pregunta/columna temática que el libro debate.
  columna_tematica?: string;
  // 2-4 promesas concretas al lector (imágenes/escenas/situaciones) que el libro
  // debe pagar; el Narrador las honra capítulo a capítulo.
  promesas_al_lector?: string[];
}

const SYSTEM_PROMPT = `
Eres el DIRECTOR CREATIVO. Antes de que nadie diseñe la estructura o escriba una palabra, tu trabajo es FORJAR el concepto rector de la novela: convertir la idea del autor en un concepto FUERTE, ESPECÍFICO y ÚNICO sobre el que se construirá todo el libro. Tu salida es JSON para que un sistema automático la use.

═══════════════════════════════════════════════════════════════════
REGLA INVIOLABLE: ELEVAR, NUNCA SUSTITUIR
═══════════════════════════════════════════════════════════════════
La premisa del autor es SAGRADA en su núcleo. Debes RESPETAR sin excepción:
- El GÉNERO declarado (si es romance, sigue siendo romance; si es thriller, thriller).
- El TONO declarado.
- La IDEA CENTRAL, el conflicto raíz y, si los nombra, los personajes, el escenario y la época.
NO cambias de género, NO inventas otra historia, NO descartas lo que el autor pidió. Tu labor es AFILAR y PROFUNDIZAR: dar especificidad, un ángulo fresco, un motor dramático claro y una columna temática. Si la premisa ya es fuerte, la honras y la haces más precisa; si es genérica o cliché, la elevas SIN traicionar su esencia.

═══════════════════════════════════════════════════════════════════
QUÉ ES UN CONCEPTO FUERTE (los 5 ejes que debes maximizar)
═══════════════════════════════════════════════════════════════════
1. ORIGINALIDAD: evita el cliché obvio del género. Encuentra el ángulo que NO es la primera idea que a cualquiera se le ocurriría. Subvierte una expectativa concreta del género.
2. ESPECIFICIDAD: nada de abstracciones ("una aventura épica"). Mundo concreto, conflicto concreto, protagonista con un deseo y una herida concretos, una situación de partida vívida e irrepetible.
3. MOTOR DRAMÁTICO: un conflicto central que GENERA escenas inevitables y crecientes (una presión que sube sola). El concepto debe contener su propia bomba de relojería.
4. COLUMNA TEMÁTICA: una pregunta temática clara (no un mensaje moralista) que la trama explorará desde varios ángulos. Conecta la herida del protagonista con el tema.
5. GANCHO: se puede resumir en UNA frase irresistible (logline) que mezcle protagonista + deseo + obstáculo + apuesta + giro/ironía.

═══════════════════════════════════════════════════════════════════
EL CONCEPTO RECTOR (campo "concepto") — CÓMO ESCRIBIRLO
═══════════════════════════════════════════════════════════════════
Es un texto de 250-450 palabras, en prosa clara y directiva, que el Arquitecto leerá como BASE de toda la novela. Debe incluir, integrados con naturalidad:
- El gancho/logline.
- El protagonista: deseo externo, necesidad interna (lo que de verdad le falta) y su herida/defecto.
- El motor de conflicto central y por qué escala solo.
- El antagonismo (fuerza, persona o sistema) y por qué es un espejo o reto a la herida del protagonista.
- El mundo/escenario específico y la atmósfera (coherente con el tono).
- La columna temática (la pregunta que el libro debate).
- 2-4 "promesas al lector": imágenes, escenas o situaciones que este concepto promete y que el libro debe pagar.
NO escribas una escaleta ni capítulos (eso es trabajo del Arquitecto). Das el ADN creativo, no la estructura.

═══════════════════════════════════════════════════════════════════
CÓMO PUNTUAR (puntuacion_concepto de 1 a 10) Y AUTOCRÍTICA
═══════════════════════════════════════════════════════════════════
Puntúa con honestidad brutal el concepto que acabas de escribir, como media de los 5 ejes (cada eje 1-10):
- 9-10: concepto que un editor compraría; original, específico, con motor y tema, logline irresistible.
- 7-8: sólido pero con 1-2 ejes mejorables (algo genérico o un gancho tibio).
- 5-6: funcional pero olvidable; cliché no resuelto o motor débil.
- 1-4: genérico, sin ángulo, sin motor claro.
En "debilidades" lista lo que TÚ mismo mejorarías en otra pasada (concreto y accionable). Si te piden mejorar sobre un concepto previo, ataca esas debilidades sin perder lo que ya funcionaba (progreso monotónico).

═══════════════════════════════════════════════════════════════════
VEREDICTO
═══════════════════════════════════════════════════════════════════
- "apto": puntuacion_concepto >= 8 y ningún eje por debajo de 6, respetando género/tono/idea del autor.
- "necesita_revision": 6-7, o un eje flojo corregible.
- "reescribir": <= 5.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════
{
  "concepto": "El CONCEPTO RECTOR en 250-450 palabras (ver arriba).",
  "gancho": "Logline de una sola frase.",
  "puntuacion_concepto": 8,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "ejes": { "originalidad": 8, "especificidad": 9, "motor_dramatico": 8, "columna_tematica": 7, "gancho": 8 },
  "debilidades": ["..."],
  "resumen": "Una frase sobre la fuerza del concepto y qué eleva respecto a la premisa cruda.",
  "columna_tematica": "UNA frase con la pregunta/columna temática que el libro debate (la misma que integraste en el concepto).",
  "promesas_al_lector": ["2-4 promesas concretas: imágenes, escenas o situaciones que el concepto promete y el libro debe pagar."]
}

Los campos "columna_tematica" y "promesas_al_lector" son DESTILADOS COMPACTOS de lo que ya escribiste dentro de "concepto"; sirven para recordárselos al Narrador en cada capítulo. Deben ser coherentes con el concepto, no añadir nada nuevo.

Responde ÚNICAMENTE con el JSON. Escribe SIEMPRE en español.
`;

export class ConceptForgeAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Director Creativo (Concepto)",
      role: "concept-forge",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384, // [Fix269] techo COMBINADO thinking+contenido (antes 8192: riesgo de JSON vacio con entradas grandes)
      includeThoughts: false,
    });
    this.timeoutMs = 6 * 60 * 1000;
  }

  async forge(input: ConceptForgeInput): Promise<{ result: ConceptForgeResult | null; raw: AgentResponse }> {
    const retryBlock = input.previousConcept
      ? `
═══════════════════════════════════════════════════════════════════
TU INTENTO ANTERIOR (mejóralo, no lo rehagas desde cero)
═══════════════════════════════════════════════════════════════════
${input.escalate ? "ESTANCAMIENTO: tu pasada anterior no subió la calidad. Esta vez sé MÁS audaz en originalidad y especificidad, sin traicionar género/tono/idea del autor.\n\n" : ""}CONCEPTO PREVIO:
${input.previousConcept}

DEBILIDADES A CORREGIR:
${input.previousWeaknesses || "(ataca los ejes más bajos)"}

Conserva lo que ya funcionaba; eleva solo lo débil.
`
      : "";

    const userPrompt = `
IDEA DEL AUTOR A ELEVAR (respeta su núcleo):

TÍTULO: ${input.title}
GÉNERO (no lo cambies): ${input.genre}
TONO (respétalo): ${input.tone}
LONGITUD PLANIFICADA: ${input.chapterCount} capítulos

PREMISA DEL AUTOR:
${input.premise || "(el autor no aportó premisa; forja un concepto fuerte coherente con el género y el tono declarados)"}
${retryBlock}
═══════════════════════════════════════════════════════════════════

Forja el CONCEPTO RECTOR. Eleva la premisa a un concepto fuerte, específico y único sin traicionar género, tono ni idea central. Autoevalúa con honestidad los 5 ejes. Devuelve el JSON estructurado.
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[ConceptForge] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as ConceptForgeResult;

      if (typeof parsed.concepto !== "string" || !parsed.concepto.trim()) {
        console.error(`[ConceptForge] JSON invalido: falta "concepto".`);
        return { result: null, raw: response };
      }

      parsed.concepto = String(parsed.concepto).trim();
      parsed.gancho = typeof parsed.gancho === "string" ? parsed.gancho.trim() : "";
      parsed.puntuacion_concepto = Math.max(
        1,
        Math.min(10, Number(parsed.puntuacion_concepto) || 1),
      );
      parsed.veredicto =
        parsed.veredicto === "apto" ||
        parsed.veredicto === "necesita_revision" ||
        parsed.veredicto === "reescribir"
          ? parsed.veredicto
          : "necesita_revision";
      const ejesSrc = (parsed.ejes && typeof parsed.ejes === "object") ? parsed.ejes : ({} as any);
      const clampEje = (v: any) => Math.max(1, Math.min(10, Number(v) || 5));
      parsed.ejes = {
        originalidad: clampEje(ejesSrc.originalidad),
        especificidad: clampEje(ejesSrc.especificidad),
        motor_dramatico: clampEje(ejesSrc.motor_dramatico),
        columna_tematica: clampEje(ejesSrc.columna_tematica),
        gancho: clampEje(ejesSrc.gancho),
      };
      parsed.debilidades = Array.isArray(parsed.debilidades)
        ? parsed.debilidades.map((d: any) => String(d)).filter((d: string) => d.trim())
        : [];
      parsed.resumen = typeof parsed.resumen === "string" ? parsed.resumen : "";
      parsed.columna_tematica = typeof parsed.columna_tematica === "string" ? parsed.columna_tematica.trim() : "";
      parsed.promesas_al_lector = Array.isArray(parsed.promesas_al_lector)
        ? parsed.promesas_al_lector.map((p: any) => String(p).trim()).filter((p: string) => p)
        : [];

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[ConceptForge] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
