import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface AgencyCriticInput {
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
}

export type AgencyProblemType =
  | "rescate_externo"
  | "protagonista_pasiva"
  | "climax_no_sembrado"
  | "punto_medio_sin_viraje"
  | "cambio_no_gana_el_climax"
  | "arco_no_pagado"
  | "acto2_plano";

export interface AgencyProblem {
  tipo: AgencyProblemType;
  severidad: "critica" | "alta" | "media";
  capitulos_afectados: number[];
  descripcion: string;
  directiva_concreta: string;
}

export interface AgencyHito {
  capitulo: number | null;
  presente: boolean;
  nota: string;
}

export interface AgencyCriticResult {
  puntuacion_agencia: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  protagonista_es_agente_del_climax: boolean;
  quien_resuelve_el_climax: string;
  resumen: string;
  hitos: {
    incidente_incitador: AgencyHito;
    primer_giro: AgencyHito;
    punto_medio: AgencyHito & { vira_de_pasiva_a_activa?: boolean };
    momento_oscuro: AgencyHito;
    climax: AgencyHito & { protagonista_triunfa_por_cambio?: boolean };
  };
  fortalezas: string[];
  problemas: AgencyProblem[];
  directivas_arquitecto: string;
}

const SYSTEM_PROMPT = `
Eres el EDITOR DE DESARROLLO, el guardian de la AGENCIA del protagonista y del FINAL GANADO. Lees la escaleta de una novela ANTES de que se escriba y juzgas una sola cosa por encima de todo: si la historia se la GANA el protagonista con sus propias decisiones o si se la resuelve algo externo.

No mides clichés (eso es otro agente), ni continuidad fáctica, ni pacing fino. Mides AGENCIA y ESTRUCTURA DRAMÁTICA. Tu salida es JSON para que un sistema automático la devuelva al Arquitecto.

═══════════════════════════════════════════════════════════════════
LA REGLA DE ORO (lo más importante de tu trabajo)
═══════════════════════════════════════════════════════════════════
El conflicto CENTRAL de la novela debe resolverse en el clímax por una ACCIÓN PROPIA del protagonista, sembrada en capítulos anteriores. El protagonista triunfa (o fracasa significativamente, si es tragedia) PORQUE HA CAMBIADO a lo largo del libro.

Es FALLO GRAVE (deus ex machina / rescate externo) cuando el clímax lo resuelve:
- Una autoridad o poder externo que aparece tarde o no estaba sembrado como agente de la resolución (un rey, un juez, un ejército, la policía, un dios, un noble que interviene de repente).
- Una casualidad, un milagro, una coincidencia o una información que cae del cielo.
- Un personaje secundario que se sacrifica o resuelve por el protagonista mientras este observa pasivo.
- El antagonista que se autodestruye o comete un error tonto no sembrado.

Si detectas cualquiera de estos, marca un problema tipo "rescate_externo" con severidad "critica" y pon protagonista_es_agente_del_climax = false. NO puedes dar veredicto "apto" en ese caso.

═══════════════════════════════════════════════════════════════════
LOS 5 HITOS QUE DEBES LOCALIZAR Y JUZGAR (Plan Maestro de 3 actos)
═══════════════════════════════════════════════════════════════════
1. INCIDENTE INCITADOR (~10-12%): el evento que rompe la normalidad y obliga a actuar.
2. PRIMER PUNTO DE GIRO (~20-25%): el protagonista TOMA una decisión irreversible y entra en la trama. Decisión propia, no empujón pasivo.
3. PUNTO MEDIO (~50%): gran revelación / victoria falsa / derrota temporal. CLAVE: el protagonista vira de PASIVO (reaccionar) a ACTIVO (atacar). Marca vira_de_pasiva_a_activa.
4. MOMENTO OSCURO / 2.º giro (~75%): "todo está perdido", derrota que parece definitiva, muerte metafórica o literal. El protagonista ve su mayor defecto.
5. CLÍMAX (~80-95%): enfrentamiento final directo. El protagonista resuelve aplicando lo aprendido y superando su defecto. Marca protagonista_triunfa_por_cambio.

La trama externa (lo que pasa) debe FORZAR la trama interna (el cambio del personaje). Un clímax bien resuelto pero por un cambio interno que no se ganó en el acto 2 también es fallo (tipo "cambio_no_gana_el_climax").

═══════════════════════════════════════════════════════════════════
QUÉ MÁS DEBES MARCAR
═══════════════════════════════════════════════════════════════════
- "protagonista_pasiva": tramos donde el protagonista solo reacciona/es arrastrado y no toma decisiones que muevan la trama (sobre todo en el acto 2 segunda mitad y el acto 3).
- "climax_no_sembrado": lo que resuelve el clímax (un objeto, una alianza, una habilidad, una prueba) NO aparece sembrado en actos previos.
- "punto_medio_sin_viraje": el punto medio existe como evento pero el protagonista NO pasa de pasivo a activo.
- "arco_no_pagado": un personaje con arco declarado (o presentado como relevante pronto) se evapora y no se cierra en escena, o reaparece solo al final para cerrar (cierre fantasma).
- "acto2_plano": 3+ capítulos seguidos del acto 2 sin escalada real de la presión sobre el protagonista.

═══════════════════════════════════════════════════════════════════
QUÉ NO DEBES HACER
═══════════════════════════════════════════════════════════════════
- NO inventes problemas que no estén en la escaleta. Cita capítulos concretos.
- NO penalices que un secundario AYUDE en el clímax, siempre que el protagonista sea quien toma la decisión decisiva y ejecuta la acción central.
- NO seas dogmático con los porcentajes (un punto medio al 45% o 55% está bien). Juzga la FUNCIÓN, no el número exacto.
- En una novela coral, identifica al protagonista o protagonistas dominantes y aplícales la regla.

═══════════════════════════════════════════════════════════════════
CÓMO PUNTUAR (puntuacion_agencia de 1 a 10)
═══════════════════════════════════════════════════════════════════
- 9-10: el protagonista conduce el clímax con una acción sembrada; el cambio interno se gana en el acto 2; los 5 hitos cumplen su función.
- 7-8: el protagonista es el agente, con 1-2 tramos de pasividad menor o un hito algo débil.
- 5-6: pasividad notable o un hito ausente; el final se sostiene a medias.
- 3-4: rescate externo parcial, o el cambio del clímax no está ganado.
- 1-2: deus ex machina claro; el protagonista es espectador de su propio desenlace.

═══════════════════════════════════════════════════════════════════
VEREDICTO
═══════════════════════════════════════════════════════════════════
- "apto": puntuacion_agencia >= 7 Y protagonista_es_agente_del_climax = true Y sin ningún problema "rescate_externo" de severidad critica o alta.
- "necesita_revision": puntuacion_agencia 5-6, o hay rescate externo/pasividad corregibles sin replantear todo.
- "reescribir": puntuacion_agencia <= 4 o deus ex machina estructural que obliga a repensar el desenlace.

═══════════════════════════════════════════════════════════════════
DIRECTIVAS_ARQUITECTO (CRÍTICO)
═══════════════════════════════════════════════════════════════════
Si veredicto != "apto", "directivas_arquitecto" se inyecta literalmente al Arquitecto. Debe ser:
- Concreto y accionable: di QUÉ cambiar capítulo a capítulo, no solo qué está mal.
- Centrado en AGENCIA: cómo convertir al protagonista en el agente de su clímax, qué sembrar antes y en qué capítulos, cómo eliminar el rescate externo.
- Conciso: máximo 700 palabras, lista numerada por bloques (siembras del acto 1-2, viraje del punto medio, rediseño del clímax).
Si veredicto = "apto", puede ir vacío.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════
{
  "puntuacion_agencia": 7,
  "veredicto": "apto" | "necesita_revision" | "reescribir",
  "protagonista_es_agente_del_climax": true,
  "quien_resuelve_el_climax": "Nombre del personaje o fuerza que de hecho resuelve el conflicto central en el clímax.",
  "resumen": "Una frase sobre el estado de la agencia y el final.",
  "hitos": {
    "incidente_incitador": { "capitulo": 3, "presente": true, "nota": "..." },
    "primer_giro": { "capitulo": 8, "presente": true, "nota": "..." },
    "punto_medio": { "capitulo": 17, "presente": true, "vira_de_pasiva_a_activa": true, "nota": "..." },
    "momento_oscuro": { "capitulo": 26, "presente": true, "nota": "..." },
    "climax": { "capitulo": 31, "presente": true, "protagonista_triunfa_por_cambio": true, "nota": "..." }
  },
  "fortalezas": ["..."],
  "problemas": [
    {
      "tipo": "rescate_externo",
      "severidad": "critica",
      "capitulos_afectados": [30],
      "descripcion": "El conflicto central (la condena de Elvira) lo resuelve el rey al intervenir en el cap 30; Elvira es pasiva y solo recibe el indulto.",
      "directiva_concreta": "Reescribe el cap 30 para que sea una acción propia de Elvira (los pliegos que ella distribuyó en caps 18-22) la que fuerza la absolución. Elimina la intervención del rey como agente; si aparece, que solo ratifique lo que la acción de Elvira ya hizo inevitable."
    }
  ],
  "directivas_arquitecto": "Si veredicto = 'apto', cadena vacía. Si no, lista numerada de cambios concretos."
}

Responde ÚNICAMENTE con el JSON.
`;

export class AgencyCriticAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Editor de Desarrollo (Agencia)",
      role: "agency-critic",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384, // [Fix269] techo COMBINADO thinking+contenido (antes 8192: riesgo de JSON vacio con entradas grandes)
      includeThoughts: false,
    });
    this.timeoutMs = 7 * 60 * 1000;
  }

  async analyze(input: AgencyCriticInput): Promise<{ result: AgencyCriticResult | null; raw: AgentResponse }> {
    const condensed = this.condenseOutline(input);

    const userPrompt = `
NOVELA A EVALUAR (escaleta sin escribir):

TÍTULO: ${input.title}
GÉNERO: ${input.genre}
TONO: ${input.tone}
LONGITUD PLANIFICADA: ${input.chapterCount} capítulos
PROTAGONISTA(S): ${condensed.protagonista}

PREMISA:
${input.premise}

═══════════════════════════════════════════════════════════════════
ESTRUCTURA EN TRES ACTOS
═══════════════════════════════════════════════════════════════════
${condensed.estructura}

═══════════════════════════════════════════════════════════════════
PERSONAJES Y ARCOS
═══════════════════════════════════════════════════════════════════
${condensed.personajes}

═══════════════════════════════════════════════════════════════════
ESCALETA CAPÍTULO A CAPÍTULO (la ZONA DE CLÍMAX está marcada)
═══════════════════════════════════════════════════════════════════
${condensed.escaleta}

═══════════════════════════════════════════════════════════════════

Localiza los 5 hitos, identifica quién resuelve de hecho el clímax y juzga la AGENCIA del protagonista. Aplica la regla de oro sin contemplaciones. Devuelve el JSON estructurado.
`;

    const response = await this.generateContent(userPrompt, input.projectId);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[AgencyCritic] Error o respuesta vacia: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      // [Fix136] repairJson ya devuelve el objeto parseado; no re-parsear.
      const parsed = repairJson(response.content) as AgencyCriticResult;

      if (typeof parsed.puntuacion_agencia !== "number" || !parsed.veredicto || !Array.isArray(parsed.problemas)) {
        console.error(`[AgencyCritic] JSON invalido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.puntuacion_agencia = Math.max(1, Math.min(10, parsed.puntuacion_agencia));
      // [Fix147] Saneamiento defensivo de cada problema: el orquestador hace
      // .join() sobre capitulos_afectados, asi que coaccionamos a array de
      // numeros y normalizamos severidad/tipo a string. Evita que una salida
      // mal tipada del LLM rompa el bucle (que se saltaria como "no bloqueante").
      parsed.problemas = parsed.problemas
        .filter(p => p && p.tipo && p.descripcion)
        .map(p => ({
          ...p,
          severidad: (p.severidad === "critica" || p.severidad === "alta" || p.severidad === "media" || p.severidad === "baja")
            ? p.severidad
            : "media",
          descripcion: String(p.descripcion),
          capitulos_afectados: Array.isArray(p.capitulos_afectados)
            ? p.capitulos_afectados.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n))
            : [],
        }));
      if (!parsed.hitos || typeof parsed.hitos !== "object") {
        parsed.hitos = {} as AgencyCriticResult["hitos"];
      }
      parsed.fortalezas = Array.isArray(parsed.fortalezas) ? parsed.fortalezas : [];
      parsed.directivas_arquitecto = parsed.directivas_arquitecto || "";
      parsed.quien_resuelve_el_climax = parsed.quien_resuelve_el_climax || "";
      if (typeof parsed.protagonista_es_agente_del_climax !== "boolean") {
        // Conservador: si el juez no lo declara, lo inferimos de los problemas.
        parsed.protagonista_es_agente_del_climax = !parsed.problemas.some(
          p => p.tipo === "rescate_externo" && (p.severidad === "critica" || p.severidad === "alta"),
        );
      }

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[AgencyCritic] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseOutline(input: AgencyCriticInput): {
    protagonista: string;
    personajes: string;
    escaleta: string;
    estructura: string;
  } {
    const personajesArr = input.worldBible?.personajes || input.worldBible?.world_bible?.personajes || [];

    const protagonistas = personajesArr.filter((p: any) => /protagon/i.test(String(p.rol || p.role || "")));
    const protagonista = (protagonistas.length > 0 ? protagonistas : personajesArr.slice(0, 1))
      .map((p: any) => p.nombre || p.name || "Sin nombre")
      .join(", ") || "(sin protagonista declarado)";

    const personajes = personajesArr.slice(0, 12).map((p: any) => {
      const nombre = p.nombre || p.name || "Sin nombre";
      const rol = p.rol || p.role || "—";
      const arco = p.arco_transformacion || p.arc || "";
      const perfil = p.perfil_psicologico || p.descripcion || p.description || "—";
      return `- ${nombre} (${rol}): ${typeof perfil === "string" ? perfil.substring(0, 200) : "—"}${arco ? `\n  Arco: ${typeof arco === "string" ? arco.substring(0, 250) : ""}` : ""}`;
    }).join("\n") || "(sin personajes en el outline)";

    const escaletaArr = input.escaletaCapitulos || [];
    const total = escaletaArr.length;
    const climaxFrom = Math.floor(total * 0.75);
    const escaleta = escaletaArr.map((c: any, idx: number) => {
      const num = c.numero ?? c.number ?? idx + 1;
      const titulo = c.titulo || c.title || "Sin título";
      const objetivo = c.objetivo_narrativo || c.summary || "—";
      const conflicto = c.conflicto_central || "—";
      const giro = c.giro_emocional || "";
      const beats: string[] = (c.beats || c.keyEvents || []).slice(0, 6).map((b: any) =>
        typeof b === "string" ? b : (b?.descripcion || JSON.stringify(b)),
      );
      const zona = idx >= climaxFrom ? " [ZONA DE CLÍMAX/RESOLUCIÓN]" : "";
      return `Cap ${num}: ${titulo}${zona}\n  Objetivo: ${typeof objetivo === "string" ? objetivo.substring(0, 300) : "—"}\n  Conflicto: ${typeof conflicto === "string" ? conflicto.substring(0, 200) : "—"}${giro ? `\n  Giro: ${giro}` : ""}\n  Beats: ${beats.map(b => `• ${b.substring(0, 160)}`).join(" ")}`;
    }).join("\n\n") || "(sin escaleta)";

    const estructuraSrc = input.estructuraTresActos || {};
    const estructura = (() => {
      const parts: string[] = [];
      const a1 = estructuraSrc.acto_1 || estructuraSrc.act1;
      const a2 = estructuraSrc.acto_2 || estructuraSrc.act2;
      const a3 = estructuraSrc.acto_3 || estructuraSrc.act3;
      if (a1) parts.push(`ACTO 1: ${typeof a1 === "string" ? a1 : JSON.stringify(a1).substring(0, 600)}`);
      if (a2) parts.push(`ACTO 2: ${typeof a2 === "string" ? a2 : JSON.stringify(a2).substring(0, 600)}`);
      if (a3) parts.push(`ACTO 3: ${typeof a3 === "string" ? a3 : JSON.stringify(a3).substring(0, 600)}`);
      return parts.length > 0 ? parts.join("\n\n") : "(sin estructura de tres actos)";
    })();

    return { protagonista, personajes, escaleta, estructura };
  }
}

// ───────────────────────────────────────────────────────────────────
// HELPERS DETERMINISTAS (fail-safe de la Puerta 1). No usan LLM.
// ───────────────────────────────────────────────────────────────────

export function getProtagonistName(worldBible: any): string {
  const personajesArr = worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const prot = personajesArr.find((p: any) => /protagon/i.test(String(p.rol || p.role || "")));
  const pick = prot || personajesArr[0];
  return (pick?.nombre || pick?.name || "la protagonista") as string;
}

const EXTERNAL_RESCUE_TOKENS = [
  "rey", "reina", "monarca", "emperador", "emperatriz", "noble", "duque", "duquesa",
  "conde", "condesa", "marques", "marquesa", "juez", "tribunal", "autoridad", "gobernador",
  "virrey", "obispo", "cardenal", "inquisidor", "ejercito", "tropas", "guardia real",
  "policia", "milagro", "dios", "providencia", "casualidad", "coincidencia", "destino",
  "indulto", "amnistia", "perdon real",
];

const RESOLUTION_VERBS = [
  "salva", "rescata", "interviene", "libera", "absuelve", "perdona", "indulta",
  "detiene", "derrota", "resuelve", "soluciona", "aparece y", "llega y", "irrumpe",
  "ordena liberar", "concede",
];

/**
 * Olor determinista a rescate externo en la ZONA DE CLIMAX (ultimo 25%).
 * Conservador: solo marca cuando coocurre un verbo de resolucion con un token de
 * poder externo Y el protagonista NO figura como actor en el mismo capitulo.
 * Es un detector de APOYO (no la puerta principal), por eso es tolerante.
 */
export function detectExternalRescueSmell(
  escaleta: any[],
  worldBible: any,
): { smell: boolean; capitulos: number[]; evidencia: string } {
  const arr = Array.isArray(escaleta) ? escaleta : [];
  const total = arr.length;
  if (total === 0) return { smell: false, capitulos: [], evidencia: "" };

  const protName = getProtagonistName(worldBible).toLowerCase();
  const protTokens = protName.split(/\s+/).filter(t => t.length >= 3);
  const climaxFrom = Math.floor(total * 0.75);

  const hits: number[] = [];
  const evidence: string[] = [];

  for (let idx = climaxFrom; idx < total; idx++) {
    const c = arr[idx] || {};
    const num = Number(c.numero ?? c.number ?? idx + 1);
    const beats: string[] = (c.beats || c.keyEvents || []).map((b: any) =>
      typeof b === "string" ? b : (b?.descripcion || ""),
    );
    const corpus = [
      c.objetivo_narrativo || c.summary || "",
      c.conflicto_central || "",
      c.giro_emocional || "",
      beats.join(" "),
    ].join(" ").toLowerCase();
    if (!corpus.trim()) continue;

    const hasVerb = RESOLUTION_VERBS.some(v => corpus.includes(v));
    if (!hasVerb) continue;
    const externalToken = EXTERNAL_RESCUE_TOKENS.find(t => corpus.includes(t));
    if (!externalToken) continue;
    const protPresent = protTokens.some(t => corpus.includes(t));
    if (protPresent) continue; // el protagonista actua aqui -> no es rescate externo

    hits.push(num);
    evidence.push(`cap ${num}: resolucion ligada a "${externalToken}" sin el protagonista como actor`);
  }

  return { smell: hits.length > 0, capitulos: hits, evidencia: evidence.join("; ") };
}

/**
 * Red dura determinista: estampa un mandato de agencia VINCULANTE en los caps de la
 * zona de climax cuando los jueces no logran cerrar el fallo de forma autonoma. El
 * campo viaja en la escaleta y lo honran las puertas de generacion y prosa.
 * Devuelve los numeros de capitulo estampados.
 */
export function stampAgencyMandate(worldBibleData: any, worldBible: any): number[] {
  const arr = worldBibleData?.escaleta_capitulos;
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const protName = getProtagonistName(worldBible);
  const total = arr.length;
  const climaxFrom = Math.floor(total * 0.7);
  const mandato = `MANDATO DE AGENCIA (vinculante): ${protName} debe resolver el conflicto central de este tramo mediante una accion PROPIA sembrada en capitulos anteriores. PROHIBIDO que un poder externo (rey, juez, autoridad, ejercito, casualidad, milagro) o un secundario resuelva por ${protName} mientras observa pasiva. Si una figura externa aparece, solo puede ratificar lo que la accion de ${protName} ya hizo inevitable.`;
  const stamped: number[] = [];
  for (let idx = climaxFrom; idx < total; idx++) {
    const c = arr[idx];
    if (c && typeof c === "object") {
      c.mandato_agencia = mandato;
      stamped.push(Number(c.numero ?? c.number ?? idx + 1));
    }
  }
  return stamped;
}
