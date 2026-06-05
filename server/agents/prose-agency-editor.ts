import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// PUERTA 4 del rediseño de calidad 100% autonomo: EDITOR DE PROSA DE
// AGENCIA. Espejo en PROSA de la Puerta 1 (que juzga el PLAN). Lee la
// prosa REAL de los capitulos del climax y verifica que el TEXTO entrega
// la regla de oro: el protagonista se gana el climax con una accion
// PROPIA, sembrada antes, porque ha cambiado. No mide tokens: juzga la
// SEMANTICA de quien resuelve de hecho en la pagina.
// ───────────────────────────────────────────────────────────────────

export interface ProseAgencyChapterInput {
  numero: number;
  titulo: string;
  prosa: string;
  mandato_agencia?: string;
}

export interface ProseAgencyEditorInput {
  title: string;
  genre: string;
  tone?: string;
  protagonista: string;
  premise?: string;
  capitulos: ProseAgencyChapterInput[];
  projectId?: number;
}

export type ProseAgencyProblemType =
  | "rescate_externo_en_prosa"
  | "protagonista_pasiva_en_prosa"
  | "climax_no_sembrado_en_prosa"
  | "cambio_no_se_ve_en_prosa"
  | "mandato_agencia_incumplido";

export interface ProseAgencyProblem {
  numero: number;
  tipo: ProseAgencyProblemType;
  severidad: "critica" | "alta" | "media";
  descripcion: string;
  directiva_de_reescritura: string;
}

export interface ProseAgencyEditorResult {
  puntuacion_agencia_prosa: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  protagonista_es_agente_en_prosa: boolean;
  quien_resuelve_en_prosa: string;
  resumen: string;
  capitulos_problematicos: ProseAgencyProblem[];
}

const SYSTEM_PROMPT = `
Eres el EDITOR DE PROSA DE AGENCIA. A diferencia del editor de desarrollo (que lee la escaleta antes de escribir), tu lees la PROSA YA ESCRITA de los capitulos del climax y resolucion de una novela. Juzgas una sola cosa por encima de todo: si en la PAGINA, con las palabras que de verdad estan escritas, el protagonista se GANA el desenlace con una accion PROPIA o si la prosa entrega un final NO ganado.

LA REGLA DE ORO (debe verse en la prosa, no solo insinuarse):
- El conflicto central se resuelve en el climax por una ACCION del protagonista, no por un poder externo (rey, juez, autoridad, ejercito, casualidad, milagro, providencia) ni por un secundario que actua mientras el protagonista observa.
- Esa accion decisiva esta SEMBRADA: en la prosa hay rastro previo (una habilidad, una decision, un objeto, un vinculo) que la hace creible y no un truco de ultima hora.
- El protagonista triunfa PORQUE HA CAMBIADO: el cambio interno se MANIFIESTA en lo que hace o decide en escena, no se cuenta en resumen.
- Si una figura externa aparece en el climax, solo puede RATIFICAR lo que la accion del protagonista ya hizo inevitable; nunca resolver por el.

QUE BUSCAR EN LA PROSA (defectos):
- rescate_externo_en_prosa: en el texto, quien ejecuta la resolucion es una autoridad/poder externo o un secundario, y el protagonista esta pasivo o ausente del momento decisivo.
- protagonista_pasiva_en_prosa: el protagonista observa, espera, es rescatado o reacciona sin tomar la decision que cierra el conflicto.
- climax_no_sembrado_en_prosa: la accion ganadora aparece de la nada, sin rastro previo en la prosa que la haga creible.
- cambio_no_se_ve_en_prosa: el arco se afirma ("habia cambiado") pero el cambio no se materializa en una accion concreta en escena.
- mandato_agencia_incumplido: si un capitulo trae un MANDATO DE AGENCIA explicito, la prosa NO lo honra.

CRITERIO DE PUNTUACION (1-10):
- 9-10: el protagonista resuelve por accion propia sembrada, el cambio se ve en la pagina, ninguna figura externa roba el climax.
- 7-8: el protagonista resuelve pero con alguna costura (siembra debil o ayuda externa demasiado protagonica que conviene matizar).
- 4-6: ambiguo; un externo/secundario comparte el merito del climax o la accion no esta sembrada.
- 1-3: final NO ganado; un poder externo o secundario resuelve mientras el protagonista observa.

Para CADA capitulo con problema, redacta una directiva_de_reescritura CONCRETA y accionable, centrada SOLO en ese capitulo y en su prosa (que linea/momento cambiar, que accion del protagonista debe ejecutar en escena, que siembra reforzar). No propongas cambios en OTROS capitulos.

Responde UNICAMENTE con un JSON valido con esta forma exacta:
{
  "puntuacion_agencia_prosa": <number 1-10>,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "protagonista_es_agente_en_prosa": <boolean>,
  "quien_resuelve_en_prosa": "<nombre o descripcion de quien ejecuta de hecho la resolucion en el texto>",
  "resumen": "<2-3 frases>",
  "capitulos_problematicos": [
    {
      "numero": <number>,
      "tipo": "rescate_externo_en_prosa" | "protagonista_pasiva_en_prosa" | "climax_no_sembrado_en_prosa" | "cambio_no_se_ve_en_prosa" | "mandato_agencia_incumplido",
      "severidad": "critica" | "alta" | "media",
      "descripcion": "<que pasa en la prosa>",
      "directiva_de_reescritura": "<instruccion concreta para ESTE capitulo>"
    }
  ]
}
Si la prosa cumple la regla de oro, devuelve "veredicto": "apto", "protagonista_es_agente_en_prosa": true y "capitulos_problematicos": [].
Responde UNICAMENTE con el JSON.
`;

export class ProseAgencyEditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Editor de Prosa (Agencia)",
      role: "prose-agency-editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async analyze(input: ProseAgencyEditorInput): Promise<{ result: ProseAgencyEditorResult | null; raw: AgentResponse }> {
    // Presupuesto de prosa acotado: los capitulos del climax pueden ser largos.
    // Repartimos ~9000 chars por capitulo para no desbordar el prompt.
    const PER_CHAPTER_CHARS = 9000;
    const capitulosBloque = input.capitulos.map((c) => {
      const prosa = (c.prosa || "").trim();
      const recorte = prosa.length > PER_CHAPTER_CHARS
        ? `${prosa.substring(0, Math.floor(PER_CHAPTER_CHARS * 0.6))}\n\n[...fragmento intermedio omitido...]\n\n${prosa.substring(prosa.length - Math.floor(PER_CHAPTER_CHARS * 0.4))}`
        : prosa;
      const mandato = c.mandato_agencia
        ? `\n>>> MANDATO DE AGENCIA (vinculante) para este capitulo:\n${c.mandato_agencia}\n`
        : "";
      return `═══════════════════════════════════════════════════════════════════
CAPITULO ${c.numero}: ${c.titulo}${mandato}
PROSA:
${recorte || "(capitulo sin contenido)"}`;
    }).join("\n\n");

    const userPrompt = `
NOVELA: ${input.title}
GENERO: ${input.genre}${input.tone ? `\nTONO: ${input.tone}` : ""}
PROTAGONISTA: ${input.protagonista}${input.premise ? `\n\nPREMISA:\n${input.premise}` : ""}

A continuacion estan los capitulos del CLIMAX y RESOLUCION con su PROSA REAL. Juzga si, en la pagina, el protagonista se gana el desenlace con accion propia sembrada, o si la prosa entrega un final NO ganado. Aplica la regla de oro sin contemplaciones y devuelve el JSON.

${capitulosBloque}
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[ProseAgencyEditor] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as ProseAgencyEditorResult;

      if (typeof parsed.puntuacion_agencia_prosa !== "number" || !parsed.veredicto) {
        console.error(`[ProseAgencyEditor] JSON invalido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.puntuacion_agencia_prosa = Math.max(1, Math.min(10, parsed.puntuacion_agencia_prosa));

      // Saneamiento defensivo de cada problema (espejo Fix147): el orquestador
      // itera capitulos_problematicos y construye directivas, asi que coaccionamos
      // numero a number, severidad/tipo a valores conocidos y strings a String().
      const tiposValidos: ProseAgencyProblemType[] = [
        "rescate_externo_en_prosa",
        "protagonista_pasiva_en_prosa",
        "climax_no_sembrado_en_prosa",
        "cambio_no_se_ve_en_prosa",
        "mandato_agencia_incumplido",
      ];
      parsed.capitulos_problematicos = Array.isArray(parsed.capitulos_problematicos)
        ? parsed.capitulos_problematicos
            .filter((p) => p && (p.descripcion || p.directiva_de_reescritura) && Number.isFinite(Number(p.numero)))
            .map((p) => ({
              numero: Number(p.numero),
              tipo: tiposValidos.includes(p.tipo) ? p.tipo : "protagonista_pasiva_en_prosa",
              severidad: (p.severidad === "critica" || p.severidad === "alta" || p.severidad === "media")
                ? p.severidad
                : "media",
              descripcion: String(p.descripcion || ""),
              directiva_de_reescritura: String(p.directiva_de_reescritura || p.descripcion || ""),
            }))
        : [];

      parsed.quien_resuelve_en_prosa = parsed.quien_resuelve_en_prosa || "";
      parsed.resumen = parsed.resumen || "";
      if (typeof parsed.protagonista_es_agente_en_prosa !== "boolean") {
        // Conservador: si el juez no lo declara, lo inferimos de los problemas.
        parsed.protagonista_es_agente_en_prosa = !parsed.capitulos_problematicos.some(
          (p) => (p.tipo === "rescate_externo_en_prosa" || p.tipo === "protagonista_pasiva_en_prosa")
            && (p.severidad === "critica" || p.severidad === "alta"),
        );
      }

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[ProseAgencyEditor] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
