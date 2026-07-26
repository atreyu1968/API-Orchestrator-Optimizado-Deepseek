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
  /**
   * [Fix79] Nombre del protagonista único de la serie ya fijado (extraído del
   * vol 1 al convertir libro→serie, o de la primera consolidación). Si llega,
   * el consolidator NO puede degradar a este personaje ni ascender a otro al
   * rol "protagonista". Garantiza un único protagonista estable a lo largo de
   * la saga.
   */
  protagonistAnchor?: string;
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
      maxOutputTokens: 16384, // [Fix269] techo COMBINADO thinking+contenido (antes 12288: riesgo de JSON vacio con entradas grandes)
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

🚨 REGLA DEL PROTAGONISTA ÚNICO (CRÍTICA)
La serie tiene UN SOLO PROTAGONISTA. Es el personaje cuyo arco vertebra toda la saga, no "el más mencionado en escenas". Distínguelo del love interest, del sidekick, del mentor o del antagonista carismático — esos son secundarios aunque aparezcan mucho.

- EXACTAMENTE UN personaje en el array "personajes" puede tener rol="protagonista". Ninguno más.
- Ese protagonista debe aparecer SIEMPRE como el PRIMER elemento del array "personajes" (índice 0).
- Si un personaje secundario (love interest, sidekick, etc.) tiene presencia narrativa fuerte pero NO es quien lleva el arco principal, su rol es "secundario_recurrente". NO le pongas "protagonista".
- Si recibes "PROTAGONISTA_ANCHOR" más abajo, ESE es el protagonista oficial de la serie y NO puedes cambiarlo bajo ningún concepto. Si su nombre no apareciera en el material de entrada (caso raro), inclúyelo igualmente con los datos que tengas del anchor y márcalo en incoherencias_detectadas. PROHIBIDO sustituirlo por otro personaje aunque salga más veces en pantalla.
- Si NO recibes anchor: elige al protagonista del vol 1 (el personaje POV principal, el que abre y cierra la trama del primer libro) y mantenlo. NO lo cambies entre volúmenes consolidando.

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

    const anchorBlock = input.protagonistAnchor
      ? `\n\n═══ 🚨 PROTAGONISTA_ANCHOR (INVIOLABLE) 🚨 ═══\nEl protagonista oficial de esta serie es: "${input.protagonistAnchor}".\nDebe ser el ÚNICO con rol="protagonista" en tu salida. Debe ser el PRIMER elemento del array "personajes". PROHIBIDO sustituirlo, renombrarlo o degradarlo a secundario, aunque otro personaje aparezca más en escenas.\n`
      : "";

    const prompt = `${input.seriesTitle ? `SERIE: "${input.seriesTitle}"\n` : ""}NÚMERO DE VOLÚMENES A CONSOLIDAR: ${input.volumes.length}
${anchorBlock}${previousBlock}
═══ MATERIAL DE ENTRADA (TODOS LOS VOLÚMENES YA PUBLICADOS) ═══
${volumesBlock}

INSTRUCCIÓN: Produce la biblia de serie consolidada según el formato definido. Solo JSON.`;

    const response = await this.generateContent(prompt);

    let worldBible: SeriesWorldBibleConsolidated;
    try {
      // [Fix136] repairJson ya devuelve el objeto parseado; el JSON.parse
      // extra lo coaccionaba a "[object Object]" y reventaba siempre.
      worldBible = repairJson(response.content);
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

    // [Fix79] Sanitización post-modelo del protagonista único.
    // El prompt obliga a "exactamente 1 protagonista, primer índice, y si hay
    // anchor que sea ese". Si el modelo lo incumple igualmente, lo corregimos
    // aquí antes de persistir para que el Architect/Ghostwriter NUNCA reciban
    // una SWB con 0 ó 2+ protagonistas ni con el anchor degradado a secundario.
    const norm = (s: string) => (s || "").trim().toLowerCase();
    const anchor = input.protagonistAnchor?.trim();

    // (a) Anchor inviolable: si llega, ese es el ÚNICO protagonista — incluso
    // si la lista de personajes vino vacía del modelo (caso fallback de
    // parseo, modelo escaso). La sanitización NO está dentro del check de
    // longitud para garantizar la inyección del anchor SIEMPRE que exista.
    if (anchor) {
      const anchorLower = norm(anchor);
        let anchorChar = worldBible.personajes.find(p => norm(p.nombre) === anchorLower);

        // Coincidencia laxa: el primer nombre del anchor (p.ej. "Iris" en
        // "Iris Vela") aparece como primera palabra del nombre del personaje.
        if (!anchorChar) {
          const anchorFirst = anchorLower.split(/\s+/)[0];
          if (anchorFirst) {
            anchorChar = worldBible.personajes.find(p => {
              const first = norm(p.nombre).split(/\s+/)[0];
              return first === anchorFirst;
            });
          }
        }

        if (!anchorChar) {
          // El modelo olvidó al anchor: lo creamos como mínimo viable y lo
          // anotamos en incoherencias.
          anchorChar = {
            nombre: anchor,
            rol: "protagonista",
            fisico: "",
            edad_o_rango: "",
            profesion_o_ocupacion: "",
            familia_y_relaciones: "",
            voz_y_tics: "",
            motivacion_nuclear: "",
            arco_resumen: "",
            estado_actual: "",
            volumenes_apariciones: [],
          };
          worldBible.personajes.unshift(anchorChar);
          worldBible.incoherencias_detectadas.push(
            `Consolidator: el protagonista oficial "${anchor}" no apareció en la salida del modelo y se ha inyectado como ficha mínima.`,
          );
        } else {
          anchorChar.rol = "protagonista";
        }

        // Degradar a cualquier otro "protagonista" que no sea el anchor.
        for (const p of worldBible.personajes) {
          if (p !== anchorChar && p.rol === "protagonista") {
            p.rol = "secundario_recurrente";
            worldBible.incoherencias_detectadas.push(
              `Consolidator: "${p.nombre}" fue marcado como protagonista por el modelo pero el anchor oficial es "${anchor}". Degradado a secundario_recurrente.`,
            );
          }
        }

      // Llevar el anchor al primer índice.
      const idx = worldBible.personajes.indexOf(anchorChar);
      if (idx > 0) {
        worldBible.personajes.splice(idx, 1);
        worldBible.personajes.unshift(anchorChar);
      }
    } else if (worldBible.personajes.length > 0) {
      // (b) Sin anchor: garantizar exactamente 1 protagonista y que ocupe el
      // primer índice del array (Architect/Ghostwriter leen el primero como
      // referencia visual destacada).
      const protagonistas = worldBible.personajes.filter(p => p.rol === "protagonista");
      let winner: SeriesWorldBibleCharacter | undefined;

      if (protagonistas.length > 1) {
        // El que aparece en más volúmenes gana; empate → el del array primero.
        const ranked = [...protagonistas].sort((a, b) =>
          (b.volumenes_apariciones?.length || 0) - (a.volumenes_apariciones?.length || 0),
        );
        winner = ranked[0];
        for (const p of protagonistas) {
          if (p !== winner) {
            p.rol = "secundario_recurrente";
            worldBible.incoherencias_detectadas.push(
              `Consolidator: degradado "${p.nombre}" de protagonista a secundario_recurrente (solo un protagonista permitido).`,
            );
          }
        }
      } else if (protagonistas.length === 1) {
        winner = protagonistas[0];
      } else {
        // No marcó protagonista: el primer personaje del array hereda el rol.
        winner = worldBible.personajes[0];
        winner.rol = "protagonista";
        worldBible.incoherencias_detectadas.push(
          `Consolidator: el modelo no marcó protagonista; se asignó a "${winner.nombre}" (primer personaje del array).`,
        );
      }

      // Reordenar a índice 0 en todos los casos.
      if (winner) {
        const idx = worldBible.personajes.indexOf(winner);
        if (idx > 0) {
          worldBible.personajes.splice(idx, 1);
          worldBible.personajes.unshift(winner);
        }
      }
    }

    return {
      ...response,
      worldBible,
      raw: response.content,
    };
  }

  /**
   * Devuelve el nombre del personaje con rol "protagonista" (o el primero del
   * array como fallback). Útil para fijar/leer `series.protagonistName`.
   */
  static extractProtagonistName(wb: SeriesWorldBibleConsolidated): string | null {
    if (!wb?.personajes?.length) return null;
    const main = wb.personajes.find(p => p.rol === "protagonista") || wb.personajes[0];
    return main?.nombre?.trim() || null;
  }

  /**
   * Helper estático que renderiza la biblia consolidada como bloque legible
   * para inyectarla en el prompt del Architect y del Ghostwriter.
   */
  static renderForPrompt(wb: SeriesWorldBibleConsolidated): string {
    const lines: string[] = [];

    if (wb.personajes.length > 0) {
      // [Fix79] Destacar al protagonista único antes que al resto.
      const protagonist = wb.personajes.find(p => p.rol === "protagonista") || wb.personajes[0];
      lines.push(`\n🌟 PROTAGONISTA ÚNICO DE LA SERIE 🌟`);
      lines.push(`Nombre EXACTO: ${protagonist.nombre}`);
      lines.push(`La cámara narrativa y el arco vertebrador de la saga PERTENECEN a este personaje.`);
      lines.push(`NO puede ser sustituido, "ascendido a segundo plano" ni reemplazado por un secundario en este nuevo volumen.`);
      if (protagonist.fisico) lines.push(`  Físico: ${protagonist.fisico}`);
      if (protagonist.edad_o_rango) lines.push(`  Edad: ${protagonist.edad_o_rango}`);
      if (protagonist.profesion_o_ocupacion) lines.push(`  Ocupación: ${protagonist.profesion_o_ocupacion}`);
      if (protagonist.familia_y_relaciones) lines.push(`  Familia/relaciones: ${protagonist.familia_y_relaciones}`);
      if (protagonist.voz_y_tics) lines.push(`  Voz: ${protagonist.voz_y_tics}`);
      if (protagonist.motivacion_nuclear) lines.push(`  Motivación: ${protagonist.motivacion_nuclear}`);
      if (protagonist.arco_resumen) lines.push(`  Arco previo: ${protagonist.arco_resumen}`);
      if (protagonist.estado_actual) lines.push(`  Estado al final del último volumen: ${protagonist.estado_actual}`);

      const otros = wb.personajes.filter(p => p !== protagonist);
      if (otros.length > 0) {
        lines.push(`\n── RESTO DE PERSONAJES ESTABLECIDOS (${otros.length}) — NINGUNO puede sustituir al protagonista ──`);
        for (const p of otros) {
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
