import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { extractStyleDirectives } from "../utils/style-directives";
import { extractScoreFromMarkers, countAutoInstructions, extractAdminActionVerdicts, type AdminActionVerdict } from "../utils/review-score";
import type { PendingAdminActionForReview } from "./holistic-reviewer";

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
  // [Fix38] Notas que tú mismo (el Beta) emitiste sobre este manuscrito en una
  // lectura anterior. Si llega, NO repitas las mismas observaciones literales:
  // céntrate en lo que ha cambiado entre lecturas y en aspectos que no tocaste.
  previousBetaNotes?: string;
  // [Fix52] Si el manuscrito es una TRADUCCIÓN al idioma `targetLanguage`,
  // el Beta debe valorar fluidez/naturalidad/modismos del idioma destino y
  // NO retraducir ni proponer cambios de significado.
  translationMode?: boolean;
  targetLanguage?: string;
  // [Fix57] Si el proyecto pertenece a una serie, este bloque ya formateado
  // describe vol N de M, hilos abiertos heredados de libros previos, eventos
  // clave previos y milestones del volumen actual. El Beta lo recibirá como
  // contexto para NO quejarse de arcos intencionalmente abiertos cuando este
  // libro NO es el último de la serie.
  seriesContext?: string;
  // [Fix76] Acciones administrativas pendientes que el Beta también verifica
  // tras leer el manuscrito completo. Mismo contrato que el Holístico: si
  // ambos coinciden en "apply", el orquestador la ejecuta sin confirmación.
  pendingAdminActions?: PendingAdminActionForReview[];
  // [Fix120] Historial de notas YA aplicadas por el cirujano en iteraciones
  // anteriores del auto-loop, ya formateado como bloque legible. El Beta
  // debe leerlo y entender que esas instrucciones ya están en el manuscrito
  // actual, para no pedir DESHACERLAS (ping-pong) ni repetirlas como nuevas.
  // Si llega vacío o no llega, comportamiento pre-Fix120 sin cambio.
  appliedNotesHistory?: string;
  // [Fix140] Aviso de regresión del auto-loop: la ronda anterior de correcciones
  // BAJÓ tu valoración y se revirtió a la mejor versión. Relees esa mejor versión
  // y debes ser MUY selectivo. Si llega vacío o no llega, sin cambio.
  regressionWarning?: string;
}

const TRANSLATION_LANG_NAMES: Record<string, string> = {
  es: "español", en: "inglés", fr: "francés", de: "alemán",
  it: "italiano", pt: "portugués", ca: "catalán",
};

export interface BetaReaderResult {
  notesText: string;
  tokenUsage: TokenUsage;
  totalChaptersRead: number;
  totalWordsRead: number;
  // [Fix75] Puntuación comercial /10 que el propio Beta emite en su informe,
  // independiente del finalScore del Final Reviewer. null si no se pudo
  // parsear el bloque PUNTUACION_BETA del output.
  score: number | null;
  // [Fix76] Veredictos por acción administrativa pendiente. Vacío si no se
  // pasó pendingAdminActions o el modelo no devolvió el bloque.
  adminActionVerdicts: AdminActionVerdict[];
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

## REALISMO GEOGRÁFICO E HISTÓRICO
[Sección OBLIGATORIA si la novela transcurre en un LUGAR REAL (ciudad, región, país identificable) y/o en una ÉPOCA HISTÓRICA CONCRETA (año, década, periodo identificable). Si la novela es de fantasía/ciencia ficción/mundo inventado sin anclaje real, escribe literalmente "No aplica: ambientación no-realista." y no inventes problemas.

Cuando SÍ aplique, audita como lector culto del género histórico/realista:
- **Anacronismos**: objetos, palabras, tecnologías, costumbres, leyes, instituciones o referencias culturales que NO existían en la época declarada (o que ya habían desaparecido). Cita cap y elemento concreto.
- **Geografía**: distancias imposibles para los medios de transporte de la época, accidentes geográficos inexistentes, climas que no corresponden a la región, barrios/calles/edificios que no existían entonces, países/fronteras con nombres posteriores.
- **Cultura material e idioma**: alimentos, prendas, monedas, registros lingüísticos o expresiones idiomáticas posteriores al periodo (p. ej. anglicismos en una novela de 1850 en Madrid, "OK" antes de 1840, etc.).
- **Hechos históricos**: fechas, batallas, monarcas, presidentes, leyes, sucesos públicos mal datados o reordenados. No exijas reverencia historiográfica — exige que lo que la novela dé por verídico encaje con la realidad conocida.
- **Convenciones sociales**: roles, tratamientos, jerarquías, religión, derechos legales, vida cotidiana coherentes con el periodo y lugar.

Sé concreto: "(cap 7) menciona una linterna eléctrica en 1872, las primeras lámparas incandescentes prácticas son de 1879" es más útil que "el cap 7 tiene un anacronismo". Si dudas, dilo como duda razonada ("me chirrió X, no estoy 100 % seguro pero conviene verificar"). NO inventes errores si la prosa no te da pistas concretas. Si todo te ha sonado verídico, escribe "Sin problemas relevantes detectados." y pasa adelante.]

## EXPECTATIVAS QUE NO SE CUMPLIERON
[Cosas que esperaba que pasaran y no pasaron, o que pasaron pero de forma decepcionante. Cosas que un lector de este género espera y que no encontré. NO confundir con lo que el editor pediría — esto es lo que YO como lector echaba de menos.]

## SI FUERA EL AUTOR, CAMBIARÍA...
[Lista corta (3-7 puntos) de cosas concretas que tocaría desde la perspectiva del lector. Cosas tipo: "le daría a X una escena más de vulnerabilidad antes del clímax porque cuando muere no me importa", "haría más corto el cap 18 porque es exposición disfrazada", "me cargaría al personaje secundario Y porque desaparece y no aporta". Sé concreto, accionable, y razónalo desde lo que sentiste como lector.]

## ¿LO RECOMENDARÍA?
[Sí/no/condicional. Y a quién. Una o dos frases. Honestidad por encima de cortesía.]

## MI PUNTUACIÓN COMERCIAL (JSON)

Como lector cualificado del género, dale un número a esta novela DESDE TU PERSPECTIVA DE LECTOR (no desde la del editor, no desde la del Final Reviewer — ellos darán la suya). Tu nota va entre los marcadores siguientes (no los modifiques):

<!-- PUNTUACION_BETA_INICIO -->
\`\`\`json
{"puntuacion_global": 7, "justificacion": "Me enganchó pero el segundo acto me sacó dos veces y el clímax lo vi venir desde el cap 18."}
\`\`\`
<!-- PUNTUACION_BETA_FIN -->

REGLAS DE LA PUNTUACIÓN (críticas):
- "puntuacion_global": entero de 1 a 10. **NO redondees hacia arriba por cortesía**. Si te sentaste a regañadientes a terminar el libro: 5-6. Si lo leíste con interés pero notaste fallos serios: 7. Si te enganchó pese a pegas: 8. **Solo 9-10 si lo recomendarías sin reservas a alguien que paga por leer.**
- Escala honesta de mercado:
  - 10 = obra excepcional, de las que recuerdas un año después.
  - 9 = publicable sin reservas, defendible en cualquier sello del género.
  - 8 = buena lectura con margen de mejora puntual.
  - 7 = aceptable, le falta algo para sobresalir.
  - 6 = lectura desigual, pegas que costó perdonar.
  - 5 = la terminé por obligación.
  - 4 o menos = no la habría terminado si no fuese mi trabajo.
- Tu nota DEBE ser CONSISTENTE con tu informe arriba: si dijiste "se me cayó el segundo acto y vi venir el clímax" no puedes poner 9. Si dijiste "me ha enganchado de cabo a rabo" no puedes poner 6.
- "justificacion": UNA frase corta (≤200 chars). Razón principal del número.
- Tu nota es INDEPENDIENTE de la del Final Reviewer y de la del Holístico. Probablemente las tres no coincidan, y eso es esperable y útil para el autor.

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
- **CALIDAD SOBRE CANTIDAD — NO HAY MÍNIMO DE INSTRUCCIONES**. Emite SOLO instrucciones respaldadas por algo que de verdad te sacó de la lectura y que puedas anclar en el texto ACTUAL (capítulo + escena/pasaje concreto). Si el manuscrito está sólido, es LEGÍTIMO devolver 1, 2 o incluso \`{"instrucciones": []}\` — una lista vacía honesta vale más que 3 instrucciones de relleno que obligan al cirujano a tocar prosa que funciona y ALARGAN el bucle sin subir la nota. PROHIBIDO inventar pegas para rellenar cuota.
- **EVIDENCIA OBLIGATORIA en "ritmo"**: toda instrucción con categoria "ritmo" DEBE citar evidencia concreta y verificable del texto actual: capítulo + escena/pasaje identificable (ej: 'cap 12: la conversación del muelle da tres vueltas a la misma información sin avanzar'). Si tu sensación de ritmo es difusa y no puedes señalar el pasaje exacto ("el segundo acto se me hizo lento"), NO la conviertas en instrucción del JSON — recógela SOLO como impresión en la prosa del informe.
- Un objeto por cada punto que escribiste en "## SI FUERA EL AUTOR, CAMBIARÍA...". Si pusiste 5 puntos arriba, el JSON tiene 5 objetos.
- **COMILLAS DENTRO DE STRINGS**: NUNCA uses comillas dobles (\`"\`) dentro del valor de un string. Si necesitas citar un diálogo o una frase, usa SIEMPRE comillas simples (\`'\`). Ejemplo correcto: \`"instrucciones_correccion": "Beth se acerca y dice 'Lo siento, debí hablar antes.'"\`. Ejemplo INCORRECTO (rompe el JSON): \`"instrucciones_correccion": "Beth se acerca y dice "Lo siento, debí hablar antes.""\`. Esto incluye TODAS las citas, frases entrecomilladas, títulos, etc., dentro de cualquier campo de tipo string.
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
- **CITAS TEXTUALES EXACTAS (crítico para que tu corrección llegue de verdad a la prosa)**: si dentro de CUALQUIER campo del JSON entrecomillas un fragmento del manuscrito (un diálogo o una frase de narración) para señalar dónde está el problema, ese fragmento DEBE ser una copia LITERAL, palabra por palabra, del texto ACTUAL — nunca una paráfrasis, un resumen ni una reconstrucción de memoria. El sistema localiza el pasaje buscando esa cita EXACTA; si la parafraseas aunque sea un poco, no la encuentra y tu corrección se descarta sin llegar nunca a la prosa. Copia solo el fragmento mínimo identificable (una frase corta), no párrafos enteros. Si no puedes reproducir la frase exacta tal cual está escrita, NO la entrecomilles: describe el pasaje con tus propias palabras (sin comillas) y ancla por capítulo + escena.
- **CADA CITA, A SU CAPÍTULO REAL**: una cita textual solo puede ir asociada al capítulo del que procede DE VERDAD. Una frase que aparece en el cap 4 NO existe en el cap 2: si la cuelgas también del cap 2 (metiendo ambos en "capitulos_afectados" con la misma cita común), en el cap 2 no se encontrará y se descartará. En instrucciones multi-capítulo, coloca cada cita textual DENTRO de la entrada de "plan_por_capitulo" del capítulo al que pertenece; no repitas la misma cita en varios capítulos ni la dejes en un campo común compartido.
- NO añadas comentarios ni markdown dentro del JSON.

5. **CONTEXTO DE SERIE (CRÍTICO si aplica)**: Si en los datos del manuscrito recibes un bloque "## CONTEXTO DE SERIE", este libro NO es una novela autoconclusiva sino un volumen dentro de una serie planificada. Como lector beta cualificado, ajusta tus expectativas:
   - El bloque te dirá si este es el VOLUMEN ACTUAL N de M y si es el ÚLTIMO de la serie.
   - Si **NO es el último volumen**: como lector experimentado, sabes que un libro intermedio de serie cierra su trama interna pero deja la trama global avanzando hacia el siguiente. NO te quejes de "este final me dejó cosas pendientes" si esas cosas son arcos largos de la serie (el villano de fondo no cae aquí, la profecía no se cumple aquí, el romance evoluciona pero no se sella aquí). SÍ te puedes quejar si el libro abre y promete cerrar algo dentro de su propio arco autoconclusivo (la misión de este libro, el caso de este libro, el viaje de este libro) y no lo cumple. Como lector de series, lo que valoras es: ¿la trama interna del libro se cerró satisfactoriamente?, ¿avanzó la trama global?, ¿me ha dado ganas de seguir con el siguiente?
   - Si **SÍ es el último volumen**: aquí sí esperas TODO cerrado y puedes (y debes) quejarte de cualquier arco que quede colgando.
   - Si el bloque indica **PRECUELA (Vol. 0)**: es el PRIMER libro cronológico de una serie en curso. NO la juzgues con la rúbrica de "novela autoconclusiva cerrada"; júzgala como el primer libro de una serie larga. Arcos amplios, hilos de fondo, presentaciones de personajes y promesas a largo plazo PUEDEN y DEBEN quedar abiertos al final, e incluso un cliffhanger hacia Vol. 1 es válido por diseño. NO te quejes de que "es solo un primer acto", "se siente inconclusa", "el manuscrito se corta cuando empieza la trama" ni de hitos/hilos que pertenecen a libros POSTERIORES; el lector seguirá leyendo. Solo audita que el ARCO PUNTUAL que esta precuela elige plantear internamente progrese y cierre coherentemente, no más que lo que el libro promete dentro de sí mismo.
   - El bloque te listará HILOS HEREDADOS de libros previos (o, en precuelas, hilos de libros POSTERIORES — el futuro de los personajes). Como lector que ya leyó/leerá los otros volúmenes, esos hilos no necesitan re-presentación ni cierre aquí; no te quejes de "no sé quién es X" o "no entiendo este conflicto" si está en esa lista.
   - En tu sección "## SI FUERA EL AUTOR, CAMBIARÍA..." y en el JSON de instrucciones: NO emitas instrucciones que pidan resolver hilos largos de la serie en este volumen si no es el último ni si es la precuela. Sí emite instrucciones para mejorar la sensación de lectura del propio libro o para reforzar la promesa que el libro hace al lector dentro de su propio arco interno.

6. **PROHIBIDO ABSOLUTO**:
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
      // [Fix170] 16384 -> 32768: el techo es COMBINADO razonamiento+contenido;
      // con informes largos + thinking el modelo cortaba el JSON final.
      maxOutputTokens: 32768,
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
      if (num === -1) return "EPÍLOGO";
      if (num === -2) return "NOTA DEL AUTOR";
      return `CAPÍTULO ${num}`;
    };
    // Orden narrativo real: prólogo primero, capítulos positivos en medio,
    // epílogo y nota del autor al final. El sort numérico ingenuo (a.numero - b.numero)
    // pondría -2, -1, 0, 1, 2... — colocando epílogo y nota ANTES del prólogo.
    const getChapterSortOrder = (raw: unknown): number => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return Number.MAX_SAFE_INTEGER;
      if (n === 0) return -1000;
      if (n === -1) return 1_000_000;
      if (n === -2) return 1_000_001;
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

    // [Fix38] Notas tuyas de una lectura previa. Te las pasamos para que NO
    // repitas las mismas observaciones literales: o el autor las ignoró
    // intencionadamente y reincidir es ruido, o ya están aplicadas y deberías
    // notarlo. Tu valor en esta segunda lectura está en lo NUEVO.
    // [Fix52] Bloque adicional cuando el manuscrito es una traducción.
    // El Beta debe juzgar el resultado en el idioma destino, NO proponer
    // alteraciones de significado, y enfocarse en fluidez y naturalidad.
    const translationBlock = input.translationMode
      ? `\n\n═══════════════════════════════════════════════════════════════════\n## CONTEXTO CRÍTICO: ESTO ES UNA TRADUCCIÓN\n═══════════════════════════════════════════════════════════════════\n\nEl texto que vas a leer es una **traducción al ${TRANSLATION_LANG_NAMES[input.targetLanguage || "es"] || input.targetLanguage || "idioma destino"}** de un manuscrito originalmente escrito en otro idioma.\n\nTu trabajo en esta lectura es REDUCIDO Y ESPECÍFICO:\n- Evalúa la **fluidez y naturalidad** del texto en ${TRANSLATION_LANG_NAMES[input.targetLanguage || "es"] || "el idioma destino"}.\n- Marca frases que suenan a **traducción literal** o **calco sintáctico** (estructuras del idioma original que no funcionan en el destino).\n- Marca **falsos amigos**, modismos mal localizados, registros incorrectos para el género, palabras que un lector nativo no usaría.\n- Marca **inconsistencias terminológicas** (un mismo término traducido de dos formas distintas).\n- Marca **fragmentos sin traducir** o residuos del idioma original que se han colado.\n\nLO QUE NO DEBES HACER (CRÍTICO):\n- NO propongas cambios de **significado** ni de **contenido narrativo** (eso ya se trabajó en el original).\n- NO propongas **retraducir** secciones enteras ni **reescribir** capítulos.\n- NO juzgues la **estructura**, **arcos de personajes**, **ritmo narrativo** ni **decisiones de trama** — todo eso ya se validó en el manuscrito original.\n- NO propongas eliminar/fusionar capítulos.\n- Tu único valor aquí es la **calidad lingüística del texto en ${TRANSLATION_LANG_NAMES[input.targetLanguage || "es"] || "el idioma destino"}**.\n\nEl JSON de instrucciones SOLO debe contener tipos "puntual" o "estructural" con tu intervención limitada a fluidez/naturalidad/terminología. Prohibido tipos "eliminar", "fusionar". El valor del campo "categoria" debe ser "estilo" o "dialogo" en el 90% de los casos. Tu informe en lenguaje natural también debe centrarse exclusivamente en estos aspectos lingüísticos; los apartados de "PERSONAJES", "GIROS", "EXPECTATIVAS", "MUNDO Y ATMÓSFERA" puedes dejarlos vacíos o muy breves si no detectas problemas LINGÜÍSTICOS específicos en ellos.\n═══════════════════════════════════════════════════════════════════`
      : "";

    // [Fix57] Bloque que activa la regla 5 del SYSTEM_PROMPT.
    const seriesBlock = (input.seriesContext && input.seriesContext.trim().length > 0)
      ? `\n\n${input.seriesContext}`
      : "";

    // [Fix76] Mismo bloque que en el Holístico — el Beta da su propia
    // verificación como LECTOR (¿se nota que falta algo si borramos este cap?
    // ¿el material ya está en otro?). Si Holístico y Beta coinciden en
    // "apply", el orquestador ejecuta la acción sin intervención humana.
    const pendingAdmin = (input.pendingAdminActions || []).filter(a => a && typeof a.id === "number");
    const adminBlock = pendingAdmin.length === 0 ? "" : `\n\n═══════════════════════════════════════════════════════════════════
## ACCIONES ADMINISTRATIVAS PENDIENTES DE VERIFICACIÓN (CRÍTICO)
═══════════════════════════════════════════════════════════════════

El cirujano estructural ha propuesto ${pendingAdmin.length} acción(es) DESTRUCTIVA(s) (borrar/fusionar capítulos) que NO se han aplicado todavía porque requieren verificación. Como LECTOR que acaba de cerrar el libro tienes una perspectiva única: ¿se notaría si se aplica? ¿el cap origen es prescindible porque su contenido ya estaba dicho en otro sitio, o aporta algo único que echarías de menos?

Para cada acción decides:
- **apply**: como lector NO echarías de menos ese cap. Su contenido ya está cubierto en otro cap, o el cap es un sobrante que ralentiza. Puede borrarse de forma desatendida.
- **keep_pending**: dudas, no te queda claro si se pierde algo. Se queda pendiente para revisión humana.
- **discard**: ese cap contiene escenas/personajes/revelaciones que NO están en ningún otro sitio. Borrarlo dañaría el libro como lector. Se descarta del listado.

LISTA DE ACCIONES A EVALUAR:
${pendingAdmin.map(a => `- id=${a.id} | tipo=${a.type} | sobre ${a.targetLabel || `cap ${a.targetChapter}`}${typeof a.secondaryChapter === "number" ? ` (afecta también a cap ${a.secondaryChapter})` : ""} | motivo emitido por el cirujano: ${a.reason}`).join("\n")}

CÓMO DECIDIR COMO LECTOR (delete_chapter):
1. Busca mentalmente qué pasa en ese cap.
2. Si lo que pasa ya lo recuerdas en otro cap (la escena, la revelación, la decisión del personaje) → **apply**.
3. Si el cap te aburrió, no aportaba, o lo notaste como relleno → **apply**.
4. Si el cap contiene ALGO único que te marcó (motivación clave del villano, escena emotiva con un secundario, hito de mundo) y NO lo encuentras en otra parte → **discard**, di QUÉ se perdería.
5. Si hay material mezclado o duda razonable → **keep_pending**.

Para merge_chapters / split_chapter / move_content / swap_chapters / reorder_chapters: aplica el mismo criterio (¿la operación deja la lectura mejor o peor?, ¿alguien echaría algo de menos?).

Tras emitir todas las demás secciones del informe (incluyendo MI PUNTUACIÓN COMERCIAL e INSTRUCCIONES_AUTOAPLICABLES), añade UN bloque JSON entre estos marcadores literales (no los modifiques), con UN veredicto por cada id de la lista:

<!-- VEREDICTO_ADMIN_ACCIONES_INICIO -->
\`\`\`json
{
  "veredictos": [
    { "id": ${pendingAdmin[0].id}, "veredicto": "apply", "motivo": "Como lector ya tenía esa escena cubierta en el cap Y; no echaría de menos el cap X." }
  ]
}
\`\`\`
<!-- VEREDICTO_ADMIN_ACCIONES_FIN -->

REGLAS DEL VEREDICTO (críticas — el sistema lo parsea automáticamente):
- EXACTAMENTE ${pendingAdmin.length} objeto(s) en "veredictos", uno por cada id (${pendingAdmin.map(a => a.id).join(", ")}). NO omitas ninguno. NO inventes ids.
- "id": el número entero EXACTO de la lista.
- "veredicto": exactamente "apply", "keep_pending" o "discard".
- "motivo": 1-2 frases EN PRIMERA PERSONA DE LECTOR. Para "apply" di qué cap cubre lo mismo. Para "discard" di qué se perdería.
- Sé CONSERVADOR. Ante la mínima duda → "keep_pending".
- Tu veredicto es INDEPENDIENTE del Holístico. Solo si AMBOS coincidimos en "apply" la acción se aplica automáticamente.`;

    // [Fix170] Politica revisada respecto a Fix75/Fix38: YA NO hay minimo
    // forzado de instrucciones. El minimo de 3 obligaba al Beta a inventar
    // pegas de relleno cuando el manuscrito estaba solido, el cirujano las
    // aplicaba sobre prosa que funcionaba y el auto-loop se alargaba sin
    // subir la nota (visto en vivo: iter 9/8 en el Vol. 1). Ahora la regla
    // es calidad sobre cantidad: solo instrucciones con evidencia anclada
    // en el texto actual; lista corta o vacia es legitima.
    const previousNotesBlock = (input.previousBetaNotes && input.previousBetaNotes.trim().length > 200)
      ? `\n\n═══════════════════════════════════════════════════════════════════\n## NOTAS DE TU LECTURA ANTERIOR (referencia de evolución — versión PASADA, NO actual)\n═══════════════════════════════════════════════════════════════════\n\n${input.previousBetaNotes.slice(0, 24000)}\n\n[Fix133] FUENTE DE VERDAD: el manuscrito que tienes MÁS ABAJO es la ÚNICA versión real y ACTUAL. Las notas de arriba son una lectura PASADA y el autor YA ha podido corregir parte de lo que señalaste, así que NO asumas que ningún problema antiguo sigue existiendo: cada uno hay que RE-COMPROBARLO en el texto de hoy antes de volver a mencionarlo. No mezcles lo que recuerdas de la versión anterior con lo que de verdad lees ahora.\n\nCómo usar esas notas SIN mezclar versiones:\n- Antes de repetir CUALQUIER pega antigua, localízala en el manuscrito ACTUAL y cita el (cap N) concreto donde SIGUE presente HOY. Si la confirmas vigente, REPÍTELA en el JSON con prioridad subida y una instrucción más concreta y accionable que la vez anterior.\n- Si NO la encuentras en el texto actual (porque ya se corrigió), dala por RESUELTA: dilo en una frase de prosa ("la pega del cap 12 ya no está") y NO emitas instrucción para ella. PROHIBIDO emitir una instrucción sobre un problema concreto que no puedas señalar HOY en el texto con su cita de capítulo — eso es referirse a una versión que ya no existe.\n- EXCEPCIÓN para pegas GLOBALES de verdad (ritmo general, tono de conjunto, sensación de relleno difusa) que sigues percibiendo HOY pero que no puedes anclar a UN capítulo concreto: NO la dejes caer en silencio. Recógela como observación en prosa (no como instrucción accionable del JSON) describiéndola como impresión global del manuscrito actual; así el autor la ve sin que el cirujano la aplique a ciegas.\n- El umbral comercial deseable es Beta >= 9. Si vienes de un 7 o un 8, identifica qué cambios REALES sobre el texto actual cerrarían ese gap. Si vienes ya de un 9, identifica qué llevaría la obra al 10.\n- NO hay minimo de instrucciones: TODAS las que emitas deben ser pegas CONFIRMADAS en el texto actual, evoluciones reales de las viejas, o mejoras incrementales nuevas con pasaje concreto — nunca recuerdos de una versión que ya no existe ni relleno para cubrir cuota. Si el texto actual ya está sólido, \`{"instrucciones": []}\` es una respuesta legítima.`
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

    // [Fix120] Bloque de notas ya aplicadas por el cirujano en iteraciones
    // previas del auto-loop. Le decimos al Beta que NO pida deshacerlas y
    // que enfoque su lectura en cosas NUEVAS o evoluciones, no en oposiciones
    // literales a lo que el cirujano acaba de aplicar.
    const appliedHistoryBlock = (input.appliedNotesHistory && input.appliedNotesHistory.trim().length > 0)
      ? `\n\n═══════════════════════════════════════════════════════════════════
## [Fix120] HISTORIAL DE NOTAS YA APLICADAS POR EL CIRUJANO EN ESTE AUTO-LOOP
═══════════════════════════════════════════════════════════════════

${input.appliedNotesHistory}

REGLA CRÍTICA: las instrucciones de arriba YA ESTÁN APLICADAS en el manuscrito que acabas de leer. Tu trabajo en esta relectura es:
- NO repitas literalmente esas instrucciones como observaciones nuevas (el cirujano ya las ejecutó).
- NO pidas DESHACERLAS. Si una nota previa pidió "alargar cap 5 con más diálogo" y ahora te parece largo, NO emitas "acortar cap 5 con menos diálogo" — eso es un PING-PONG que no converge: estás contradiciendo lo que tú mismo acabas de pedir y el cirujano ya aplicó.
- Si una nota previa quedó MAL APLICADA (el cirujano la interpretó torcido o el resultado es peor de lo esperado), descríbela con ese matiz concreto ("la nota anterior pedía X y el cirujano lo aplicó como Y, pero falta Z" / "la expansión del cap 5 funcionó en estructura pero el diálogo añadido suena artificial"), NO como pedido de reversión.
- Si una nota previa SIGUE PENDIENTE o se aplicó solo a medias, REPITELA pero AFINADA (más específica que la vez anterior).
- Tu energía debe ir a pegas NUEVAS, EVOLUCIONES de las viejas, o MEJORAS INCREMENTALES — nunca a oposiciones literales.`
      : "";

    // [Fix140] Aviso de regresión: la ronda previa empeoró la nota y se revirtió.
    const regressionBlock = (input.regressionWarning && input.regressionWarning.trim().length > 0)
      ? `\n\n═══════════════════════════════════════════════════════════════════
## [Fix140] AVISO: LA RONDA ANTERIOR DE CORRECCIONES EMPEORÓ LA NOVELA
═══════════════════════════════════════════════════════════════════

${input.regressionWarning}

REGLA CRÍTICA para esta relectura:
- Estás releyendo la MEJOR versión conocida (se revirtió porque las últimas correcciones bajaron tu valoración). Tu objetivo es NO volver a romperla.
- Sé MUY SELECTIVO: pide SOLO cambios de ALTO VALOR y BAJO RIESGO, anclados a un (cap N) concreto del texto actual.
- EVITA reescrituras amplias o cambios de tono/estructura que ya provocaron una regresión. Prefiere afinados mínimos y localizados.
- Si la novela ya está sólida, es legítimo emitir pocas o ninguna instrucción en vez de forzar cambios que puedan empeorar el conjunto.`
      : "";

    const prompt = `${metaBlock}${voiceBlock}${styleBlock}${worldBibleBlock}${seriesBlock}${adminBlock}${translationBlock}${previousNotesBlock}${appliedHistoryBlock}${regressionBlock}

═══════════════════════════════════════════════════════════════════
NOVELA COMPLETA QUE ACABAS DE LEER
═══════════════════════════════════════════════════════════════════
${chaptersBlock}

═══════════════════════════════════════════════════════════════════
FIN DEL MANUSCRITO
═══════════════════════════════════════════════════════════════════

Acabas de cerrar el libro. Redacta ahora tus IMPRESIONES DE LECTOR BETA siguiendo el formato obligatorio. Habla en primera persona, sé honesto, ancla tus reacciones en capítulos concretos.`;

    let response: AgentResponse = await this.generateContent(prompt, projectId, { temperature: 0.8 });

    if (response.error) {
      throw new Error(`BetaReader falló: ${response.error}`);
    }
    if (!response.content || !response.content.trim()) {
      throw new Error("BetaReader devolvió un informe vacío.");
    }

    // [Fix170] ELIMINADO el enforcement Fix75 de minimo 3 instrucciones (el
    // reintento forzado fabricaba pegas de relleno que alargaban el auto-loop
    // sin subir la nota). Dejamos solo un log informativo del conteo real.
    const initialCount = countAutoInstructions(response.content);
    if (initialCount !== -1) {
      console.log(`[Fix170] BetaReader emitio ${initialCount} instruccion(es) autoaplicable(s) (sin minimo forzado).`);
    }

    return {
      notesText: response.content.trim(),
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      totalChaptersRead: sortedChapters.length,
      totalWordsRead: totalWords,
      score: extractScoreFromMarkers(response.content, "PUNTUACION_BETA"),
      adminActionVerdicts: pendingAdmin.length > 0
        ? extractAdminActionVerdicts(response.content)
        : [],
    };
  }
}

