import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// ───────────────────────────────────────────────────────────────────
// [Fix156][Puerta Acto 2] EDITOR DE RITMO DEL ACTO 2. Espejo en PROSA de
// las Puertas 4/5, pero corre A MITAD DE NOVELA (cuando el acto 2 ya esta
// escrito, ~75%) en vez de al final. Lee la PROSA REAL del tramo central
// (acto 2, ~25%-75%) y juzga lo que mas rompe al lector en esa zona: si la
// tension ESCALA de forma monotona hacia el climax o si el tramo se hunde
// en una meseta (apuestas que no suben, avance sin coste, escenas
// repetitivas, subtramas estancadas). No mide tokens: juzga la SEMANTICA
// del ritmo. Su valor es ATAJAR el bajon del acto 2 EN CUANTO se escribe,
// para que el acto 3 se construya sobre un acto 2 ya solido, en vez de
// esperar al rescate final (tarde y caro).
// ───────────────────────────────────────────────────────────────────

export interface Act2ChapterInput {
  numero: number;
  titulo: string;
  prosa: string;
}

export interface Act2PacingEditorInput {
  title: string;
  genre: string;
  tone?: string;
  protagonista: string;
  premise?: string;
  capitulos: Act2ChapterInput[];
  projectId?: number;
}

export type Act2ProblemType =
  | "meseta_sin_escalada"
  | "apuesta_no_sube"
  | "avance_sin_coste"
  | "repeticion_estructural"
  | "tension_plana"
  | "subtrama_estancada";

export interface Act2Problem {
  numero: number;
  tipo: Act2ProblemType;
  severidad: "critica" | "alta" | "media";
  descripcion: string;
  directiva_de_reescritura: string;
}

export interface Act2PacingEditorResult {
  puntuacion_acto2: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  escala_correctamente: boolean;
  resumen: string;
  capitulos_problematicos: Act2Problem[];
}

const SYSTEM_PROMPT = `
Eres el EDITOR DE RITMO DEL ACTO 2. Lees la PROSA YA ESCRITA del tramo central de una novela (el acto 2, la zona donde mas novelas se hunden) y juzgas una sola cosa por encima de todo: si la tension ESCALA de verdad hacia el climax o si el tramo se aplana en una MESETA que aburre al lector.

EL ACTO 2 SANO (debe verse en la prosa, no solo insinuarse):
- ESCALADA MONOTONA: cada tramo sube la apuesta respecto al anterior. El protagonista arriesga o pierde mas a medida que avanza; el problema se vuelve mas grave, mas personal o mas urgente.
- COSTE TANGIBLE E IRREVERSIBLE: el avance se paga (una herida, una perdida, una decision sin vuelta atras, la rotura de un recurso o aliado). Nada de tension que se resuelve gratis ni de victorias sin precio.
- VARIEDAD DE ESCENA: las escenas no repiten la misma forma una y otra vez (p.ej. cuatro "investigaciones" o cuatro "conversaciones" identicas). Cada escena aporta algo nuevo.
- MOMENTUM HACIA EL CLIMAX: el tramo empuja hacia el desenlace; las subtramas progresan; no hay relleno ni ruedas girando en el sitio.

QUE BUSCAR EN LA PROSA (defectos del acto 2):
- meseta_sin_escalada: el tramo se estanca; la tension se mantiene plana en lugar de subir; el lector siente "presion sin avance".
- apuesta_no_sube: lo que esta en juego es igual o menor que en capitulos previos; el riesgo no crece.
- avance_sin_coste: la trama avanza pero sin precio real; los obstaculos se superan demasiado facil o se resuelven gratis.
- repeticion_estructural: varias escenas con la misma forma/funcion seguidas (investigacion x4, dialogo expositivo x3) sin variedad.
- tension_plana: prosa sin urgencia; ritmo monocorde; falta de conflicto activo en escena.
- subtrama_estancada: una subtrama o relacion clave deja de progresar durante el tramo.

REGLAS:
- Juzga SOLO el tramo central que se te entrega; no inventes capitulos que no ves ni propongas cambios en otros capitulos fuera del tramo.
- PROHIBIDO sugerir salvadores, informantes o soluciones que no esten ya sembrados antes (anti deus ex machina): la escalada se logra con elementos ya presentes.
- CONSERVA los hechos canonicos, nombres, revelaciones y la trama: lo que se corrige es la INTENSIDAD, el coste y la variedad, no los hechos.

CRITERIO DE PUNTUACION (1-10):
- 9-10: el acto 2 escala de forma clara y sostenida, cada avance se paga con coste real, hay variedad de escena y momentum hacia el climax.
- 7-8: escala en lo esencial pero con alguna costura (un tramo algo plano o una escena repetida que conviene matizar).
- 4-6: hay meseta perceptible; la tension se aplana en parte del tramo o el coste es debil.
- 1-3: el acto 2 se hunde; tension plana, apuestas que no suben, avance sin coste o relleno repetitivo.

Para CADA capitulo con problema, redacta una directiva_de_reescritura CONCRETA y accionable, centrada SOLO en ese capitulo y su prosa (que momento elevar, que apuesta subir, que coste irreversible introducir, que repeticion romper). No propongas cambios en OTROS capitulos.

Responde UNICAMENTE con un JSON valido con esta forma exacta:
{
  "puntuacion_acto2": <number 1-10>,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "escala_correctamente": <boolean>,
  "resumen": "<2-3 frases>",
  "capitulos_problematicos": [
    {
      "numero": <number>,
      "tipo": "meseta_sin_escalada" | "apuesta_no_sube" | "avance_sin_coste" | "repeticion_estructural" | "tension_plana" | "subtrama_estancada",
      "severidad": "critica" | "alta" | "media",
      "descripcion": "<que pasa en la prosa>",
      "directiva_de_reescritura": "<instruccion concreta para ESTE capitulo>"
    }
  ]
}
Si el acto 2 escala bien, devuelve "veredicto": "apto", "escala_correctamente": true y "capitulos_problematicos": [].
Responde UNICAMENTE con el JSON.
`;

export class Act2PacingEditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Editor de Ritmo (Acto 2)",
      role: "act2-pacing-editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // [Fix156] Mismo techo que las Puertas 4/5 (Fix155): con thinking en
      // esfuerzo "max" sobre una entrada grande (varios capitulos del acto 2),
      // el razonamiento consume parte del presupuesto COMBINADO de salida en
      // DeepSeek V4; 16384 deja sitio para razonamiento Y veredicto sin que el
      // JSON salga vacio o cortado. Solo se factura lo realmente usado.
      maxOutputTokens: 16384,
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async analyze(input: Act2PacingEditorInput): Promise<{ result: Act2PacingEditorResult | null; raw: AgentResponse }> {
    // Presupuesto de prosa acotado: el acto 2 puede tener varios capitulos.
    // Repartimos ~7000 chars por capitulo (cabeza+cola) para no desbordar el
    // prompt y aun asi captar el arco de cada escena.
    const PER_CHAPTER_CHARS = 7000;
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

    const userPrompt = `
NOVELA: ${input.title}
GENERO: ${input.genre}${input.tone ? `\nTONO: ${input.tone}` : ""}
PROTAGONISTA: ${input.protagonista}${input.premise ? `\n\nPREMISA:\n${input.premise}` : ""}

A continuacion esta el TRAMO CENTRAL (acto 2) de la novela con su PROSA REAL, en orden. Juzga si la tension escala de verdad hacia el climax o si el tramo se hunde en una meseta. Aplica el criterio sin contemplaciones y devuelve el JSON.

${capitulosBloque}
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[Act2PacingEditor] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as Act2PacingEditorResult;

      if (typeof parsed.puntuacion_acto2 !== "number" || !parsed.veredicto) {
        console.error(`[Act2PacingEditor] JSON invalido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.puntuacion_acto2 = Math.max(1, Math.min(10, parsed.puntuacion_acto2));

      // Saneamiento defensivo de cada problema (espejo Fix148): el orquestador
      // itera capitulos_problematicos y construye directivas, asi que coaccionamos
      // numero a number, severidad/tipo a valores conocidos y strings a String().
      const tiposValidos: Act2ProblemType[] = [
        "meseta_sin_escalada",
        "apuesta_no_sube",
        "avance_sin_coste",
        "repeticion_estructural",
        "tension_plana",
        "subtrama_estancada",
      ];
      parsed.capitulos_problematicos = Array.isArray(parsed.capitulos_problematicos)
        ? parsed.capitulos_problematicos
            .filter((p) => p && (p.descripcion || p.directiva_de_reescritura) && Number.isFinite(Number(p.numero)))
            .map((p) => ({
              numero: Number(p.numero),
              tipo: tiposValidos.includes(p.tipo) ? p.tipo : "meseta_sin_escalada",
              severidad: (p.severidad === "critica" || p.severidad === "alta" || p.severidad === "media")
                ? p.severidad
                : "media",
              descripcion: String(p.descripcion || ""),
              directiva_de_reescritura: String(p.directiva_de_reescritura || p.descripcion || ""),
            }))
        : [];

      parsed.resumen = parsed.resumen || "";
      if (typeof parsed.escala_correctamente !== "boolean") {
        // Conservador: si el juez no lo declara, lo inferimos de los problemas.
        parsed.escala_correctamente = !parsed.capitulos_problematicos.some(
          (p) => (p.tipo === "meseta_sin_escalada" || p.tipo === "apuesta_no_sube" || p.tipo === "tension_plana")
            && (p.severidad === "critica" || p.severidad === "alta"),
        );
      }

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[Act2PacingEditor] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }
}
