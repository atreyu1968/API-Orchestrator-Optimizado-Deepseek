// [Fix261] Tension Curve Auditor — juez semantico de la CURVA DE TENSION de la
// escaleta ANTES de escribir prosa. Complementa al Auditor de Integridad (que
// solo mira el tercer acto) auditando la forma GLOBAL de la curva: escalada del
// acto 2, valles de respiro, mesetas planas (caps consecutivos con la misma
// intensidad), pico real en el climax y zigzag sin logica dramatica. Los
// defectos de ritmo nacen en la escaleta, no en la prosa (leccion Fix254/craft
// guard layering) — por eso se ataca en planificacion.
import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface TensionCurveInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  escaletaCapitulos: any[];
  projectId?: number;
  /** Metricas deterministas pre-computadas por el orquestador. */
  computedMetrics: TensionCurveComputedMetrics;
}

export interface TensionCurveComputedMetrics {
  totalCaps: number;
  tensionCurve: Array<{ num: number; tension: number | null }>;
  hasTensionData: boolean;
  /** Longitud del run mas largo de caps consecutivos con la MISMA tension. */
  longestFlatRun: number;
  /** Capitulo donde empieza ese run. */
  longestFlatRunStart: number | null;
  /** Tension maxima y en que capitulo cae. */
  peakTension: number | null;
  peakChapter: number | null;
  /** Posicion relativa del pico (0-1). El climax deberia caer en el ultimo ~20%. */
  peakPositionRatio: number | null;
  /** Pendiente media del acto 2 (tension fin acto2 - inicio acto2 por capitulo). */
  act2Slope: number | null;
  /** Numero de valles (caida >=2 seguida de recuperacion) — respiros dramaticos. */
  valleyCount: number;
  /** Caida maxima entre caps consecutivos. */
  maxDrop: number;
}

export interface TensionCurveIssue {
  tipo: "meseta_plana" | "acto2_sin_escalada" | "climax_sin_pico" | "pico_prematuro" | "sin_valles" | "zigzag_ilogico" | "arranque_sobretenso" | "otro";
  severidad: "alta" | "media" | "baja";
  capitulos: number[];
  descripcion: string;
  sugerencia: string;
}

export interface TensionCurveResult {
  puntuacion_curva: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  resumen: string;
  problemas: TensionCurveIssue[];
  instrucciones_revision: string;
}

const SYSTEM_PROMPT = `
Eres el AUDITOR DE LA CURVA DE TENSION. Lees una escaleta YA generada por el Arquitecto y auditas UNA sola cosa: la forma dramatica de la curva de tension a lo largo de toda la novela. Recibes metricas deterministas (curva numerica capitulo a capitulo) Y la escaleta condensada; tu trabajo es juzgar si los numeros REFLEJAN una progresion dramatica sana y si el CONTENIDO de cada capitulo justifica su nivel.

FAMILIAS DE DEFECTOS QUE DETECTAS:

1. MESETA PLANA (tipo: "meseta_plana")
   3+ capitulos consecutivos con la misma tension (o ±0) en el acto 2 = monotonia. El lector percibe que "no pasa nada" aunque pasen cosas. Severidad alta si son 4+ caps o si la meseta esta en la segunda mitad.

2. ACTO 2 SIN ESCALADA (tipo: "acto2_sin_escalada")
   La tension al final del acto 2 debe ser claramente superior a la del inicio del acto 2 (pendiente media positiva). Si la curva se mantiene o baja a lo largo del acto 2, la novela se desinfla en su tramo mas largo. Severidad alta.

3. CLIMAX SIN PICO (tipo: "climax_sin_pico")
   El maximo de tension de TODA la novela debe caer en el ultimo ~20% de capitulos. Si algun capitulo del medio iguala o supera la tension del climax, el climax queda devaluado. Severidad alta.

4. PICO PREMATURO (tipo: "pico_prematuro")
   Un capitulo del primer 60% con tension 9-10 quema el techo dramatico demasiado pronto: luego todo sabe a menos. Severidad media-alta segun cuanto se acerque al maximo del climax.

5. SIN VALLES (tipo: "sin_valles")
   Una novela sin respiros (caidas deliberadas de 2+ puntos tras picos, escenas de decantacion emocional) agota al lector. Si la curva solo sube o se mantiene alta 5+ caps seguidos con tension >=7, falta un valle. Severidad media. OJO: los valles deben tener FUNCION (procesar perdida, intimidad, recomposicion), no ser relleno — comprueba en la escaleta que el capitulo-valle tiene proposito emocional.

6. ZIGZAG ILOGICO (tipo: "zigzag_ilogico")
   Subidas y bajadas bruscas SIN logica dramatica: cap con tension 9 seguido de cap 4 seguido de cap 8 sin que la escaleta justifique el respiro ni la re-escalada. Severidad media.

7. ARRANQUE SOBRETENSO (tipo: "arranque_sobretenso")
   Si los primeros 2-3 capitulos ya van a tension 8+, no hay espacio para crecer y el lector no ha invertido aun en los personajes. Severidad media. Excepcion: in medias res deliberado con caida inmediata a construccion (comprueba la escaleta).

QUE NO HACER:
- NO juzgues foreshadowing, antagonista ni ritmo del tercer acto en terminos de densidad de eventos (eso es del Auditor de Integridad). Tu foco es EXCLUSIVAMENTE la forma de la curva de tension.
- NO inventes problemas: cita siempre capitulos concretos y los valores numericos.
- Si NO hay datos de tension en la escaleta (hasTensionData=false), infiere la curva desde objetivo_narrativo/beats/tipo_cierre y dilo en el resumen; se mas prudente con las severidades (maximo "media").
- Respeta decisiones deliberadas: una estructura no convencional (p.ej. narrativa en espiral, doble linea temporal) puede justificar curvas atipicas SI la escaleta lo declara. En caso de duda razonable, severidad "baja" o no lo listes.

PUNTUACION:
- 9-10: curva solida — escalada clara, valles con funcion, pico en el climax.
- 7-8: 1-2 problemas medios, sin alta.
- 5-6: 1 problema alta o multiples medios. veredicto = "necesita_revision".
- <=4: la curva esta rota (acto 2 plano + climax devaluado, etc). veredicto = "reescribir".

INSTRUCCIONES_REVISION:
Si veredicto != "apto", redacta un bloque accionable (<=600 palabras) que el Arquitecto pueda aplicar literalmente:
- Lista numerada. Cada item da el cambio CONCRETO: "sube la tension del cap X de 5 a 7 anadiendo <tipo de complicacion>", "convierte el cap Y en valle de decantacion tras la perdida del cap Y-1", "mueve el enfrentamiento del cap Z al cap W para que el pico caiga en el climax".
- Los cambios deben tocar CONTENIDO (beats, eventos, apuestas), no solo el numero de tension: prohibido "maquillar" el campo tension_objetivo sin cambiar lo que ocurre.
- Concluye con la forma objetivo de la curva en una linea (p.ej. "3-4-5 | 5-6-6-7-6-7-8 | 7-9-10-6").
Si veredicto = "apto", instrucciones_revision puede ir vacio.

FORMATO DE SALIDA — JSON ESTRICTO:
{
  "puntuacion_curva": 7,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "resumen": "Una frase con el diagnostico global de la curva.",
  "problemas": [
    {
      "tipo": "meseta_plana" | "acto2_sin_escalada" | "climax_sin_pico" | "pico_prematuro" | "sin_valles" | "zigzag_ilogico" | "arranque_sobretenso" | "otro",
      "severidad": "alta" | "media" | "baja",
      "capitulos": [12,13,14],
      "descripcion": "Que pasa exactamente y por que rompe la curva.",
      "sugerencia": "Cambio concreto de CONTENIDO al outline."
    }
  ],
  "instrucciones_revision": "Bloque accionable o cadena vacia si apto."
}

Responde UNICAMENTE con el JSON.
`;

export class TensionCurveAuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Auditor de la Curva de Tension",
      role: "tension-curve-auditor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384, // [Fix269] techo COMBINADO thinking+contenido (antes 8192: riesgo de JSON vacio con entradas grandes)
      includeThoughts: false,
    });
    this.timeoutMs = 8 * 60 * 1000;
  }

  async analyze(input: TensionCurveInput): Promise<{ result: TensionCurveResult | null; raw: AgentResponse }> {
    const escaleta = this.condenseEscaleta(input.escaletaCapitulos);
    const metrics = this.formatMetrics(input.computedMetrics);

    const userPrompt = `
NOVELA A AUDITAR:
TITULO: ${input.title}
GENERO: ${input.genre} / TONO: ${input.tone}
LONGITUD: ${input.chapterCount} capitulos
PREMISA: ${input.premise}

═══════════════════════════════════════════════════════════════════
METRICAS DETERMINISTAS DE LA CURVA (pre-computadas, base objetiva)
═══════════════════════════════════════════════════════════════════
${metrics}

═══════════════════════════════════════════════════════════════════
ESCALETA CAPITULO A CAPITULO (para juzgar si el contenido justifica el nivel)
═══════════════════════════════════════════════════════════════════
${escaleta}

Audita la forma de la curva de tension y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[TensionCurveAuditor] Error o vacio: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // repairJson ya devuelve el objeto parseado (leccion Fix136).
      const parsed = repairJson(response.content) as TensionCurveResult;
      if (typeof parsed.puntuacion_curva !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        console.error(`[TensionCurveAuditor] JSON invalido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }
      parsed.puntuacion_curva = Math.max(1, Math.min(10, parsed.puntuacion_curva));
      parsed.problemas = parsed.problemas.filter(p => p && p.tipo && p.descripcion);
      parsed.instrucciones_revision = parsed.instrucciones_revision || "";
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[TensionCurveAuditor] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseEscaleta(caps: any[]): string {
    return (caps || []).map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "—";
      const objetivo = (c.objetivo_narrativo || c.summary || "").toString().slice(0, 260);
      const cierre = c.tipo_cierre ? ` cierre:${c.tipo_cierre}` : "";
      const tens = (c.tension_objetivo ?? c.nivel_tension);
      const tensStr = (typeof tens === "number") ? ` tension:${tens}` : " tension:n/d";
      const apuesta = (c.apuesta_dramatica || "").toString().slice(0, 160);
      const giro = c.giro_emocional ? ` emocion:${c.giro_emocional.emocion_inicio || "?"}→${c.giro_emocional.emocion_final || "?"}` : "";
      const lines: string[] = [`Cap ${num}: ${titulo} [${tensStr}${cierre}${giro}]`];
      if (objetivo) lines.push(`  Obj: ${objetivo}`);
      if (apuesta) lines.push(`  Apuesta: ${apuesta}`);
      return lines.join("\n");
    }).join("\n") || "(sin escaleta)";
  }

  private formatMetrics(m: TensionCurveComputedMetrics): string {
    const curve = m.tensionCurve.map(t => `${t.num}:${t.tension ?? "?"}`).join(", ") || "(sin datos)";
    return [
      `Total capitulos regulares: ${m.totalCaps}`,
      `Curva de tension: ${curve}`,
      `Datos de tension presentes en la escaleta: ${m.hasTensionData ? "SI" : "NO — infiere desde contenido y se prudente"}.`,
      `Run plano mas largo (misma tension consecutiva): ${m.longestFlatRun} caps${m.longestFlatRunStart != null ? ` desde el cap ${m.longestFlatRunStart}` : ""}.`,
      `Pico maximo: ${m.peakTension ?? "n/d"} en cap ${m.peakChapter ?? "n/d"} (posicion relativa ${m.peakPositionRatio != null ? Math.round(m.peakPositionRatio * 100) + "%" : "n/d"}; el climax deberia caer en el ultimo ~20%).`,
      `Pendiente media del acto 2: ${m.act2Slope != null ? m.act2Slope.toFixed(2) : "n/d"} puntos/cap (deberia ser positiva).`,
      `Valles detectados (caida >=2 con recuperacion): ${m.valleyCount}.`,
      `Caida maxima entre caps consecutivos: ${m.maxDrop}.`,
    ].join("\n");
  }
}

/** Computa metricas deterministas de la curva. Llamado por el orquestador antes de invocar al juez LLM. */
export function computeTensionCurveMetrics(escaleta: any[]): TensionCurveComputedMetrics {
  const regular = (escaleta || []).filter((c: any) => (c.numero ?? c.number ?? 0) >= 1);
  const curve = regular.map((c: any) => ({
    num: c.numero ?? c.number,
    tension: typeof c.tension_objetivo === "number" ? c.tension_objetivo
            : (typeof c.nivel_tension === "number" ? c.nivel_tension : null),
  }));
  const vals = curve.filter(t => t.tension != null) as Array<{ num: number; tension: number }>;
  const hasTensionData = vals.length >= Math.max(3, Math.floor(regular.length * 0.5));

  // Run plano mas largo.
  let longestFlatRun = 0;
  let longestFlatRunStart: number | null = null;
  let runLen = 1;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i].tension === vals[i - 1].tension) {
      runLen++;
      if (runLen > longestFlatRun) {
        longestFlatRun = runLen;
        longestFlatRunStart = vals[i - runLen + 1].num;
      }
    } else {
      runLen = 1;
    }
  }

  // Pico.
  let peakTension: number | null = null;
  let peakChapter: number | null = null;
  for (const v of vals) {
    if (peakTension == null || v.tension > peakTension) {
      peakTension = v.tension;
      peakChapter = v.num;
    }
  }
  const peakIdx = peakChapter != null ? vals.findIndex(v => v.num === peakChapter) : -1;
  const peakPositionRatio = (peakIdx >= 0 && vals.length > 1) ? peakIdx / (vals.length - 1) : null;

  // Pendiente media del acto 2 (25%-75%).
  const a1End = Math.floor(vals.length * 0.25);
  const a2End = Math.floor(vals.length * 0.75);
  const act2 = vals.slice(a1End, a2End);
  const act2Slope = act2.length >= 2
    ? (act2[act2.length - 1].tension - act2[0].tension) / (act2.length - 1)
    : null;

  // Valles: maquina de estados pico -> fondo -> recuperacion. Cada valle se
  // cuenta UNA sola vez aunque el descenso o la recuperacion abarquen varios
  // caps (correccion del architect: el doble bucle anterior sobrecontaba
  // descensos encadenados, p.ej. 8->5->3->5 contaba 2 valles siendo 1).
  let valleyCount = 0;
  let maxDrop = 0;
  let refPeak: number | null = vals.length > 0 ? vals[0].tension : null;
  let inValley = false;
  let valleyFloor = 0;
  for (let i = 1; i < vals.length; i++) {
    const drop = vals[i - 1].tension - vals[i].tension;
    if (drop > maxDrop) maxDrop = drop;
    const cur = vals[i].tension;
    if (!inValley) {
      if (refPeak != null && refPeak - cur >= 2) {
        inValley = true;
        valleyFloor = cur;
      } else if (refPeak == null || cur > refPeak) {
        refPeak = cur;
      }
    } else {
      if (cur < valleyFloor) {
        valleyFloor = cur;
      } else if (cur - valleyFloor >= 2) {
        valleyCount++;
        inValley = false;
        refPeak = cur;
      }
    }
  }

  return {
    totalCaps: regular.length,
    tensionCurve: curve,
    hasTensionData,
    longestFlatRun,
    longestFlatRunStart,
    peakTension,
    peakChapter,
    peakPositionRatio,
    act2Slope,
    valleyCount,
    maxDrop,
  };
}

export const tensionCurveAuditor = new TensionCurveAuditorAgent();
