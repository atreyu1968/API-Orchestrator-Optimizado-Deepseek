import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface EditorialInstruction {
  capitulos_afectados: number[];
  categoria: string;
  descripcion: string;
  instrucciones_correccion: string;
  elementos_a_preservar?: string;
  prioridad?: "alta" | "media" | "baja";
  // "puntual": resoluble con find/replace localizados (cirugía de texto sin tocar el resto).
  // "estructural": requiere reescribir párrafos/escenas enteras (cae en el flujo de reescritura completa).
  tipo?: "puntual" | "estructural";
  // Cuando capitulos_afectados.length > 1: rol específico de cada capítulo en el arco multi-capítulo
  plan_por_capitulo?: Record<string, string>;
}

export interface EditorialNotesParseResult {
  resumen_general?: string;
  instrucciones: EditorialInstruction[];
}

export interface DroppedInstruction {
  descripcion: string;
  capitulos_afectados: number[];
  motivo: string;
}

export interface RefineResult {
  refined: EditorialInstruction[];
  dropped: DroppedInstruction[];
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

interface RefinerInput {
  projectTitle: string;
  originalNotes: string;
  draftInstructions: EditorialInstruction[];
  chapterContents: Array<{ numero: number; titulo: string; content: string }>;
  worldBibleContext: string;
}

export class EditorialNotesParser extends BaseAgent {
  constructor() {
    super({
      name: "Analista de Notas Editoriales",
      role: "editorial-notes-parser",
      model: "deepseek-v4-flash",
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
10. TIPO (CAMPO CRÍTICO): clasifica cada instrucción como:
   - "puntual": se resuelve modificando frases o párrafos concretos sin alterar la arquitectura del capítulo. Ejemplos: "añadir 1-2 párrafos justificando la aparición", "eliminar la mención al cuchillo", "corregir el color de los ojos", "reformular el diálogo del minuto 3 para que no parezca casual".
   - "estructural": requiere reescribir escenas enteras, reordenar la secuencia, cambiar el tono global del clímax o redistribuir material entre capítulos. Ejemplos: "haz que el desenlace sea menos idealista", "el segundo acto necesita otro ritmo", "el final debe ser fruto de una negociación, no de armonía espontánea".
   Sé RIGUROSO: si dudas, marca como "estructural". Las puntuales se aplican como cirugía determinista; las estructurales requieren reescritura completa del capítulo (más caras y arriesgadas).

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
      "prioridad": "alta",
      "tipo": "puntual"
    },
    {
      "capitulos_afectados": [8, 9, 10],
      "categoria": "ritmo",
      "descripcion": "El paso de la investigación académica al thriller de persecución es abrupto. La pérdida del cuaderno en el cap 8 frustra al lector justo cuando empieza a entender el cifrado.",
      "instrucciones_correccion": "Suaviza la transición distribuyendo la pérdida del cuaderno y la profundización del 'reloj de piedra' a lo largo del arco 8-10, manteniendo intactos los beats narrativos principales.",
      "elementos_a_preservar": "El arco general, los personajes presentes, los giros estructurales mayores.",
      "prioridad": "alta",
      "tipo": "estructural",
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

  /**
   * SEGUNDA PASADA — Anclaje contra contenido real y canon.
   *
   * El primer parser (execute) trabaja solo con las notas + el índice de capítulos.
   * Eso permite que invente citas, frases o personajes que no existen ("modifica
   * la frase X" cuando X no aparece, "introduce a Clara Rojas" cuando no está en
   * el World Bible). Este método toma esos borradores y los anclaje contra el
   * texto real de los capítulos afectados y la canon. Devuelve:
   *  - refined: instrucciones con citas reales del texto y compatibles con la canon.
   *  - dropped: instrucciones que se descartan porque no se pueden anclar (con motivo).
   */
  async refineWithContext(input: RefinerInput): Promise<AgentResponse & { result?: RefineResult }> {
    if (!input.draftInstructions || input.draftInstructions.length === 0) {
      return { content: "", result: { refined: [], dropped: [] } };
    }

    const chapterBlocks = input.chapterContents.map(c => {
      const label = c.numero === 0 ? "Prólogo (0)"
        : c.numero === -1 ? "Epílogo (-1)"
        : c.numero === -2 ? "Nota del autor (-2)"
        : `Capítulo ${c.numero}`;
      return `─── ${label} — "${c.titulo}" ───\n${c.content}\n─── FIN ${label} ───`;
    }).join("\n\n");

    const draftJson = JSON.stringify(input.draftInstructions, null, 2);

    const wbBlock = input.worldBibleContext && input.worldBibleContext.trim().length > 0
      ? `\n═══════════════════════════════════════════════════════════════════\nWORLD BIBLE — CANON INVIOLABLE:\n═══════════════════════════════════════════════════════════════════\n${input.worldBibleContext}\n═══════════════════════════════════════════════════════════════════\n`
      : "";

    const refinerSystemPrompt = `Eres un editor jefe que VERIFICA Y AFINA instrucciones de corrección antes de pasarlas a los narradores. Recibes:
  (a) las notas LIBRES del editor humano,
  (b) un BORRADOR de instrucciones quirúrgicas extraído por un primer analista,
  (c) el TEXTO REAL de los capítulos afectados,
  (d) el WORLD BIBLE (canon inviolable).

Tu tarea: producir instrucciones GROUNDED — ancladas en lo que el texto realmente dice y en lo que la canon permite. El primer analista trabajó solo con el índice de títulos y puede haber inventado frases o pedido cosas que contradicen la canon. Tú tienes el texto delante. Corrige, refina, descarta.

REGLAS DE REFINAMIENTO:
1. Para cada instrucción del borrador, COMPRUEBA contra el texto real del capítulo o capítulos:
   - Si cita una frase concreta a modificar y esa frase NO aparece literal en el capítulo → REESCRIBE la instrucción para que cite una frase real (busca el equivalente más cercano en el texto), o si la situación que se quiere corregir directamente no existe en el capítulo → DESCARTA la instrucción.
   - Si pide añadir un evento que ya está en el texto → DESCARTA (ya cumplido).
   - Si pide modificar algo que el texto resuelve de otra forma → REESCRIBE la instrucción para que sea coherente con lo que está escrito.
2. CONTRA EL WORLD BIBLE:
   - Si la instrucción exige introducir un personaje, lugar, evento, regla o relación que NO aparece en el World Bible y NO aparece en el texto → DESCARTA con motivo "violaría la canon: [hecho]".
   - Si la instrucción pide cambiar un dato que el World Bible fija como canónico (nombre, edad, parentesco, regla del mundo, motivación de personaje, cronología) → DESCARTA.
   - Si solo una parte de la instrucción es incompatible → REESCRIBE conservando lo viable y eliminando la parte canon-rompedora.
3. AFINAMIENTO POSITIVO: cuando una instrucción sí es viable, mejórala incluyendo:
   - Citas literales del texto (entre comillas) cuando ayuden a localizar el cambio.
   - Indicación clara de elementos a preservar tomada del propio capítulo.
   - Reclasificación tipo "puntual" / "estructural" según lo que ahora ves en el texto (si es un retoque a una frase, es puntual; si requiere reescribir varias escenas, es estructural).
4. NO añadas instrucciones nuevas que el editor humano no pidió. Solo refinas o descartas las del borrador.
5. Conserva los campos: capitulos_afectados, categoria, descripcion, instrucciones_correccion, elementos_a_preservar (mejorado), prioridad, tipo, plan_por_capitulo (si aplica).
6. Para cada instrucción descartada, registra: descripcion (breve), capitulos_afectados, motivo (frase concreta del porqué).

FORMATO DE SALIDA — ÚNICAMENTE JSON VÁLIDO, SIN PREFIJOS, SIN MARKDOWN:
{
  "refined": [ { ...instrucción afinada... } ],
  "dropped": [ { "descripcion": "...", "capitulos_afectados": [n], "motivo": "..." } ]
}`;

    const refinerPrompt = `MANUSCRITO: "${input.projectTitle}"
${wbBlock}
═══════════════════════════════════════════════════════════════════
NOTAS DEL EDITOR HUMANO (para contexto):
═══════════════════════════════════════════════════════════════════
${input.originalNotes}
═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════
BORRADOR DE INSTRUCCIONES A VERIFICAR/AFINAR:
═══════════════════════════════════════════════════════════════════
${draftJson}
═══════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════
TEXTO REAL DE LOS CAPÍTULOS AFECTADOS (anclaje obligatorio):
═══════════════════════════════════════════════════════════════════
${chapterBlocks}
═══════════════════════════════════════════════════════════════════

Devuelve ÚNICAMENTE el JSON con "refined" y "dropped".`;

    // Reutilizamos el modelo del propio analista pero con un system prompt distinto:
    // hacemos una llamada one-off insertando el system prompt al inicio del user prompt.
    const fullPrompt = `${refinerSystemPrompt}\n\n${refinerPrompt}`;
    const response = await this.generateContent(fullPrompt);

    try {
      const parsed = repairJson(response.content) as RefineResult;
      const refined = Array.isArray(parsed?.refined) ? parsed.refined.filter(
        (i: any) => Array.isArray(i.capitulos_afectados) && i.capitulos_afectados.length > 0 && (i.instrucciones_correccion || i.descripcion)
      ) : [];
      const dropped = Array.isArray(parsed?.dropped) ? parsed.dropped.filter(
        (d: any) => d && typeof d === "object" && d.motivo
      ) : [];
      return { ...response, result: { refined, dropped } };
    } catch (e) {
      console.error("[EditorialNotesParser.refineWithContext] Failed to parse JSON response", e);
      // Si el refinamiento falla, devolvemos los borradores tal cual para no bloquear.
      return { ...response, result: { refined: input.draftInstructions, dropped: [] } };
    }
  }
}
