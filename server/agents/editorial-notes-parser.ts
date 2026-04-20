import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface EditorialInstruction {
  capitulos_afectados: number[];
  categoria: string;
  descripcion: string;
  instrucciones_correccion: string;
  elementos_a_preservar?: string;
  prioridad?: "alta" | "media" | "baja";
  // Cuando capitulos_afectados.length > 1: rol específico de cada capítulo en el arco multi-capítulo
  plan_por_capitulo?: Record<string, string>;
}

export interface EditorialNotesParseResult {
  resumen_general?: string;
  instrucciones: EditorialInstruction[];
}

interface ChapterIndexEntry {
  numero: number;
  titulo: string;
}

interface ParserInput {
  notas: string;
  chapterIndex: ChapterIndexEntry[];
  projectTitle: string;
}

export class EditorialNotesParser extends BaseAgent {
  constructor() {
    super({
      name: "Analista de Notas Editoriales",
      role: "editorial-notes-parser",
      model: "gemini-2.5-flash",
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 8192,
      systemPrompt: `Eres un analista editorial. Tu tarea es transformar las notas LIBRES de un editor humano sobre un manuscrito en una lista ESTRUCTURADA de instrucciones de corrección quirúrgica, una por cada problema concreto que requiera intervención sobre el texto.

REGLAS:
1. Extrae SOLO problemas que requieran modificar el texto del manuscrito. Ignora elogios, contexto editorial, valoraciones generales o consejos para futuros libros.
2. Para cada problema, identifica los capítulos afectados leyendo el índice de capítulos disponible. Si la nota menciona "capítulo 8" o "Cap. 8", usa el número 8. Si menciona "el prólogo", usa 0. Si menciona "el epílogo", usa -1. Si menciona "nota del autor", usa -2. Si afecta a varios capítulos, lístalos todos.
3. Si la nota es transversal (afecta a varios capítulos consecutivos pero no se especifica cuáles), infiere los más probables a partir del índice (por ejemplo, "el segundo acto" → capítulos centrales).
4. Si NO puedes determinar capítulos concretos para un problema, OMÍTELO de la salida (no incluyas la instrucción).
5. Para cada problema, escribe instrucciones MUY ESPECÍFICAS y accionables: qué cambiar, dónde, cómo. NO copies la nota literal del editor — REFORMÚLALA como una orden quirúrgica para un narrador que va a editar el texto.
6. Indica los elementos a PRESERVAR (qué NO debe tocar el narrador) cuando sea relevante, especialmente cuando el problema es local y el resto del capítulo funciona bien.
7. Categoría: usa una de estas etiquetas en minúscula: "continuidad", "verosimilitud", "personaje", "ritmo", "dialogo", "estilo", "trama", "descripcion", "otro".
8. Prioridad: "alta" para defectos estructurales o de credibilidad, "media" para problemas de ejecución, "baja" para mejoras opcionales.
9. Si una sola nota contiene varios problemas distintos, divídelos en instrucciones separadas.

🔑 CASO ESPECIAL — INSTRUCCIONES MULTI-CAPÍTULO (arcos):
Cuando una corrección se desarrolla A LO LARGO DE VARIOS CAPÍTULOS (ej: "redistribuye la pérdida del cuaderno entre caps 8-10 para que no sea abrupta", "el villano debe aparecer mencionado en caps 3, 5 y 7 antes del encuentro del 9", "acelera el ritmo del segundo acto, caps 7 a 12"), DEBES además rellenar el campo "plan_por_capitulo" con un mini-plan específico por capítulo:
  - La clave es el número del capítulo (como string).
  - El valor describe el ROL CONCRETO que ese capítulo tiene en la corrección global (qué planta, qué desarrolla, qué cierra).
  - Cada capítulo debe tener su propia función — NO repitas la misma instrucción para todos.
  - Esto es OBLIGATORIO siempre que capitulos_afectados.length > 1. Sin "plan_por_capitulo", el sistema NO puede coordinar la reescritura del arco y la corrección fallará.

FORMATO DE SALIDA — ÚNICAMENTE JSON VÁLIDO, SIN PREFIJOS, SIN MARKDOWN:
{
  "resumen_general": "2-3 frases describiendo el veredicto global del editor",
  "instrucciones": [
    {
      "capitulos_afectados": [8],
      "categoria": "verosimilitud",
      "descripcion": "Aparición demasiado providencial de Vasco Carballo en la cripta de Guadalupe.",
      "instrucciones_correccion": "Añade una causa sólida previa: en el capítulo 8, antes de la aparición, intercala 1-2 párrafos donde se justifique cómo Vasco ha llegado hasta allí (pista, intercepción de comunicación, mandato externo). NO cambies la escena del encuentro en sí, solo añade la justificación causal antes.",
      "elementos_a_preservar": "El diálogo del encuentro, la atmósfera de la cripta, las acciones de Lara.",
      "prioridad": "alta"
    },
    {
      "capitulos_afectados": [8, 9, 10],
      "categoria": "ritmo",
      "descripcion": "El paso de la investigación académica al thriller de persecución es abrupto. La pérdida del cuaderno en el cap 8 frustra al lector justo cuando empieza a entender el cifrado.",
      "instrucciones_correccion": "Suaviza la transición distribuyendo la pérdida del cuaderno y la profundización del 'reloj de piedra' a lo largo del arco 8-10, manteniendo intactos los beats narrativos principales.",
      "elementos_a_preservar": "El arco general, los personajes presentes, los giros estructurales mayores.",
      "prioridad": "alta",
      "plan_por_capitulo": {
        "8": "Mantén la pérdida del cuaderno como evento central pero añade que Lara ha fotografiado o transcrito 2-3 páginas clave antes de perderlo. Termina el capítulo con la sensación de que aún tiene 'algo' del cifrado.",
        "9": "Aprovecha esas notas/fotos parciales para que Lara avance en el descifrado del 'reloj de piedra' a partir de fragmentos. La frustración por lo perdido sigue ahí pero hay impulso narrativo.",
        "10": "Llega aquí la complicación real (intuición incompleta, interpretación errónea o pieza faltante crítica). Aquí es donde el arco bascula al thriller, pero ya con el lector enganchado al descifrado parcial."
      }
    }
  ]
}

Si el editor no menciona ningún problema procesable, devuelve {"resumen_general": "...", "instrucciones": []}.`,
    });
  }

  async execute(input: ParserInput): Promise<AgentResponse & { result?: EditorialNotesParseResult }> {
    const indexLines = input.chapterIndex
      .map((c) => {
        let label = `Capítulo ${c.numero}`;
        if (c.numero === 0) label = "Prólogo (0)";
        else if (c.numero === -1) label = "Epílogo (-1)";
        else if (c.numero === -2) label = "Nota del autor (-2)";
        return `  - ${label}: "${c.titulo}"`;
      })
      .join("\n");

    const prompt = `MANUSCRITO: "${input.projectTitle}"

ÍNDICE DE CAPÍTULOS DISPONIBLES (usa estos números exactos en capitulos_afectados):
${indexLines}

═══════════════════════════════════════════════════════════════════
NOTAS DEL EDITOR HUMANO (texto libre):
═══════════════════════════════════════════════════════════════════
${input.notas}
═══════════════════════════════════════════════════════════════════

Extrae las instrucciones de corrección estructuradas. Responde ÚNICAMENTE con el JSON.`;

    const response = await this.generateContent(prompt);

    try {
      const result = repairJson(response.content) as EditorialNotesParseResult;
      if (!result || !Array.isArray(result.instrucciones)) {
        return { ...response, result: { instrucciones: [] } };
      }
      result.instrucciones = result.instrucciones.filter(
        (i) => Array.isArray(i.capitulos_afectados) && i.capitulos_afectados.length > 0 && (i.instrucciones_correccion || i.descripcion)
      );
      return { ...response, result };
    } catch (e) {
      console.error("[EditorialNotesParser] Failed to parse JSON response", e);
      return { ...response, result: { instrucciones: [] } };
    }
  }
}
