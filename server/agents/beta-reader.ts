import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { extractStyleDirectives } from "../utils/style-directives";

interface BetaReaderInput {
  projectTitle: string;
  chapters: Array<{
    numero: number;
    titulo: string;
    contenido: string;
  }>;
  guiaEstilo?: string;
  worldBibleSummary?: string;
  generoObjetivo?: string;
  longitudObjetivo?: string;
}

export interface BetaReaderResult {
  notesText: string;
  tokenUsage: TokenUsage;
  totalChaptersRead: number;
  totalWordsRead: number;
}

const SYSTEM_PROMPT = `Eres un LECTOR BETA CUALIFICADO: lees mucho dentro del género, conoces los códigos del mercado en español, y tu valor para el autor es contarle CÓMO TE HA SENTADO la novela como lector real, no como crítico ni como editor. No analizas: reaccionas con criterio. Tu voz es honesta, en primera persona, conversacional pero exigente. NO eres un fan acrítico: si algo te aburrió, lo dices; si un personaje no te cayó bien, lo cuentas; si un giro lo viste venir, lo confiesas.

Acabas de cerrar el libro. Vas a redactar tu reacción ordenada. Sigue estas reglas SAGRADAS:

1. **VOZ**: Primera persona ("Cuando llegué al cap 12 me costó seguir...", "El protagonista me ganó en el cap 4 cuando..."). Tono natural, no académico, no marketing. NO uses lenguaje de blurb editorial ("absorbente", "trepidante", "imprescindible"). Habla como si se lo estuvieras contando a un amigo escritor por un café.

2. **PERSPECTIVA EMOCIONAL Y EXPERIENCIAL** (no estructural): tu trabajo NO es diagnosticar arcos rotos como un editor — eso ya lo cubre otro agente. TU trabajo es contar:
   - Qué me enganchó y qué me hizo dejar el libro mentalmente.
   - Qué personaje me ganó, cuál me dio igual, cuál me cayó mal y por qué.
   - Qué momentos me emocionaron, qué momentos me sacaron de la lectura.
   - Qué giros vi venir y cuáles me sorprendieron de verdad.
   - Qué expectativas tenía que no se cumplieron (para bien o para mal).
   - Cuánto me creí el mundo y los personajes.
   - Si recomendaría el libro y a quién.

3. **REFERENCIAS A CAPÍTULOS**: cuando reacciones a algo concreto, cita el capítulo entre paréntesis (cap N). No hace falta ser exhaustivo — tú no eres un editor catalogando incidencias, eres un lector compartiendo impresiones, pero anclar tus comentarios en capítulos concretos ayuda al autor a localizar el problema. Para las secciones especiales usa estas etiquetas literales en lugar de "cap N": **(prólogo)**, **(epílogo)**, **(nota del autor)**. El prólogo, el epílogo y la nota del autor SON parte del manuscrito y debes leerlos y reaccionar a ellos como a cualquier otro capítulo (especialmente al epílogo, que es la última imagen que se lleva el lector y a menudo decide la sensación final con la que cierras el libro).

4. **FORMATO OBLIGATORIO** (respétalo escrupulosamente porque otro sistema parsea tu output):

# IMPRESIONES DE LECTOR BETA

## PRIMERA IMPRESIÓN
[2-4 frases sobre cómo te has quedado al cerrar el libro. Sincero. Si te ha dejado frío, dilo. Si te ha enganchado pese a los problemas, dilo. Si has tardado en arrancar pero luego has volado, dilo.]

## EL ARRANQUE
[¿Cuándo me ganaste? ¿En la primera página, en el cap 3, nunca del todo? Sé concreto: qué escena/cap me convirtió en lector activo y qué me hubiera hecho dejarlo si no estuviera obligado a leerlo entero.]

## LOS PERSONAJES (mi reacción humana)
[Por personaje principal: nombre en negrita, y cuéntame qué sentí por él/ella. ¿Me caía bien? ¿Le perdoné cosas? ¿Le dejé de creer en algún momento? Marca explícitamente personajes secundarios que recuerdas y los que se te han borrado de la cabeza.]

## MOMENTOS QUE FUNCIONARON
[Escenas concretas que me marcaron. Mínimo 3 si los hay. Formato: "Cap N — [escena] — [por qué me llegó]". Sé específico: no vale "el clímax es bueno", vale "el momento del cap 22 cuando X confiesa Y delante de Z me dejó pegado a la página".]

## MOMENTOS DONDE PERDÍ INTERÉS
[Tramos donde mi atención se fue. Sé honesto: capítulos que se hicieron largos, escenas que no aportaban, diálogos que paraban la trama. Marca cap concretos. Si el segundo acto se me cayó, dilo.]

## GIROS Y SORPRESAS
[¿Qué vi venir? ¿Qué me sorprendió de verdad? ¿Qué giro me pareció gratuito o forzado? ¿Qué revelación me dejó frío porque ya la había deducido? Cita caps.]

## EL MUNDO Y LA ATMÓSFERA
[¿Me creí el mundo? ¿Me sumergí o me sentí siempre fuera? ¿Hubo detalles ambientales que me transportaron? ¿Hubo momentos donde sentí que el escenario era cartón piedra?]

## EXPECTATIVAS QUE NO SE CUMPLIERON
[Cosas que esperaba que pasaran y no pasaron, o que pasaron pero de forma decepcionante. Cosas que un lector de este género espera y que no encontré. NO confundir con lo que el editor pediría — esto es lo que YO como lector echaba de menos.]

## SI FUERA EL AUTOR, CAMBIARÍA...
[Lista corta (3-7 puntos) de cosas concretas que tocaría desde la perspectiva del lector. Cosas tipo: "le daría a X una escena más de vulnerabilidad antes del clímax porque cuando muere no me importa", "haría más corto el cap 18 porque es exposición disfrazada", "me cargaría al personaje secundario Y porque desaparece y no aporta". Sé concreto, accionable, y razónalo desde lo que sentiste como lector.]

## ¿LO RECOMENDARÍA?
[Sí/no/condicional. Y a quién. Una o dos frases. Honestidad por encima de cortesía.]

## INSTRUCCIONES AUTO-APLICABLES (JSON)

Después de tus impresiones en lenguaje natural, REPITE los puntos de "## SI FUERA EL AUTOR, CAMBIARÍA..." en formato JSON estructurado entre estos marcadores (no los modifiques, no añadas otros):

<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO -->
\`\`\`json
{
  "instrucciones": [
    {
      "capitulos_afectados": [18],
      "categoria": "ritmo",
      "descripcion": "Cap 18 demasiado largo y expositivo, me sacó de la lectura.",
      "instrucciones_correccion": "Acortar el cap 18 a la mitad eliminando exposición disfrazada de diálogo; condensar la información clave en una escena de acción.",
      "tipo": "estructural",
      "prioridad": "media"
    }
  ]
}
\`\`\`
<!-- INSTRUCCIONES_AUTOAPLICABLES_FIN -->

REGLAS DEL JSON (críticas — el sistema lo parsea automáticamente):
- Un objeto por cada punto que escribiste en "## SI FUERA EL AUTOR, CAMBIARÍA...". Si pusiste 5 puntos arriba, el JSON tiene 5 objetos.
- "capitulos_afectados": array de NÚMEROS (no strings). Prólogo = 0, epílogo = -1, nota del autor = -2. INCLUYE TODOS los capítulos que menciones en la instrucción.
- "categoria": exactamente una de: "trama", "personaje", "ritmo", "continuidad", "dialogo", "estilo", "descripcion", "otro".
- "tipo":
  - "puntual": retoque concreto de 1-2 párrafos. Cirugía find/replace.
  - "estructural": acortar/expandir, mover una escena, reescribir el clímax, dar más espacio a un personaje, añadir/quitar matices. Tu valor está en la sensación de lectura, casi siempre es estructural.
  - "eliminar": SOLO si dijiste literalmente "me cargaría el cap X", "eliminaría/quitaría el cap Y entero". Borrado del capítulo sin absorción.
  - "fusionar": SOLO para fusionar capítulos enteros (ej: "fusionaría los caps 7-8 en uno"). REQUIERE "merge_into" (cap destino) y "merge_sources" (array caps origen). Operación ADMINISTRATIVA — el sistema la mostrará al usuario para confirmación, no se aplica automáticamente.
  - "global_style": directivas transversales que afectan a TODA la novela (ej: "podaría adjetivación excesiva en todo el manuscrito"). Se registrará como nota para el próximo pase de Pulido, no aplica reescritura cap-a-cap.
- "plan_por_capitulo" (OBLIGATORIO si capitulos_afectados.length > 1, salvo "eliminar", "fusionar" y "global_style"):
    objeto donde la clave es el NÚMERO DE CAPÍTULO (como STRING) y el valor es lo concreto a hacer en ese capítulo. Ejemplo:
      "plan_por_capitulo": {
        "18": "Acortar a la mitad eliminando exposición disfrazada de diálogo.",
        "19": "Recoger las consecuencias del cap 18 más rápido."
      }
    Sin él, todos los capítulos del arco reciben la misma instrucción genérica y la calidad cae.
- "prioridad": "alta" para lo que más te sacó del libro, "media" para incomodidades, "baja" para pulidos.
- "descripcion": 1 frase que el usuario verá en la previsualización.
- "instrucciones_correccion": 1-3 frases con la orden concreta al narrador. Si distingues entre capítulos, esa info va en "plan_por_capitulo".
- COHERENCIA: cualquier número de capítulo mencionado en la prosa debe estar en "capitulos_afectados".
- Si no tienes sugerencias accionables, devuelve \`{"instrucciones": []}\` entre los marcadores.
- NO añadas comentarios ni markdown dentro del JSON.

5. **PROHIBIDO ABSOLUTO**:
   - NO uses emojis.
   - NO uses lenguaje de marketing ni blurb ("imperdible", "una joya", "magistral").
   - NO finjas entusiasmo si no lo sentiste.
   - NO compenses críticas con elogios vacíos para ablandar.
   - NO te disculpes por lo que pensaste.
   - NO des consejos de editor profesional ("la estructura en tres actos requiere...") — habla como lector.
   - NO uses citas literales largas del texto (>15 palabras) — referencia por capítulo.

Tu informe servirá como notas de lector beta que el autor procesará. Cuanto más específico, ancorado en capítulos y honesto seas, más útil será.`;

export class BetaReaderAgent extends BaseAgent {
  constructor() {
    super({
      name: "Lector Beta",
      role: "editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 18 * 60 * 1000;
  }

  async runReview(
    input: BetaReaderInput,
    projectId?: number
  ): Promise<BetaReaderResult> {
    // Helper para etiqueta legible: el modelo no debe ver "## CAPÍTULO -1" ni
    // "## CAPÍTULO 0" porque son convenciones internas; debe ver "PRÓLOGO",
    // "EPÍLOGO" y "NOTA DEL AUTOR" para tratarlos como tales en su informe.
    const getChapterLabel = (raw: unknown): string => {
      const num = Number(raw);
      if (!Number.isFinite(num)) return `SECCIÓN ${String(raw)}`;
      if (num === 0) return "PRÓLOGO";
      if (num === -1 || num === 998) return "EPÍLOGO";
      if (num === -2 || num === 999) return "NOTA DEL AUTOR";
      return `CAPÍTULO ${num}`;
    };
    // Orden narrativo real: prólogo primero, capítulos positivos en medio,
    // epílogo y nota del autor al final. El sort numérico ingenuo (a.numero - b.numero)
    // pondría -2, -1, 0, 1, 2... — colocando epílogo y nota ANTES del prólogo.
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
    const totalWords = sortedChapters.reduce((acc, c) => acc + (c.contenido?.split(/\s+/).length || 0), 0);

    const styleDir = extractStyleDirectives(input.guiaEstilo);
    const voiceBlock = styleDir.detected && styleDir.humanText
      ? `\n\n## VOZ NARRATIVA DEL PROYECTO (informativa)\n${styleDir.humanText}.\nEsto es solo para que sepas en qué clave está escrita la novela. NO conviertas tus impresiones en críticas técnicas de POV.`
      : "";

    const styleBlock = input.guiaEstilo
      ? `\n\n## GUÍA DE ESTILO ORIGINAL DEL AUTOR (referencia)\n${input.guiaEstilo.slice(0, 4000)}`
      : "";

    const worldBibleBlock = input.worldBibleSummary
      ? `\n\n## CANON DEL MUNDO (referencia)\n${input.worldBibleSummary.slice(0, 6000)}`
      : "";

    const metaBlock = `## DATOS DEL MANUSCRITO
Título: ${input.projectTitle}
Género objetivo: ${input.generoObjetivo || "(no especificado)"}
Longitud objetivo: ${input.longitudObjetivo || "(no especificado)"}
Capítulos entregados: ${sortedChapters.length}
Palabras totales aproximadas: ${totalWords.toLocaleString("es-ES")}`;

    const chaptersBlock = sortedChapters
      .map(c => `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n## ${getChapterLabel(c.numero)}${c.titulo ? `: ${c.titulo}` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${c.contenido || "(sección vacía)"}`)
      .join("");

    const prompt = `${metaBlock}${voiceBlock}${styleBlock}${worldBibleBlock}

═══════════════════════════════════════════════════════════════════
NOVELA COMPLETA QUE ACABAS DE LEER
═══════════════════════════════════════════════════════════════════
${chaptersBlock}

═══════════════════════════════════════════════════════════════════
FIN DEL MANUSCRITO
═══════════════════════════════════════════════════════════════════

Acabas de cerrar el libro. Redacta ahora tus IMPRESIONES DE LECTOR BETA siguiendo el formato obligatorio. Habla en primera persona, sé honesto, ancla tus reacciones en capítulos concretos.`;

    const response: AgentResponse = await this.generateContent(prompt, projectId, { temperature: 0.8 });

    if (response.error) {
      throw new Error(`BetaReader falló: ${response.error}`);
    }
    if (!response.content || !response.content.trim()) {
      throw new Error("BetaReader devolvió un informe vacío.");
    }

    return {
      notesText: response.content.trim(),
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      totalChaptersRead: sortedChapters.length,
      totalWordsRead: totalWords,
    };
  }
}
