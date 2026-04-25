import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";
import { storage } from "../storage";

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
🕰️ ÉPOCA DE LA ACCIÓN — DEFINICIÓN OBLIGATORIA (CRÍTICO PARA ANACRONISMOS)
═══════════════════════════════════════════════════════════════════
ANTES de escribir nada del JSON, define mentalmente la ÉPOCA EXACTA en la
que ocurre la acción. Sin esto es IMPOSIBLE evitar anacronismos en los
capítulos generados después.

🔎 FUENTE DE VERDAD PRIORITARIA — LA GUÍA DE ESTILO:
La "Guía de Estilo" recibida puede contener una sección titulada
"ÉPOCA(S) HISTÓRICA(S) DE LA NARRACIÓN" / "ÉPOCA(S) HISTÓRICA(S) DE LA
SERIE" con la época principal, el listado de épocas paralelas (si las
hay), el vocabulario autorizado/prohibido, el registro lingüístico y
las notas de voz histórica.

→ Si esa sección EXISTE en la guía, COPIA ESA INFORMACIÓN tal cual al
  campo "world_bible.lexico_historico" (incluyendo "epocas_paralelas"
  y los slugs/ids declarados en la guía). NO la reinventes ni la
  contradigas. Puedes ENRIQUECERLA con más términos prohibidos/
  autorizados específicos, pero NO cambies la época ni los ids.
→ Si la guía declara qué capítulos pertenecen a cada época paralela,
  asigna el campo "epoca_id" en cada capítulo de "escaleta_capitulos"
  respetando esa asignación.
→ Si la guía NO incluye sección de época (guías antiguas), DEDÚCELA
  tú mismo a partir de la idea/título/género siguiendo las reglas
  de abajo.

DEBES rellenar OBLIGATORIAMENTE el campo "world_bible.lexico_historico.epoca"
con formato preciso:
  - Si es novela histórica con período concreto: "Año(s) + Lugar geográfico".
    Ej: "1888, Londres victoriano"; "Verano de 79 d.C., Pompeya";
        "1936-1939, España (Guerra Civil)".
  - Si es contemporánea: "Contemporánea, [ciudad/país]" o "Actualidad, Madrid".
  - Si es futuro/sci-fi: "Futuro cercano (~2070), Tokio" / "Año 3024, colonia marciana".
  - Si es fantasía con mundo secundario: "Mundo secundario, equivalente a [siglo X / cultura Y]".

A partir de esa época concreta, RELLENA ADEMÁS (estos mínimos APLICAN SOLO si la
guía NO trae la sección de época; si la trae, copia LITERALMENTE las listas de
la guía y, opcionalmente, AÑADE entradas ADICIONALES sin eliminar ni modificar
ninguna de las originales):
  - "terminos_anacronicos_prohibidos": lista de palabras/conceptos que NO existían
    en esa época y que el ghostwriter NUNCA debe usar. Sé específico para la época
    declarada (ej: para 1888 prohíbe "ordenador", "psicología clínica", "antibiótico";
    para Roma 79 d.C. prohíbe "minuto exacto", "bacteria", "pólvora", "imprenta").
    Mínimo 15 entradas para épocas históricas; vacío solo para contemporáneas.
  - "vocabulario_epoca_autorizado": 15-30 términos auténticos del período que el
    ghostwriter debería preferir (oficios, monedas, indumentaria, instituciones,
    expresiones de época). Vacío solo para contemporáneas.
  - "registro_linguistico": tipo de habla (formal cortesano / coloquial popular /
    técnico jurídico / militar de campo / etc.) acorde a la época y los personajes.
    Si la guía ya lo declara, COPIA literalmente; no lo reescribas.
  - "notas_voz_historica": 2-4 frases con el matiz que el narrador debe mantener
    para sonar de la época (sin caer en arcaísmo forzado).
    Si la guía ya las declara, COPIA literalmente; no las reescribas.

Si la novela es CONTEMPORÁNEA o FUTURISTA SIN restricciones de época, las listas
pueden ir vacías PERO "epoca" debe estar declarada explícitamente para que los
agentes posteriores sepan que NO hay restricciones (no es lo mismo que olvidarlo).

═══════════════════════════════════════════════════════════════════
🕰️🕰️ NOVELAS CON LÍNEAS TEMPORALES PARALELAS (DUAL TIMELINE / MULTI-ÉPOCA)
═══════════════════════════════════════════════════════════════════
Si la novela tiene capítulos en MÁS DE UNA época (p.ej. capítulos en 2024 que
alternan con flashbacks a 1936; o tres líneas temporales: pasado, presente,
futuro), DEBES declarar TODAS las épocas en el array
"world_bible.lexico_historico.epocas_paralelas" con esta estructura:

  "epocas_paralelas": [
    {
      "id": "presente",        // identificador corto SIN espacios; será referenciado por cada capítulo
      "epoca": "Contemporánea, Madrid 2024",
      "terminos_anacronicos_prohibidos": [],
      "vocabulario_epoca_autorizado": [],
      "registro_linguistico": "coloquial urbano contemporáneo",
      "notas_voz_historica": "..."
    },
    {
      "id": "guerra_civil",
      "epoca": "1936-1939, España (Guerra Civil)",
      "terminos_anacronicos_prohibidos": ["móvil", "internet", "antibiótico moderno", ...],
      "vocabulario_epoca_autorizado": ["camisa azul", "alpargata", "zaguán", ...],
      "registro_linguistico": "español peninsular de los años 30, registros campesino y urbano de la época",
      "notas_voz_historica": "..."
    }
  ]

REGLAS:
- Cuando uses "epocas_paralelas", el campo "epoca" raíz puede contener la época
  PRINCIPAL/marco de la novela (la del presente narrativo o la dominante).
- Cada capítulo en "escaleta_capitulos" DEBE incluir el campo "epoca_id" con el
  identificador exacto de la época que le corresponde (debe coincidir con un
  "id" del array epocas_paralelas). Si el capítulo pertenece a la época
  principal raíz, puedes omitir "epoca_id" o ponerlo a null.
- Si la novela tiene UNA SOLA época, NO uses "epocas_paralelas" — déjalo vacío
  o ausente, y rellena solo el bloque raíz como se explicó arriba.

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
    "epoca": "OBLIGATORIO. Formato exacto: 'Año(s) + Lugar geográfico'. Ejemplos válidos: '1888, Londres victoriano', 'Verano de 79 d.C., Pompeya', '1936-1939, España (Guerra Civil)', '2024, Madrid contemporáneo', 'Futuro cercano (~2070), Tokio'. Si la novela es contemporánea, escribe 'Contemporánea' o 'Actualidad' + ciudad/país. Si es fantasía/sci-fi sin equivalente histórico, escribe 'Mundo secundario, equivalente tecnológico/cultural a [siglo X / época Y]'. Si la novela tiene varias épocas paralelas (timeline dual), pon aquí la PRINCIPAL/marco y rellena además 'epocas_paralelas'. NUNCA dejes este campo vacío.",
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
      model: "gemini-2.5-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: ArchitectInput): Promise<AgentResponse> {
    const guiaEstilo = input.guiaEstilo || `Género: ${input.genre}, Tono: ${input.tone}`;
    const ideaInicial = input.premise || input.title;

    const sectionsInfo = [];
    if (input.hasPrologue) sectionsInfo.push("PRÓLOGO");
    sectionsInfo.push(`${input.chapterCount} CAPÍTULOS`);
    if (input.hasEpilogue) sectionsInfo.push("EPÍLOGO");
    if (input.hasAuthorNote) sectionsInfo.push("NOTA DEL AUTOR");

    const commonContext = `
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
    `;

    console.log(`[El Arquitecto] === FASE 1: Generando World Bible y estructura global ===`);

    const phase1Prompt = `
    ${commonContext}
    
    FASE 1 DE 2: Genera la World Bible completa, matriz de arcos, plan de momentum, estructura de 3 actos, línea temporal y premisa.
    
    La novela tendrá ${input.chapterCount} capítulos${input.hasPrologue ? " + prólogo" : ""}${input.hasEpilogue ? " + epílogo" : ""}${input.hasAuthorNote ? " + nota del autor" : ""}.
    Diseña los arcos, giros y tensión para exactamente esa cantidad de capítulos.
    
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

    console.log(`[El Arquitecto] Fase 1 completada. Personajes: ${phase1Json.world_bible?.personajes?.length || 0}, Arcos: ${phase1Json.matriz_arcos?.subtramas?.length || 0}`);

    console.log(`[El Arquitecto] === FASE 2: Generando escaleta de ${input.chapterCount} capítulos ===`);

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
    const phase2Response = await this.generateContent(phase2Prompt);

    console.log(`[El Arquitecto] Fase 2 API respondió: ${phase2Response.content?.length || 0} chars, tokens: in=${phase2Response.tokenUsage?.inputTokens || 0} out=${phase2Response.tokenUsage?.outputTokens || 0}, error=${phase2Response.error || "none"}, timedOut=${phase2Response.timedOut}`);

    if (phase2Response.error || phase2Response.timedOut || !phase2Response.content?.trim()) {
      console.error(`[El Arquitecto] Fase 2 falló: ${phase2Response.error || "timeout/vacío"}`);
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
    console.log(`[El Arquitecto] Fase 2 completada. Capítulos generados: ${chaptersCount}`);

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
