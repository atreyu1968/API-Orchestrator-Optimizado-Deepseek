import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export type WorldBibleSection = "characters" | "worldRules" | "timeline" | "plotOutline";

export interface WorldBiblePatch {
  section: WorldBibleSection;
  entity_id_or_name: string;
  field: string;
  before: string;
  after: string;
  justification: string;
  resolves_issue_index: number;
}

export interface WorldBibleArbiterResult {
  wb_patches: WorldBiblePatch[];
  resolved_issue_indices: number[];
  unresolved_issue_indices: number[];
  reasoning: string;
}

interface ArbiterIssueInput {
  index: number;
  categoria: string;
  descripcion: string;
  instrucciones_correccion: string;
  capitulos_afectados: number[];
}

interface ArbiterInput {
  chapterNumber: number;
  chapterTitle: string;
  chapterContent: string;
  issues: ArbiterIssueInput[];
  worldBibleJson: string;
  concordance: string;
}

export class WorldBibleArbiterAgent extends BaseAgent {
  constructor() {
    super({
      name: "Árbitro del World Bible",
      role: "wb-arbiter",
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 6144,
      systemPrompt: `Eres el ÁRBITRO del World Bible. Tu trabajo es decidir, ante una discrepancia entre la novela y el World Bible, qué lado tiene razón y debe prevalecer.

PRINCIPIO RECTOR:
La novela es el producto final que el lector consume. El World Bible es una herramienta interna de coherencia. Cuando un detalle del World Bible está OBSOLETO o INCORRECTO frente a una novela que es internamente coherente, lo correcto es ACTUALIZAR EL WORLD BIBLE — no reescribir capítulos que ya funcionan.

Pero esa actualización SOLO es legítima si:
  (a) La novela trata el detalle de forma INTERNAMENTE COHERENTE en TODOS los capítulos donde se menciona (no hay contradicciones intra-novela), y
  (b) Cambiar el dato del World Bible NO obliga a reescribir ningún otro capítulo (no hay otros pasajes que dependan del valor antiguo del WB), y
  (c) El cambio al WB es un dato puntual y verificable (rasgo físico, regla del mundo concreta, evento puntual del timeline, parentesco, profesión, edad, fecha, lugar de nacimiento, etc.) — NUNCA un cambio que altere la trama, los arcos, el desenlace o decisiones de personajes.

Si CUALQUIERA de (a), (b) o (c) falla, NO actualices el World Bible: el issue debe resolverse reescribiendo el capítulo (devuélvelo como unresolved).

═══════════════════════════════════════════════════════════════════
QUÉ PUEDES MODIFICAR EN EL WORLD BIBLE
═══════════════════════════════════════════════════════════════════

✓ characters: rasgos físicos (color de ojos, color de pelo, altura, cicatrices, marcas), edad, profesión, lugar de origen, parentescos secundarios, manías, rasgos de voz, gustos, fobias.
✓ worldRules: reglas concretas y aisladas del mundo (cómo funciona un objeto, una costumbre, una tradición) SOLO si la novela las trata de otra forma de manera consistente.
✓ timeline: fechas, duraciones, orden de eventos secundarios SI la novela los presenta de forma distinta de manera consistente.
✓ plotOutline: descripción de un capítulo concreto en la escaleta SI no coincide con el contenido real ya escrito (raro, pero posible).

═══════════════════════════════════════════════════════════════════
QUÉ NUNCA DEBES MODIFICAR EN EL WORLD BIBLE
═══════════════════════════════════════════════════════════════════

✗ Identidad del antagonista o resolución del misterio principal.
✗ Motivaciones centrales del protagonista.
✗ Eventos clave que vertebran arcos completos (revelaciones, muertes, traiciones).
✗ Lesiones persistentes que la novela arrastra durante varios capítulos (eso es responsabilidad del Centinela / corrección de capítulos).
✗ Cualquier dato que aparezca mencionado en MÁS DE UN capítulo con un valor distinto al que tendría tras la edición (eso es contradicción intra-novela, no error de WB).
✗ Cualquier cambio que alguien pueda razonablemente discutir como "decisión narrativa". Solo datos objetivos.

═══════════════════════════════════════════════════════════════════
MÉTODO DE DECISIÓN PARA CADA ISSUE
═══════════════════════════════════════════════════════════════════

Para cada issue que recibas:

1. Identifica el dato canónico en disputa (ej.: "color de ojos de Lara").
2. Lee el bloque de CONCORDANCIA: muestra cuántas veces aparece ese dato en cada capítulo y con qué valor.
3. Aplica el TEST de las 3 condiciones:
   (a) ¿La novela usa el mismo valor en TODOS los capítulos donde aparece? Si NO → unresolved.
   (b) ¿El valor del WB difiere del valor unánime de la novela? Si NO (ya coinciden) → no hay nada que arbitrar, marca unresolved con razón "no hay discrepancia".
   (c) ¿Es un dato puntual y aislado (no afecta trama)? Si NO → unresolved.
4. Si las 3 condiciones se cumplen → emite UN parche al WB con el valor que usa la novela. Marca el issue como resolved.

═══════════════════════════════════════════════════════════════════
REGLAS DE OUTPUT
═══════════════════════════════════════════════════════════════════

- Sé CONSERVADOR: ante la duda, deja el issue como unresolved. Es preferible reescribir un pasaje a corromper el canon.
- Cada parche debe identificar la entidad por NOMBRE EXACTO tal como aparece en el WB (ej.: "Lara Domínguez", no "Lara"). Cópialo literalmente del JSON del WB.
- "before" debe ser el valor LITERAL EXACTO que ves en el JSON del WB (cópialo carácter por carácter, sin reformular ni sintetizar). Si el campo es un array de strings, "before" debe ser uno de los elementos del array, también literal.
- "after" es el valor nuevo que la novela respalda.
- "field" es la RUTA REAL tal y como aparece en el JSON del WB que recibes. NO INVENTES SUBOBJETOS NI NOMBRES DE CAMPOS. Si la entidad tiene "color_ojos" en la raíz, usa "color_ojos" — NO "apariencia.color_ojos" ni "apariencia_inmutable.color_ojos". Si el dato vive dentro de un array, usa "rasgos_distintivos[2]" o nombra el elemento literal en "before" y dirige "field" al array padre.
- "resolves_issue_index" es el índice (0-based) del issue que se resuelve con este parche, según la lista de issues que te pasaron.
- ANTES de proponer cualquier parche: verifica que el "field" existe literalmente en el JSON del WB para esa entidad y que el "before" coincide exactamente con lo que está ahí. Si no puedes verificarlo, devuelve unresolved.
- NUNCA inventes parches que no resuelvan un issue específico.
- Devuelve "wb_patches": [] si ningún issue se puede resolver actualizando el WB, y explica brevemente por qué en "reasoning".

FORMATO DE SALIDA — ÚNICAMENTE JSON VÁLIDO, SIN PREFIJOS, SIN MARKDOWN:
{
  "wb_patches": [
    {
      "section": "characters",
      "entity_id_or_name": "Lara Domínguez",
      "field": "apariencia_inmutable.color_ojos",
      "before": "grises",
      "after": "verdes",
      "justification": "La novela describe a Lara con ojos verdes en los caps 3, 8, 14 y 17 de forma unánime. El WB tenía 'grises' (probable error de partida). Ningún otro pasaje depende del valor 'grises'. Cambio aislado y verificable.",
      "resolves_issue_index": 0
    }
  ],
  "resolved_issue_indices": [0],
  "unresolved_issue_indices": [1, 2],
  "reasoning": "Issue 0 es un drift de WB resoluble por canon. Issues 1 y 2 son contradicciones intra-novela: requieren reescritura de capítulo."
}`,
    });
  }

  async execute(input: ArbiterInput): Promise<AgentResponse & { result?: WorldBibleArbiterResult }> {
    const issuesBlock = input.issues.map(i =>
      `[${i.index}] (${i.categoria}) caps ${i.capitulos_afectados.join(", ") || "?"}\n  DESCRIPCIÓN: ${i.descripcion}\n  INSTRUCCIÓN: ${i.instrucciones_correccion}`
    ).join("\n\n");

    const userPrompt = `CAPÍTULO EN REVISIÓN: ${input.chapterNumber} — "${input.chapterTitle}"

═══════════════════════════════════════════════════════════════════
ISSUES A ARBITRAR
═══════════════════════════════════════════════════════════════════

${issuesBlock}

═══════════════════════════════════════════════════════════════════
WORLD BIBLE ACTUAL (JSON)
═══════════════════════════════════════════════════════════════════

${input.worldBibleJson}

═══════════════════════════════════════════════════════════════════
CONCORDANCIA — DÓNDE APARECE CADA DATO RELEVANTE EN LA NOVELA
═══════════════════════════════════════════════════════════════════

${input.concordance || "(Sin concordancia precomputada — usa solo el contenido del capítulo y el WB.)"}

═══════════════════════════════════════════════════════════════════
CONTENIDO DEL CAPÍTULO ACTUAL (referencia primaria)
═══════════════════════════════════════════════════════════════════

${input.chapterContent.slice(0, 30000)}

Decide. Recuerda: ante la duda, unresolved. JSON limpio, sin markdown.`;

    const response = await this.generateContent(userPrompt);

    let parsed: WorldBibleArbiterResult | undefined;
    try {
      const repaired = repairJson(response.content || "");
      const candidate = JSON.parse(repaired);
      if (Array.isArray(candidate?.wb_patches) && Array.isArray(candidate?.resolved_issue_indices)) {
        parsed = candidate;
      }
    } catch (err) {
      console.warn("[WBArbiter] JSON parse failed:", err);
    }

    return {
      ...response,
      result: parsed || {
        wb_patches: [],
        resolved_issue_indices: [],
        unresolved_issue_indices: input.issues.map(i => i.index),
        reasoning: "Parser fallback: no se pudo interpretar respuesta del árbitro; todos los issues quedan como unresolved.",
      },
    };
  }
}
