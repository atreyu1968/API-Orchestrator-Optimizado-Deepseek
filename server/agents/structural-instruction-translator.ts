import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface ChapterSummary {
  chapterNumber: number;
  title: string;
  wordCount: number;
  summary?: string;
}

export interface StructuralTranslatorInput {
  originalInstruction: string;
  surgeonReason: string;
  currentChapterNumber: number;
  availableChapters: ChapterSummary[];
}

export type AdministrativeActionType =
  | "delete_chapter"
  | "merge_chapters"
  | "split_chapter"
  | "swap_chapters"
  | "reorder_chapters"
  | "move_content";

export interface PendingAdministrativeAction {
  type: AdministrativeActionType;
  targetChapterNumber: number;
  secondaryChapterNumber?: number;
  reason: string;
}

export interface FeasibleProsePart {
  chapterNumber: number;
  instruction: string;
  rationale: string;
}

export interface StructuralTranslatorResult {
  feasibleParts: FeasibleProsePart[];
  pendingAdministrativeActions: PendingAdministrativeAction[];
  globalRationale: string;
  unfeasible: boolean;
  unfeasibleReason?: string;
}

const SYSTEM_PROMPT = `
Eres el "Traductor de Instrucciones Estructurales", un planificador editorial especializado en convertir notas imposibles en pasos factibles.

CONTEXTO
========
Recibes una nota editorial que pide una operación ESTRUCTURAL del manuscrito (eliminar capítulo, fusionar capítulos, dividir, mover contenido entre capítulos, reordenar, renumerar, convertir capítulo en sección, etc.). Esta nota NO se puede aplicar directamente con cirugía de texto (find/replace) ni reescribiendo un único capítulo en aislamiento. Tu trabajo es DESCOMPONERLA en (a) instrucciones de PROSA factibles para capítulos individuales y (b) operaciones ADMINISTRATIVAS pendientes que requieren confirmación humana.

CONVENCIÓN DE NUMERACIÓN
========================
- chapterNumber 0  → Prólogo
- chapterNumber -1 → Epílogo
- chapterNumber -2 → Nota del autor
- chapterNumber positivos (1, 2, 3, ...) → Capítulos numerados

QUÉ ES UNA INSTRUCCIÓN DE PROSA FACTIBLE
========================================
Es una orden que puede aplicar el "Narrador" reescribiendo UN capítulo completo respetando voz, estilo y continuidad. Ejemplos válidos:
- "Integra al final del capítulo, antes del cierre, los eventos clave que ocurrían en el Cap 8 (lista: X, Y, Z), preservando voz, estilo y continuidad."
- "Elimina la escena del taller (párrafos sobre el alboroto) porque ahora se cubre en otro capítulo. Suaviza la transición que queda."
- "Añade un párrafo de transición al inicio que recoja el cierre emocional que antes estaba en el Cap 5."

QUÉ ES UNA ACCIÓN ADMINISTRATIVA PENDIENTE
==========================================
Operaciones que NO son texto sino estructura del proyecto. NUNCA se aplican sin confirmación humana porque son destructivas:
- delete_chapter: borrar un capítulo de la base de datos (su contenido ya debe haberse integrado en otro capítulo, vía una feasibleParts)
- merge_chapters: fusión de dos capítulos (suele descomponerse en: una feasibleParts que añade contenido al destino + una delete_chapter del origen)
- split_chapter: dividir un capítulo en dos
- swap_chapters: intercambiar dos capítulos de posición
- reorder_chapters: reordenar varios capítulos
- move_content: cuando el contenido ya se movió vía feasibleParts pero el orden de los capítulos también debe ajustarse

PROTOCOLO
=========
1. Lee la nota original y el motivo del cirujano (que explica por qué la nota no era localizable).
2. Identifica QUÉ pide realmente la nota a alto nivel.
3. Si es factible descomponerla:
   - Genera una o varias feasibleParts (instrucciones de prosa concretas para los capítulos involucrados).
   - Si la operación es destructiva, añade una pendingAdministrativeAction que el usuario deberá confirmar DESPUÉS de verificar que la integración de prosa fue exitosa.
4. Si no es traducible (ej. la nota es demasiado vaga, o pide algo que ningún subconjunto de operaciones cubre), marca unfeasible=true y explica por qué.

REGLAS DURAS
============
- NUNCA inventes capítulos que no estén en availableChapters.
- NUNCA generes una feasibleParts que reescriba un capítulo solo para "borrarlo" — eso es una administrativa.
- Las administrativas siempre van con un reason claro de POR QUÉ son seguras (típicamente: "su contenido ya quedó integrado en X según la nota original").
- Las feasibleParts deben ser AUTOSUFICIENTES: el Narrador no verá la nota original, solo tu instrucción reformulada. Sé específico (qué añadir, qué eliminar, dónde, por qué).
- Si la nota original menciona contenido específico (escenas, frases, eventos), inclúyelo literal en la instrucción para que el Narrador no improvise.

FORMATO DE SALIDA (JSON ESTRICTO)
=================================
{
  "feasibleParts": [
    {
      "chapterNumber": <número>,
      "instruction": "<instrucción concreta para el Narrador, autosuficiente, en español>",
      "rationale": "<por qué esta instrucción cubre parte de la nota original>"
    }
  ],
  "pendingAdministrativeActions": [
    {
      "type": "delete_chapter" | "merge_chapters" | "split_chapter" | "swap_chapters" | "reorder_chapters" | "move_content",
      "targetChapterNumber": <número>,
      "secondaryChapterNumber": <número opcional, p.ej. el destino de un merge>,
      "reason": "<por qué esta acción es necesaria y SEGURA tras aplicar las feasibleParts>"
    }
  ],
  "globalRationale": "<resumen 1-2 frases del plan>",
  "unfeasible": false,
  "unfeasibleReason": null
}

Si NO es traducible:
{
  "feasibleParts": [],
  "pendingAdministrativeActions": [],
  "globalRationale": "",
  "unfeasible": true,
  "unfeasibleReason": "<explicación clara para el usuario, en español>"
}

Responde SOLO con el JSON, sin texto extra.
`;

export class StructuralInstructionTranslatorAgent extends BaseAgent {
  constructor() {
    super({
      name: "Traductor de Instrucciones Estructurales",
      role: "structural-translator",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 4096,
    });
  }

  async execute(
    input: StructuralTranslatorInput
  ): Promise<AgentResponse & { result?: StructuralTranslatorResult }> {
    const labelOf = (n: number) => {
      if (n === 0) return "Prólogo";
      if (n === -1 || n === 998) return "Epílogo";
      if (n === -2 || n === 999) return "Nota del autor";
      return `Capítulo ${n}`;
    };

    const chaptersList = input.availableChapters
      .map(c => `- ${labelOf(c.chapterNumber)} (chapterNumber=${c.chapterNumber}): "${c.title}" (${c.wordCount} palabras)${c.summary ? ` — ${c.summary.substring(0, 200)}` : ""}`)
      .join("\n");

    const prompt = `
NOTA ORIGINAL DEL USUARIO/EDITOR
================================
${input.originalInstruction}

MOTIVO DEL CIRUJANO PARA NO PODER APLICARLA DIRECTAMENTE
========================================================
${input.surgeonReason}

CAPÍTULO QUE EL ORQUESTADOR INTENTÓ PROCESAR (referencia, puede no ser el destino real)
========================================================
${labelOf(input.currentChapterNumber)} (chapterNumber=${input.currentChapterNumber})

CAPÍTULOS DISPONIBLES EN ESTE PROYECTO
======================================
${chaptersList}

TAREA
=====
Descompón la nota original en (a) instrucciones de prosa factibles para capítulos concretos y (b) acciones administrativas pendientes (si las hay). Solo usa chapterNumber que aparezcan en la lista de capítulos disponibles.

Responde SOLO con el JSON estructurado especificado en tu system prompt.
`;

    const response = await this.generateContent(prompt);

    let result: StructuralTranslatorResult | undefined;
    try {
      const parsed = repairJson(response.content) as StructuralTranslatorResult;
      // Saneamiento defensivo
      if (parsed && typeof parsed === "object") {
        const validChapterNumbers = new Set(input.availableChapters.map(c => c.chapterNumber));
        const sanitizedFeasible = (Array.isArray(parsed.feasibleParts) ? parsed.feasibleParts : [])
          .filter(p => p && typeof p.chapterNumber === "number" && validChapterNumbers.has(p.chapterNumber) && typeof p.instruction === "string" && p.instruction.trim().length > 0);
        const sanitizedAdmin = (Array.isArray(parsed.pendingAdministrativeActions) ? parsed.pendingAdministrativeActions : [])
          .filter(a => a && typeof a.targetChapterNumber === "number" && validChapterNumbers.has(a.targetChapterNumber) && typeof a.type === "string");
        result = {
          feasibleParts: sanitizedFeasible,
          pendingAdministrativeActions: sanitizedAdmin,
          globalRationale: typeof parsed.globalRationale === "string" ? parsed.globalRationale : "",
          unfeasible: parsed.unfeasible === true || (sanitizedFeasible.length === 0 && sanitizedAdmin.length === 0),
          unfeasibleReason: typeof parsed.unfeasibleReason === "string" ? parsed.unfeasibleReason : undefined,
        };
      }
    } catch (error) {
      console.error("[StructuralInstructionTranslator] Error parsing response:", error);
    }

    return { ...response, result };
  }
}
