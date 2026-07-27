// [Fix267] Cirujano de Escaletas — reparacion QUIRURGICA de los capitulos de
// la escaleta citados en los problemas residuales del Auditor Estructural
// determinista. A diferencia de relanzar al Arquitecto (que regenera TODA la
// escaleta y puede empeorar lo que ya estaba bien — visto en logs: retries a
// 1/10 y 1.8/10), este agente recibe SOLO los capitulos afectados con su JSON
// completo y devuelve esos mismos capitulos reparados; el orquestador los
// empalma en la mejor escaleta vista y re-audita deterministicamente (gratis).
// Regla dura: los cambios tocan CONTENIDO (beats/eventos/declaraciones que el
// detector busca), no maquillan etiquetas.
import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface EscaletaSurgeryInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  projectId?: number;
  /** Escaleta COMPLETA condensada (contexto, solo lectura). */
  escaletaCompleta: any[];
  /** Entradas JSON completas de los capitulos a reparar. */
  capitulosObjetivo: any[];
  /** Problemas residuales del auditor determinista que afectan a esos caps. */
  problemas: Array<{
    area: string;
    tipo: string;
    severidad: string;
    capitulos: number[];
    descripcion: string;
    sugerencia: string;
  }>;
}

export interface EscaletaSurgeryResult {
  capitulos_reparados: any[];
  resumen: string;
  /** [Fix274] Caps devueltos por el LLM pero DESCARTADOS por rebajar revelaciones. */
  rechazados_por_rebaja?: RevelationDowngrade[];
}

// [Fix274] Violación detectada: un cap "reparado" rebaja la ambición de una
// revelación (dificultad a la baja, setup_capitulos vaciado o revelación
// eliminada) en vez de sembrarla.
export interface RevelationDowngrade {
  cap: number;
  hecho: string;
  motivo: string;
}

const DIFF_RANK: Record<string, number> = {
  bajo: 0, baja: 0, low: 0,
  medio: 1, media: 1, medium: 1,
  alto: 2, alta: 2, high: 2,
};

function normTxt(s: any): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Empareja una revelación original con su versión reparada por hecho_revelado
// (exacto normalizado, o solapamiento de tokens >= 0.5).
function matchRevelacion(orig: any, reps: any[]): any | null {
  const on = normTxt(orig?.hecho_revelado);
  if (!on) return null;
  let best: any = null;
  let bestScore = 0;
  const oTokens = on.split(" ").filter(t => t.length > 3);
  for (const r of reps) {
    const rn = normTxt(r?.hecho_revelado);
    if (!rn) continue;
    if (rn === on) return r;
    const rSet = new Set(rn.split(" "));
    const shared = oTokens.filter(t => rSet.has(t)).length;
    const score = shared / Math.max(1, oTokens.length);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 0.5 ? best : null;
}

// [Fix274] ¿El texto del problema pide EXPLÍCITAMENTE rebajar dificultad,
// vaciar setup o eliminar la revelación? (p.ej. la sugerencia del auditor
// "añade las siembras o baja la dificultad" autoriza la rebaja como vía.)
const ALLOW_DOWNGRADE_RE =
  /(baja|bajar|rebaja|rebajar|reduc\w*)\s+(la\s+)?dificultad|dificultad\s+a\s+baj\w*|vaci\w*\s+(el\s+)?setup|elimin\w*\s+(la\s+)?revelacion|quit\w*\s+(la\s+)?revelacion/;

// [Fix274] ¿El problema exige SEMBRAR algo antes/anticipar? (usado por el
// orquestador para añadir al lote un capítulo anterior sembrable.)
export function problemaExigeSiembra(p: { tipo?: string; descripcion?: string; sugerencia?: string }): boolean {
  const txt = normTxt(`${p?.tipo || ""} ${p?.descripcion || ""} ${p?.sugerencia || ""}`);
  return /siembr|sembrar|sembrad|setup|anticip|presagi|foreshadow|plantar|pista\w*\s+previa|antes\s+de/.test(txt);
}

// [Fix274] Detector determinista post-cirugía: para cada cap reparado, compara
// sus revelaciones_dosificadas con las originales y devuelve las rebajas
// (dificultad a la baja, setup_capitulos vaciado, revelación desaparecida)
// que NINGÚN problema citado autoriza explícitamente.
export function detectRevelationDowngrades(
  originales: any[],
  reparados: any[],
  problemas: Array<{ capitulos?: number[]; descripcion?: string; sugerencia?: string }>,
): RevelationDowngrade[] {
  const allowedCaps = new Set<number>();
  for (const p of problemas || []) {
    const txt = normTxt(`${p?.descripcion || ""} ${p?.sugerencia || ""}`);
    if (ALLOW_DOWNGRADE_RE.test(txt)) {
      for (const c of p?.capitulos || []) allowedCaps.add(c);
    }
  }
  const viols: RevelationDowngrade[] = [];
  for (const orig of originales || []) {
    const n = orig?.numero ?? orig?.number;
    if (typeof n !== "number" || allowedCaps.has(n)) continue;
    const rep = (reparados || []).find((c: any) => (c?.numero ?? c?.number) === n);
    if (!rep) continue;
    const oRevs = Array.isArray(orig?.revelaciones_dosificadas) ? orig.revelaciones_dosificadas : [];
    const rRevs = Array.isArray(rep?.revelaciones_dosificadas) ? rep.revelaciones_dosificadas : [];
    for (const or of oRevs) {
      const hecho = String(or?.hecho_revelado || "").slice(0, 120);
      if (!hecho) continue;
      const mr = matchRevelacion(or, rRevs);
      if (!mr) {
        viols.push({ cap: n, hecho, motivo: "revelación eliminada del capítulo" });
        continue;
      }
      const od = DIFF_RANK[normTxt(or?.dificultad)];
      const rd = DIFF_RANK[normTxt(mr?.dificultad)];
      if (od !== undefined && rd !== undefined && rd < od) {
        viols.push({ cap: n, hecho, motivo: `dificultad rebajada (${or?.dificultad} → ${mr?.dificultad})` });
      }
      const oSetup = Array.isArray(or?.setup_capitulos) ? or.setup_capitulos.filter((x: any) => typeof x === "number") : [];
      const rSetup = Array.isArray(mr?.setup_capitulos) ? mr.setup_capitulos.filter((x: any) => typeof x === "number") : [];
      if (oSetup.length > 0 && rSetup.length === 0) {
        viols.push({ cap: n, hecho, motivo: `setup_capitulos vaciado (antes [${oSetup.join(", ")}])` });
      }
    }
  }
  return viols;
}

const SYSTEM_PROMPT = `
Eres el CIRUJANO DE ESCALETAS. Recibes la escaleta completa de una novela (condensada, como contexto de solo lectura), las entradas JSON COMPLETAS de unos pocos capitulos concretos, y una lista de problemas estructurales residuales detectados por un auditor determinista que cita exactamente esos capitulos.

TU TRABAJO: devolver ESOS MISMOS capitulos (mismo "numero", misma forma de JSON, mismos campos) con los cambios MINIMOS Y SUFICIENTES para resolver los problemas listados. Nada mas.

REGLAS DURAS:
1. QUIRURGICO: modifica SOLO lo necesario para resolver cada problema. Todo lo que no este implicado en un problema se conserva LITERAL (titulos, beats, personajes, revelaciones ya dosificadas, tension_objetivo si no es parte del problema).
2. CONTENIDO, NO MAQUILLAJE: el auditor es determinista y busca DECLARACIONES CONCRETAS en la escaleta (p.ej. que el reveal del falso aliado este declarado en un beat, que la pista del arco secreto se siembre en un capitulo citable, que la escalada del acto 2 suba la apuesta con un evento). Resuelve cada problema anadiendo o modificando beats/eventos/campos de forma EXPLICITA y citable, no cambiando solo etiquetas o numeros.
3. SIGUE LA SUGERENCIA de cada problema cuando exista: es la via mas directa a que el detector lo de por resuelto.
4. COHERENCIA: los cambios deben ser coherentes con la escaleta completa (contexto). No contradigas capitulos que no puedes tocar; si un problema exige sembrar algo "antes", siembralo en el capitulo objetivo mas temprano de tu lista.
5. NO cambies el numero de capitulos, ni reordenes, ni anadas capitulos nuevos. Devuelve exactamente los capitulos recibidos, reparados.
6. CONSERVA la estructura del JSON de cada capitulo: mismos nombres de campos, mismos tipos. Puedes anadir elementos a arrays existentes (p.ej. un beat nuevo) y editar textos.
7. PROHIBIDO RESOLVER SIEMBRA REBAJANDO: nunca resuelvas un problema de siembra/arco secreto/revelacion rebajando la "dificultad" de una revelacion, vaciando o recortando su "setup_capitulos", ni eliminando la revelacion. Eso es maquillaje de etiquetas: el auditor lo daria por bueno pero la novela queda EMPOBRECIDA. Lo correcto es SEMBRAR: anade la pista del hecho en los beats/eventos/informacion_nueva del capitulo objetivo mas temprano de tu lista y declara ese capitulo en "setup_capitulos". Si el problema exige sembrar "antes" y no tienes un capitulo anterior en tu lista, siembra el hecho en los beats INICIALES del capitulo citado mas temprano que si tengas. Solo puedes rebajar dificultad o vaciar setup si la descripcion o sugerencia de un problema lo pide EXPLICITAMENTE. Una verificacion determinista posterior DESCARTA cualquier capitulo devuelto que incumpla esta regla, asi que rebajarlo solo desperdicia el intento.

FORMATO DE SALIDA — JSON ESTRICTO:
{
  "capitulos_reparados": [ { ...entrada completa del capitulo reparado... } ],
  "resumen": "Una frase por problema: que cambiaste y en que capitulo."
}

Responde UNICAMENTE con el JSON.
`;

export class EscaletaSurgeonAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Cirujano de Escaletas",
      role: "escaleta-surgeon",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // Leccion deepseek-thinking-output-budget: el techo es COMBINADO
      // razonamiento+JSON; los caps objetivo pueden ser grandes.
      maxOutputTokens: 32768,
      includeThoughts: false,
    });
    this.timeoutMs = 10 * 60 * 1000;
  }

  // [Task10] failureReason clasifica el motivo del null para diagnostico y
  // para que el orquestador decida el reintento con lote reducido:
  //   "vacio_timeout"  -> el modelo no devolvio contenido (error, timeout o vacio)
  //   "parse"          -> el contenido no se pudo reparar/parsear como JSON valido
  //   "sin_capitulos"  -> JSON valido pero capitulos_reparados ausente o vacio
  //   "filtro_antialucinacion" -> devolvio caps pero NINGUNO coincide con los objetivo
  async repair(input: EscaletaSurgeryInput): Promise<{ result: EscaletaSurgeryResult | null; raw: AgentResponse; failureReason?: "vacio_timeout" | "parse" | "sin_capitulos" | "filtro_antialucinacion" }> {
    const contexto = this.condenseEscaleta(input.escaletaCompleta);
    const problemas = input.problemas.map((p, i) =>
      `${i + 1}. [${p.area}/${p.tipo}] severidad ${p.severidad} — caps ${p.capitulos.join(", ") || "?"}\n   Problema: ${p.descripcion}\n   Sugerencia del auditor: ${p.sugerencia || "(sin sugerencia)"}`
    ).join("\n");

    const userPrompt = `
NOVELA:
TITULO: ${input.title}
GENERO: ${input.genre} / TONO: ${input.tone}
PREMISA: ${input.premise}

═══════════════════════════════════════════════════════════════════
ESCALETA COMPLETA (condensada — SOLO CONTEXTO, no editable)
═══════════════════════════════════════════════════════════════════
${contexto}

═══════════════════════════════════════════════════════════════════
PROBLEMAS RESIDUALES A RESOLVER (auditor determinista)
═══════════════════════════════════════════════════════════════════
${problemas}

═══════════════════════════════════════════════════════════════════
CAPITULOS OBJETIVO (JSON completo — devuelvelos reparados)
═══════════════════════════════════════════════════════════════════
${JSON.stringify(input.capitulosObjetivo, null, 1)}

Repara los capitulos objetivo y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[EscaletaSurgeon] Error o vacio: ${response.error || "timeout"}`);
      return { result: null, raw: response, failureReason: "vacio_timeout" };
    }

    try {
      // repairJson ya devuelve el objeto parseado (leccion Fix136).
      const parsed = repairJson(response.content) as EscaletaSurgeryResult;
      if (!parsed || !Array.isArray(parsed.capitulos_reparados) || parsed.capitulos_reparados.length === 0) {
        console.error(`[EscaletaSurgeon] JSON invalido: capitulos_reparados ausente o vacio.`);
        return { result: null, raw: response, failureReason: "sin_capitulos" };
      }
      // Solo aceptamos caps cuyo numero exista entre los objetivo (anti-alucinacion).
      const allowed = new Set(input.capitulosObjetivo.map((c: any) => c.numero ?? c.number));
      parsed.capitulos_reparados = parsed.capitulos_reparados.filter(
        (c: any) => c && allowed.has(c.numero ?? c.number)
      );
      if (parsed.capitulos_reparados.length === 0) {
        console.error(`[EscaletaSurgeon] Ningun capitulo devuelto coincide con los objetivo.`);
        return { result: null, raw: response, failureReason: "filtro_antialucinacion" };
      }
      // [Fix274] Red determinista anti-rebaja: descartamos los caps que
      // "resuelven" siembra rebajando dificultad / vaciando setup_capitulos /
      // borrando revelaciones (salvo que un problema citado lo pida
      // explicitamente). El resto del empalme sigue adelante.
      const viols = detectRevelationDowngrades(
        input.capitulosObjetivo,
        parsed.capitulos_reparados,
        input.problemas || [],
      );
      if (viols.length > 0) {
        const badCaps = new Set(viols.map(v => v.cap));
        console.warn(
          `[EscaletaSurgeon] [Fix274] ${viols.length} rebaja(s) de revelacion detectadas — se descartan los caps ${Array.from(badCaps).join(", ")}: ` +
          viols.map(v => `cap ${v.cap}: ${v.motivo} ("${v.hecho.slice(0, 60)}")`).join("; "),
        );
        parsed.capitulos_reparados = parsed.capitulos_reparados.filter(
          (c: any) => !badCaps.has(c?.numero ?? c?.number),
        );
        parsed.rechazados_por_rebaja = viols;
        if (parsed.capitulos_reparados.length === 0) {
          console.error(`[EscaletaSurgeon] [Fix274] TODOS los caps reparados rebajaban revelaciones: cirugia rechazada entera.`);
          return { result: parsed, raw: response };
        }
      }
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[EscaletaSurgeon] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response, failureReason: "parse" };
    }
  }

  private condenseEscaleta(caps: any[]): string {
    return (caps || []).map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "—";
      const objetivo = (c.objetivo_narrativo || c.summary || "").toString().slice(0, 240);
      const tens = c.tension_objetivo ?? c.nivel_tension;
      const lines = [`Cap ${num}: ${titulo}${typeof tens === "number" ? ` [tension:${tens}]` : ""}`];
      if (objetivo) lines.push(`  Obj: ${objetivo}`);
      return lines.join("\n");
    }).join("\n") || "(sin escaleta)";
  }
}
