import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// PUERTA 5 del rediseno de calidad 100% autonomo: LECTURA FINAL POR EJES.
// Mientras la Puerta 4 audita la PROSA del CLIMAX (agencia), esta puerta
// lee la novela COMPLETA terminada y la juzga por EJES ortogonales que los
// lectores existentes (Holistico, Beta, Revisor Final, Voz/Ritmo,
// Continuidad de estados) NO auditan de forma sistematica y vinculante:
//   - promesa_pago: siembras/promesas importantes sin pago; cabos sueltos
//     (pistolas de Chejov que nunca disparan).
//   - coherencia_causal: giros mayores no motivados ni sembrados;
//     conveniencias/coincidencias que resuelven; informacion que aparece
//     de la nada.
//   - consistencia_personaje: motivacion/comportamiento de un personaje que
//     se contradice a lo largo del libro (NO estados fisicos -- eso lo cubre
//     el centinela de continuidad -- sino decisiones/voz/moral incoherentes).
//   - cierre_tematico: preguntas o lineas tematicas/emocionales planteadas
//     al inicio que el final no cierra ni paga.
// No mide tokens: juzga la SEMANTICA de la novela entera y mapea cada
// problema a un capitulo concreto con una directiva de reescritura.
// ───────────────────────────────────────────────────────────────────

export interface FinalAxisChapterInput {
  numero: number;
  titulo: string;
  prosa: string;
}

export interface FinalAxisReaderInput {
  title: string;
  genre: string;
  tone?: string;
  protagonista: string;
  premise?: string;
  capitulos: FinalAxisChapterInput[];
  projectId?: number;
}

export type FinalAxisEje =
  | "promesa_pago"
  | "coherencia_causal"
  | "consistencia_personaje"
  | "cierre_tematico";

export interface FinalAxisProblem {
  numero: number;
  eje: FinalAxisEje;
  severidad: "critica" | "alta" | "media";
  descripcion: string;
  directiva_de_reescritura: string;
}

export interface FinalAxisEjes {
  promesa_pago: number;
  coherencia_causal: number;
  consistencia_personaje: number;
  cierre_tematico: number;
}

export interface FinalAxisReaderResult {
  puntuacion_global: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  ejes: FinalAxisEjes;
  resumen: string;
  problemas: FinalAxisProblem[];
}

const SYSTEM_PROMPT = `
Eres el LECTOR FINAL POR EJES. Lees la novela COMPLETA, ya escrita, de principio a fin, y la juzgas de forma profesional a lo largo de CUATRO EJES ortogonales. No repites el trabajo de otros revisores (estilo, ritmo, enganche emocional, agencia del climax): tu mision es cazar los defectos ESTRUCTURALES de coherencia que solo se ven leyendo el libro entero.

LOS CUATRO EJES:
1. promesa_pago (siembra -> pago / cabos sueltos): toda promesa importante que el libro hace al lector debe pagarse. Un objeto, una amenaza, un secreto, una habilidad, una relacion o un misterio presentados con peso deben tener consecuencia o resolucion. Caza las "pistolas de Chejov" que nunca disparan y los hilos abandonados.
2. coherencia_causal (giros sembrados, sin conveniencias): los giros mayores y la resolucion deben estar MOTIVADOS y sembrados antes. Caza las conveniencias (una coincidencia oportuna que resuelve, informacion que aparece de la nada justo cuando hace falta, un personaje que sabe algo que no podia saber, un obstaculo que se evapora sin coste).
3. consistencia_personaje (motivacion/comportamiento a lo largo del libro): un personaje debe comportarse de forma coherente con su caracterizacion y motivaciones a lo largo de TODO el libro. Caza giros de conducta no justificados, decisiones que contradicen lo establecido, una voz o moral que cambia sin causa. NO juzgues estados fisicos (heridas, ubicacion): solo coherencia psicologica y de motivacion.
4. cierre_tematico (las preguntas planteadas se cierran): las preguntas dramaticas, dilemas morales y lineas tematicas/emocionales que el libro plantea al inicio deben quedar cerradas (resueltas o deliberadamente dejadas abiertas con sentido) al final. Caza los temas que se abren con fuerza y se olvidan, y los finales que no pagan la promesa emocional del arranque.

CRITERIO DE PUNTUACION POR EJE Y GLOBAL (1-10):
- 9-10: el eje esta solido; sin defectos relevantes.
- 7-8: el eje funciona con alguna costura menor conviene matizar.
- 4-6: defecto claro que un lector atento notaria y restaria satisfaccion.
- 1-3: fallo grave que rompe la coherencia o deja una promesa central sin pagar.
La puntuacion_global refleja la salud estructural conjunta (no es la media exacta: un fallo critico en un eje hunde el global).

SEVERIDAD de cada problema:
- critica: rompe la coherencia central o deja sin pagar una promesa principal del libro.
- alta: defecto importante que un lector notaria y restaria satisfaccion.
- media: costura menor, mejorable.

Para CADA problema, identifica el CAPITULO concreto donde debe repararse (normalmente donde se paga/cierra, o donde se siembra) y redacta una directiva_de_reescritura CONCRETA y accionable centrada SOLO en ese capitulo (que anadir, que escena reforzar, que siembra plantar o que pago entregar). No propongas cambios en OTROS capitulos dentro de la misma directiva.

Responde UNICAMENTE con un JSON valido con esta forma exacta:
{
  "puntuacion_global": <number 1-10>,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "ejes": {
    "promesa_pago": <number 1-10>,
    "coherencia_causal": <number 1-10>,
    "consistencia_personaje": <number 1-10>,
    "cierre_tematico": <number 1-10>
  },
  "resumen": "<2-3 frases con el diagnostico estructural>",
  "problemas": [
    {
      "numero": <number: capitulo donde reparar>,
      "eje": "promesa_pago" | "coherencia_causal" | "consistencia_personaje" | "cierre_tematico",
      "severidad": "critica" | "alta" | "media",
      "descripcion": "<que defecto estructural y donde>",
      "directiva_de_reescritura": "<instruccion concreta para ESE capitulo>"
    }
  ]
}
Si la novela esta estructuralmente solida, devuelve "veredicto": "apto" y "problemas": [].
Responde UNICAMENTE con el JSON.
`;

export class FinalAxisReaderAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Lector Final (por Ejes)",
      role: "final-axis-reader",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
      includeThoughts: false,
    });
    this.timeoutMs = 10 * 60 * 1000;
  }

  async analyze(input: FinalAxisReaderInput): Promise<{ result: FinalAxisReaderResult | null; raw: AgentResponse }> {
    // Presupuesto de prosa acotado: la novela completa puede ser muy larga.
    // Recortamos cada capitulo a cabeza+cola para que el juez vea el arco
    // entero sin desbordar el prompt. DeepSeek V4-Flash tiene un contexto de
    // 1M tokens, pero acotamos por coste y latencia.
    const PER_CHAPTER_CHARS = 3500;
    const capitulosBloque = input.capitulos.map((c) => {
      const prosa = (c.prosa || "").trim();
      const recorte = prosa.length > PER_CHAPTER_CHARS
        ? `${prosa.substring(0, Math.floor(PER_CHAPTER_CHARS * 0.6))}\n\n[...fragmento intermedio omitido...]\n\n${prosa.substring(prosa.length - Math.floor(PER_CHAPTER_CHARS * 0.4))}`
        : prosa;
      return `═══════════════════════════════════════════════════════════════════
CAPITULO ${c.numero}: ${c.titulo}
${recorte || "(capitulo sin contenido)"}`;
    }).join("\n\n");

    const userPrompt = `
NOVELA: ${input.title}
GENERO: ${input.genre}${input.tone ? `\nTONO: ${input.tone}` : ""}
PROTAGONISTA: ${input.protagonista}${input.premise ? `\n\nPREMISA:\n${input.premise}` : ""}

A continuacion esta la novela COMPLETA (capitulos en orden, con su prosa recortada a cabeza+cola). Leela de principio a fin y juzgala por los cuatro ejes. Mapea cada defecto al capitulo donde debe repararse y devuelve el JSON.

${capitulosBloque}
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[FinalAxisReader] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as FinalAxisReaderResult;

      if (typeof parsed.puntuacion_global !== "number" || !parsed.veredicto) {
        console.error(`[FinalAxisReader] JSON invalido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.puntuacion_global = Math.max(1, Math.min(10, parsed.puntuacion_global));

      // Saneamiento defensivo de los ejes (clamp y defaults).
      const clampEje = (v: any): number =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 7;
      const e = (parsed.ejes || {}) as Partial<FinalAxisEjes>;
      parsed.ejes = {
        promesa_pago: clampEje(e.promesa_pago),
        coherencia_causal: clampEje(e.coherencia_causal),
        consistencia_personaje: clampEje(e.consistencia_personaje),
        cierre_tematico: clampEje(e.cierre_tematico),
      };

      // Saneamiento defensivo de cada problema (espejo P4): el orquestador itera
      // problemas y construye directivas, asi que coaccionamos numero a number,
      // eje/severidad a valores conocidos y strings a String().
      const ejesValidos: FinalAxisEje[] = [
        "promesa_pago",
        "coherencia_causal",
        "consistencia_personaje",
        "cierre_tematico",
      ];
      parsed.problemas = Array.isArray(parsed.problemas)
        ? parsed.problemas
            .filter((p) => p && (p.descripcion || p.directiva_de_reescritura) && Number.isFinite(Number(p.numero)))
            .map((p) => ({
              numero: Number(p.numero),
              eje: ejesValidos.includes(p.eje) ? p.eje : "coherencia_causal",
              severidad: (p.severidad === "critica" || p.severidad === "alta" || p.severidad === "media")
                ? p.severidad
                : "media",
              descripcion: String(p.descripcion || ""),
              directiva_de_reescritura: String(p.directiva_de_reescritura || p.descripcion || ""),
            }))
        : [];

      parsed.resumen = parsed.resumen || "";

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[FinalAxisReader] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
