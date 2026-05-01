import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";
import { storage } from "../storage";
import { extractStyleDirectives, buildArchitectDirectiveBlock } from "../utils/style-directives";

interface ArchitectInput {
  title: string;
  premise?: string;
  genre: string;
  tone: string;
  chapterCount: number;
  hasPrologue?: boolean;
  hasEpilogue?: boolean;
  hasAuthorNote?: boolean;
  guiaEstilo?: string;
  architectInstructions?: string;
  kindleUnlimitedOptimized?: boolean;
  forbiddenNames?: string[];
  projectId?: number;

  // Texto íntegro de los volúmenes anteriores de la misma serie, ordenados
  // por seriesOrder ascendente. Aprovecha el contexto de 1M tokens de
  // DeepSeek V4 para que el Arquitecto diseñe la nueva escaleta sin
  // contradecir hechos, frases ni gestos concretos de los libros previos.
  previousVolumesFullText?: string;

  // Catálogo del pseudónimo: títulos + premisas (y, si caben, sinopsis
  // breves) de OTRAS novelas del mismo pseudónimo. Sirve para que el
  // Arquitecto evite repetirse a sí mismo en giros y estructuras.
  pseudonymCatalog?: string;

  // Contenido íntegro de la "Guía Extendida" (extended_guides.content):
  // materiales de referencia del autor, manuscritos importados como
  // ejemplo de voz, fuentes históricas, etc. Antes solo se inyectaba el
  // resumen en `architectInstructions`; ahora se pasa entero.
  extendedGuideContent?: string;

  // Solo para el flujo de re-arquitectura mid-novela (T003):
  // texto íntegro de los capítulos ya escritos hasta el corte del usuario.
  // Si está presente, el Arquitecto debe rediseñar la escaleta DESDE
  // `redesignFromChapter` SIN tocar los capítulos previos.
  writtenChaptersFullText?: string;
  redesignFromChapter?: number;
  redesignInstructions?: string;
}

const PHASE1_SYSTEM_PROMPT = `
Eres un Arquitecto de Tramas Maestro, Orquestador de Bestsellers y Supervisor de Continuidad Literaria con capacidad de RAZONAMIENTO PROFUNDO.
Tu misión es diseñar novelas IMPECABLES que compitan en el nivel 9+/10 del mercado editorial.

═══════════════════════════════════════════════════════════════════
🔥 BESTSELLER BLUEPRINT - TU OBJETIVO ES EL 9+/10 🔥
═══════════════════════════════════════════════════════════════════
CADA NOVELA que planifiques debe diseñarse para:
- ENGANCHAR en las primeras 3 páginas (hook irresistible)
- SORPRENDER cada 3-5 capítulos con giros que el lector NO vea venir
- ESCALAR la tensión de forma que el lector NO PUEDA dejar de leer
- EMOCIONAR profundamente: el lector debe SENTIR, no solo entender
- SATISFACER con un clímax que justifique todo el viaje

Piensa como un guionista de Hollywood + un autor de thrillers #1 en ventas.

═══════════════════════════════════════════════════════════════════
FILOSOFÍA ANTI-REPETICIÓN
═══════════════════════════════════════════════════════════════════
Cada capítulo debe revelar información NUEVA, escalar el conflicto de forma DIFERENTE, y avanzar al menos UN arco narrativo.

═══════════════════════════════════════════════════════════════════
⛔ ORIGINALIDAD DE NOMBRES DE PERSONAJES (REGLA INVIOLABLE) ⛔
═══════════════════════════════════════════════════════════════════
Tienes tendencia GRAVE a reutilizar los mismos nombres y apellidos en todas las novelas. Esto está TERMINANTEMENTE PROHIBIDO.

REGLAS:
1. NUNCA reutilices nombres o apellidos de personajes que ya existen en otras novelas del autor (se te proporcionará la lista como "NOMBRES YA USADOS EN OTRAS OBRAS").
2. NUNCA uses nombres genéricos que la IA tiende a repetir. Lista negra ABSOLUTA de nombres/apellidos prohibidos (salvo que la obra sea continuación de una serie donde ya existen):
   - Marco/Marcos, Elena, Lucía, Gabriel, Isabella/Isabel, Alejandro/Alexander, Sofía, Miguel, Valentina, Adrián, Daniela, Rafael, Carmen, Hugo, Clara, León, Victoria, Emilio, Aurora, Sebastián
   - Apellidos: Vega, Torres, Mendoza, Rivera, Delgado, Vargas, Navarro, Herrera, Montoya, Castillo, Moreno, Reyes
3. Investiga nombres REALES pero INUSUALES y MEMORABLES apropiados para la época, cultura y geografía de la novela.
4. Cada personaje debe tener un nombre que SUENE DIFERENTE a los demás del mismo libro (evita nombres que empiecen igual o rimen).
5. Los nombres deben reflejar la PROCEDENCIA CULTURAL del personaje (no pongas nombres españoles a personajes japoneses, ni nombres anglosajones a personajes de la Roma antigua, etc.).
6. Prioriza nombres que el lector RECUERDE: distintivos, con personalidad, que evoquen algo del carácter del personaje.
7. Para novelas históricas: investiga nombres AUTÉNTICOS de la época, no uses adaptaciones modernas.

═══════════════════════════════════════════════════════════════════
PERSONAJES TRIDIMENSIONALES — ANTI-ARQUETIPOS (CRÍTICO)
═══════════════════════════════════════════════════════════════════
Tu SEGUNDO mayor defecto (después de los nombres repetidos) es crear SECUNDARIOS ARQUETÍPICOS.
Cada secundario con más de 3 apariciones DEBE tener:
1. UN DEFECTO QUE CONTRADIGA SU ROL: el hacker que tiene pánico a la tecnología médica, la novata que es más fría que su jefe, el mentor que duda de sí mismo
2. UNA MOTIVACIÓN PROPIA que NO sea simplemente "ayudar al protagonista"
3. AL MENOS UN MOMENTO donde actúa CONTRA los intereses del grupo por razones personales coherentes
4. UN MODISMO DE HABLA ÚNICO: no solo acento, sino estructura mental distinta (uno habla con refranes, otro con preguntas retóricas, otro nunca termina las frases)

PROHIBIDO crear estos arquetipos sin subversión:
- El hacker cínico y brillante → Añade vulnerabilidad emocional o ineptitud social real
- La novata entusiasta/asustadiza → Dale competencia inesperada o frialdad calculadora
- El jefe duro pero justo → Dale un defecto moral real
- El villano que monologa → Que actúe más que hable
- El confidente sabio → Que tenga sus propios problemas sin resolver

═══════════════════════════════════════════════════════════════════
PRINCIPIOS DE CONTINUIDAD FÍSICA
═══════════════════════════════════════════════════════════════════
1. RASGOS FÍSICOS INMUTABLES: Documenta con precisión exacta el color de ojos, cabello, cicatrices, altura de cada personaje.
2. POSICIÓN ESPACIOTEMPORAL: Simula dónde está cada personaje físicamente.
3. CAUSALIDAD MECÁNICA: Cada acción es consecuencia de una anterior.

═══════════════════════════════════════════════════════════════════
PROHIBICIONES ABSOLUTAS - VEROSIMILITUD NARRATIVA
═══════════════════════════════════════════════════════════════════
NUNCA planifiques:
1. RESCATES NO SEMBRADOS - Ningún personaje/objeto/habilidad puede aparecer sin establecerse previamente
2. COINCIDENCIAS INVEROSÍMILES - Nada de "justo en ese momento llegó X"
3. SOLUCIONES MÁGICAS - No introducir reglas/tecnología justo cuando se necesitan
4. REGLA DE SETUP/PAYOFF - Todo payoff requiere un setup previo (mínimo 2 capítulos de anticipación)

═══════════════════════════════════════════════════════════════════
⚠️ CLARIDAD DE IDENTIDADES — ANTI-CONFUSIÓN (REGLA CRÍTICA) ⚠️
═══════════════════════════════════════════════════════════════════
Los errores de "identidad confusa" son IMPOSIBLES de corregir con reescrituras — DEBEN prevenirse en el diseño.

REGLAS OBLIGATORIAS:
1. IDENTIDADES DOBLES/SECRETAS: Si un personaje tiene una identidad oculta (alias, disfraz, falsa identidad):
   - Documéntalo EXPLÍCITAMENTE en la World Bible con campos "identidad_publica" e "identidad_real"
   - Especifica EXACTAMENTE en qué capítulo se revela al lector y en qué capítulo se revela a otros personajes
   - Define CÓMO el narrador se refiere al personaje ANTES y DESPUÉS de la revelación (nombre A vs nombre B)
   - NUNCA dejes ambiguo quién sabe qué sobre la identidad en cada momento de la trama
2. PERSONAJES SIMILARES: Si dos personajes comparten rasgos (gemelos, dobles, impostores):
   - Dales MARCADORES ÚNICOS inconfundibles (cicatriz, tic verbal, objeto distintivo)
   - Documenta las diferencias en cada escena donde coexistan
3. POV Y CONOCIMIENTO: En cada capítulo de la escaleta, declara:
   - Qué sabe el narrador/POV sobre cada identidad secreta en ese momento
   - Si hay información que el lector sabe pero el personaje no (ironía dramática), o viceversa
4. TRANSICIONES DE IDENTIDAD: Si un personaje cambia de nombre/rol/apariencia:
   - Define el capítulo EXACTO del cambio
   - El beat narrativo DEBE incluir la transición explícita
   - Los capítulos posteriores SOLO usan la nueva forma de referirse al personaje
5. PROHIBIDO: Tramas donde la identidad del personaje sea deliberadamente ambigua sin resolución clara planificada

═══════════════════════════════════════════════════════════════════
🕰️ ÉPOCA DE LA ACCIÓN
═══════════════════════════════════════════════════════════════════
Identifica la época a partir de título/premisa/guía y rellena
"world_bible.lexico_historico.epoca" con UNA LÍNEA. Ejemplos:
  - "1888, Londres victoriano"     - "Contemporánea, Madrid"
  - "Año 3024, colonia marciana"   - "Mundo secundario, s. XIX equiv."

Si la Guía de Estilo trae sección "ÉPOCA(S) HISTÓRICA(S)", úsala como
fuente de verdad: copia "epoca", ids de épocas paralelas y, si vienen,
sus listas de vocabulario y registro. No las reinventes ni contradigas.

Los demás campos de "lexico_historico" (terminos_anacronicos_prohibidos,
vocabulario_epoca_autorizado, registro_linguistico, notas_voz_historica)
son OPCIONALES en Fase 1: si los tienes claros añade 4-8 entradas como
ancla; si no, déjalos como [] o "" — los agentes posteriores los
completan bajo demanda. NO inventes listas largas: ahorrar tokens
es más importante que cubrir todo el vocabulario aquí.

MULTI-ÉPOCA (solo si la novela tiene timelines paralelos): añade entradas
en "epocas_paralelas" con {id (slug), epoca}. El resto opcional. Cada
capítulo de "escaleta_capitulos" debe traer "epoca_id" igual a un id del
array, o null si pertenece a la época raíz. Si es mono-época, deja
"epocas_paralelas" como [].

═══════════════════════════════════════════════════════════════════
FASE 1: WORLD BIBLE + ESTRUCTURA GLOBAL
═══════════════════════════════════════════════════════════════════
En esta fase, genera SOLO la base de la novela: personajes, mundo, arcos y estructura de actos.
NO generes la escaleta de capítulos (eso vendrá en la Fase 2).

Genera un JSON con estas claves:

"world_bible": { 
  "personajes": [{ 
    "nombre": "",
    "rol": "protagonista/antagonista/aliado/mentor/etc",
    "perfil_psicologico": "Descripción profunda de motivaciones, miedos, deseos, CONTRADICCIONES internas y defectos NO convencionales",
    "arco_transformacion": {
      "estado_inicial": "",
      "catalizador_cambio": "",
      "punto_crisis": "",
      "estado_final": ""
    },
    "contra_cliche": "Qué hace a este personaje DIFERENTE de su arquetipo. El hacker que no es cínico. La novata que no es asustadiza. El mentor que no es sabio. OBLIGATORIO para secundarios.",
    "identidad": {
      "tiene_doble_identidad": false,
      "identidad_publica": "Nombre/rol que todos conocen (null si no aplica)",
      "identidad_real": "Nombre/rol verdadero (null si no aplica)",
      "capitulo_revelacion_lector": null,
      "capitulo_revelacion_personajes": null,
      "nombre_narrador_antes_revelacion": "Cómo lo llama el narrador antes de la revelación",
      "nombre_narrador_despues_revelacion": "Cómo lo llama el narrador después"
    },
    "relaciones": [{"con": "nombre", "tipo": "alianza/conflicto/romance/mentoria", "evolucion": "cómo cambia"}],
    "vivo": true,
    "apariencia_inmutable": {
      "ojos": "Color EXACTO - CANÓNICO E INMUTABLE",
      "cabello": "Color, longitud, textura - CANÓNICO E INMUTABLE",
      "piel": "Tono y características - CANÓNICO E INMUTABLE",
      "altura": "Descripción relativa - CANÓNICO E INMUTABLE",
      "rasgos_distintivos": ["Cicatrices, lunares, marcas"],
      "voz": "Timbre, acento, características"
    },
    "vestimenta_habitual": "",
    "modismos_habla": ["Frases o muletillas características"]
  }],
  "lugares": [{ "nombre": "", "descripcion_sensorial": "", "reglas": [], "atmosfera": "" }],
  "reglas_lore": [{ "categoria": "", "regla": "", "restricciones": [] }],
  "watchpoints_continuidad": ["Elementos críticos que requieren verificación constante"],
  "temas_centrales": ["Los 2-3 temas filosóficos/morales"],
  "motivos_literarios": ["Símbolos recurrentes"],
  "vocabulario_prohibido": ["Palabras/frases cliché a EVITAR"],
  "lexico_historico": {
    "epoca": "OBLIGATORIO, una línea (ver instrucciones de ÉPOCA arriba).",
    "terminos_anacronicos_prohibidos": [],
    "vocabulario_epoca_autorizado": [],
    "registro_linguistico": "",
    "notas_voz_historica": "",
    "epocas_paralelas": []
  },
  "paleta_sensorial_global": {
    "sentidos_dominantes": [],
    "imagenes_recurrentes_permitidas": [],
    "imagenes_prohibidas_cliche": []
  }
}

"matriz_arcos": {
  "arco_principal": {
    "descripcion": "La trama central en una oración",
    "puntos_giro": [
      {"capitulo": 1, "evento": "", "consecuencia": ""}
    ]
  },
  "subtramas": [
    {
      "nombre": "",
      "tipo": "romance/misterio/venganza/redención/etc",
      "personajes_involucrados": [],
      "capitulos_desarrollo": [],
      "interseccion_trama_principal": "",
      "resolucion": ""
    }
  ]
}

"momentum_plan": {
  "curva_tension": {
    "acto1": { "nivel_inicial": 3, "nivel_final": 6, "puntos_tension": [] },
    "acto2": { "nivel_inicial": 6, "nivel_final": 9, "punto_medio_shock": "", "puntos_tension": [] },
    "acto3": { "nivel_inicial": 8, "nivel_climax": 10, "puntos_tension": [] }
  },
  "catalogo_giros": [
    { "capitulo": 0, "tipo": "revelacion/traicion/muerte/falsa_pista/reversal/descubrimiento", "descripcion": "", "setup_previo": "", "impacto_emocional": "" }
  ],
  "cadencia_sorpresas": "Cada cuántos capítulos debe haber un giro (3-5 recomendado)",
  "hooks_capitulo": {
    "regla": "CADA capítulo DEBE terminar con un hook",
    "tipos_permitidos": ["cliffhanger", "pregunta_sin_respuesta", "revelacion_parcial", "amenaza_inminente", "decision_imposible"]
  }
}

"estructura_tres_actos": {
  "acto1": { "capitulos": [], "funcion": "", "planteamiento": "", "incidente_incitador": "", "primer_punto_giro": "" },
  "acto2": { "capitulos": [], "funcion": "", "accion_ascendente": "", "punto_medio": "", "crisis": "", "segundo_punto_giro": "" },
  "acto3": { "capitulos": [], "funcion": "", "climax": "", "resolucion": "", "eco_tematico": "" }
}

"linea_temporal": [
  {"momento": "", "eventos_clave": [""], "capitulos": []}
]

"premisa": "Premisa central en una oración poderosa"

Responde ÚNICAMENTE con el JSON estructurado.
`;

const PHASE2_SYSTEM_PROMPT = `
Eres un Arquitecto de Tramas Maestro generando la ESCALETA DE CAPÍTULOS.
Ya has creado la World Bible y estructura global en la fase anterior. Ahora debes crear el plan capítulo por capítulo.

REGLAS CRÍTICAS:
1. Cada capítulo debe tener MÍNIMO 6 beats narrativos sustanciales.
2. Cada "informacion_nueva" debe ser GENUINAMENTE NUEVA — no repetir de capítulos anteriores.
3. Los conflictos deben escalar progresivamente.
4. Mínimo 2 subtramas activas por capítulo y 2-3 diálogos significativos.
5. Al menos 1 momento de reflexión interna del protagonista por capítulo, pero SOLO en beats de calma o transición — NUNCA durante beats de acción/tensión/clímax.

TÍTULOS - OBLIGATORIOS:
⛔ TODOS los capítulos DEBEN tener un "titulo" EVOCADOR y LITERARIO (2-6 palabras). NUNCA vacío o genérico.
- "Prólogo" SOLO en capítulo número 0. "Epílogo" SOLO en número -1.
- Capítulos regulares (1 a N) tienen títulos EVOCADORES.

FORMATO COMPACTO — Genera un JSON con "escaleta_capitulos":
{
  "escaleta_capitulos": [
    {
      "numero": 1,
      "titulo": "Título evocador",
      "acto": "1",
      "epoca_id": "presente_o_id_que_corresponda_o_null_si_novela_mono_epoca",
      "cronologia": "Momento temporal",
      "ubicacion": "Lugar con detalles sensoriales",
      "elenco_presente": ["Personaje1", "Personaje2"],
      "funcion_estructural": "Rol del capítulo en la trama",
      "arcos_que_avanza": [{"arco": "nombre", "de": "estado_antes", "a": "estado_después"}],
      "informacion_nueva": "Revelación que descubre el lector",
      "pregunta_dramatica": "Pregunta al terminar",
      "conflicto_central": "Descripción breve del conflicto y stakes",
      "beats": [
        "Apertura: descripción concisa de lo que ocurre (personajes, acción, sensorial)",
        "Desarrollo: descripción concisa",
        "Tensión: descripción concisa del conflicto",
        "Reflexión: monólogo interno o pausa narrativa",
        "Escalada: descripción concisa",
        "Cierre/Hook: tipo (cliffhanger/revelación/amenaza) + descripción"
      ],
      "palabras_objetivo": 3000,
      "giro_emocional": "de [emoción] a [emoción]",
      "continuidad_entrada": "Estado al iniciar",
      "continuidad_salida": "Estado al terminar",
      "hook_final": "Descripción del gancho para el siguiente capítulo",
      "nivel_tension": 7,
      "estado_identidades": "Quién sabe qué sobre identidades secretas en este punto. Ej: 'El lector sabe que X es Y, pero los personajes no' o 'null si no hay identidades dobles activas'"
    }
  ]
}

IMPORTANTE: Cada beat es un STRING conciso (1-3 oraciones), NO un objeto complejo. Esto reduce el JSON total.
IMPORTANTE: Si hay personajes con doble identidad, el campo "estado_identidades" es OBLIGATORIO en cada capítulo donde aparezcan.
Responde ÚNICAMENTE con el JSON.
`;

export class ArchitectAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Arquitecto",
      role: "architect",
      systemPrompt: PHASE1_SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,        // subido a max: el Arquitecto decide la trama y los personajes, baja originalidad se origina aquí. Razonamiento profundo merece la pena.
      maxOutputTokens: 32768,
      includeThoughts: false,      // el thoughtSignature solo se loguea, no lo usamos. Quitarlo reduce el tamaño de respuesta y baja el riesgo de drop a media generación.
    });
    // Override timeout: el Arquitecto genera JSON estructurado (no prosa larga).
    // 8 min por fase: la Fase 2 (escaleta detallada de N capítulos, hasta 65k
    // tokens de salida) chocaba contra los 5 min en novelas largas (>20 caps).
    // Sigue cabiendo dentro del watchdog de 15 min: 8 min × 1 fase activa + holgura.
    this.timeoutMs = 8 * 60 * 1000;
  }

  async execute(input: ArchitectInput): Promise<AgentResponse> {
    const guiaEstilo = input.guiaEstilo || `Género: ${input.genre}, Tono: ${input.tone}`;
    const ideaInicial = input.premise || input.title;

    const sectionsInfo = [];
    if (input.hasPrologue) sectionsInfo.push("PRÓLOGO");
    sectionsInfo.push(`${input.chapterCount} CAPÍTULOS`);
    if (input.hasEpilogue) sectionsInfo.push("EPÍLOGO");
    if (input.hasAuthorNote) sectionsInfo.push("NOTA DEL AUTOR");

    // Extrae voz narrativa canónica (POV, tiempo) desde la guía de estilo y la
    // prepende como bloque destacado para garantizar atención del modelo.
    const narrativeDirective = buildArchitectDirectiveBlock(extractStyleDirectives(guiaEstilo));

    const commonContext = `${narrativeDirective}
    Idea: "${ideaInicial}" 
    Guía de Estilo: "${guiaEstilo}"
    TÍTULO: ${input.title}
    GÉNERO: ${input.genre}
    TONO: ${input.tone}
    ESTRUCTURA: ${sectionsInfo.join(" + ")}
    ${input.hasPrologue ? "NOTA: Incluir PRÓLOGO que establezca el tono y siembre intriga." : ""}
    ${input.hasEpilogue ? "NOTA: Incluir EPÍLOGO que cierre todos los arcos narrativos." : ""}
    ${input.hasAuthorNote ? "NOTA: Incluir reflexiones para NOTA DEL AUTOR." : ""}
    ${input.architectInstructions ? `
    ═══════════════════════════════════════════════════════════════════
    🎯 INSTRUCCIONES ESPECÍFICAS DEL AUTOR (PRIORIDAD ALTA) 🎯
    ═══════════════════════════════════════════════════════════════════
    ${input.architectInstructions}
    Estas instrucciones tienen PRIORIDAD sobre las guías generales.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.kindleUnlimitedOptimized ? `
    ═══════════════════════════════════════════════════════════════════
    ⚡ OPTIMIZACIÓN KINDLE UNLIMITED (ACTIVA) ⚡
    ═══════════════════════════════════════════════════════════════════
    1. CAPÍTULOS CORTOS Y ADICTIVOS (800-1500 palabras, leíbles en 3-5 min)
    2. CLIFFHANGERS OBLIGATORIOS en cada capítulo
    3. Giros cada 3-4 capítulos, escenas cortas y dinámicas
    4. Hook en página 1, incidente incitador antes del capítulo 3
    5. Empezar in media res, múltiples líneas de tensión
    ⚠️ En KU, cada página leída = ingresos. El lector NO PUEDE dejar el libro.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.forbiddenNames && input.forbiddenNames.length > 0 ? `
    ═══════════════════════════════════════════════════════════════════
    ⛔ NOMBRES YA USADOS EN OTRAS OBRAS (PROHIBIDO REUTILIZAR) ⛔
    ═══════════════════════════════════════════════════════════════════
    Los siguientes nombres y apellidos ya fueron usados en otras novelas del autor.
    ESTÁ PROHIBIDO reutilizar cualquiera de ellos (ni como nombre ni como apellido):
    ${input.forbiddenNames.join(", ")}
    
    Inventa nombres COMPLETAMENTE NUEVOS, originales y memorables para TODOS los personajes.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.previousVolumesFullText ? `
    ═══════════════════════════════════════════════════════════════════
    📚 VOLÚMENES ANTERIORES DE LA SERIE (TEXTO ÍNTEGRO) 📚
    ═══════════════════════════════════════════════════════════════════
    A continuación tienes el texto literal de los libros previos de esta saga.
    USO OBLIGATORIO:
    - Respeta TODOS los hechos, frases dichas, gestos, relaciones y giros.
    - Reutiliza personajes, lugares y léxico ESTABLECIDOS (no los reinventes con otros nombres).
    - Continúa los hilos sueltos que dejaron los volúmenes previos.
    - Tu nueva escaleta debe sentirse como continuación natural, no como un libro independiente.

${input.previousVolumesFullText}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.pseudonymCatalog ? `
    ═══════════════════════════════════════════════════════════════════
    🎭 CATÁLOGO DEL PSEUDÓNIMO — EVITA REPETIRTE A TI MISMO 🎭
    ═══════════════════════════════════════════════════════════════════
    Estas son OTRAS novelas publicadas bajo este mismo pseudónimo.
    NO REPITAS sus premisas, giros, estructuras, arquetipos de protagonista
    ni clímax. La nueva novela debe ser claramente DIFERENTE de las siguientes:

${input.pseudonymCatalog}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.extendedGuideContent ? `
    ═══════════════════════════════════════════════════════════════════
    📖 MATERIALES DE REFERENCIA DEL AUTOR (ÍNTEGROS) 📖
    ═══════════════════════════════════════════════════════════════════
    Material aportado por el autor (otra novela suya como ejemplo de voz,
    fuentes de research, biografía, contexto histórico, etc.). Léelo entero
    y usa lo que sea relevante para que la novela tenga DATOS REALES
    cuando aplique y/o IMITE LA VOZ del autor cuando sea su material:

${input.extendedGuideContent}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.writtenChaptersFullText && typeof input.redesignFromChapter === "number" ? `
    ═══════════════════════════════════════════════════════════════════
    🔧 RE-ARQUITECTURA EN CURSO — RESPETA LO YA ESCRITO 🔧
    ═══════════════════════════════════════════════════════════════════
    El usuario quiere REDISEÑAR la escaleta DESDE el capítulo ${input.redesignFromChapter}.
    Los capítulos anteriores YA ESTÁN ESCRITOS y NO SE TOCAN.
    A continuación tienes el texto íntegro de esos capítulos ya escritos:

${input.writtenChaptersFullText}

    REGLAS:
    - Tu nueva escaleta debe partir EXACTAMENTE del estado al final del último capítulo escrito.
    - NO contradigas hechos, personajes, relaciones ni revelaciones de los capítulos previos.
    - Mantén los nombres, lugares y léxico ya establecidos.
    - Para la sección "seccion_por_capitulo", marca los capítulos previos como "YA_ESCRITO_NO_TOCAR" en su campo "objetivo_narrativo" (un placeholder corto basta) y diseña a fondo SOLO desde el capítulo ${input.redesignFromChapter} en adelante.
    ${input.redesignInstructions ? `\n    INSTRUCCIONES DEL AUTOR PARA EL REDISEÑO (PRIORIDAD MÁXIMA):\n    ${input.redesignInstructions}\n    ` : ""}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    `;

    console.log(`[El Arquitecto] === FASE 1: Generando World Bible y estructura global ===`);

    if (input.projectId) {
      try {
        await storage.createActivityLog({
          projectId: input.projectId,
          level: "info",
          agentRole: "architect",
          message: `📐 El Arquitecto — Fase 1/2: generando World Bible (personajes, lugares, arcos, estructura). Timeout: 8 min.`,
        });
      } catch (e) {
        console.warn(`[El Arquitecto] No se pudo escribir activity log Fase 1 inicio: ${(e as Error).message}`);
      }
    }
    const phase1StartedAt = Date.now();

    const phase1Prompt = `
    ${commonContext}
    
    FASE 1 DE 2: Genera la World Bible completa, matriz de arcos, plan de momentum, estructura de 3 actos, línea temporal y premisa.
    
    La novela tendrá ${input.chapterCount} capítulos${input.hasPrologue ? " + prólogo" : ""}${input.hasEpilogue ? " + epílogo" : ""}${input.hasAuthorNote ? " + nota del autor" : ""}.
    Diseña los arcos, giros y tensión para exactamente esa cantidad de capítulos.
    
    ⚡ BREVEDAD OBLIGATORIA — el JSON Fase 1 tiene cap de 32K tokens de salida. Para
    no truncar la respuesta:
    - Campos de prosa (perfil_psicologico, descripcion_sensorial, atmosfera, eventos_clave,
      notas_voz_historica, etc.): MÁX. 2 frases concisas, NO párrafos largos.
    - "linea_temporal": MÁX. 8 entradas de momentos clave, no una por capítulo.
    - "personajes": describe a fondo solo a protagonistas y antagonistas (perfil ≤ 3 frases);
      secundarios con 1-2 frases de perfil + contra_cliche obligatorio.
    - "lexico_historico": SOLO el campo "epoca" es obligatorio (1 línea). Las listas
      de vocabulario son OPCIONALES — si las añades máx. 4-8 entradas como ancla.
      No las infles, los agentes posteriores las amplían bajo demanda.
    - Termina el JSON limpiamente: si te quedas corto de tokens, recorta entradas
      opcionales antes que dejar el JSON truncado a media frase.
    
    Responde ÚNICAMENTE con el JSON estructurado según las instrucciones.
    `;

    this.config.systemPrompt = PHASE1_SYSTEM_PROMPT;
    const phase1Response = await this.generateContent(phase1Prompt);

    if (phase1Response.error || phase1Response.timedOut || !phase1Response.content?.trim()) {
      console.error(`[El Arquitecto] Fase 1 falló: ${phase1Response.error || "timeout/vacío"}`);
      return phase1Response;
    }

    let phase1Json: any;
    try {
      phase1Json = repairJson(phase1Response.content);
      console.log(`[El Arquitecto] Fase 1: JSON parseado correctamente`);
    } catch (e) {
      console.error(`[El Arquitecto] Fase 1: Error parseando JSON - ${(e as Error).message}`);
      return {
        content: phase1Response.content,
        error: `Phase 1 JSON parse error: ${(e as Error).message}`,
        timedOut: false,
        tokenUsage: phase1Response.tokenUsage,
        thoughtSignature: phase1Response.thoughtSignature,
      };
    }

    const phase1ElapsedSec = Math.round((Date.now() - phase1StartedAt) / 1000);
    const personajesCount = phase1Json.world_bible?.personajes?.length || 0;
    const arcosCount = phase1Json.matriz_arcos?.subtramas?.length || 0;
    console.log(`[El Arquitecto] Fase 1 completada en ${phase1ElapsedSec}s. Personajes: ${personajesCount}, Arcos: ${arcosCount}`);

    if (input.projectId) {
      try {
        await storage.createActivityLog({
          projectId: input.projectId,
          level: "info",
          agentRole: "architect",
          message: `✅ El Arquitecto — Fase 1/2 completada en ${phase1ElapsedSec}s. ${personajesCount} personajes, ${arcosCount} arcos.`,
        });
      } catch (e) {
        console.warn(`[El Arquitecto] No se pudo escribir activity log Fase 1 fin: ${(e as Error).message}`);
      }
    }

    console.log(`[El Arquitecto] === FASE 2: Generando escaleta de ${input.chapterCount} capítulos ===`);

    if (input.projectId) {
      try {
        await storage.createActivityLog({
          projectId: input.projectId,
          level: "info",
          agentRole: "architect",
          message: `📐 El Arquitecto — Fase 2/2: generando escaleta detallada de ${input.chapterCount} capítulos. Timeout: 8 min.`,
        });
      } catch (e) {
        console.warn(`[El Arquitecto] No se pudo escribir activity log Fase 2 inicio: ${(e as Error).message}`);
      }
    }
    const phase2StartedAt = Date.now();

    const phase1Summary = JSON.stringify({
      premisa: phase1Json.premisa,
      world_bible: {
        personajes: phase1Json.world_bible?.personajes?.map((p: any) => ({
          nombre: p.nombre,
          rol: p.rol,
          perfil_psicologico: p.perfil_psicologico,
          arco_transformacion: p.arco_transformacion,
          contra_cliche: p.contra_cliche,
          modismos_habla: p.modismos_habla,
          relaciones: p.relaciones,
        })),
        lugares: phase1Json.world_bible?.lugares,
        temas_centrales: phase1Json.world_bible?.temas_centrales,
        motivos_literarios: phase1Json.world_bible?.motivos_literarios,
        lexico_historico: phase1Json.world_bible?.lexico_historico ? {
          epoca: phase1Json.world_bible.lexico_historico.epoca,
          epocas_paralelas: phase1Json.world_bible.lexico_historico.epocas_paralelas,
        } : undefined,
      },
      matriz_arcos: phase1Json.matriz_arcos,
      momentum_plan: phase1Json.momentum_plan,
      estructura_tres_actos: phase1Json.estructura_tres_actos,
      linea_temporal: phase1Json.linea_temporal,
    });

    const phase2Prompt = `
    ${commonContext}

    ═══════════════════════════════════════════════════════════════════
    CONTEXTO DE LA FASE 1 (World Bible y estructura ya creadas):
    ═══════════════════════════════════════════════════════════════════
    ${phase1Summary}

    ═══════════════════════════════════════════════════════════════════
    ⛔ REQUISITO ABSOLUTO: EXACTAMENTE ${input.chapterCount} CAPÍTULOS ⛔
    ═══════════════════════════════════════════════════════════════════
    
    EL NÚMERO DE CAPÍTULOS NO ES TU DECISIÓN. DEBES generar EXACTAMENTE ${input.chapterCount} entradas en "escaleta_capitulos", numeradas del 1 al ${input.chapterCount}.
    ${input.hasPrologue ? "ADEMÁS: Prólogo como capítulo número 0." : ""}
    ${input.hasEpilogue ? "ADEMÁS: Epílogo como capítulo número -1." : ""}
    
    Si la historia te parece "terminada" antes del capítulo ${input.chapterCount}:
    - Expande subtramas existentes
    - Añade complicaciones y obstáculos
    - Desarrolla más los arcos de personajes secundarios
    
    CADA capítulo debe tener:
    - ⛔ TÍTULO OBLIGATORIO: Campo "titulo" con valor literario (2-6 palabras), NUNCA vacío
    - Beats detallados (mínimo 6 por capítulo)
    - Información nueva
    - Conflicto central
    - Continuidad de entrada/salida
    
    ⚠️ VERIFICACIÓN FINAL: Antes de responder, CUENTA las entradas en escaleta_capitulos.
    Si no hay EXACTAMENTE ${input.chapterCount} capítulos, tu respuesta es INVÁLIDA.
    
    Responde ÚNICAMENTE con el JSON que contenga "escaleta_capitulos".
    `;

    this.config.systemPrompt = PHASE2_SYSTEM_PROMPT;
    // La escaleta puede ser muy larga (60+ capítulos). Subimos el cap para Fase 2,
    // mientras Fase 1 (constructor) se queda en 32K para forzar concisión en la WB.
    const previousMaxOut = this.config.maxOutputTokens;
    this.config.maxOutputTokens = 65536;
    let phase2Response;
    try {
      phase2Response = await this.generateContent(phase2Prompt);
    } finally {
      this.config.maxOutputTokens = previousMaxOut;
    }

    console.log(`[El Arquitecto] Fase 2 API respondió: ${phase2Response.content?.length || 0} chars, tokens: in=${phase2Response.tokenUsage?.inputTokens || 0} out=${phase2Response.tokenUsage?.outputTokens || 0}, error=${phase2Response.error || "none"}, timedOut=${phase2Response.timedOut}`);

    if (phase2Response.error || phase2Response.timedOut || !phase2Response.content?.trim()) {
      const phase2ElapsedSec = Math.round((Date.now() - phase2StartedAt) / 1000);
      console.error(`[El Arquitecto] Fase 2 falló tras ${phase2ElapsedSec}s: ${phase2Response.error || "timeout/vacío"}`);
      if (input.projectId) {
        try {
          await storage.createActivityLog({
            projectId: input.projectId,
            level: "warning",
            agentRole: "architect",
            message: `⚠️ El Arquitecto — Fase 2/2 falló tras ${phase2ElapsedSec}s: ${phase2Response.timedOut ? "timeout (8 min)" : (phase2Response.error || "respuesta vacía")}.`,
          });
        } catch (e) {
          console.warn(`[El Arquitecto] No se pudo escribir activity log Fase 2 fallo: ${(e as Error).message}`);
        }
      }
      return phase2Response;
    }

    let phase2Json: any;
    try {
      phase2Json = repairJson(phase2Response.content);
      console.log(`[El Arquitecto] Fase 2: JSON parseado correctamente`);
    } catch (e) {
      console.error(`[El Arquitecto] Fase 2: Error parseando JSON - ${(e as Error).message}`);
      return {
        content: phase2Response.content,
        error: `Phase 2 JSON parse error: ${(e as Error).message}`,
        timedOut: false,
        tokenUsage: phase2Response.tokenUsage,
        thoughtSignature: phase2Response.thoughtSignature,
      };
    }

    const chaptersCount = phase2Json.escaleta_capitulos?.length || 0;
    const phase2ElapsedSec = Math.round((Date.now() - phase2StartedAt) / 1000);
    console.log(`[El Arquitecto] Fase 2 completada en ${phase2ElapsedSec}s. Capítulos generados: ${chaptersCount}`);

    if (input.projectId) {
      try {
        await storage.createActivityLog({
          projectId: input.projectId,
          level: "info",
          agentRole: "architect",
          message: `✅ El Arquitecto — Fase 2/2 completada en ${phase2ElapsedSec}s. ${chaptersCount} capítulos en la escaleta.`,
        });
      } catch (e) {
        console.warn(`[El Arquitecto] No se pudo escribir activity log Fase 2 fin: ${(e as Error).message}`);
      }
    }

    const mergedResult = {
      ...phase1Json,
      escaleta_capitulos: phase2Json.escaleta_capitulos,
    };

    const mergedTokenUsage = {
      inputTokens: (phase1Response.tokenUsage?.inputTokens || 0) + (phase2Response.tokenUsage?.inputTokens || 0),
      outputTokens: (phase1Response.tokenUsage?.outputTokens || 0) + (phase2Response.tokenUsage?.outputTokens || 0),
      thinkingTokens: (phase1Response.tokenUsage?.thinkingTokens || 0) + (phase2Response.tokenUsage?.thinkingTokens || 0),
    };

    const mergedThoughts = [
      phase1Response.thoughtSignature || "",
      phase2Response.thoughtSignature || "",
    ].filter(Boolean).join("\n\n--- FASE 2 ---\n\n");

    console.log(`[El Arquitecto] ✅ Ambas fases completadas. Total: ${mergedResult.world_bible?.personajes?.length || 0} personajes, ${chaptersCount} capítulos`);

    return {
      content: JSON.stringify(mergedResult),
      tokenUsage: mergedTokenUsage,
      thoughtSignature: mergedThoughts || undefined,
      timedOut: false,
    };
  }
}
