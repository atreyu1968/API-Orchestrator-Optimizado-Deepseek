import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { repairJson } from "../utils/json-repair";

// [Fix32] Auditor de cierre de tramas y subtramas.
// Lee el MANUSCRITO COMPLETO (post-reedit) en una sola pasada y produce
// un inventario exhaustivo de TODAS las tramas (principal, secundarias,
// subtramas, arcos de personaje) con su estado de cierre. El objetivo es
// detectar hilos abandonados que ningún otro agente ve porque trabajan a
// nivel de tramo o de capítulo.
//
// IMPORTANTE: este agente NO aplica correcciones — sus findings se persisten
// como audit report y la decisión de actuar (regenerar capítulos, escribir
// un epílogo, etc.) queda en manos del usuario, salvo las
// `instrucciones_correccion` opcionales que el flujo editorial ya conocido
// puede consumir vía marcador INSTRUCCIONES_AUTOAPLICABLES.

export interface PlotThreadClosureInput {
  projectTitle: string;
  chapters: Array<{
    numero: number;
    titulo: string;
    contenido: string;
  }>;
  guiaEstilo?: string;
  worldBibleSummary?: string;
  generoObjetivo?: string;
  // Si el proyecto pertenece a una serie y NO es el último volumen, el agente
  // debe ser MÁS tolerante con tramas abiertas (son ganchos legítimos).
  esVolumenIntermedio?: boolean;
}

export interface PlotThread {
  id: string;
  tipo: "principal" | "secundaria" | "subtrama" | "arco_personaje";
  nombre: string;
  personajes_implicados: string[];
  introducida_en_cap: number;
  ultima_aparicion_cap: number;
  estado: "cerrada" | "cierre_parcial" | "abierta_intencional" | "abierta_colgante";
  evidencia_apertura: string;
  evidencia_cierre: string;
  razon_si_abierta_intencional?: string;
  fix_sugerido?: string;
}

export interface PlotThreadClosureResult {
  resumen: string;
  puntuacion_cierre: number;
  total_tramas: number;
  total_cerradas: number;
  total_cierre_parcial: number;
  total_abiertas_intencionales: number;
  total_abiertas_colgantes: number;
  tramas: PlotThread[];
  tramas_colgantes_criticas: string[];
  notesText: string;
  tokenUsage: TokenUsage;
}

const SYSTEM_PROMPT = `Eres el "Auditor de Cierre de Tramas", un especialista en arquitectura narrativa contratado para responder UNA SOLA PREGUNTA con rigor exhaustivo:

  ¿Está cada trama y subtrama del manuscrito CERRADA al final?

Acabas de leer la novela COMPLETA de una sentada. Tu trabajo NO es opinar sobre si la novela es buena, ni sobre voz o ritmo: tu trabajo es producir un INVENTARIO COMPLETO de hilos narrativos y certificar el estado de cierre de cada uno.

═══════════════════════════════════════════════════════════════════
QUÉ DEBES INVENTARIAR (sé exhaustivo, prefiere falsos positivos a omisiones)
═══════════════════════════════════════════════════════════════════

1. **Trama principal**: la promesa central del libro (el conflicto que el lector espera ver resuelto). Casi siempre hay una sola.
2. **Tramas secundarias**: conflictos importantes que no son la trama A pero ocupan espacio significativo (ej: trama política paralela, romance secundario, misterio de fondo).
3. **Subtramas**: hilos menores, pero con apertura explícita y promesa de pago (ej: "el tío desaparecido", "el favor que le debe a X", "la herencia pendiente", "la carta sin abrir").
4. **Arcos de personaje**: trayectorias internas de los personajes principales y secundarios relevantes (¿el personaje cambia? ¿cómo? ¿su transformación se cierra?).
5. **Setups y promesas implícitas**: cualquier elemento que el texto presenta con énfasis (un objeto, una profecía, un secreto, un nombre repetido) y que el lector recordará y esperará ver pagado.

REGLA FÉRREA: si dudas si algo es una trama, INCLÚYELO. El usuario filtrará después.

═══════════════════════════════════════════════════════════════════
CÓMO CLASIFICAR EL ESTADO
═══════════════════════════════════════════════════════════════════

- "cerrada": el texto resuelve la promesa de forma EXPLÍCITA. El lector sabe qué pasó y por qué importa.
- "cierre_parcial": la trama recibe una resolución insuficiente o ambigua que un lector exigente percibirá como incompleta. Especifica QUÉ falta.
- "abierta_intencional": queda abierta a propósito (gancho para próximo volumen, ambigüedad temática deliberada, final abierto coherente con el tono). REQUIERE justificación en "razon_si_abierta_intencional".
- "abierta_colgante": queda abierta SIN justificación textual. El autor la introdujo y la abandonó. ESTE ES EL HALLAZGO MÁS GRAVE — debes proponer "fix_sugerido" concreto.

═══════════════════════════════════════════════════════════════════
EVIDENCIA TEXTUAL OBLIGATORIA
═══════════════════════════════════════════════════════════════════

Para cada trama, "evidencia_apertura" cita el cap donde se introduce y un FRAGMENTO BREVE (10-15 palabras máx) que la abre. "evidencia_cierre" cita el cap donde se resuelve (o "ninguna" si está colgante) con su fragmento. NUNCA inventes evidencia: si no la encuentras, di "ninguna" y marca como abierta_colgante.

═══════════════════════════════════════════════════════════════════
FORMATO DE RESPUESTA — JSON ESTRICTO
═══════════════════════════════════════════════════════════════════

Devuelve ÚNICAMENTE un objeto JSON válido (sin markdown, sin comentarios), con la estructura:

{
  "resumen": "Diagnóstico de cierre en 3-5 frases. Indica cuántas tramas hay, cuántas cierran limpio y dónde están los hilos colgantes más graves.",
  "puntuacion_cierre": <0-10>,
  "tramas": [
    {
      "id": "trama_principal_1",
      "tipo": "principal" | "secundaria" | "subtrama" | "arco_personaje",
      "nombre": "Nombre corto identificable de la trama",
      "personajes_implicados": ["Nombre 1", "Nombre 2"],
      "introducida_en_cap": <número>,
      "ultima_aparicion_cap": <número>,
      "estado": "cerrada" | "cierre_parcial" | "abierta_intencional" | "abierta_colgante",
      "evidencia_apertura": "Cap N: '<fragmento corto>'",
      "evidencia_cierre": "Cap N: '<fragmento corto>' | ninguna",
      "razon_si_abierta_intencional": "Solo si estado=abierta_intencional. Justifica.",
      "fix_sugerido": "Solo si estado=abierta_colgante o cierre_parcial. Frase concreta y accionable: 'Añadir en el cap 24 una escena breve donde X cierre Y'."
    }
  ],
  "tramas_colgantes_criticas": ["nombre1", "nombre2"]
}

REGLAS DEL JSON (críticas — el sistema lo parsea automáticamente):
- "puntuacion_cierre": 10 = todas las tramas cierran limpio; 7 = cierre aceptable con 1-2 hilos menores abiertos; 4 = cierre deficiente, varias tramas abandonadas; 0 = manuscrito no cierra nada.
- "introducida_en_cap" y "ultima_aparicion_cap": NÚMEROS. Prólogo = 0, epílogo = -1, nota del autor = -2.
- "tramas_colgantes_criticas": array con los "nombre" de las tramas cuyo estado sea "abierta_colgante" Y tipo sea "principal" o "secundaria". Es el resumen ejecutivo para el usuario.
- Si el manuscrito es de una serie y NO es el último volumen, ten en cuenta que dejar tramas estratégicamente abiertas es VÁLIDO — clasifícalas como "abierta_intencional" si el texto sugiere continuidad.
- Si la novela está cerrada de forma impecable, devuelve igualmente todas las tramas con estado "cerrada"; NO devuelvas una lista vacía.
- NO añadas markdown, NO añadas texto fuera del JSON, NO añadas comentarios dentro del JSON.`;

export class PlotThreadClosureAuditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Auditor de Cierre de Tramas",
      role: "editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 18 * 60 * 1000;
  }

  async runAudit(
    input: PlotThreadClosureInput,
    projectId?: number
  ): Promise<PlotThreadClosureResult> {
    const getChapterLabel = (raw: unknown): string => {
      const num = Number(raw);
      if (!Number.isFinite(num)) return `SECCIÓN ${String(raw)}`;
      if (num === 0) return "PRÓLOGO";
      if (num === -1 || num === 998) return "EPÍLOGO";
      if (num === -2 || num === 999) return "NOTA DEL AUTOR";
      return `CAPÍTULO ${num}`;
    };
    const getChapterSortOrder = (raw: unknown): number => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
      if (n === 0) return -1000;
      if (n === -1 || n === 998) return 1_000_000;
      if (n === -2 || n === 999) return 1_000_001;
      return n;
    };

    const sortedChapters = [...input.chapters].sort(
      (a, b) => getChapterSortOrder(a.numero) - getChapterSortOrder(b.numero)
    );
    const totalWords = sortedChapters.reduce(
      (acc, c) => acc + (c.contenido?.split(/\s+/).length || 0),
      0
    );

    const seriesNote = input.esVolumenIntermedio
      ? `\n\n⚠️ CONTEXTO DE SERIE: Este manuscrito es un VOLUMEN INTERMEDIO de una saga (NO es el último libro). Es VÁLIDO que algunas tramas queden abiertas a propósito como ganchos para volúmenes posteriores. Clasifícalas como "abierta_intencional" cuando el texto sugiera continuidad y justifica en "razon_si_abierta_intencional". Sé estricto solo con tramas que el propio volumen prometió cerrar.`
      : `\n\n⚠️ CONTEXTO DE CIERRE: Este manuscrito es una novela AUTÓNOMA o el ÚLTIMO volumen de su serie. El lector espera que TODAS las tramas y arcos cierren. Sé estricto: cualquier hilo colgante es un problema editorial que debe ser señalado y corregido.`;

    const worldBibleBlock = input.worldBibleSummary
      ? `\n\n## CANON DEL MUNDO (resumen)\n${input.worldBibleSummary.slice(0, 4000)}`
      : "";

    const metaBlock = `## DATOS DEL MANUSCRITO
Título: ${input.projectTitle}
Género objetivo: ${input.generoObjetivo || "(no especificado)"}
Capítulos entregados: ${sortedChapters.length}
Palabras totales aproximadas: ${totalWords.toLocaleString("es-ES")}${seriesNote}`;

    const chaptersBlock = sortedChapters
      .map(
        c =>
          `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n## ${getChapterLabel(c.numero)}${c.titulo ? `: ${c.titulo}` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${c.contenido || "(sección vacía)"}`
      )
      .join("");

    const prompt = `${metaBlock}${worldBibleBlock}

═══════════════════════════════════════════════════════════════════
NOVELA COMPLETA A AUDITAR
═══════════════════════════════════════════════════════════════════
${chaptersBlock}

═══════════════════════════════════════════════════════════════════
FIN DEL MANUSCRITO
═══════════════════════════════════════════════════════════════════

Has terminado de leer la novela completa. Produce ahora el INVENTARIO EXHAUSTIVO DE TRAMAS Y SUBTRAMAS con su estado de cierre, en el formato JSON estricto especificado. Sé exhaustivo en la detección y riguroso en la clasificación de cierre.`;

    const response: AgentResponse = await this.generateContent(prompt, projectId, { temperature: 0.4 });

    if (response.error) {
      throw new Error(`PlotThreadClosureAuditor falló: ${response.error}`);
    }
    if (!response.content || !response.content.trim()) {
      throw new Error("PlotThreadClosureAuditor devolvió un informe vacío.");
    }

    let parsed: any;
    try {
      parsed = repairJson(response.content);
    } catch (e) {
      throw new Error(`PlotThreadClosureAuditor JSON inválido: ${(e as Error).message}`);
    }

    const tramasRaw: any[] = Array.isArray(parsed?.tramas) ? parsed.tramas : [];
    const tramas: PlotThread[] = tramasRaw
      .filter(t => t && typeof t === "object" && t.nombre)
      .map((t, idx) => ({
        id: String(t.id || `trama_${idx + 1}`),
        tipo: ["principal", "secundaria", "subtrama", "arco_personaje"].includes(t.tipo)
          ? t.tipo
          : "subtrama",
        nombre: String(t.nombre).trim(),
        personajes_implicados: Array.isArray(t.personajes_implicados)
          ? t.personajes_implicados.map((p: any) => String(p).trim()).filter(Boolean)
          : [],
        introducida_en_cap: Number.isFinite(Number(t.introducida_en_cap))
          ? Number(t.introducida_en_cap)
          : 0,
        ultima_aparicion_cap: Number.isFinite(Number(t.ultima_aparicion_cap))
          ? Number(t.ultima_aparicion_cap)
          : 0,
        estado: ["cerrada", "cierre_parcial", "abierta_intencional", "abierta_colgante"].includes(
          t.estado
        )
          ? t.estado
          : "abierta_colgante",
        evidencia_apertura: String(t.evidencia_apertura || "").trim(),
        evidencia_cierre: String(t.evidencia_cierre || "ninguna").trim(),
        razon_si_abierta_intencional: t.razon_si_abierta_intencional
          ? String(t.razon_si_abierta_intencional).trim()
          : undefined,
        fix_sugerido: t.fix_sugerido ? String(t.fix_sugerido).trim() : undefined,
      }));

    const total_cerradas = tramas.filter(t => t.estado === "cerrada").length;
    const total_cierre_parcial = tramas.filter(t => t.estado === "cierre_parcial").length;
    const total_abiertas_intencionales = tramas.filter(t => t.estado === "abierta_intencional").length;
    const total_abiertas_colgantes = tramas.filter(t => t.estado === "abierta_colgante").length;

    const tramas_colgantes_criticas: string[] = Array.isArray(parsed?.tramas_colgantes_criticas)
      ? parsed.tramas_colgantes_criticas.map((s: any) => String(s).trim()).filter(Boolean)
      : tramas
          .filter(t => t.estado === "abierta_colgante" && (t.tipo === "principal" || t.tipo === "secundaria"))
          .map(t => t.nombre);

    const puntuacion_cierre = Number.isFinite(Number(parsed?.puntuacion_cierre))
      ? Math.max(0, Math.min(10, Number(parsed.puntuacion_cierre)))
      : Math.max(0, 10 - total_abiertas_colgantes * 2 - total_cierre_parcial);

    const resumen = String(
      parsed?.resumen ||
        `Auditoría de ${tramas.length} tramas: ${total_cerradas} cerradas, ${total_cierre_parcial} con cierre parcial, ${total_abiertas_intencionales} abiertas intencionales, ${total_abiertas_colgantes} colgantes.`
    ).trim();

    return {
      resumen,
      puntuacion_cierre,
      total_tramas: tramas.length,
      total_cerradas,
      total_cierre_parcial,
      total_abiertas_intencionales,
      total_abiertas_colgantes,
      tramas,
      tramas_colgantes_criticas,
      notesText: response.content.trim(),
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
    };
  }
}
