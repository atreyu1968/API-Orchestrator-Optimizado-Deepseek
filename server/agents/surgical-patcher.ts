import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface PatchOperation {
  find_exact: string;
  replace_with: string;
  justification: string;
}

export interface SurgicalPatchResult {
  operations: PatchOperation[];
  not_applicable_reason?: string;
}

export interface AppliedPatchReport {
  applied: PatchOperation[];
  failed: Array<{ op: PatchOperation; reason: string }>;
  finalContent: string;
  originalLength: number;
  finalLength: number;
}

interface PatcherInput {
  chapterNumber: number;
  chapterTitle: string;
  originalContent: string;
  instructions: string;
  worldBibleContext?: string;
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

FORMATO DE SALIDA — ÚNICAMENTE JSON VÁLIDO, SIN PREFIJOS, SIN MARKDOWN:
{
  "operations": [
    {
      "find_exact": "Vasco apareció en el umbral de la cripta sin previo aviso.",
      "replace_with": "Vasco apareció en el umbral de la cripta. Lara comprendió tarde que la nota interceptada en Plasencia era el mapa que él había seguido.",
      "justification": "Resuelve la verosimilitud de la aparición añadiendo la causa previa señalada por el editor."
    }
  ]
}

O bien, si no se puede:
{
  "operations": [],
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

    const prompt = `CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"

${worldBibleBlock}═══════════════════════════════════════════════════════════════════
TEXTO ORIGINAL DEL CAPÍTULO (no lo modifiques fuera de las operaciones que devuelvas):
═══════════════════════════════════════════════════════════════════
${input.originalContent}
═══════════════════════════════════════════════════════════════════

INSTRUCCIONES EDITORIALES A APLICAR (todas):
${input.instructions}

Devuelve ÚNICAMENTE el JSON con las operaciones find/replace que resuelvan estas instrucciones. Recuerda: "find_exact" debe ser COPIADO LITERAL del texto original arriba, y cada "replace_with" debe respetar el WORLD BIBLE al 100%.`;

    const response = await this.generateContent(prompt);

    try {
      const result = repairJson(response.content) as SurgicalPatchResult;
      if (!result || !Array.isArray(result.operations)) {
        return { ...response, result: { operations: [] } };
      }
      result.operations = result.operations.filter(
        (op) => typeof op.find_exact === "string" && op.find_exact.length > 0 && typeof op.replace_with === "string"
      );
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

    for (const op of operations) {
      const idx = working.indexOf(op.find_exact);
      if (idx === -1) {
        failed.push({ op, reason: "find_exact no aparece literal en el capítulo" });
        continue;
      }
      const lastIdx = working.lastIndexOf(op.find_exact);
      if (lastIdx !== idx) {
        failed.push({ op, reason: "find_exact aparece varias veces (ambiguo)" });
        continue;
      }
      working = working.substring(0, idx) + op.replace_with + working.substring(idx + op.find_exact.length);
      applied.push(op);
    }

    return {
      applied,
      failed,
      finalContent: working,
      originalLength: originalContent.length,
      finalLength: working.length,
    };
  }
}
