// [Fix18] Plot Integrity Auditor — audita la escaleta del Arquitecto en tres
// dimensiones que producen críticas recurrentes: (1) presagios/foreshadowing
// (revelaciones sin sembrar), (2) coherencia del antagonista (decisiones por
// conveniencia de trama), (3) ritmo del tercer acto (densidad de pivotes,
// curva de tensión, consecuencias inmediatas).
import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface PlotIntegrityInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  worldBible: any;
  escaletaCapitulos: any[];
  matrizArcos?: any;
  estructuraTresActos?: any;
  projectId?: number;
  /** Métricas deterministas pre-computadas por el orquestador. */
  computedMetrics: PlotIntegrityComputedMetrics;
}

export interface PlotIntegrityComputedMetrics {
  totalCaps: number;
  pivotalDensityPerAct: { act1: number; act2: number; act3: number };
  pivotalCountPerAct: { act1: number; act2: number; act3: number };
  tensionCurve: Array<{ num: number; tension: number | null }>;
  tensionDropMax: number;
  diegeticDaysPerAct: { act1: number; act2: number; act3: number };
  diegeticDaysCompressionRatio: number | null;
  cliffhangerRatio: number | null;
  hasSeedFields: boolean;
}

export interface PlotIntegrityIssue {
  area: "foreshadowing" | "antagonista" | "pacing";
  tipo: string;
  severidad: "alta" | "media" | "baja";
  capitulos: number[];
  descripcion: string;
  sugerencia: string;
}

export interface PlotIntegrityResult {
  puntuacion_global: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  resumen: string;
  problemas: PlotIntegrityIssue[];
  instrucciones_revision: string;
}

const SYSTEM_PROMPT = `
Eres el AUDITOR DE INTEGRIDAD NARRATIVA. Lees una escaleta YA generada por el Arquitecto y detectas tres familias de defectos que provocan críticas recurrentes:

1. FORESHADOWING TARDÍO (area: "foreshadowing")
   Revelaciones del acto 2 o 3 (especialmente místicas, mágicas, sobrenaturales o de identidad) que aparecen sin haber sido sembradas en capítulos anteriores. Para cada revelación importante:
   - ¿Hay al menos 2 menciones/atmósferas/objetos/comentarios en capítulos previos que la anticipen?
   - Si NO, es siembra huérfana → severidad alta y sugiere en qué capítulos del acto 1 sembrarla.
   También detecta siembras (objetos, secretos, capacidades) introducidas en el acto 1 que NO se cosechan después (Chéjov sin disparar).

2. ANTAGONISTA POR CONVENIENCIA (area: "antagonista")
   Lee con suspicacia las decisiones del antagonista. Para cada decisión que le perjudica (delegar algo crítico, dejar evidencia, subestimar al protagonista, no actuar cuando podría):
   - ¿Es coherente con su perfil descrito (perfil_psicologico, descripcion, arco)?
   - ¿Es la opción menos restrictiva que aún sirve a la trama? Si el antagonista podría haber actuado de forma más quirúrgica y la escaleta lo hace fallar para forzar el clímax, eso es conveniencia → severidad alta.
   - Si la escaleta NO justifica el fallo (no hay distracción concreta, evento externo, presión, ego cegado mostrado), señálalo y sugiere qué sembrar antes para que el fallo sea creíble.

3. RITMO DEL TERCER ACTO (area: "pacing")
   Te paso métricas deterministas (densidad de pivotes por acto, curva de tensión, días diegéticos por acto, runs de cliffhangers). Úsalas:
   - Si el acto 3 concentra >50% de eventos pivotales totales → comprimido. severidad alta.
   - Si los días diegéticos del acto 3 colapsan a <1/3 del promedio de los actos 1-2 SIN un único capítulo etiquetado como compresión consciente → ritmo apresurado. severidad alta.
   - Pares causa→efecto críticos (traición, revelación, pérdida) que ocurren en <2 capítulos cuando el peso emocional pediría más respiro → falta de decantación. severidad media-alta.
   - Caídas de tensión >3 puntos entre capítulos consecutivos del clímax → el clímax pierde fuerza. severidad media.

═══════════════════════════════════════════════════════════════════
QUÉ NO HACER
═══════════════════════════════════════════════════════════════════
- NO juzgues clichés, originalidad, voz ni promesa de género (otros agentes).
- NO repitas problemas de los otros auditores; tu foco son los TRES bloques de arriba.
- NO inventes problemas: cita siempre capítulos concretos.
- NO penalices que falten campos opcionales (siembra/cosecha/tension_objetivo) — esos son ayuda extra; razona también desde objetivo_narrativo y beats.

═══════════════════════════════════════════════════════════════════
PUNTUACIÓN
═══════════════════════════════════════════════════════════════════
- 9-10: integridad sólida, ningún problema mayor.
- 7-8: 1-2 problemas medios, sin alta.
- 5-6: 1 problema alta o múltiples medios. veredicto = "necesita_revision".
- ≤4: múltiples altas o una alta crítica que requiere repensar tramos enteros. veredicto = "reescribir".

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES_REVISION
═══════════════════════════════════════════════════════════════════
Si veredicto != "apto", redacta un bloque accionable (≤700 palabras) que el Arquitecto pueda aplicar literalmente:
- Lista numerada por área (foreshadowing / antagonista / pacing).
- Cada item indica el cambio CONCRETO al outline (qué sembrar en cap.X, qué justificación añadir a la decisión del antagonista en cap.Y, qué capítulo desdoblar o redistribuir en el acto 3).
- Concluye con una "regla anti-recurrencia" para que el Arquitecto no vuelva a caer en el mismo patrón.
Si veredicto = "apto", instrucciones_revision puede ir vacío.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA — JSON ESTRICTO
═══════════════════════════════════════════════════════════════════
{
  "puntuacion_global": 7,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "resumen": "Una frase con el diagnóstico global.",
  "problemas": [
    {
      "area": "foreshadowing" | "antagonista" | "pacing",
      "tipo": "revelacion_huerfana" | "siembra_sin_cosechar" | "decision_conveniencia" | "antagonista_fuera_de_perfil" | "acto3_comprimido" | "consecuencia_inmediata" | "salto_temporal" | "caida_tension" | "otro",
      "severidad": "alta" | "media" | "baja",
      "capitulos": [17,18],
      "descripcion": "Qué pasa exactamente y por qué rompe la integridad.",
      "sugerencia": "Cambio concreto al outline (siembra en cap X, justificación en cap Y, desdoblar cap Z, etc.)."
    }
  ],
  "instrucciones_revision": "Bloque accionable o cadena vacía si apto."
}

Responde ÚNICAMENTE con el JSON.
`;

export class PlotIntegrityAuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Auditor de Integridad Narrativa",
      role: "plot-integrity-auditor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
      includeThoughts: false,
    });
    this.timeoutMs = 8 * 60 * 1000;
  }

  async analyze(input: PlotIntegrityInput): Promise<{ result: PlotIntegrityResult | null; raw: AgentResponse }> {
    const escaleta = this.condenseEscaleta(input.escaletaCapitulos);
    const antagonistas = this.condenseAntagonistas(input.worldBible);
    const metrics = this.formatMetrics(input.computedMetrics);

    const userPrompt = `
NOVELA A AUDITAR:
TÍTULO: ${input.title}
GÉNERO: ${input.genre} / TONO: ${input.tone}
LONGITUD: ${input.chapterCount} capítulos
PREMISA: ${input.premise}

═══════════════════════════════════════════════════════════════════
MÉTRICAS DETERMINISTAS (pre-computadas, úsalas como base objetiva)
═══════════════════════════════════════════════════════════════════
${metrics}

═══════════════════════════════════════════════════════════════════
ANTAGONISTAS (perfil descrito en la World Bible)
═══════════════════════════════════════════════════════════════════
${antagonistas}

═══════════════════════════════════════════════════════════════════
ESCALETA CAPÍTULO A CAPÍTULO
═══════════════════════════════════════════════════════════════════
${escaleta}

Audita las tres áreas (foreshadowing / antagonista / pacing) y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[PlotIntegrityAuditor] Error o vacío: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      const repaired = repairJson(response.content);
      const parsed = JSON.parse(repaired) as PlotIntegrityResult;
      if (typeof parsed.puntuacion_global !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        console.error(`[PlotIntegrityAuditor] JSON inválido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }
      parsed.puntuacion_global = Math.max(1, Math.min(10, parsed.puntuacion_global));
      parsed.problemas = parsed.problemas.filter(p => p && p.area && p.tipo && p.descripcion);
      parsed.instrucciones_revision = parsed.instrucciones_revision || "";
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[PlotIntegrityAuditor] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseEscaleta(caps: any[]): string {
    return (caps || []).map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "—";
      const objetivo = (c.objetivo_narrativo || c.summary || "").toString().slice(0, 320);
      const tipo = c.tipo_capitulo ? ` tipo:${c.tipo_capitulo}` : "";
      const cierre = c.tipo_cierre ? ` cierre:${c.tipo_cierre}` : "";
      const tens = (c.tension_objetivo ?? c.nivel_tension);
      const tensStr = (typeof tens === "number") ? ` tension:${tens}` : "";
      const dias = (c.dias_diegeticos != null) ? ` dias:${c.dias_diegeticos}` : "";
      const pivotes: string[] = Array.isArray(c.eventos_pivotales) ? c.eventos_pivotales.slice(0, 4) : [];
      const siembras: string[] = Array.isArray(c.siembra) ? c.siembra.slice(0, 4) : [];
      const cosechas: string[] = Array.isArray(c.cosecha) ? c.cosecha.slice(0, 4) : [];
      const justAnt = (c.justificacion_antagonica || "").toString().slice(0, 200);
      const lines: string[] = [`Cap ${num}: ${titulo} [${tipo}${cierre}${tensStr}${dias}]`];
      if (objetivo) lines.push(`  Obj: ${objetivo}`);
      if (pivotes.length) lines.push(`  Pivotes: ${pivotes.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" | ")}`);
      if (siembras.length) lines.push(`  Siembra: ${siembras.join(" | ")}`);
      if (cosechas.length) lines.push(`  Cosecha: ${cosechas.join(" | ")}`);
      if (justAnt) lines.push(`  Justif. antagonista: ${justAnt}`);
      return lines.join("\n");
    }).join("\n\n") || "(sin escaleta)";
  }

  private condenseAntagonistas(wb: any): string {
    const personajes: any[] = wb?.personajes || wb?.world_bible?.personajes || [];
    const antags = personajes.filter((p: any) => {
      const rol = String(p.rol || p.role || "").toLowerCase();
      return rol.includes("antag") || rol.includes("villan") || rol.includes("adversari") || rol.includes("enemigo");
    });
    if (antags.length === 0) {
      return "(sin antagonistas etiquetados — infiere a partir del elenco si la escaleta menciona uno)";
    }
    return antags.slice(0, 6).map((p: any) => {
      const nombre = p.nombre || p.name || "Sin nombre";
      const rol = p.rol || p.role || "antagonista";
      const perfil = (p.perfil_psicologico || p.descripcion || "").toString().slice(0, 350);
      const arco = (p.arco_transformacion || p.arc || "").toString().slice(0, 250);
      return `- ${nombre} (${rol})\n  Perfil: ${perfil || "—"}${arco ? `\n  Arco: ${arco}` : ""}`;
    }).join("\n\n");
  }

  private formatMetrics(m: PlotIntegrityComputedMetrics): string {
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const tCurve = m.tensionCurve.filter(t => t.tension != null).map(t => `${t.num}:${t.tension}`).join(", ") || "(sin datos)";
    return [
      `Total capítulos regulares: ${m.totalCaps}`,
      `Densidad de eventos pivotales por acto: acto1 ${pct(m.pivotalDensityPerAct.act1)} (${m.pivotalCountPerAct.act1}), acto2 ${pct(m.pivotalDensityPerAct.act2)} (${m.pivotalCountPerAct.act2}), acto3 ${pct(m.pivotalDensityPerAct.act3)} (${m.pivotalCountPerAct.act3}).`,
      `Días diegéticos por acto: acto1 ${m.diegeticDaysPerAct.act1.toFixed(1)}, acto2 ${m.diegeticDaysPerAct.act2.toFixed(1)}, acto3 ${m.diegeticDaysPerAct.act3.toFixed(1)}. Ratio acto3/(acto1+acto2 promedio): ${m.diegeticDaysCompressionRatio == null ? "n/d" : m.diegeticDaysCompressionRatio.toFixed(2)}.`,
      `Curva de tensión por capítulo: ${tCurve}. Caída máxima entre capítulos consecutivos: ${m.tensionDropMax}.`,
      `Ratio de cierres tipo cliffhanger: ${m.cliffhangerRatio == null ? "n/d" : pct(m.cliffhangerRatio)}.`,
      `Campos opcionales (siembra/cosecha/tension/dias/pivotes) presentes: ${m.hasSeedFields ? "SÍ" : "NO — debes inferir desde objetivo_narrativo y beats."}`,
    ].join("\n");
  }
}

/** Computa métricas deterministas a partir de la escaleta. Llamado por el orquestador antes de invocar al auditor LLM. */
export function computePlotIntegrityMetrics(escaleta: any[]): PlotIntegrityComputedMetrics {
  const regular = (escaleta || []).filter((c: any) => (c.numero ?? c.number ?? 0) >= 1);
  const total = regular.length;
  const a1End = Math.floor(total * 0.25);
  const a2End = Math.floor(total * 0.75);
  const slices = {
    act1: regular.slice(0, a1End),
    act2: regular.slice(a1End, a2End),
    act3: regular.slice(a2End),
  };
  const countPivotes = (caps: any[]) =>
    caps.reduce((sum, c) => sum + (Array.isArray(c.eventos_pivotales) ? c.eventos_pivotales.length : 0), 0);
  const totalPivotes = countPivotes(regular) || 1;
  const counts = { act1: countPivotes(slices.act1), act2: countPivotes(slices.act2), act3: countPivotes(slices.act3) };
  const densities = {
    act1: counts.act1 / totalPivotes,
    act2: counts.act2 / totalPivotes,
    act3: counts.act3 / totalPivotes,
  };
  const sumDays = (caps: any[]) =>
    caps.reduce((sum, c) => sum + (typeof c.dias_diegeticos === "number" ? c.dias_diegeticos : 0), 0);
  const days = { act1: sumDays(slices.act1), act2: sumDays(slices.act2), act3: sumDays(slices.act3) };
  const earlyAvg = (slices.act1.length + slices.act2.length > 0)
    ? (days.act1 + days.act2) / (slices.act1.length + slices.act2.length)
    : 0;
  const a3Avg = slices.act3.length > 0 ? days.act3 / slices.act3.length : 0;
  const compressionRatio = (earlyAvg > 0 && a3Avg > 0) ? (a3Avg / earlyAvg) : null;

  const tensionCurve = regular.map((c: any) => ({
    num: c.numero ?? c.number,
    tension: typeof c.tension_objetivo === "number" ? c.tension_objetivo
            : (typeof c.nivel_tension === "number" ? c.nivel_tension : null),
  }));
  let tensionDropMax = 0;
  for (let i = 1; i < tensionCurve.length; i++) {
    const prev = tensionCurve[i - 1].tension;
    const cur = tensionCurve[i].tension;
    if (typeof prev === "number" && typeof cur === "number") {
      const drop = prev - cur;
      if (drop > tensionDropMax) tensionDropMax = drop;
    }
  }

  const cierres = regular
    .map((c: any) => String(c.tipo_cierre || "").trim().toLowerCase())
    .filter((s: string) => s.length > 0);
  const cliffhangerRatio = cierres.length > 0
    ? cierres.filter((s: string) => s.includes("cliff")).length / cierres.length
    : null;

  const hasSeedFields = regular.some((c: any) =>
    Array.isArray(c.siembra) || Array.isArray(c.cosecha) ||
    Array.isArray(c.eventos_pivotales) || typeof c.tension_objetivo === "number" ||
    typeof c.dias_diegeticos === "number"
  );

  return {
    totalCaps: total,
    pivotalDensityPerAct: densities,
    pivotalCountPerAct: counts,
    tensionCurve,
    tensionDropMax,
    diegeticDaysPerAct: days,
    diegeticDaysCompressionRatio: compressionRatio,
    cliffhangerRatio,
    hasSeedFields,
  };
}

export const plotIntegrityAuditor = new PlotIntegrityAuditorAgent();
