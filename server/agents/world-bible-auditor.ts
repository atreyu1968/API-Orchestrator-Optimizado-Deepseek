// [Fix110] Auditor de World Bible — se ejecuta entre Fase 1 y Fase 2 del
// Arquitecto para fortificar la base narrativa ANTES de comprometer la
// escaleta. Causa raíz que ataca: en runs reales (ej "El eco del asfalto"),
// el Auditor Estructural posterior topaba en 6.5/10 con problemas residuales
// concentrados en "escalada_acto2" (3 problemas medios) y "arco_secreto"
// porque la Fase 1 no contenía suficiente munición dramática (antagonista
// con métodos limitados, pocos secretos dosificables, stakes planos).
// Reescribir la escaleta sobre un World Bible débil tenía techo natural;
// había que fortificar la base.
//
// Audita 5 áreas:
//   - antagonismo: fuerza opositora real, alcance, métodos, recursos.
//   - escalada_actos: ¿hay material para que el acto 2 escale (palancas,
//     secretos progresivamente revelables, alianzas que rompen)?
//   - reservas_secretos: cantidad/calidad de revelaciones dosificables
//     (evita info-dump y "agente revela todo en cap 21").
//   - stakes_personaje: apuestas claras y escalables del protagonista.
//   - densidad_arcos: número/cobertura de subtramas para sostener N caps.
//
// Patrón idéntico a PlotIntegrityAuditor: LLM con DeepSeek V4-Flash,
// schema estricto, feedback accionable que el Arquitecto reinyecta a la
// Fase 1 en el siguiente retry.

import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export type WorldBibleAuditArea =
  | "antagonismo"
  | "escalada_actos"
  | "reservas_secretos"
  | "stakes_personaje"
  | "densidad_arcos";

export interface WorldBibleAuditProblem {
  area: WorldBibleAuditArea;
  severidad: "alta" | "media" | "baja";
  descripcion: string;
  sugerencia: string;
}

export interface WorldBibleAuditResult {
  puntuacion_global: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  resumen: string;
  problemas: WorldBibleAuditProblem[];
  feedback_para_arquitecto: string;
}

// [Fix119] Contexto opcional cuando el audit se dispara on-demand desde el
// bucle SA (Fix115/Fix116) en vez de pre-flight. Le decimos al WBA EXACTAMENTE
// qué dimensión estructural está fallando y le pasamos los problemas
// residuales del Auditor Estructural para que pueda diagnosticar si la WB
// tiene munición para resolverlos o si el problema es de implementación
// (escaleta). Sin esto, el WBA puede devolver "apto" sin feedback porque la
// base le parece coherente pese a que el SA no logra pasar de 5/10.
export interface WorldBibleOnDemandFocus {
  // Área SA que está fallando (arco_secreto, falso_aliado, escalada_acto2,
  // ledger_info, dosificacion_revelacion, forma_escena, deus_ex_machina,
  // trauma_protagonista). NO coincide 1:1 con las 5 áreas del WBA — el WBA
  // debe MAPEAR a sus propias áreas (ver focusBlock).
  area: string;
  areaLabel: string;
  // Razón por la que se disparó el audit (count concentrado o cobertura 0%).
  triggerKind: "concentrated" | "chronic_zero";
  // Problemas residuales que el SA reporta para esa área en la mejor
  // escaleta lograda hasta ahora. El WBA lee estos problemas y decide si
  // la WB tiene los elementos necesarios para resolverlos.
  problemasResiduales: Array<{
    descripcion: string;
    sugerencia?: string;
    severidad?: string;
    capitulos?: number[];
  }>;
  // Score actual de la mejor escaleta SA (informativo, para que el WBA sepa
  // a qué distancia está del umbral de 7).
  bestSAScore?: number;
}

export interface WorldBibleAuditInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  phase1Json: any;
  projectId?: number;
  onDemandFocus?: WorldBibleOnDemandFocus;
}

const SYSTEM_PROMPT = `
Eres el AUDITOR DE WORLD BIBLE. Lees la FASE 1 del Arquitecto (personajes, lugares, arcos, premisa, estructura de tres actos) ANTES de que se haya escrito la escaleta capítulo a capítulo. Tu misión es detectar si la base narrativa tiene suficiente munición dramática para sostener una novela de N capítulos con un acto 2 que escale y un clímax inevitable.

═══════════════════════════════════════════════════════════════════
LAS 5 ÁREAS QUE AUDITAS (y solo estas)
═══════════════════════════════════════════════════════════════════

1. ANTAGONISMO (area: "antagonismo")
   - ¿Hay al menos un antagonista (humano, sistema, fuerza natural o conflicto interno) descrito con perfil, métodos y recursos concretos?
   - ¿Tiene capacidad real de oponerse al protagonista durante TODO el arco, o se desinfla a mitad?
   - ¿Sus métodos están diferenciados (no un solo movimiento repetido)?
   - Si el antagonista es difuso, monolítico o demasiado débil para sostener N capítulos → severidad alta y sugiere qué endurecer (red de aliados, recursos, palanca específica sobre el protagonista).

2. ESCALADA DE ACTOS (area: "escalada_actos")
   - ¿Hay material en la Fase 1 (palancas, secretos progresivamente revelables, alianzas frágiles, dependencias del protagonista) para que el acto 2 ESCALE en vez de mesetar?
   - El acto 2 es donde más fallan las novelas. Necesitas detectar AHORA si la base permite escalada genuina:
     * ¿Hay al menos 3 "palancas dramáticas" (cosas que el antagonista puede activar/quitar progresivamente: amenazar a X, exponer secreto Y, cortar recurso Z)?
     * ¿Hay reversales planificados (aliado→traidor, ventaja→trampa, refugio→peligro)?
   - Si el acto 2 solo tiene "el protagonista investiga más profundo" sin palancas que el antagonista pueda activar → severidad alta y sugiere palancas concretas a añadir a la Fase 1.

3. RESERVAS DE SECRETOS (area: "reservas_secretos")
   - Cuenta los secretos/revelaciones disponibles en la World Bible (no en la escaleta — esa todavía no existe).
   - Para una novela de N capítulos, regla práctica: necesitas N/4 a N/3 revelaciones dosificables (no menos, o el lector se aburrirá; no muchas más, o se vuelve confuso).
   - Cada secreto debe ser distinguible de los otros (identidad, motivación, evento del pasado, regla del mundo, vínculo emocional oculto).
   - Si hay <3 secretos identificables o todos son del mismo tipo → severidad alta. Sugiere qué secretos añadir y su rol (revelación parcial acto 1, mid-act 2, cerca de clímax).

4. STAKES DEL PROTAGONISTA (area: "stakes_personaje")
   - ¿Qué pierde el protagonista si fracasa, EN CONCRETO? "Salvar a su familia" sin nombrar a quién es vago.
   - ¿Las apuestas pueden escalar (lo personal → lo cercano → lo irreversible)?
   - ¿Hay un vínculo emocional documentado que dé peso al fracaso (no solo "es buen tipo")?
   - Si las apuestas son abstractas, intercambiables o no escalables → severidad media-alta y sugiere qué vínculos concretos añadir.

5. DENSIDAD DE ARCOS (area: "densidad_arcos")
   - Cuenta las subtramas en matriz_arcos.
   - Para N capítulos: regla práctica MÍNIMO 2 arcos si N<20, 3 arcos si N≤30, 4+ arcos si N>30.
   - Cada arco debe tener actores y eje propios; arcos que se reducen a "el protagonista resuelve X" sin actores secundarios no cuentan como arco completo.
   - Si la densidad es insuficiente para sostener la cantidad de capítulos → severidad alta. Sugiere qué arco adicional añadir y a qué personaje vincularlo.

═══════════════════════════════════════════════════════════════════
QUÉ NO HACER
═══════════════════════════════════════════════════════════════════
- NO juzgues la escaleta capítulo a capítulo: AÚN NO EXISTE. Auditas SOLO la Fase 1.
- NO juzgues clichés, voz narrativa, prosa ni nombres (otros agentes lo hacen).
- NO inventes problemas: cita siempre el nombre del personaje, arco o elemento de la Fase 1.
- NO seas perfeccionista: una Fase 1 sólida con 1 problema medio puede ser apta (7-8/10).

═══════════════════════════════════════════════════════════════════
PUNTUACIÓN
═══════════════════════════════════════════════════════════════════
- 9-10: base impecable, ningún problema mayor. veredicto = "apto".
- 7-8: 1-2 problemas medios, sin altos. veredicto = "apto" si todos son medios y la base es coherente.
- 5-6: 1 problema alta o múltiples medios sin solución obvia. veredicto = "necesita_revision".
- ≤4: 2+ altas o una base estructuralmente débil. veredicto = "reescribir".

═══════════════════════════════════════════════════════════════════
FEEDBACK PARA ARQUITECTO
═══════════════════════════════════════════════════════════════════
Si veredicto != "apto", redacta un bloque accionable (≤600 palabras) que el Arquitecto pueda aplicar literalmente al regenerar la Fase 1:
- Lista numerada por área.
- Cada item dice EXACTAMENTE qué añadir/cambiar en la Fase 1 (ej: "Añade al antagonista X la palanca económica: el protagonista debe dinero al cartel de X, que puede ejecutar deuda en cualquier momento del acto 2"; "Añade el secreto: Y es hijo no reconocido de Z — reservar reveal para cap N% del libro").
- Concluye con la regla anti-recurrencia.
Si veredicto = "apto", feedback_para_arquitecto puede ir vacío.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA — JSON ESTRICTO
═══════════════════════════════════════════════════════════════════
{
  "puntuacion_global": 7,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "resumen": "Una frase con el diagnóstico global.",
  "problemas": [
    {
      "area": "antagonismo" | "escalada_actos" | "reservas_secretos" | "stakes_personaje" | "densidad_arcos",
      "severidad": "alta" | "media" | "baja",
      "descripcion": "Qué falla concretamente en la Fase 1.",
      "sugerencia": "Qué añadir/cambiar literalmente en la Fase 1."
    }
  ],
  "feedback_para_arquitecto": "Bloque accionable o cadena vacía si apto."
}

Responde ÚNICAMENTE con el JSON.
`;

export class WorldBibleAuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Auditor de World Bible",
      role: "world-bible-auditor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      // [Fix110-rev2] Subido de 6144 a 10240. En el run "Serie Íñigo Zubiri
      // Vol. 2" el auditor devolvió null silenciosamente, causa más probable:
      // la respuesta JSON (con feedback_para_arquitecto hasta 600 palabras)
      // se truncaba antes del cierre.
      maxOutputTokens: 10240,
      includeThoughts: false,
    });
    this.timeoutMs = 6 * 60 * 1000;
  }

  async audit(input: WorldBibleAuditInput): Promise<{ result: WorldBibleAuditResult | null; raw: AgentResponse; failureReason?: string }> {
    const condensed = this.condensePhase1(input.phase1Json);
    const focusBlock = this.buildOnDemandFocusBlock(input.onDemandFocus);

    const userPrompt = `
NOVELA A AUDITAR (FASE 1 — antes de escaleta):
TÍTULO: ${input.title}
GÉNERO: ${input.genre} / TONO: ${input.tone}
LONGITUD PREVISTA: ${input.chapterCount} capítulos
PREMISA: ${input.premise}
${focusBlock}
═══════════════════════════════════════════════════════════════════
FASE 1 DEL ARQUITECTO (lo que tiene que sostener N capítulos)
═══════════════════════════════════════════════════════════════════
${condensed}

Audita las 5 áreas (antagonismo / escalada_actos / reservas_secretos / stakes_personaje / densidad_arcos) y devuelve el JSON.${input.onDemandFocus ? `

RECORDATORIO: el bucle SA está atascado en "${input.onDemandFocus.areaLabel}". Tu diagnóstico tiene DOS resultados posibles igual de válidos: (1) la WB carece de munición → emite veredicto "necesita_revision"/"reescribir" y feedback CONCRETO de qué añadir a la Fase 1; (2) la WB tiene base suficiente → emite veredicto "apto" y feedback_para_arquitecto = "WB SUFICIENTE — el problema reside en la implementación de la escaleta, no en la base. La escaleta debe utilizar los siguientes elementos ya disponibles: [lista 2-4 elementos concretos de la Fase 1 que el Arquitecto podría usar para resolver el bottleneck]". NO inventes carencias para parecer útil — si la base aguanta, dilo claro.` : ""}
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      const reason = response.timedOut
        ? `timeout tras ${Math.round(this.timeoutMs / 1000)}s`
        : response.error
          ? `error LLM: ${response.error}`
          : "respuesta vacía del LLM";
      console.error(`[WorldBibleAuditor] ${reason}`);
      return { result: null, raw: response, failureReason: reason };
    }

    try {
      // [Fix136] repairJson ya devuelve el objeto parseado; un segundo
      // JSON.parse coaccionaba el objeto a "[object Object]" y reventaba
      // siempre, dejando el auditor inservible (caía al fallback "reusar
      // Fase 1 sin auditar"). Usar el resultado de repairJson directamente.
      const parsed = repairJson(response.content) as WorldBibleAuditResult;
      if (typeof parsed.puntuacion_global !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        const reason = `JSON parseado pero faltan campos requeridos (puntuacion_global=${typeof parsed.puntuacion_global}, veredicto=${parsed.veredicto}, problemas=${Array.isArray(parsed.problemas) ? "array" : typeof parsed.problemas})`;
        console.error(`[WorldBibleAuditor] ${reason}`);
        return { result: null, raw: response, failureReason: reason };
      }
      parsed.puntuacion_global = Math.max(1, Math.min(10, parsed.puntuacion_global));
      parsed.problemas = parsed.problemas.filter(p => p && p.area && p.descripcion && p.sugerencia);
      parsed.feedback_para_arquitecto = parsed.feedback_para_arquitecto || "";
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      const len = response.content?.length || 0;
      const tail = response.content ? response.content.slice(-80).replace(/\s+/g, " ") : "";
      const reason = `parse error tras repair: ${(error as Error).message} (respuesta ${len} chars, cola: "${tail}") — probable truncamiento o JSON malformado`;
      console.error(`[WorldBibleAuditor] ${reason}`);
      return { result: null, raw: response, failureReason: reason };
    }
  }

  // [Fix119] Construye el bloque de contexto on-demand cuando el audit se
  // dispara desde el bucle SA. Mapea el área SA a las áreas WBA relevantes
  // y enumera los problemas residuales que el SA reportó, para que el WBA
  // pueda diagnosticar si la WB tiene munición para resolverlos.
  private buildOnDemandFocusBlock(focus?: WorldBibleOnDemandFocus): string {
    if (!focus) return "";

    // Mapeo SA → WBA. Algunas áreas SA tienen 1-2 áreas WBA naturales.
    const SA_TO_WBA_AREAS: Record<string, string[]> = {
      arco_secreto: ["reservas_secretos", "stakes_personaje"],
      falso_aliado: ["antagonismo", "densidad_arcos"],
      escalada_acto2: ["escalada_actos", "antagonismo"],
      ledger_info: ["reservas_secretos"],
      dosificacion_revelacion: ["reservas_secretos"],
      forma_escena: ["escalada_actos"],
      deus_ex_machina: ["escalada_actos", "antagonismo"],
      trauma_protagonista: ["stakes_personaje"],
    };
    const wbaAreas = SA_TO_WBA_AREAS[focus.area] || [];
    const wbaAreasStr = wbaAreas.length > 0
      ? wbaAreas.join(", ")
      : "(sin mapeo directo — usa tu criterio)";

    const triggerStr = focus.triggerKind === "chronic_zero"
      ? `COBERTURA CRÓNICA 0% — el Auditor Estructural lleva ≥3 iteraciones consecutivas reportando que esta dimensión tiene 0% de cobertura en la escaleta. Suele indicar que la WB CARECE del elemento estructural requerido (p.ej. no hay personaje con ese rol, no hay secreto distribuible, no hay palanca dramática). Solo redibujar la escaleta NO lo resuelve.`
      : `BOTTLENECK CONCENTRADO — el Auditor Estructural lleva 2 iteraciones consecutivas reportando ≥3 problemas en esta misma dimensión. Suele indicar que la WB no tiene suficiente munición para alimentar la dimensión: el Arquitecto rediseña la escaleta una y otra vez sobre la misma base y sigue cayendo en los mismos huecos.`;

    const problemasStr = focus.problemasResiduales.length > 0
      ? focus.problemasResiduales.slice(0, 10).map((p, i) => {
          const sev = p.severidad ? ` [${p.severidad}]` : "";
          const caps = p.capitulos && p.capitulos.length > 0 ? ` (caps ${p.capitulos.slice(0, 5).join(",")})` : "";
          const sug = p.sugerencia ? `\n     Sugerencia del SA: ${p.sugerencia.slice(0, 220)}` : "";
          return `  ${i + 1}.${sev}${caps} ${(p.descripcion || "").slice(0, 280)}${sug}`;
        }).join("\n")
      : "  (sin detalle de problemas — diagnostica usando solo el nombre del área)";

    const scoreStr = typeof focus.bestSAScore === "number"
      ? `${focus.bestSAScore}/10`
      : "(no disponible)";

    return `
═══════════════════════════════════════════════════════════════════
[Fix119] CONTEXTO DEL BOTTLENECK SA — AUDIT ON-DEMAND
═══════════════════════════════════════════════════════════════════
Este audit NO es pre-flight: el Auditor Estructural ya está corriendo sobre la escaleta y se ha atascado. Mejor score logrado: ${scoreStr} (umbral publicable: 7/10).

DIMENSIÓN SA ATASCADA: "${focus.areaLabel}" (key SA: ${focus.area})
ÁREAS WBA QUE SUELEN ESTAR DETRÁS DE ESTE FALLO: ${wbaAreasStr}
RAZÓN DEL DISPARO: ${triggerStr}

PROBLEMAS RESIDUALES QUE EL SA SIGUE REPORTANDO EN ESA DIMENSIÓN:
${problemasStr}

TU TAREA EN ESTE AUDIT: revisa la Fase 1 con FOCO en las áreas WBA mencionadas (sin ignorar las otras 3, pero priorizando éstas). Decide si la base tiene los elementos necesarios para resolver los problemas residuales listados. Si los tiene y el SA no los aprovecha, el problema es de implementación de escaleta (dilo claro en feedback_para_arquitecto). Si NO los tiene, lista exactamente qué añadir a la Fase 1 (personajes, palancas, secretos, vínculos, métodos del antagonista).
═══════════════════════════════════════════════════════════════════
`;
  }

  private condensePhase1(phase1: any): string {
    const wb = phase1?.world_bible || {};
    const personajes: any[] = wb.personajes || [];
    const matriz = phase1?.matriz_arcos || {};
    const arcoPrincipal = matriz.arco_principal || null;
    const subtramas: any[] = matriz.subtramas || [];
    const tresActos = phase1?.estructura_tres_actos || {};
    const momentum = phase1?.momentum_plan || {};
    const giros: any[] = momentum.catalogo_giros || [];

    const arcoStr = (arco: any): string => {
      if (!arco) return "";
      if (typeof arco === "string") return arco.slice(0, 220);
      const ei = (arco.estado_inicial || "").toString().slice(0, 120);
      const cat = (arco.catalizador_cambio || arco.catalizador || "").toString().slice(0, 120);
      const pc = (arco.punto_crisis || "").toString().slice(0, 120);
      const ef = (arco.estado_final || "").toString().slice(0, 120);
      const parts = [];
      if (ei) parts.push(`inicio: ${ei}`);
      if (cat) parts.push(`catalizador: ${cat}`);
      if (pc) parts.push(`crisis: ${pc}`);
      if (ef) parts.push(`final: ${ef}`);
      return parts.join(" → ");
    };

    const personajesStr = personajes.length > 0
      ? personajes.slice(0, 12).map((p: any) => {
          const nombre = p.nombre || "Sin nombre";
          const rol = p.rol || "—";
          const perfil = (p.perfil_psicologico || "").toString().slice(0, 320);
          const arco = arcoStr(p.arco_transformacion);
          const contra = (p.contra_cliche || "").toString().slice(0, 180);
          const rels = Array.isArray(p.relaciones)
            ? p.relaciones.slice(0, 4).map((r: any) =>
                typeof r === "string"
                  ? r
                  : `${r?.con || "?"} (${r?.tipo || "?"}${r?.evolucion ? ": " + String(r.evolucion).slice(0, 60) : ""})`
              ).join(" | ")
            : "";
          const lines = [`- ${nombre} (${rol})`];
          if (perfil) lines.push(`  Perfil: ${perfil}`);
          if (contra) lines.push(`  Contra-cliché: ${contra}`);
          if (arco) lines.push(`  Arco: ${arco}`);
          if (rels) lines.push(`  Relaciones: ${rels}`);
          return lines.join("\n");
        }).join("\n")
      : "(sin personajes — esto ya es un problema)";

    const arcoPrincipalStr = arcoPrincipal
      ? `${(arcoPrincipal.descripcion || "").toString().slice(0, 320)}${
          Array.isArray(arcoPrincipal.puntos_giro) && arcoPrincipal.puntos_giro.length > 0
            ? "\n  Puntos giro: " + arcoPrincipal.puntos_giro.slice(0, 6).map((pg: any) =>
                `cap ${pg.capitulo ?? "?"}: ${(pg.evento || "").toString().slice(0, 80)}`
              ).join(" | ")
            : ""
        }`
      : "(sin arco_principal — esto ya es un problema)";

    const subtramasStr = subtramas.length > 0
      ? subtramas.slice(0, 8).map((a: any, i: number) => {
          const nombre = a.nombre || `Subtrama ${i + 1}`;
          const tipo = a.tipo || "—";
          const actores = Array.isArray(a.personajes_involucrados) ? a.personajes_involucrados.slice(0, 6).join(", ") : "";
          const inter = (a.interseccion_trama_principal || "").toString().slice(0, 200);
          const resolucion = (a.resolucion || "").toString().slice(0, 180);
          const caps = Array.isArray(a.capitulos_desarrollo) ? a.capitulos_desarrollo.slice(0, 8).join(",") : "";
          const lines = [`- ${nombre} [${tipo}]`];
          if (actores) lines.push(`  Personajes: ${actores}`);
          if (caps) lines.push(`  Caps de desarrollo: ${caps}`);
          if (inter) lines.push(`  Intersección trama principal: ${inter}`);
          if (resolucion) lines.push(`  Resolución prevista: ${resolucion}`);
          return lines.join("\n");
        }).join("\n")
      : "(sin subtramas — esto ya es un problema)";

    const actoStr = (acto: any, nombre: string, campos: Array<[string, string]>): string => {
      if (!acto) return `${nombre}: (vacío)`;
      const funcion = (acto.funcion || "").toString().slice(0, 220);
      const caps = Array.isArray(acto.capitulos) ? acto.capitulos.slice(0, 14).join(",") : "";
      const lines = [`${nombre}${caps ? ` (caps ${caps})` : ""}:`];
      if (funcion) lines.push(`  Función: ${funcion}`);
      for (const [key, label] of campos) {
        const v = (acto[key] || "").toString().slice(0, 180);
        if (v) lines.push(`  ${label}: ${v}`);
      }
      return lines.join("\n");
    };

    const girosStr = giros.length > 0
      ? `CATÁLOGO DE GIROS PLANIFICADOS (${giros.length}) — material para "reservas_secretos":\n` +
        giros.slice(0, 12).map((g: any) =>
          `- cap ${g.capitulo ?? "?"} [${g.tipo || "?"}]: ${(g.descripcion || "").toString().slice(0, 140)}${g.setup_previo ? ` | setup: ${String(g.setup_previo).slice(0, 80)}` : ""}`
        ).join("\n")
      : "CATÁLOGO DE GIROS: (vacío — esto importa para reservas_secretos)";

    return [
      `PREMISA: ${phase1?.premisa || "(no especificada)"}`,
      ``,
      `PERSONAJES (${personajes.length}):`,
      personajesStr,
      ``,
      `ARCO PRINCIPAL:`,
      `  ${arcoPrincipalStr}`,
      ``,
      `SUBTRAMAS (${subtramas.length}):`,
      subtramasStr,
      ``,
      `ESTRUCTURA TRES ACTOS:`,
      actoStr(tresActos.acto1, "Acto 1", [["planteamiento", "Planteamiento"], ["incidente_incitador", "Incidente incitador"], ["primer_punto_giro", "Primer punto de giro"]]),
      actoStr(tresActos.acto2, "Acto 2", [["accion_ascendente", "Acción ascendente"], ["punto_medio", "Punto medio"], ["crisis", "Crisis"], ["segundo_punto_giro", "Segundo punto de giro"]]),
      actoStr(tresActos.acto3, "Acto 3", [["climax", "Clímax"], ["resolucion", "Resolución"], ["eco_tematico", "Eco temático"]]),
      ``,
      girosStr,
    ].join("\n");
  }
}
