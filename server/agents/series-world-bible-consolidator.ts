import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface SeriesWorldBibleCharacter {
  nombre: string;
  rol: "protagonista" | "antagonista" | "secundario_recurrente" | "secundario_puntual";
  fisico: string;
  edad_o_rango: string;
  profesion_o_ocupacion: string;
  familia_y_relaciones: string;
  voz_y_tics: string;
  motivacion_nuclear: string;
  arco_resumen: string;
  estado_actual: string;
  volumenes_apariciones: number[];
}

export interface SeriesWorldBibleConsolidated {
  personajes: SeriesWorldBibleCharacter[];
  lugares: Array<{ nombre: string; descripcion: string; volumenes: number[] }>;
  reglas_del_mundo: string[];
  lexico_canonico: Array<{ termino: string; significado: string }>;
  hilos_de_serie_abiertos: string[];
  incoherencias_detectadas: string[];
}

interface VolumeInput {
  order: number;
  title: string;
  worldBibleJson?: string;
  fullText?: string;
}

interface ConsolidatorInput {
  seriesTitle?: string;
  volumes: VolumeInput[];
  previousConsolidated?: SeriesWorldBibleConsolidated;
}

interface ConsolidatorResult {
  worldBible: SeriesWorldBibleConsolidated;
  raw: string;
}

export class SeriesWorldBibleConsolidatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Consolidador de Biblia de Serie",
      role: "series-wb-consolidator",
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 12288,
      systemPrompt: `Eres el CONSOLIDADOR DE BIBLIA DE SERIE. Tu trabajo es leer todos los volúmenes ya publicados de una saga y producir UNA SOLA biblia canónica que el resto del sistema usará como verdad para escribir los volúmenes siguientes.

PRINCIPIO RECTOR
La biblia que devuelves es la VERSIÓN OFICIAL y DEDUPLICADA. Cada personaje aparece UNA sola vez con sus rasgos finales. Cada lugar aparece UNA sola vez. El léxico está unificado. Si dos volúmenes se contradicen, eliges la versión más reciente y registras la contradicción en "incoherencias_detectadas" para que el equipo lo sepa.

REGLAS ABSOLUTAS
1. PROHIBIDO inventar rasgos que no aparezcan en el material. Si no se menciona el color de ojos de un personaje, deja el campo "fisico" describiendo solo lo que sí aparece.
2. PROHIBIDO renombrar. Si un personaje aparece como "Iris" en 2 volúmenes y "Elin" en 1, usa el nombre dominante y anota la divergencia en incoherencias_detectadas.
3. PROHIBIDO mezclar personajes. Si hay dos personajes parecidos pero distintos, mantenlos separados.
4. PROHIBIDO inventar familia, hijos, parejas que no aparezcan explícitamente o como hilo abierto claro.
5. PRIORIZA la información del VOLUMEN MÁS RECIENTE para "estado_actual" y "arco_resumen" (los personajes evolucionan). Para "fisico", "edad_o_rango", "profesion_o_ocupacion" y "motivacion_nuclear" prioriza también el más reciente.
6. Si recibes una biblia previa (previousConsolidated), úsala como base y AÑADE las novedades del nuevo volumen — no reescribas todo desde cero.
7. Para cada personaje, marca en "volumenes_apariciones" los números de orden donde aparece.

CAMPOS POR PERSONAJE
- nombre: exacto, tal como aparece más veces.
- rol: protagonista / antagonista / secundario_recurrente / secundario_puntual.
- fisico: 1-3 frases con TODOS los rasgos canónicos (color ojos, pelo, altura, cicatrices, marcas, edad aparente, vestuario habitual).
- edad_o_rango: número o rango si fluctúa entre volúmenes.
- profesion_o_ocupacion: oficio, cargo, estatus social.
- familia_y_relaciones: padres, hermanos, hijos, parejas, mejor amigo, mentor — solo los CONFIRMADOS.
- voz_y_tics: cómo habla, muletillas, registro, palabras suyas.
- motivacion_nuclear: 1-2 frases con su deseo profundo y su miedo profundo.
- arco_resumen: 1-3 frases con el viaje del personaje a lo largo de los volúmenes ya escritos.
- estado_actual: dónde está, en qué situación, con quién, al final del último volumen disponible.
- volumenes_apariciones: array de enteros (seriesOrder).

CAMPOS POR LUGAR
- nombre, descripcion (1-2 frases con su geografía/atmósfera canónica), volumenes (array).

REGLAS DEL MUNDO
Frases breves que cualquier autor de un nuevo volumen DEBE respetar (cómo funciona la magia, la política, la tecnología, las leyes físicas si son distintas, etc.).

LÉXICO CANÓNICO
Términos propios de la serie (criaturas, conjuros, organizaciones, jergas) con su significado breve.

HILOS DE SERIE ABIERTOS
Subtramas que el último volumen dejó SIN RESOLVER y que el volumen siguiente puede recoger.

INCOHERENCIAS DETECTADAS
Lista honesta de divergencias entre volúmenes (nombres que bailan, edades inconsistentes, etc.). Esto NO es para corregir, es para alertar al autor.

FORMATO DE SALIDA
Responde SOLO con un objeto JSON con esta forma exacta:
{
  "personajes": [...],
  "lugares": [...],
  "reglas_del_mundo": [...],
  "lexico_canonico": [...],
  "hilos_de_serie_abiertos": [...],
  "incoherencias_detectadas": [...]
}
NADA de markdown, NADA de texto fuera del JSON.`,
    });
  }

  async execute(input: ConsolidatorInput): Promise<AgentResponse & ConsolidatorResult> {
    const volumesBlock = input.volumes
      .sort((a, b) => a.order - b.order)
      .map((v) => {
        const parts: string[] = [];
        parts.push(`\n═══ VOLUMEN ${v.order}: "${v.title}" ═══`);
        if (v.worldBibleJson) {
          parts.push(`\n--- WORLD BIBLE DE ESTE VOLUMEN ---\n${v.worldBibleJson}`);
        }
        if (v.fullText) {
          parts.push(`\n--- TEXTO ÍNTEGRO DE ESTE VOLUMEN ---\n${v.fullText}`);
        }
        return parts.join("\n");
      })
      .join("\n\n");

    const previousBlock = input.previousConsolidated
      ? `\n\n═══ BIBLIA DE SERIE PREVIA (USA COMO BASE Y ACTUALIZA) ═══\n${JSON.stringify(input.previousConsolidated, null, 2)}\n`
      : "";

    const prompt = `${input.seriesTitle ? `SERIE: "${input.seriesTitle}"\n` : ""}NÚMERO DE VOLÚMENES A CONSOLIDAR: ${input.volumes.length}
${previousBlock}
═══ MATERIAL DE ENTRADA (TODOS LOS VOLÚMENES YA PUBLICADOS) ═══
${volumesBlock}

INSTRUCCIÓN: Produce la biblia de serie consolidada según el formato definido. Solo JSON.`;

    const response = await this.generateContent(prompt);
    const repaired = repairJson(response.content);

    let worldBible: SeriesWorldBibleConsolidated;
    try {
      worldBible = JSON.parse(repaired);
    } catch (e) {
      console.error(`[SeriesWBConsolidator] JSON.parse falló: ${(e as Error).message}`);
      worldBible = {
        personajes: [],
        lugares: [],
        reglas_del_mundo: [],
        lexico_canonico: [],
        hilos_de_serie_abiertos: [],
        incoherencias_detectadas: [`Consolidator: respuesta del modelo no parseable como JSON.`],
      };
    }

    if (!Array.isArray(worldBible.personajes)) worldBible.personajes = [];
    if (!Array.isArray(worldBible.lugares)) worldBible.lugares = [];
    if (!Array.isArray(worldBible.reglas_del_mundo)) worldBible.reglas_del_mundo = [];
    if (!Array.isArray(worldBible.lexico_canonico)) worldBible.lexico_canonico = [];
    if (!Array.isArray(worldBible.hilos_de_serie_abiertos)) worldBible.hilos_de_serie_abiertos = [];
    if (!Array.isArray(worldBible.incoherencias_detectadas)) worldBible.incoherencias_detectadas = [];

    return {
      ...response,
      worldBible,
      raw: response.content,
    };
  }

  /**
   * Helper estático que renderiza la biblia consolidada como bloque legible
   * para inyectarla en el prompt del Architect y del Ghostwriter.
   */
  static renderForPrompt(wb: SeriesWorldBibleConsolidated): string {
    const lines: string[] = [];

    if (wb.personajes.length > 0) {
      lines.push(`── PERSONAJES ESTABLECIDOS (${wb.personajes.length}) ──`);
      for (const p of wb.personajes) {
        lines.push(`\n▸ ${p.nombre} [${p.rol}]  (V${(p.volumenes_apariciones || []).join(", V")})`);
        if (p.fisico) lines.push(`  Físico: ${p.fisico}`);
        if (p.edad_o_rango) lines.push(`  Edad: ${p.edad_o_rango}`);
        if (p.profesion_o_ocupacion) lines.push(`  Ocupación: ${p.profesion_o_ocupacion}`);
        if (p.familia_y_relaciones) lines.push(`  Familia/relaciones: ${p.familia_y_relaciones}`);
        if (p.voz_y_tics) lines.push(`  Voz: ${p.voz_y_tics}`);
        if (p.motivacion_nuclear) lines.push(`  Motivación: ${p.motivacion_nuclear}`);
        if (p.arco_resumen) lines.push(`  Arco previo: ${p.arco_resumen}`);
        if (p.estado_actual) lines.push(`  Estado al final del último volumen: ${p.estado_actual}`);
      }
    }

    if (wb.lugares.length > 0) {
      lines.push(`\n── LUGARES CANÓNICOS (${wb.lugares.length}) ──`);
      for (const l of wb.lugares) {
        lines.push(`▸ ${l.nombre}: ${l.descripcion}  (V${(l.volumenes || []).join(", V")})`);
      }
    }

    if (wb.reglas_del_mundo.length > 0) {
      lines.push(`\n── REGLAS DEL MUNDO ──`);
      wb.reglas_del_mundo.forEach((r) => lines.push(`• ${r}`));
    }

    if (wb.lexico_canonico.length > 0) {
      lines.push(`\n── LÉXICO CANÓNICO ──`);
      wb.lexico_canonico.forEach((l) => lines.push(`• ${l.termino}: ${l.significado}`));
    }

    if (wb.hilos_de_serie_abiertos.length > 0) {
      lines.push(`\n── HILOS DE SERIE ABIERTOS (puedes recogerlos) ──`);
      wb.hilos_de_serie_abiertos.forEach((h) => lines.push(`• ${h}`));
    }

    if (wb.incoherencias_detectadas.length > 0) {
      lines.push(`\n── INCOHERENCIAS DETECTADAS ENTRE VOLÚMENES (evita amplificarlas) ──`);
      wb.incoherencias_detectadas.forEach((i) => lines.push(`⚠ ${i}`));
    }

    return lines.join("\n");
  }
}
