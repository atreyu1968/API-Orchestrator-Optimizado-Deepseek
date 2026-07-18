import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface PatchOperation {
  find_exact: string;
  replace_with: string;
  justification: string;
}

// [Fix130] Estado de cobertura por instrucción: el cirujano declara, para cada
// instrucción numerada que recibe, si la resolvió, si el capítulo ya la cumplía,
// si no es aplicable como cirugía puntual (requiere reescritura) o si exige una
// siembra previa ausente (anti deus ex machina, Fix129).
export type InstructionCoverageStatus =
  | "aplicada"
  | "ya_cumplida"
  | "requiere_estructural"
  | "siembra_ausente";

export interface InstructionCoverage {
  instruccion: number;
  estado: InstructionCoverageStatus;
  motivo?: string;
}

export interface SurgicalPatchResult {
  operations: PatchOperation[];
  not_applicable_reason?: string;
  // [Fix130] Una entrada por cada instrucción numerada recibida.
  instruction_coverage?: InstructionCoverage[];
}

export interface AppliedPatchReport {
  applied: PatchOperation[];
  failed: Array<{ op: PatchOperation; reason: string }>;
  finalContent: string;
  originalLength: number;
  finalLength: number;
  // [Fix212] Cuantas operaciones se anclaron por el nivel 2 (coincidencia
  // normalizada unica) en vez de por coincidencia literal exacta.
  fuzzyApplied?: number;
}

// [Fix212] Normalizacion tolerante para el anclaje de nivel 2: minusculas,
// sin diacriticos, comillas y guiones tipograficos a rectos, espacios colapsados.
// Devuelve el texto normalizado Y un mapa indice-normalizado -> indice-original
// para poder aplicar el parche sobre el TEXTO REAL en la posicion correcta.
function normalizeWithIndexMap(s: string): { norm: string; map: number[] } {
  const normChars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const raw = s[i];
    let ch = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    ch = ch
      .replace(/[«»\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u2013\u2014\u2015\u2012]/g, "-")
      .replace(/\u2026/g, "...");
    if (/\s/.test(raw)) {
      // Colapsa cualquier secuencia de espacios/saltos en UN espacio.
      if (normChars.length > 0 && normChars[normChars.length - 1] === " ") continue;
      normChars.push(" ");
      map.push(i);
      continue;
    }
    for (const c of ch) {
      normChars.push(c);
      map.push(i);
    }
  }
  return { norm: normChars.join(""), map };
}

// [Fix212] Normaliza un ancla con las mismas reglas (sin mapa) y recorta extremos.
function normalizeAnchor(s: string): string {
  return normalizeWithIndexMap(s).norm.trim();
}

interface PatcherInput {
  chapterNumber: number;
  chapterTitle: string;
  originalContent: string;
  instructions: string;
  worldBibleContext?: string;
  // [Fix129] Extractos SOLO-LECTURA de capítulos vecinos / de siembra para
  // verificar coherencia y siembra previa (anti deus ex machina). NO editables.
  referenceChapters?: string;
  // [Fix130] Número de instrucciones numeradas que se envían, para exigir una
  // entrada de cobertura por cada una.
  instructionCount?: number;
}

export class SurgicalPatcherAgent extends BaseAgent {
  constructor() {
    super({
      name: "Cirujano de Texto",
      role: "surgical-patcher",
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 8192,
      systemPrompt: `Eres un cirujano de texto. Tu trabajo es aplicar correcciones EXTREMADAMENTE LOCALIZADAS a un capítulo de novela respondiendo con una lista de operaciones find/replace que un programa aplicará de forma determinista.

REGLAS INVIOLABLES:
1. Por cada operación, "find_exact" debe ser una cadena que aparezca LITERAL Y EXACTAMENTE en el capítulo original (mismas comillas, mismos espacios, misma puntuación, mismas mayúsculas). Si dudas, copia y pega del original.
2. "find_exact" debe ser ÚNICO en el capítulo. Si la frase aparece varias veces, INCLUYE suficiente contexto previo y posterior para que solo coincida con la ocurrencia que quieres modificar.
3. "find_exact" debe ser lo MÁS CORTO POSIBLE manteniendo unicidad: nunca incluyas párrafos enteros si basta con una frase.
4. "replace_with" contiene EXACTAMENTE el texto sustituto. Puede ser:
   - Una versión corregida de la frase original (lo habitual).
   - Texto nuevo que se inserta junto al original (entonces "replace_with" debe contener el original + lo nuevo).
   - Una cadena vacía si quieres eliminar el fragmento (poco habitual).
5. NO toques nada que no esté DIRECTAMENTE implicado en las instrucciones. Ningún cambio "de paso", ninguna mejora estilística colateral.
6. NO añadas información, eventos, personajes ni detalles que no estuvieran ya implícitos.
7. PROHIBIDO devolver el capítulo entero como find_exact ni hacer una operación que abarque más del 15% del texto. Si una sola corrección requiere reescribir más del 15%, devuelve "operations": [] y rellena "not_applicable_reason" explicando por qué la instrucción es estructural y no puntual.
8. Si una instrucción no se puede traducir a operaciones puntuales (por ejemplo: "haz que el desenlace sea menos idealista"), devuelve "operations": [] y "not_applicable_reason".
9. Cada operación debe tener una "justification" breve indicando qué instrucción resuelve.
10. Si el original ya cumple lo que pide la instrucción, devuelve "operations": [].
11. PROHIBIDO contradecir el WORLD BIBLE. Si la instrucción te empuja a introducir un dato que choca con la canon (nombre, edad, ubicación, parentesco, regla del mundo, evento previo, motivación de personaje, cronología, etc.), NO la apliques: omite esa operación o, si toda la instrucción depende de violar la canon, devuelve "operations": [] con "not_applicable_reason" explicando qué hecho del World Bible se vería violado. Tu replace_with siempre debe ser COMPATIBLE con cada hecho del World Bible que se te ha pasado.
12. PROHIBIDO ABSOLUTO mencionar la estructura del libro dentro del replace_with. La novela NO sabe que es una novela. NUNCA introduzcas frases como "como ocurrió en el Capítulo 3", "ya vimos en el prólogo", "tal y como se contó en el cap. 7", "en el epílogo", "en la primera parte", ni ninguna referencia a números de capítulo, partes, secciones o divisiones del manuscrito. Si necesitas evocar algo que pasó antes en la historia, usa SIEMPRE referencias narrativas internas a la ficción (lugares, personajes, fechas, sucesos: "aquella noche en la cripta", "lo que descubrió en Plasencia", "la última conversación con Vasco"). Si la instrucción del editor menciona números de capítulo como referencia, tradúcelos a esa forma diegética; nunca los copies tal cual al texto.
13. [Fix129] ANTI DEUS EX MACHINA. Si se te entregan CAPÍTULOS DE REFERENCIA (solo lectura), úsalos para verificar coherencia con lo que pasa antes y después. Son SOLO contexto: NUNCA generes operaciones sobre ellos ni copies su texto a este capítulo. Si una instrucción te pide RESOLVER un conflicto, INTRODUCIR un aliado/objeto/poder/revelación decisivos, o CERRAR una trama, y la SIEMBRA que lo haría verosímil (pista, presencia previa, causa) NO aparece ni en este capítulo ni en los de referencia, NO inventes la resolución: no produzcas esa operación y declara esa instrucción como "siembra_ausente" en "instruction_coverage", explicando qué siembra falta y en qué capítulo previo debería estar. Resolver sin siembra crea un deus ex machina y está PROHIBIDO.
14. [Fix130] COBERTURA OBLIGATORIA. Recibirás N instrucciones numeradas (1..N). DEBES devolver el array "instruction_coverage" con EXACTAMENTE una entrada por cada instrucción, indicando su "estado": "aplicada" (generaste operación(es) que la resuelven), "ya_cumplida" (el capítulo ya la satisface, sin cambios), "requiere_estructural" (no se puede como cirugía puntual, necesita reescritura del capítulo) o "siembra_ausente" (regla 13). No omitas ninguna instrucción del array, aunque no generes operaciones para ella. El campo "justification" de cada operación debe empezar por el número de la instrucción que resuelve (ej: "2: ...").

FORMATO DE SALIDA — ÚNICAMENTE JSON VÁLIDO, SIN PREFIJOS, SIN MARKDOWN:
{
  "operations": [
    {
      "find_exact": "Vasco apareció en el umbral de la cripta sin previo aviso.",
      "replace_with": "Vasco apareció en el umbral de la cripta. Lara comprendió tarde que la nota interceptada en Plasencia era el mapa que él había seguido.",
      "justification": "1: Resuelve la verosimilitud de la aparición añadiendo la causa previa señalada por el editor."
    }
  ],
  "instruction_coverage": [
    { "instruccion": 1, "estado": "aplicada" },
    { "instruccion": 2, "estado": "requiere_estructural", "motivo": "Pide replantear todo el clímax: no es puntual." }
  ]
}

O bien, si no se puede ninguna:
{
  "operations": [],
  "instruction_coverage": [
    { "instruccion": 1, "estado": "requiere_estructural", "motivo": "La instrucción pide replantear el clímax entero del capítulo." }
  ],
  "not_applicable_reason": "La instrucción pide replantear el clímax entero del capítulo: requiere reescritura estructural, no parches puntuales."
}`,
    });
  }

  async execute(input: PatcherInput): Promise<AgentResponse & { result?: SurgicalPatchResult }> {
    const worldBibleBlock = input.worldBibleContext && input.worldBibleContext.trim().length > 0
      ? `═══════════════════════════════════════════════════════════════════
WORLD BIBLE — CANON INVIOLABLE (cualquier replace_with debe ser compatible con todo lo siguiente):
═══════════════════════════════════════════════════════════════════
${input.worldBibleContext}
═══════════════════════════════════════════════════════════════════

`
      : "";

    // [Fix129] Bloque SOLO-LECTURA de capítulos de referencia (vecinos / siembra).
    const referenceBlock = input.referenceChapters && input.referenceChapters.trim().length > 0
      ? `═══════════════════════════════════════════════════════════════════
CAPÍTULOS DE REFERENCIA — SOLO LECTURA (NO los edites, NO copies su texto; úsalos
para verificar coherencia y SIEMBRA previa: regla 13 anti deus ex machina):
═══════════════════════════════════════════════════════════════════
${input.referenceChapters}
═══════════════════════════════════════════════════════════════════

`
      : "";

    // [Fix130] Recordatorio del número de instrucciones para exigir cobertura completa.
    const coverageReminder = input.instructionCount && input.instructionCount > 0
      ? `\n\nRecibes ${input.instructionCount} instrucción(es) numerada(s). Devuelve "instruction_coverage" con EXACTAMENTE ${input.instructionCount} entrada(s), una por cada instrucción (regla 14).`
      : "";

    const prompt = `CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"

${worldBibleBlock}${referenceBlock}═══════════════════════════════════════════════════════════════════
TEXTO ORIGINAL DEL CAPÍTULO (no lo modifiques fuera de las operaciones que devuelvas):
═══════════════════════════════════════════════════════════════════
${input.originalContent}
═══════════════════════════════════════════════════════════════════

INSTRUCCIONES EDITORIALES A APLICAR (todas):
${input.instructions}${coverageReminder}

Devuelve ÚNICAMENTE el JSON con las operaciones find/replace que resuelvan estas instrucciones. Recuerda: "find_exact" debe ser COPIADO LITERAL del texto original arriba (NUNCA de los capítulos de referencia), y cada "replace_with" debe respetar el WORLD BIBLE al 100%.`;

    const response = await this.generateContent(prompt);

    try {
      const result = repairJson(response.content) as SurgicalPatchResult;
      if (!result || !Array.isArray(result.operations)) {
        return { ...response, result: { operations: [] } };
      }
      result.operations = result.operations.filter(
        (op) => typeof op.find_exact === "string" && op.find_exact.length > 0 && typeof op.replace_with === "string"
      );
      // [Fix130] Saneamiento del array de cobertura.
      if (Array.isArray(result.instruction_coverage)) {
        result.instruction_coverage = result.instruction_coverage
          .filter((c) => c && typeof (c as any).instruccion === "number" && typeof (c as any).estado === "string")
          .map((c) => ({
            instruccion: (c as any).instruccion,
            estado: (c as any).estado,
            motivo: typeof (c as any).motivo === "string" ? (c as any).motivo : undefined,
          }));
      } else {
        result.instruction_coverage = undefined;
      }
      return { ...response, result };
    } catch (e) {
      console.error("[SurgicalPatcher] Failed to parse JSON response", e);
      return { ...response, result: { operations: [] } };
    }
  }

  /**
   * Aplica las operaciones find/replace de forma determinista al texto original.
   * Una operación falla si "find_exact" no aparece literal o aparece más de una vez.
   * Devuelve las aplicadas, las fallidas y el texto resultante.
   */
  applyOperations(originalContent: string, operations: PatchOperation[]): AppliedPatchReport {
    const applied: PatchOperation[] = [];
    const failed: Array<{ op: PatchOperation; reason: string }> = [];
    let working = originalContent;
    let fuzzyApplied = 0;

    for (const op of operations) {
      const idx = working.indexOf(op.find_exact);
      if (idx !== -1) {
        const lastIdx = working.lastIndexOf(op.find_exact);
        if (lastIdx !== idx) {
          failed.push({ op, reason: "find_exact aparece varias veces (ambiguo)" });
          continue;
        }
        working = working.substring(0, idx) + op.replace_with + working.substring(idx + op.find_exact.length);
        applied.push(op);
        continue;
      }

      // [Fix212] NIVEL 2: el ancla no aparece literal (tildes, comillas
      // tipograficas, guiones o espacios distintos). Se normalizan ancla y
      // capitulo con las mismas reglas; si la coincidencia normalizada es
      // UNICA, se aplica el parche sobre el TEXTO REAL en esa posicion.
      // 0 o >1 coincidencias -> descartada como antes.
      const anchor = normalizeAnchor(op.find_exact);
      if (anchor.length < 8) {
        failed.push({ op, reason: "find_exact no aparece literal en el capítulo" });
        continue;
      }
      const { norm, map } = normalizeWithIndexMap(working);
      const nIdx = norm.indexOf(anchor);
      if (nIdx === -1) {
        failed.push({ op, reason: "find_exact no aparece literal en el capítulo" });
        continue;
      }
      if (norm.indexOf(anchor, nIdx + 1) !== -1) {
        failed.push({ op, reason: "find_exact aparece varias veces (ambiguo, coincidencia normalizada)" });
        continue;
      }
      const origStart = map[nIdx];
      const origEnd = map[nIdx + anchor.length - 1] + 1;
      if (origStart === undefined || map[nIdx + anchor.length - 1] === undefined || origEnd <= origStart) {
        failed.push({ op, reason: "find_exact no aparece literal en el capítulo" });
        continue;
      }
      working = working.substring(0, origStart) + op.replace_with + working.substring(origEnd);
      applied.push(op);
      fuzzyApplied++;
    }

    return {
      applied,
      failed,
      finalContent: working,
      originalLength: originalContent.length,
      finalLength: working.length,
      fuzzyApplied,
    };
  }
}
