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

export interface WorldBibleAuditInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  chapterCount: number;
  phase1Json: any;
  projectId?: number;
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
      maxOutputTokens: 6144,
      includeThoughts: false,
    });
    this.timeoutMs = 6 * 60 * 1000;
  }

  async audit(input: WorldBibleAuditInput): Promise<{ result: WorldBibleAuditResult | null; raw: AgentResponse }> {
    const condensed = this.condensePhase1(input.phase1Json);

    const userPrompt = `
NOVELA A AUDITAR (FASE 1 — antes de escaleta):
TÍTULO: ${input.title}
GÉNERO: ${input.genre} / TONO: ${input.tone}
LONGITUD PREVISTA: ${input.chapterCount} capítulos
PREMISA: ${input.premise}

═══════════════════════════════════════════════════════════════════
FASE 1 DEL ARQUITECTO (lo que tiene que sostener N capítulos)
═══════════════════════════════════════════════════════════════════
${condensed}

Audita las 5 áreas (antagonismo / escalada_actos / reservas_secretos / stakes_personaje / densidad_arcos) y devuelve el JSON.
`;

    const response = await this.generateContent(userPrompt, input.projectId);
    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[WorldBibleAuditor] Error o vacío: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      const repaired = repairJson(response.content);
      const parsed = JSON.parse(repaired) as WorldBibleAuditResult;
      if (typeof parsed.puntuacion_global !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        console.error(`[WorldBibleAuditor] JSON inválido: faltan campos requeridos.`);
        return { result: null, raw: response };
      }
      parsed.puntuacion_global = Math.max(1, Math.min(10, parsed.puntuacion_global));
      parsed.problemas = parsed.problemas.filter(p => p && p.area && p.descripcion && p.sugerencia);
      parsed.feedback_para_arquitecto = parsed.feedback_para_arquitecto || "";
      parsed.resumen = parsed.resumen || "";
      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[WorldBibleAuditor] Parse error: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
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
