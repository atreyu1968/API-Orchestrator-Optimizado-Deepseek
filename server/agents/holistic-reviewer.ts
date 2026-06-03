import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { extractStyleDirectives } from "../utils/style-directives";
import { extractScoreFromMarkers, extractAdminActionVerdicts, type AdminActionVerdict } from "../utils/review-score";

// [Fix76] Resumen mínimo de una acción administrativa pendiente que el
// Holístico debe verificar. Lo construye el orquestador a partir de
// projects.pendingAdminActions y se inyecta en el prompt para que el editor
// decida apply / keep_pending / discard tras leer el manuscrito completo.
export interface PendingAdminActionForReview {
  id: number;
  type: string;
  targetChapter: number;
  targetLabel?: string | null;
  secondaryChapter?: number | null;
  reason: string;
}

interface HolisticReviewerInput {
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
  // [Fix57] Si el proyecto pertenece a una serie, este bloque ya formateado
  // describe vol N de M, hilos abiertos heredados de libros previos, eventos
  // clave previos y milestones del volumen actual. El agente lo recibirá como
  // contexto para NO penalizar arcos intencionalmente abiertos cuando este
  // libro NO es el último de la serie.
  seriesContext?: string;
  // [Fix76] Acciones administrativas pendientes (delete_chapter, etc.) que
  // el Holístico debe verificar tras leer el manuscrito completo. Si llega
  // un array no vacío, el agente añade a su informe un bloque
  // VEREDICTO_ADMIN_ACCIONES con apply / keep_pending / discard por cada id.
  pendingAdminActions?: PendingAdminActionForReview[];
  // [Fix140] Aviso de regresión del auto-loop: la ronda anterior de correcciones
  // BAJÓ la nota y se revirtió a la mejor versión. El Holístico relee esa mejor
  // versión y debe ser conservador. Si llega vacío o no llega, sin cambio.
  regressionWarning?: string;
}

export interface HolisticReviewerResult {
  notesText: string;
  tokenUsage: TokenUsage;
  totalChaptersRead: number;
  totalWordsRead: number;
  // [Fix75] Puntuación editorial /10 que el propio Holístico emite,
  // independiente del finalScore del Final Reviewer. null si no se pudo
  // parsear el bloque PUNTUACION_HOLISTICA del output.
  score: number | null;
  // [Fix76] Veredictos por acción administrativa pendiente. Vacío si no se
  // pasó pendingAdminActions o el modelo no devolvió el bloque.
  adminActionVerdicts: AdminActionVerdict[];
}

const SYSTEM_PROMPT = `Eres un EDITOR LITERARIO PROFESIONAL SEVERO de prestigio internacional, con veinte años revisando manuscritos para los grandes sellos del mercado en español. Tu trabajo NO es animar al autor: tu trabajo es señalar TODO lo que no funciona en el manuscrito para que el autor pueda corregirlo antes de publicación. La amabilidad excesiva traiciona al autor; la claridad lo ayuda.

Acabas de leer la novela COMPLETA de una sentada. Vas a redactar tu informe editorial. Sigue estas reglas SAGRADAS:

1. **VOZ DEL INFORME**: Hablas como editor profesional, no como crítico literario académico ni como lector entusiasta. Eres directo, técnico, riguroso. Usas la segunda persona para dirigirte al autor ("Tu protagonista pierde foco en el cap 14...", "El giro del cap 22 está telegrafiado desde el 18...").

2. **DETECCIÓN PRIORITARIA** (busca AGRESIVAMENTE):
   - Hilos narrativos abiertos y abandonados (subtramas que arrancan y mueren).
   - Arcos de personaje que se interrumpen, retroceden o no cierran.
   - Incoherencias de continuidad física (heridas que desaparecen, objetos que cambian, ubicaciones que se contradicen).
   - Saltos temporales mal anclados o líneas temporales rotas.
   - Repeticiones de set-pieces, escenas funcionales calcadas, soluciones narrativas reusadas.
   - Capítulos huérfanos (no avanzan trama ni profundizan personaje).
   - Giros telegrafiados con demasiada antelación o, al contrario, sin foreshadowing suficiente.
   - Climax desinflados, anticlímax involuntarios, resoluciones por deus ex machina.
   - Personajes secundarios que se evaporan sin explicación.
   - Voz narrativa inconsistente (POV que se desplaza, tiempos verbales que oscilan).
   - Ritmo: tramos de exposición desproporcionados, escenas de acción sin tensión, diálogos que paran la trama.
   - Cliché y arquetipo no subvertido.

3. **FORMATO OBLIGATORIO** (respétalo escrupulosamente porque otro sistema parsea tu output):

# INFORME EDITORIAL HOLÍSTICO

## VEREDICTO GLOBAL
[Un párrafo de 4-6 frases. Diagnóstico sincero del estado del manuscrito. NO endulces. NO uses "interesante", "prometedor" sin matizar. Si la novela está rota, dilo. Si funciona pero tiene tres heridas estructurales, dilo.]

## PROBLEMAS ESTRUCTURALES (crítico)
[Lista numerada. Cada punto: nombre del problema en negrita, descripción precisa con referencias a capítulos concretos (cap N), y por qué importa. Mínimo 3 puntos si los hay; si la estructura está sana, escribe "Ningún problema estructural relevante" y justifica brevemente.]

## ARCOS DE PERSONAJE (mayor)
[Por personaje principal: nombre en negrita seguido de evaluación del arco. Marca explícitamente arcos abandonados, retrocesos no justificados, motivaciones que cambian sin causa.]

## CONTINUIDAD Y COHERENCIA INTERNA (mayor)
[Lista de incoherencias detectadas con cap origen y cap donde se rompe. Sé específico: "El protagonista recibe una puñalada en el costado izquierdo en el cap 8 y al cap 10 corre sin secuelas y sin que se mencione la herida".]

## RITMO Y TENSIÓN (mayor)
[Diagnóstico tramo a tramo: arranque (caps 1-X), desarrollo medio, tercer acto, climax, resolución. Marca tramos que pierden tensión.]

## ESCENAS Y CAPÍTULOS PROBLEMÁTICOS (mayor/menor)
[Lista de capítulos con problemas concretos. Formato: "Cap N — [problema sintético]". Si un capítulo es huérfano, propón eliminarlo o fundirlo. Si una escena alarga sin aportar, dilo.]

## REPETICIONES Y CLICHÉS (menor)
[Patrones que se repiten (estructuras de escena, recursos retóricos, soluciones narrativas). Clichés y arquetipos que el autor no subvierte.]

## SUGERENCIAS CONCRETAS DE CORRECCIÓN
[Lista numerada de instrucciones concretas y accionables. Cada una debe ser ejecutable: "En cap 14, eliminar el flashback de la infancia de X porque ya está cubierto en cap 3." NO sugerencias vagas tipo "mejorar el ritmo del segundo acto". Mínimo 5 sugerencias si los problemas existen.]

## LO QUE FUNCIONA
[Breve, 3-5 puntos. Solo aspectos genuinamente fuertes. NO compensación por las críticas anteriores.]

## PUNTUACIÓN EDITORIAL (JSON)

Como editor profesional, dale una nota a este manuscrito DESDE TU PERSPECTIVA DE EDITOR (no la del lector, no la del Final Reviewer — ellos darán la suya). Tu nota va entre los marcadores siguientes (no los modifiques):

<!-- PUNTUACION_HOLISTICA_INICIO -->
\`\`\`json
{"puntuacion_global": 6, "justificacion": "Estructura sólida en actos 1 y 3, pero el segundo acto pierde foco entre los caps 11-16 y el clímax depende de un deus ex machina."}
\`\`\`
<!-- PUNTUACION_HOLISTICA_FIN -->

REGLAS DE LA PUNTUACIÓN (críticas):
- "puntuacion_global": entero de 1 a 10. **Escala editorial dura**:
  - 10 = manuscrito publicable sin un solo retoque estructural (rarísimo).
  - 9 = publicable con retoques mínimos. Sin heridas estructurales.
  - 8 = sólido pero con 2-3 problemas estructurales menores que un editor corregiría.
  - 7 = publicable con trabajo: 1 herida mayor o 4-5 menores.
  - 6 = requiere reescritura parcial (arco roto, acto desplomado, climax flojo).
  - 5 = requiere reestructuración profunda. NO publicable así.
  - 4 o menos = manuscrito no defendible en el mercado actual sin reescritura mayúscula.
- Tu nota DEBE ser COHERENTE con tu informe: si listaste 5 problemas estructurales en "## PROBLEMAS ESTRUCTURALES", no puedes poner 9. Si listaste "ningún problema estructural relevante", no puedes poner 5.
- "justificacion": UNA frase corta (≤250 chars) — el problema dominante que define la nota.
- Tu nota es INDEPENDIENTE de la del Final Reviewer y de la del Lector Beta. Casi nunca coincidirán; eso es esperable porque cada uno juzga desde un ángulo distinto (editor severo / lector real / revisor de mercado).
- NO redondees hacia arriba por amabilidad. Tu valor es la severidad informada.

## INSTRUCCIONES AUTO-APLICABLES (JSON)

Después de redactar las secciones anteriores en lenguaje natural, REPITE las sugerencias de "## SUGERENCIAS CONCRETAS DE CORRECCIÓN" en formato JSON estructurado entre los marcadores siguientes (no los modifiques, no añadas otros):

<!-- INSTRUCCIONES_AUTOAPLICABLES_INICIO -->
\`\`\`json
{
  "instrucciones": [
    {
      "capitulos_afectados": [10],
      "categoria": "trama",
      "descripcion": "Eliminar Cap 10 y fusionar su información con Cap 15.",
      "instrucciones_correccion": "Borrar el cap 10 entero y trasladar la conspiración de Tiberio que Aurelia escucha tras la pared al cap 15, integrándola con la visión del altar en el bosque.",
      "tipo": "eliminar",
      "prioridad": "alta"
    }
  ]
}
\`\`\`
<!-- INSTRUCCIONES_AUTOAPLICABLES_FIN -->

## VEREDICTO DE REPARABILIDAD AUTOMÁTICA (JSON)

Después del bloque anterior, emite un SEGUNDO bloque JSON entre los marcadores siguientes con tu evaluación de si los problemas detectados pueden ser corregidos por el sistema automático de reescritura cap-a-cap (Cirujano + Final Reviewer) o requieren intervención humana directa:

<!-- VEREDICTO_GATE_INICIO -->
\`\`\`json
{
  "severidad_global": "reparable",
  "issues_irreparables": [
    {"capitulo": 7, "problema": "POV mezclado entre omnisciente y 1ª persona sin justificación narrativa", "motivo": "requiere reescritura completa del cap desde otro punto de vista, fuera del alcance del Cirujano"}
  ]
}
\`\`\`
<!-- VEREDICTO_GATE_FIN -->

REGLAS DEL VEREDICTO (críticas):
- "severidad_global": exactamente uno de:
  - "reparable": problemas locales o estructurales abordables vía cirugía cap-a-cap (continuidad, foreshadowing, ritmo, repeticiones, retoques de personaje, escenas que sobran/faltan).
  - "reparable_con_reservas": problemas significativos pero ejecutables; el resultado puede no ser óptimo y conviene avisar al usuario.
  - "irreparable_automaticamente": al menos un capítulo requiere REESCRITURA COMPLETA por cambio de POV/voz/foco que no es find-and-replace, o un arco de personaje exige re-estructurar 5+ capítulos coordinadamente, o el clímax está construido sobre una premisa inconsistente con el setup.
- "issues_irreparables": array (vacío si severidad="reparable"). Cada item: capitulo (número), problema (1 frase), motivo (por qué el sistema no puede repararlo automáticamente).
- Sé CONSERVADOR. Marca "irreparable_automaticamente" SOLO si genuinamente la cirugía cap-a-cap no puede resolverlo. Casi todo es "reparable" o "reparable_con_reservas". Un reviewer demasiado pesimista bloquea el flujo automático sin necesidad.
- Si todo está limpio: \`{"severidad_global": "reparable", "issues_irreparables": []}\`.

REGLAS DEL JSON (críticas — el sistema lo parsea automáticamente):
- **COMILLAS DENTRO DE STRINGS**: NUNCA uses comillas dobles (\`"\`) dentro del valor de un string. Si necesitas citar un diálogo, una frase o un fragmento del manuscrito, usa SIEMPRE comillas simples (\`'\`). Ejemplo correcto: \`"instrucciones_correccion": "El doctor le dice a Audra 'Lyle siempre llevaba café.'"\`. Ejemplo INCORRECTO (rompe el JSON): \`"instrucciones_correccion": "El doctor le dice a Audra "Lyle siempre llevaba café.""\`. Esto aplica a TODOS los campos de tipo string (descripcion, instrucciones_correccion, plan_por_capitulo, etc.).
- Cada objeto del array debe corresponder 1-a-1 con un punto de "## SUGERENCIAS CONCRETAS DE CORRECCIÓN". Si pusiste 7 sugerencias arriba, el JSON tiene 7 objetos.
- "capitulos_afectados": array de NÚMEROS (no strings). Prólogo = 0, epílogo = -1, nota del autor = -2. Capítulos normales = 1, 2, 3... INCLUYE TODOS los capítulos que menciones en "instrucciones_correccion" — si la prosa habla del cap 32, 32 debe estar en capitulos_afectados.
- "categoria": exactamente una de: "trama", "personaje", "ritmo", "continuidad", "dialogo", "estilo", "descripcion", "otro".
- "tipo" (CRÍTICO — escoge el adecuado, el sistema procesa cada tipo de forma distinta):
  - "puntual": retoque local de 1-2 párrafos sin tocar la estructura del capítulo. Ejemplo: "corregir la mención al frasco roto en cap 23". Es CIRUGÍA find/replace.
  - "estructural": reescribir escenas enteras, reordenar dentro del capítulo, mover una revelación de un cap a otro, expandir un arco, añadir foreshadowing. Reescritura completa del capítulo afectado.
  - "eliminar": SOLO si la sugerencia natural dice literalmente "eliminar el cap X", "borrar el cap Y", "fuera el cap Z". Borrado destructivo del capítulo entero, sin absorción en otro.
  - "fusionar": SOLO para fusionar capítulos enteros (ej: "condensar caps 7-9 en uno solo", "fusionar caps 34, 35 y epílogo en un cierre"). REQUIERE los campos:
      • "merge_into": número del capítulo DESTINO (donde se absorben los demás).
      • "merge_sources": array de números de los capítulos ORIGEN (los que serán absorbidos y eliminados).
      • "capitulos_afectados" = [merge_into, ...merge_sources] (todos).
    Esta operación es ADMINISTRATIVA y requiere CONFIRMACIÓN HUMANA — el sistema la mostrará al usuario para que la apruebe explícitamente, no se aplica automáticamente con el resto.
  - "global_style": SOLO para directivas transversales que afectan a la novela ENTERA (ej: "reducir descripciones sensoriales repetitivas en todos los capítulos", "uniformar la voz narrativa", "podar adjetivación excesiva globalmente"). El sistema lo registrará como NOTA para el próximo pase de Pulido — no aplica reescritura cap-a-cap (sería catastrófico).
- "plan_por_capitulo" (OBLIGATORIO si capitulos_afectados.length > 1, salvo para "eliminar", "fusionar" y "global_style"):
    objeto donde la clave es el NÚMERO DE CAPÍTULO (como STRING) y el valor es la instrucción específica para ESE capítulo. Ejemplo:
      "plan_por_capitulo": {
        "4": "Mostrar a Publio insistiendo en la viabilidad política del vino y mostrando inquietud por las represalias.",
        "5": "Profundizar la inquietud de Publio durante la negociación, sembrando codicia.",
        "20": "Añadir una conversación en susurros entre Publio y un mensajero imperial.",
        "21": "Que Publio escriba/reciba una carta secreta que Aurelia entreve."
      }
    Sin "plan_por_capitulo", el sistema NO puede coordinar la reescritura del arco y los N capítulos recibirán la misma instrucción genérica → calidad degradada. NO es opcional cuando hay arco multi-cap.
- "prioridad": "alta" para problemas estructurales/clímax/arco, "media" para ejecución, "baja" para pulidos. "global_style" siempre es "baja" o "media".
- "descripcion": 1 frase que el usuario verá en la previsualización antes de aprobar.
- "instrucciones_correccion": 1-3 frases con la orden CONCRETA al narrador (qué tocar, dónde, cómo). NO copies la frase natural literal — reformúlala como orden ejecutable. Si distingues entre capítulos, esa información va en "plan_por_capitulo", no aquí.
- COHERENCIA CRÍTICA: cualquier número de capítulo que menciones en "descripcion", "instrucciones_correccion" o "plan_por_capitulo" DEBE estar también en "capitulos_afectados". El sistema valida esto y descarta o reconcilia automáticamente, pero un JSON coherente reduce errores.
- Si la novela está limpia y no tienes sugerencias, devuelve \`{"instrucciones": []}\` igualmente entre los marcadores.
- NO añadas comentarios dentro del JSON. NO añadas markdown dentro del JSON. NO añadas texto entre los marcadores aparte del bloque \`\`\`json ... \`\`\`.

4. **PROHIBIDO ABSOLUTO**:
   - NO uses emojis.
   - NO uses lenguaje de marketing ("apasionante", "trepidante", "absorbente") salvo que cualifiques.
   - NO inventes problemas si no existen para llenar secciones.
   - NO te disculpes por la severidad.
   - NO menciones tu papel ("como editor te diría que..."). Limítate a editar.
   - NO sugieras reescrituras totales. Tus sugerencias deben ser quirúrgicas y aplicables.
   - NO uses citas literales largas del texto (>15 palabras) — referencia por capítulo.

5. **CONTEXTO DE SERIE (CRÍTICO si aplica)**: Si en los datos del manuscrito recibes un bloque "## CONTEXTO DE SERIE", este libro NO es una obra autoconclusiva sino un volumen dentro de una serie planificada. Debes ajustar tu severidad:
   - El bloque te dirá si este es el VOLUMEN ACTUAL N de M y si es el ÚLTIMO de la serie.
   - Si **NO es el último volumen**: los arcos largos de la serie (la trama global, el conflicto principal del villano de fondo, romances que evolucionan, profecías) están DISEÑADOS para cerrarse en volúmenes posteriores. NO los marques como "arcos abiertos abandonados", "trama que muere", "subtrama sin resolver" ni problema estructural. Marca COMO PROBLEMA solo los arcos que el propio volumen abre y promete cerrar dentro de sí mismo (la trama autoconclusiva del libro: el caso del libro, la misión del libro, el viaje del libro). Un volumen intermedio bien construido cierra su trama interna y deja avanzados — no resueltos — los hilos de la serie.
   - Si **SÍ es el último volumen**: aplica todo el rigor habitual; aquí TODO arco serie y volumen debe cerrar.
   - El bloque también te listará HILOS NO RESUELTOS HEREDADOS de libros previos y EVENTOS CLAVE previos. Esos hilos heredados se asume que el lector ya los conoce; no marques como "personaje sin presentar" o "evento sin contexto" cosas explícitamente listadas allí. Sí marca cuando el libro contradice un evento previo o un rasgo establecido.
   - El bloque te listará MILESTONES OBLIGATORIOS de este volumen. Verifica que esos hitos ocurran. Si faltan, ESO sí es un problema estructural mayor.
   - En el JSON de instrucciones auto-aplicables: NO emitas instrucciones que pidan "cerrar el arco X" si X es un hilo de serie y este no es el último volumen. NO emitas instrucciones que pidan presentar/explicar elementos heredados de libros previos. Sí emite instrucciones para corregir contradicciones contra el canon de la serie.

6. **REFERENCIAS A CAPÍTULOS**: Siempre que diagnostiques algo, cita el capítulo concreto entre paréntesis (cap N). Si el problema cruza varios capítulos, cita todos los implicados (caps N-M o caps N, P, R). Para las secciones especiales usa estas etiquetas literales en lugar de "cap N": **(prólogo)**, **(epílogo)**, **(nota del autor)**. El prólogo, el epílogo y la nota del autor SON parte integral del manuscrito y debes evaluarlos como tales:
   - El **prólogo** marca tono, promesa y contrato con el lector. Si es funcional, dilo; si dispersa, dilo.
   - El **epílogo** cierra arcos pendientes y entrega la imagen final. Evalúa explícitamente si lo logra, si está conectado con el clímax (cap N) o si es un apéndice descolgado.
   - La **nota del autor** se valora por separado (no es ficción): comenta solo si su tono o contenido daña la sensación final.

Tu informe servirá como notas editoriales que el autor procesará después con un sistema de corrección quirúrgica. Cuanto más concreto y referenciado sea tu informe, más útil será.`;

export class HolisticReviewerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Lector Holístico",
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
    input: HolisticReviewerInput,
    projectId?: number
  ): Promise<HolisticReviewerResult> {
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
      ? `\n\n## VOZ NARRATIVA CANÓNICA DEL PROYECTO\n${styleDir.humanText}.\nEvalúa si la novela respeta esta voz; cualquier desviación sostenida es un problema MAYOR.`
      : "";

    const styleBlock = input.guiaEstilo
      ? `\n\n## GUÍA DE ESTILO ORIGINAL DEL AUTOR\n${input.guiaEstilo.slice(0, 4000)}`
      : "";

    const worldBibleBlock = input.worldBibleSummary
      ? `\n\n## CANON DEL MUNDO (resumen)\n${input.worldBibleSummary.slice(0, 6000)}`
      : "";

    // [Fix57] Bloque que activa la regla 5 del SYSTEM_PROMPT.
    const seriesBlock = (input.seriesContext && input.seriesContext.trim().length > 0)
      ? `\n\n${input.seriesContext}`
      : "";

    // [Fix76] Si hay acciones administrativas pendientes (delete_chapter,
    // merge_chapters...) emitidas por el cirujano estructural, el editor las
    // verifica ahora: tiene el manuscrito entero delante, puede comprobar si
    // la integración de prosa quedó bien y emitir veredicto. El flujo es
    // desatendido: si Holístico y Beta dicen "apply" sobre la misma id, el
    // orquestador la ejecuta sin confirmación humana.
    const pendingAdmin = (input.pendingAdminActions || []).filter(a => a && typeof a.id === "number");
    const adminBlock = pendingAdmin.length === 0 ? "" : `\n\n═══════════════════════════════════════════════════════════════════
## ACCIONES ADMINISTRATIVAS PENDIENTES DE VERIFICACIÓN (CRÍTICO)
═══════════════════════════════════════════════════════════════════

El sistema de cirugía estructural ha emitido ${pendingAdmin.length} acción(es) administrativa(s) pendiente(s). Cada una propone una operación DESTRUCTIVA (borrar o fusionar capítulos) que NO se ha aplicado todavía porque requiere verificación. AHORA QUE HAS LEÍDO EL MANUSCRITO COMPLETO debes decidir, para cada acción, si:

- **apply**: la integración de la prosa quedó bien (el contenido del cap origen ya está incorporado en el cap destino, o el cap es genuinamente redundante/innecesario). La acción puede ejecutarse de forma desatendida.
- **keep_pending**: dudas, no puedes verificarlo desde el texto, o el efecto podría perder información narrativa importante. Se mantiene pendiente para revisión humana.
- **discard**: la acción es claramente errónea (el cap origen contiene material único e insustituible NO integrado en otra parte; borrarlo destruiría la novela). Se descarta del listado.

LISTA DE ACCIONES A EVALUAR:
${pendingAdmin.map(a => `- id=${a.id} | tipo=${a.type} | sobre ${a.targetLabel || `cap ${a.targetChapter}`}${typeof a.secondaryChapter === "number" ? ` (afecta también a cap ${a.secondaryChapter})` : ""} | motivo emitido por el cirujano: ${a.reason}`).join("\n")}

CRITERIO DE VERIFICACIÓN PARA delete_chapter:
1. Localiza el cap que se propone borrar (targetChapter).
2. Si su contenido narrativo (escenas, revelaciones, beats de personaje, info de mundo) ya aparece en otro cap del manuscrito → **apply**.
3. Si su contenido es redundante con cosas que ya están dichas o es un cap huérfano que no aporta → **apply**.
4. Si contiene material ÚNICO que no está en ningún otro cap (motivación del villano, arco de un personaje, escena clave de mundo) → **discard** y explica qué se perdería.
5. Si hay duda razonable o el cap mezcla material único con material ya integrado → **keep_pending**.

CRITERIO PARA merge_chapters / split_chapter / move_content / swap_chapters / reorder_chapters:
- Si la operación SOLO ejecuta una reorganización segura ya descrita en la prosa de los caps afectados → **apply**.
- Si requiere reescritura que el sistema desatendido no puede hacer bien → **keep_pending**.
- Si la fusión propuesta crearía un cap incoherente o destruiría material → **discard**.

Tras emitir todas las demás secciones del informe, añade UN bloque JSON entre estos marcadores literales (no los modifiques, no añadas otros), con UN veredicto por cada id de la lista de arriba:

<!-- VEREDICTO_ADMIN_ACCIONES_INICIO -->
\`\`\`json
{
  "veredictos": [
    { "id": ${pendingAdmin[0].id}, "veredicto": "apply", "motivo": "El contenido del cap X ya aparece integrado en cap Y línea Z; borrarlo no pierde información." }
  ]
}
\`\`\`
<!-- VEREDICTO_ADMIN_ACCIONES_FIN -->

REGLAS DEL VEREDICTO (críticas — el sistema lo parsea automáticamente):
- Tienes que devolver EXACTAMENTE ${pendingAdmin.length} objeto(s) en el array "veredictos", uno por cada id de la lista (${pendingAdmin.map(a => a.id).join(", ")}). NO omitas ninguno. NO inventes ids nuevos.
- "id": el número entero EXACTO de la lista de arriba.
- "veredicto": exactamente uno de "apply", "keep_pending", "discard".
- "motivo": 1-2 frases CONCRETAS que justifican el veredicto, citando caps específicos. Para "apply" deja claro DÓNDE está integrado el material. Para "discard" deja claro QUÉ se perdería.
- Sé CONSERVADOR. Ante la mínima duda → "keep_pending". El usuario prefiere mantener un cap dudoso a borrarlo por error.
- Tu veredicto es INDEPENDIENTE del que emita el Lector Beta. Solo si AMBOS coincidimos en "apply" la acción se ejecuta automáticamente. Si nuestros veredictos divergen, la acción queda pendiente.`;

    const metaBlock = `## DATOS DEL MANUSCRITO
Título: ${input.projectTitle}
Género objetivo: ${input.generoObjetivo || "(no especificado)"}
Longitud objetivo: ${input.longitudObjetivo || "(no especificado)"}
Capítulos entregados: ${sortedChapters.length}
Palabras totales aproximadas: ${totalWords.toLocaleString("es-ES")}`;

    const chaptersBlock = sortedChapters
      .map(c => `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n## ${getChapterLabel(c.numero)}${c.titulo ? `: ${c.titulo}` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${c.contenido || "(sección vacía)"}`)
      .join("");

    // [Fix140] Aviso de regresión: la ronda previa empeoró la nota y se revirtió.
    const regressionBlock = (input.regressionWarning && input.regressionWarning.trim().length > 0)
      ? `\n\n═══════════════════════════════════════════════════════════════════
## [Fix140] AVISO: LA RONDA ANTERIOR DE CORRECCIONES EMPEORÓ LA NOVELA
═══════════════════════════════════════════════════════════════════

${input.regressionWarning}

REGLA CRÍTICA para esta relectura:
- Estás releyendo la MEJOR versión conocida (se revirtió porque las últimas correcciones la empeoraron). Tu objetivo es NO volver a romperla.
- Sé CONSERVADOR y QUIRÚRGICO: señala SOLO defectos graves, reales y verificables en el texto actual; cita el (cap N).
- EVITA exigir reescrituras amplias, refundiciones de tono o cambios estructurales de alto riesgo: ya provocaron una regresión. Prefiere ajustes mínimos y localizados de alto valor y bajo riesgo.
- Si el manuscrito ya está sólido, dilo: es legítimo emitir pocas o ninguna instrucción en vez de forzar cambios que puedan empeorar el conjunto.`
      : "";

    const prompt = `${metaBlock}${voiceBlock}${styleBlock}${worldBibleBlock}${seriesBlock}${adminBlock}${regressionBlock}

═══════════════════════════════════════════════════════════════════
NOVELA COMPLETA A REVISAR
═══════════════════════════════════════════════════════════════════
${chaptersBlock}

═══════════════════════════════════════════════════════════════════
FIN DEL MANUSCRITO
═══════════════════════════════════════════════════════════════════

Has terminado de leer la novela completa. Redacta ahora tu INFORME EDITORIAL HOLÍSTICO siguiendo el formato obligatorio. Sé severo, concreto y referencia siempre los capítulos.`;

    const response: AgentResponse = await this.generateContent(prompt, projectId, { temperature: 0.6 });

    if (response.error) {
      throw new Error(`HolisticReviewer falló: ${response.error}`);
    }
    if (!response.content || !response.content.trim()) {
      throw new Error("HolisticReviewer devolvió un informe vacío.");
    }

    return {
      notesText: response.content.trim(),
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      totalChaptersRead: sortedChapters.length,
      totalWordsRead: totalWords,
      score: extractScoreFromMarkers(response.content, "PUNTUACION_HOLISTICA"),
      adminActionVerdicts: pendingAdmin.length > 0
        ? extractAdminActionVerdicts(response.content)
        : [],
    };
  }
}
