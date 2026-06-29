import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// [Fix166][Puerta Tiempo Verbal Temprano] JUEZ DE CONSISTENCIA DE TIEMPO
// VERBAL. Lee la PROSA REAL de los PRIMEROS capitulos ya escritos y
// detecta el tiempo verbal GRAMATICAL de la NARRACION (pasado vs
// presente), capitulo a capitulo. No infiere el tiempo "deseado" de la
// guia (leccion Fix165: esa inferencia es POCO fiable y fabricaba un
// canon fantasma); juzga el tiempo REAL de la prosa, que SI es fiable.
// Su valor es ATAJAR una desviacion de tiempo verbal EN CUANTO aparece
// en los primeros capitulos, antes de que se propague al resto del libro
// (donde el Revisor Final ya no puede corregirla cap-a-cap).
//
// IMPORTANTE: juzga el tiempo de la NARRACION (la voz que cuenta la
// historia), NO el de los dialogos ni el de pensamientos en presente ni
// el presente historico puntual de un recuerdo: esos conviven con una
// narracion en pasado sin que el capitulo sea "mixto".
// ───────────────────────────────────────────────────────────────────

export interface TenseChapterInput {
  numero: number;
  titulo: string;
  prosa: string;
}

export interface TenseConsistencyJudgeInput {
  title: string;
  genre: string;
  protagonista: string;
  // Tiempo CANONICO explicito (solo si el usuario lo fijo de forma inequivoca,
  // p.ej. via bloque de voz). Si llega, el juez lo usa como referencia para
  // marcar desviaciones; si no llega, juzga la consistencia INTERNA (todos los
  // capitulos en el mismo tiempo) sin imponer ninguno.
  tiempoCanonico?: "pasado" | "presente";
  capitulos: TenseChapterInput[];
  projectId?: number;
}

export type DetectedTense = "pasado" | "presente" | "mixto";

export interface TenseChapterVerdict {
  numero: number;
  tiempo: DetectedTense;
}

export interface DeviatedChapter {
  numero: number;
  tiempo_detectado: DetectedTense;
  directiva_de_reescritura: string;
}

export interface TenseConsistencyResult {
  capitulos: TenseChapterVerdict[];
  tiempo_dominante: DetectedTense;
  consistente: boolean;
  resumen: string;
  capitulos_desviados: DeviatedChapter[];
}

const SYSTEM_PROMPT = `
Eres el JUEZ DE CONSISTENCIA DE TIEMPO VERBAL. Lees la PROSA YA ESCRITA de los primeros capitulos de una novela y determinas, con precision gramatical, en que TIEMPO VERBAL esta narrada cada capitulo: PASADO (preterito/imperfecto: "camino", "habia llegado", "miro") o PRESENTE ("camina", "ha llegado", "mira").

QUE JUZGAR (y que NO):
- Juzga SOLO el tiempo de la NARRACION: la voz que cuenta la historia, los verbos de accion y descripcion fuera de dialogo.
- NO cuentes los DIALOGOS: un personaje puede hablar en presente ("voy a matarte") dentro de una narracion en pasado; eso es NORMAL y no hace mixto al capitulo.
- NO cuentes los PENSAMIENTOS en presente, las verdades generales ("el mar es azul"), ni el presente historico puntual de un recuerdo o de una frase aislada: la narracion sigue siendo pasado.
- Un capitulo es "mixto" SOLO si la NARRACION misma alterna de verdad entre pasado y presente de forma inconsistente (no por los casos normales de arriba).

CRITERIO:
- Decide el tiempo de cada capitulo por el TIEMPO DOMINANTE de su narracion (la inmensa mayoria de los verbos narrativos).
- "tiempo_dominante" = el tiempo de la narracion que predomina en el CONJUNTO de los capitulos entregados.
- "consistente" = true SOLO si TODOS los capitulos comparten el mismo tiempo de narracion (y ninguno es "mixto").

REGLAS:
- Juzga SOLO los capitulos que se te entregan; no inventes capitulos que no ves.
- NO propongas cambios de trama, estilo, longitud ni contenido: tu unico objeto es el TIEMPO VERBAL de la narracion.
- Para cada capitulo cuyo tiempo se desvie del dominante (o sea "mixto"), redacta una directiva_de_reescritura CONCRETA: convertir TODA la narracion de ese capitulo al tiempo dominante, conservando intactos los hechos, el dialogo, el estilo, el orden de las escenas y la longitud (solo cambia la conjugacion de los verbos de narracion).

Responde UNICAMENTE con un JSON valido con esta forma exacta:
{
  "capitulos": [ { "numero": <number>, "tiempo": "pasado" | "presente" | "mixto" } ],
  "tiempo_dominante": "pasado" | "presente" | "mixto",
  "consistente": <boolean>,
  "resumen": "<2-3 frases sobre el tiempo verbal de la narracion en estos capitulos>",
  "capitulos_desviados": [
    {
      "numero": <number>,
      "tiempo_detectado": "pasado" | "presente" | "mixto",
      "directiva_de_reescritura": "<instruccion concreta de conversion de tiempo para ESTE capitulo>"
    }
  ]
}
Si todos los capitulos comparten el mismo tiempo de narracion, devuelve "consistente": true y "capitulos_desviados": [].
Responde UNICAMENTE con el JSON.
`;

export class TenseConsistencyJudgeAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Juez de Tiempo Verbal",
      role: "tense-consistency-judge",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // [Fix166] Mismo techo que las Puertas 4/5/Acto2 (Fix155/156): con thinking
      // en esfuerzo "max" sobre varios capitulos, el razonamiento consume parte
      // del presupuesto COMBINADO de salida en DeepSeek V4; 16384 deja sitio para
      // razonamiento Y veredicto sin que el JSON salga vacio o cortado.
      maxOutputTokens: 16384,
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async analyze(input: TenseConsistencyJudgeInput): Promise<{ result: TenseConsistencyResult | null; raw: AgentResponse }> {
    // Presupuesto de prosa acotado: para juzgar el tiempo verbal basta una
    // muestra amplia de la narracion; recortamos ~6000 chars por capitulo
    // (cabeza+cola) para no desbordar el prompt y aun captar el patron.
    const PER_CHAPTER_CHARS = 6000;
    const capitulosBloque = input.capitulos.map((c) => {
      const prosa = (c.prosa || "").trim();
      const recorte = prosa.length > PER_CHAPTER_CHARS
        ? `${prosa.substring(0, Math.floor(PER_CHAPTER_CHARS * 0.6))}\n\n[...fragmento intermedio omitido...]\n\n${prosa.substring(prosa.length - Math.floor(PER_CHAPTER_CHARS * 0.4))}`
        : prosa;
      return `═══════════════════════════════════════════════════════════════════
CAPITULO ${c.numero}: ${c.titulo}
PROSA:
${recorte || "(capitulo sin contenido)"}`;
    }).join("\n\n");

    const canonBlock = input.tiempoCanonico
      ? `\nTIEMPO VERBAL CANONICO FIJADO POR EL AUTOR: ${input.tiempoCanonico.toUpperCase()}. Marca como desviado cualquier capitulo cuya narracion NO este en ese tiempo y redacta su directiva de conversion hacia ${input.tiempoCanonico}.`
      : `\nNo hay tiempo verbal canonico fijado: juzga la CONSISTENCIA INTERNA (que todos los capitulos compartan el mismo tiempo de narracion) sin imponer ninguno; el tiempo de referencia es el DOMINANTE entre los capitulos entregados.`;

    const userPrompt = `
NOVELA: ${input.title}
GENERO: ${input.genre}
PROTAGONISTA: ${input.protagonista}
${canonBlock}

A continuacion estan los PRIMEROS capitulos de la novela con su PROSA REAL, en orden. Determina en que tiempo verbal esta narrado CADA capitulo (juzgando solo la narracion, no los dialogos) y devuelve el JSON.

${capitulosBloque}
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[TenseConsistencyJudge] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as TenseConsistencyResult;

      const tiemposValidos: DetectedTense[] = ["pasado", "presente", "mixto"];
      const coerceTense = (t: any): DetectedTense =>
        tiemposValidos.includes(t) ? t : "mixto";

      parsed.capitulos = Array.isArray(parsed.capitulos)
        ? parsed.capitulos
            .filter((c) => c && Number.isFinite(Number(c.numero)))
            .map((c) => ({ numero: Number(c.numero), tiempo: coerceTense(c.tiempo) }))
        : [];

      if (parsed.capitulos.length === 0) {
        console.error(`[TenseConsistencyJudge] JSON invalido: sin capitulos juzgados.`);
        return { result: null, raw: response };
      }

      // tiempo_dominante: si el modelo no lo declara o es invalido, lo inferimos
      // por mayoria de los capitulos (pasado/presente; ignorando mixto en el
      // recuento, con desempate hacia pasado por ser el default narrativo).
      if (!tiemposValidos.includes(parsed.tiempo_dominante)) {
        const conteo = { pasado: 0, presente: 0 };
        for (const c of parsed.capitulos) {
          if (c.tiempo === "pasado") conteo.pasado++;
          else if (c.tiempo === "presente") conteo.presente++;
        }
        parsed.tiempo_dominante = conteo.presente > conteo.pasado ? "presente" : "pasado";
      }

      // Saneamiento defensivo de cada desviacion (espejo Fix148/156): el
      // orquestador itera capitulos_desviados, asi que coaccionamos numero a
      // number, tiempo a valor conocido y strings a String().
      parsed.capitulos_desviados = Array.isArray(parsed.capitulos_desviados)
        ? parsed.capitulos_desviados
            .filter((p) => p && Number.isFinite(Number(p.numero)))
            .map((p) => ({
              numero: Number(p.numero),
              tiempo_detectado: coerceTense(p.tiempo_detectado),
              directiva_de_reescritura: String(p.directiva_de_reescritura || ""),
            }))
        : [];

      parsed.resumen = String(parsed.resumen || "");

      if (typeof parsed.consistente !== "boolean") {
        // Conservador: consistente solo si todos los capitulos comparten tiempo
        // y ninguno es mixto.
        const tiempos = new Set(parsed.capitulos.map((c) => c.tiempo));
        parsed.consistente = tiempos.size === 1 && !tiempos.has("mixto");
      }

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[TenseConsistencyJudge] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
