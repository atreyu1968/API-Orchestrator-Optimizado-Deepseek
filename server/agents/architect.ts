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
  // [Fix90] Rango opcional. Si ambos están presentes y `minChapterCount <
  // maxChapterCount`, el Arquitecto decide el número final dentro del rango
  // tras una autoauditoría de densidad de hilos. Si no, se cae al modo
  // EXACTO con `chapterCount`.
  minChapterCount?: number | null;
  maxChapterCount?: number | null;
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

  // v7.2 Fix 9: feedback estructurado del Lector Beta de Escaletas. Cuando
  // el Lector Beta puntúa la escaleta < 8/10, el Orquestador re-ejecuta al
  // Arquitecto pasándole estas instrucciones de revisión + el perfil del
  // lector objetivo, para que rediseñe pensando explícitamente en él.
  betaReaderFeedback?: string;

  // [Fix18] Feedback del Auditor de Integridad Narrativa: se inyecta cuando
  // la auditoría de foreshadowing / coherencia antagonista / pacing del acto 3
  // detecta problemas de severidad alta. El Arquitecto debe corregir SIN
  // perder lo aprobado por críticas previas.
  plotIntegrityFeedback?: string;

  // [Fix92] Feedback del Auditor Estructural determinista (forma de escena,
  // ledger de información nueva, dosificación de revelaciones). Se inyecta
  // cuando el auditor detecta segundo acto repetitivo, "informacion_nueva"
  // de relleno en caps consecutivos, o info-dumps de revelaciones (patrón
  // "Cifuentes confiesa toda su historia en cap 21"). El Arquitecto DEBE
  // rellenar los 3 campos nuevos por capítulo (forma_dominante,
  // categoria_info_nueva, revelaciones_dosificadas) y aplicar las
  // correcciones literales.
  structuralAuditFeedback?: string;

  // [Fix78] World Bible consolidada de la serie (personajes con fichas ricas,
  // lugares, léxico, reglas) extraída de TODOS los volúmenes previos. El
  // Arquitecto DEBE usarla como verdad canónica: prohibido renombrar,
  // reinventar físico/edad/profesión/familia ni cambiar motivación nuclear
  // de los personajes ya establecidos. Si está presente, prevalece sobre
  // cualquier deducción que el Arquitecto pueda hacer del texto íntegro.
  seriesUnifiedWorldBible?: string;
  /**
   * [Fix80] Bloque markdown con HITOS OBLIGATORIOS del volumen actual e
   * HILOS argumentales abiertos de la serie. Antes de Fix80 estos datos
   * solo se inyectaban a los lectores (Holístico/Beta) en `series-context-
   * builder.ts`; el Architect del Vol 2 no sabía qué hitos debía planificar
   * ni qué hilos continuar, así que diseñaba escaletas desconectadas de
   * la guía de serie. Ahora se inyecta también aquí.
   */
  seriesMilestonesAndThreads?: string;
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
⛔ PROHIBICIONES ABSOLUTAS — VEROSIMILITUD NARRATIVA (REGLA CRÍTICA) ⛔
═══════════════════════════════════════════════════════════════════
El mayor pecado de una novela mal planificada es resolver conflictos con
soluciones FÁCILES, RÁPIDAS o NO GANADAS por los personajes. El lector
detecta inmediatamente cuando el conflicto se desinfla porque al autor le
faltaba estructura, y abandona el libro. NUNCA planifiques:

1. ⛔ DEUS EX MACHINA — Prohibido TERMINANTEMENTE que un problema se
   resuelva por:
   - Un personaje/poder/objeto/aliado que aparece de la nada en el
     capítulo del clímax (o cerca) sin haber sido sembrado MÍNIMO 2-3
     capítulos antes con presencia activa, no una mención de pasada.
   - Una revelación oportuna ("¡resulta que el villano era su padre!",
     "¡resulta que tenía el antídoto en el bolsillo!") que no tenga
     pistas explícitas plantadas en al menos 2 capítulos previos.
   - Una habilidad nueva del protagonista que se "descubre justo a
     tiempo" sin entrenamiento, coste o consecuencia previa.
   - Una intervención externa (cataclismo natural, autoridad que llega,
     enemigo común que aparece) que rescata al protagonista sin que él
     haya hecho NADA para provocarla.
   - Cualquier solución que, si la eliminas, deja al personaje muerto o
     atrapado: si solo "funciona" porque el autor lo necesita, es DEM.

2. ⛔ SOLUCIONES FÁCILES Y RÁPIDAS — El protagonista NUNCA debe resolver
   un conflicto mayor:
   - En menos capítulos de los que le costó plantearlo (regla 1:1
     mínimo entre setup y resolución de cualquier subtrama relevante).
   - Sin pagar un coste TANGIBLE (físico, emocional, moral, social,
     material). Si gana sin perder nada, el lector siente que no
     importaba.
   - Por suerte, casualidad, "el malo se descuidó" o el antagonista
     comete un error tonto sin estar caracterizado como descuidado.
   - Convenciendo al antagonista con un discurso de 1 escena: las
     decisiones de personajes se ganan con MÚLTIPLES interacciones,
     contradicciones internas y al menos un fracaso intermedio.
   - Con un atajo técnico/mágico que NO tenía limitaciones declaradas
     previamente y aparece exactamente cuando hace falta.

3. ⛔ RESCATES NO SEMBRADOS — Ningún personaje/objeto/habilidad/regla
   puede aparecer sin establecerse previamente, con uso activo en
   escena (no solo nombrado).

4. ⛔ COINCIDENCIAS INVEROSÍMILES — Nada de "justo en ese momento
   llegó X", "casualmente tenía la información clave", "se encontraron
   por azar en el sitio exacto". Las coincidencias se permiten SOLO al
   inicio de la novela (gancho); NUNCA para resolver conflictos.

5. ⛔ SOLUCIONES MÁGICAS — No introducir reglas/tecnología/poderes JUSTO
   cuando se necesitan. Toda regla mágica/tecnológica usada en el clímax
   debe haber sido demostrada en acción (no solo descrita) al menos
   2 veces en la primera mitad del libro, con sus LIMITACIONES también
   demostradas.

6. ⛔ REGLA DE SETUP/PAYOFF — Todo payoff requiere setup previo:
   - Mínimo 2 capítulos de anticipación visible al lector.
   - Para el clímax: mínimo 3 capítulos previos con tensión escalada.
   - El setup debe parecer NATURAL en su momento, no un "anuncio" del
     payoff (Chéjov, no spoiler).

📋 VERIFICACIÓN OBLIGATORIA AL CERRAR LA ESCALETA: recorre los capítulos
del último tercio (clímax y resolución) y para CADA elemento que resuelve
un conflicto (personaje que ayuda, objeto que se usa, habilidad que se
ejecuta, información que se revela), identifica el capítulo EXACTO previo
donde ese elemento fue sembrado con presencia activa. Si no encuentras
ese capítulo, REESCRIBE la resolución o añade el setup. Si la resolución
solo funciona porque "el autor lo decidió", está PROHIBIDA.

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

═══════════════════════════════════════════════════════════════════
⚠️ EL DEFECTO MÁS GRAVE QUE DEBES EVITAR: MONOTONÍA ESTRUCTURAL ⚠️
═══════════════════════════════════════════════════════════════════
Tu mayor riesgo NO es la calidad de cada capítulo individual, sino que TODOS
los capítulos del acto 2 (la parte central) acaben teniendo la misma FORMA:
apertura → conflicto → reflexión interna → escalada → cliffhanger. Cuando eso
pasa, el lector abandona la novela en la zona media porque "siempre sucede
lo mismo aunque cambie el contenido". DEBES rotar la forma de los capítulos.

CATÁLOGO DE TIPOS DE CAPÍTULO (debes USAR variedad, NO siempre el mismo):
A) "presion_unica"   — un solo escenario, tiempo real, claustrofóbico, sin saltos.
B) "montaje"         — comprime semanas/meses en escenas breves yuxtapuestas.
C) "dialogo_central" — 60%+ es una conversación larga; la trama avanza por palabras, no por acción.
D) "persecucion"     — movimiento físico continuo; ritmo rápido, beats cortos.
E) "investigacion"   — descubrimiento metódico; el protagonista junta piezas, el lector también.
F) "intimo"          — escena pequeña, doméstica o sensorial; revela carácter sin trama.
G) "set_piece"       — gran escena espectacular (batalla, fiesta, ceremonia, catástrofe).
H) "paralelismo_pov" — dos hilos en paralelo cortados (A→B→A→B) que convergen al final.
I) "flashback"       — el capítulo entero o su mayor parte ocurre en el pasado y reilumina el presente.
J) "confrontacion"   — choque frontal entre dos personajes con stakes irreversibles.
K) "viaje_transicion"— traslado físico/psicológico entre dos estados; menos trama, más cambio interior.
L) "bisagra"         — el género o tono cambia brevemente (humor en novela oscura, terror en romance, etc.).
M) "revelacion"      — todo el capítulo orbita alrededor de UN dato que reordena lo anterior.
N) "calma_engañosa"  — aparente respiro; bajo la superficie algo se está pudriendo.

REGLAS DE VARIEDAD (ANTI-MONOTONÍA — OBLIGATORIAS):
1. Cada capítulo lleva un campo "tipo_capitulo" con UNA letra del catálogo (A-N).
2. NINGÚN tipo puede repetirse en 3 capítulos consecutivos. Si los caps 8, 9, 10 son todos "investigacion", la respuesta es INVÁLIDA.
3. El acto 2 (parte central) debe usar AL MENOS min(7, N) tipos distintos del catálogo, donde N = número de capítulos del acto 2. Es decir: si el acto medio tiene 18-22 caps, exige 7+ tipos (con 5 tipos rotados en bucle ABCDEABCDE el lector percibe la misma monotonía que si fueran todos iguales); si el acto medio tiene 6 caps, exige los 6 tipos distintos; si tiene 4 caps, los 4. Nunca menos. Mezcla el orden — no rotes en bucle.
3b. PATRONES ROTATORIOS PROHIBIDOS: si el acto 2 tiene 8 o más capítulos, ningún par de letras consecutivas (AB, CD, etc.) puede aparecer 3 veces o más como secuencia. Es decir, NO puedes tener "…AB…AB…AB…" ni "…CD…CD…CD…" ni "…CE…CE…CE…" recorriendo el acto medio. Rompe la rotación con tipos intercalados distintos. (En actos cortos <8 caps esta regla no aplica.)
3c. FUNCIÓN ESTRUCTURAL — VARIEDAD SEMÁNTICA: la "funcion_estructural" (etiqueta semántica del rol del cap: "emboscada", "encuentro con mentor", "casi confesión", "investigación de pista", "discusión con antagonista", etc.) NO puede repetirse en más de ceil(N/4) capítulos del acto 2 (con tope de 3). Es decir: en un acto 2 de 20 caps, máx 3 repeticiones de la misma función; en uno de 12 caps, máx 3; en uno de 8 caps, máx 2; en uno de 4 caps, máx 1. Si planeas "4 emboscadas" o "5 encuentros tensos con el interés romántico" en un acto largo, la respuesta es INVÁLIDA — el lector lo percibe como "siempre pasa lo mismo aunque cambien los detalles". Usa funciones estructurales DISTINTAS para cada beat del desarrollo.
4. NO todos los capítulos deben terminar en cliffhanger. Rota: cliffhanger / pregunta abierta / escena reposada / revelación silenciosa / cambio de POV / final ambiguo. NINGÚN tipo_cierre puede superar el 50% del acto 2 (antes era 60% solo para cliffhangers — ahora vale para cualquier cierre repetido). Si la mitad o más del acto medio termina igual, la respuesta es INVÁLIDA. (En actos muy cortos de 2-3 caps esta regla no aplica con el mismo rigor; varía cuanto puedas.)
5. NO todos los capítulos deben tener reflexión interna del protagonista. Algunos son puro exterior (acción, diálogo, observación). Solo añade reflexión interna donde la FORMA lo permite (intimo, viaje_transicion, calma_engañosa, después de revelacion). En presion_unica / persecucion / set_piece NO la metas.
6. Las subtramas activas pueden variar de 1 a 3 según el tipo: un capítulo intimo o de presion_unica puede tener UNA sola subtrama activa; un montaje o paralelismo puede llevar 3-4. NO fuerces "2 subtramas" en cada capítulo.
7. Los diálogos también varían: dialogo_central tiene muchísimos, persecucion o set_piece pueden no tener ninguno. NO fuerces "2-3 diálogos" en cada capítulo.

REGLAS DE CALIDAD GENERAL:
8. Cada capítulo debe tener "objetivo_narrativo" OBLIGATORIO: párrafo de 100-200 palabras que cuente qué ocurre realmente (sinopsis en prosa, no metadatos). Sin esto el Narrador escribe a ciegas.
9. Cada capítulo debe tener AL MENOS 5 beats sustanciales (cada beat 1-3 oraciones). Algunos tipos (set_piece, persecucion) pueden llevar 7-10 beats; otros (intimo, calma_engañosa) bastan con 4-5.
10. Cada "informacion_nueva" debe ser GENUINAMENTE NUEVA — no repetir de capítulos anteriores.
11. Los conflictos deben escalar progresivamente a lo largo del acto 2, NO mantenerse en meseta.

═══════════════════════════════════════════════════════════════════
[Fix92] REGLAS ESTRUCTURALES DEL SEGUNDO ACTO (CRÍTICAS RECURRENTES DEL BETA)
═══════════════════════════════════════════════════════════════════
El Lector Beta detecta una y otra vez tres patrones que arruinan el acto medio
aunque la prosa sea buena. Estas tres reglas son OBLIGATORIAS y se auditan
deterministamente después de generar la escaleta:

REGLA F (VARIEDAD DE FORMA DE ESCENA — anti segundo acto monótono):
Cada capítulo lleva un campo "forma_dominante" con UN valor del catálogo:
  - "investigacion_activa"   (el prota busca pistas, persigue, indaga)
  - "confrontacion_directa"  (cara a cara con stakes en mesa, sin escapatoria)
  - "revelacion"             (el lector reordena su modelo de la trama)
  - "introspeccion"          (escena interior, sueño, monólogo, recuerdo)
  - "accion_fisica"          (persecución, pelea, evasión, escena cinética)
  - "setback"                (el prota pierde algo concreto que tenía)
  - "atmosferica"            (atmósfera, world-building sensorial, sin trama)
  - "pivote_relacional"      (una relación entre dos personajes cambia de estado)
Esto NO sustituye a "tipo_capitulo" (A-N, estructural); describe lo que
EXPERIMENTA EL LECTOR. Un mismo "tipo_capitulo: E (investigacion)" puede tener
forma_dominante "investigacion_activa", "confrontacion_directa", "setback" o
"pivote_relacional" según cómo se desarrolle la escena.
RESTRICCIÓN: en cualquier ventana de 4 capítulos consecutivos del acto 2,
ningún valor de "forma_dominante" puede aparecer más de 2 veces. Si todos son
"investigacion_activa", el lector vive el acto 2 como "el prota va, no obtiene
nada, vuelve, repite" — patrón explícitamente prohibido.

REGLA L (LEDGER DE INFORMACIÓN NUEVA — anti "no obtiene nada x4"):
Cada capítulo lleva "categoria_info_nueva" con UN valor del catálogo:
  - "testigo"                (alguien declara o cuenta)
  - "evidencia_fisica"       (objeto, documento, foto, prueba)
  - "pista_falsa"            (lead que llevará a callejón sin salida)
  - "revelacion_personal"    (algo del pasado del prota o un secundario)
  - "antecedente_historico"  (contexto del mundo, época, lugar)
  - "conexion_red"           (cómo dos elementos se vinculan)
  - "amenaza"                (advertencia, atentado, presión nueva)
  - "vinculo_emocional"      (una relación humana se revela)
  - "setup_subtrama"         (siembra de subtrama / volumen siguiente)
  - "ninguna"                (solo en caps atmosféricos/introspectivos puros)
Y "informacion_nueva" (texto libre) NUNCA puede ser de relleno: prohibido
"ninguna", "sin novedades", "no obtiene nada", "callejón sin salida", "nada
nuevo" o texto < 40 caracteres. Aunque el protagonista fracase en su objetivo,
el LECTOR debe ganar al menos una pieza concreta: un detalle del trauma del
prota, una pista falsa sembrada por el antagonista, un vínculo emocional con
un secundario, una amenaza menor que escala el peligro, un antecedente
histórico del lugar.
RESTRICCIÓN: en el acto 2/3 no puede haber 2 caps consecutivos con
"informacion_nueva" de relleno. En ventanas de 4 caps del acto 2, ninguna
"categoria_info_nueva" puede repetirse más de 2 veces. "ninguna" no puede
aparecer en 2 caps consecutivos jamás.

REGLA D (DOSIFICACIÓN DE REVELACIONES — anti "el villano se vacía de golpe"):
En cada capítulo que contenga una revelación importante, declara el array
"revelaciones_dosificadas": [
  {
    "hecho_revelado": "Lo concreto que el lector descubre",
    "personaje_revelador": "Nombre del personaje que lo suelta",
    "dificultad": "alto" | "medio" | "bajo",
    "modo_extraccion": "presion_fisica" | "amenaza_a_tercero" |
                       "evidencia_irrefutable" | "error_del_personaje" |
                       "ofrecimiento_voluntario_motivado" | "sin_resistencia",
    "setup_capitulos": [n, n]
  }
]
"dificultad" mide el peso narrativo: "alto" = revela motivo, identidad oculta,
traición o trauma central; "medio" = pista o conexión; "bajo" = detalle de
color. RESTRICCIONES INVIOLABLES:
  - Toda revelación con dificultad "alto" debe traer modo_extraccion DISTINTO
    de "sin_resistencia" (el personaje no puede confesarlo gratis).
  - Toda revelación con dificultad "alto" debe traer al menos 1 capítulo en
    "setup_capitulos" donde se sembró la resistencia o la amenaza que ahora
    desbloquea la confesión.
  - Ningún capítulo puede acumular ≥3 revelaciones de dificultad "alto" (es un
    info-dump expositivo — repártelas en al menos 2 capítulos).
  - Ningún personaje antagonista o cómplice puede revelar ≥3 hechos en un
    único capítulo (rompe la regla "el villano nunca se vacía de golpe"). Si
    necesitas que confiese mucho, distribúyelo: primera escena suelta lo que
    NO le compromete; segunda escena suelta UN dato comprometedor bajo presión
    específica; tercera escena suelta el resto bajo amenaza nueva o ya derrotado.

REGLA S [Fix93] (ARCO COMPLETO DEL SECRETO — siembra textual real ≥3 caps):
"setup_capitulos: [n, n]" NO basta como declaración formal. El auditor abre
los capítulos previos listados y comprueba que efectivamente MENCIONAN el
hecho con tokens concretos. Toda revelación con dificultad "alto" debe estar
sembrada con presencia textual en ≥3 capítulos anteriores distintos; las de
dificultad "medio" en ≥2. Cada siembra puede tomar tres formas:
  (i)  pista parcial en "informacion_nueva" del cap previo (algo que apunta
       al hecho sin completarlo — un nombre suelto, un detalle aparentemente
       trivial, un objeto que cobrará sentido).
  (ii) detalle del personaje implicado en el "objetivo_narrativo" del cap
       previo que retroactivamente apunte al secreto.
  (iii) evento en "eventos_pivotales" del cap previo relacionado con el
       lugar, fecha u objeto del hecho.
Anti-patrón prohibido: declarar "setup_capitulos: [7, 12, 18]" cuando los
caps 7, 12 y 18 no contienen NINGUNA referencia al hecho revelado. Si el
material no admite ≥3 siembras textuales reales, baja la dificultad a "bajo"
(es un detalle de color, no un giro) o elimina la revelación.

REGLA T [Fix94] (FALSO ALIADO — reveal tardío + humanización previa):
Para cada personaje del world_bible cuyo "rol" contenga "topo", "traidor",
"falso_aliado", "antagonista_oculto", "complice_oculto", "infiltrado" o
"doble_agente":
  (A) La revelación de su traición debe ocurrir en el último 40% de la
      novela (cap ≥ 60% del total). Si el personaje se descubre como topo en
      el acto 1 o primera mitad del acto 2, el lector lo ve venir y el giro
      pierde fuerza — patrón explícito "Cifuentes obvio desde cap 2".
  (B) Antes del capítulo de reveal debe haber AL MENOS UN capítulo con
      "forma_dominante" = "introspeccion" o "pivote_relacional", o
      "categoria_info_nueva" = "vinculo_emocional", donde el personaje
      aparezca en escena y se humanice: un momento a solas mirando fotos
      viejas, una llamada cansada a su mujer/hijo, una conversación con el
      protagonista donde muestre un miedo o un recuerdo aparentemente
      sincero. Sin esto el giro funciona en lo formal pero NO DUELE — el
      lector no había construido vínculo con el traidor y la traición es
      solo funcional, no trágica.
Si no quieres seguir estas restricciones, cambia el rol del personaje en el
world_bible a "antagonista declarado" (sin ocultación) y elimina la
ambigüedad: el lector sabrá desde el inicio que es enemigo y no esperará un
giro.

═══════════════════════════════════════════════════════════════════
⛔ ANTI-DEUS-EX-MACHINA Y ANTI-SOLUCIONES FÁCILES (REGLA CRÍTICA) ⛔
═══════════════════════════════════════════════════════════════════
Las prohibiciones globales de la Fase 1 (Deus Ex Machina, soluciones
fáciles/rápidas, rescates no sembrados, coincidencias, soluciones
mágicas) se aplican AQUÍ con especial dureza al diseñar cada capítulo:

12. ⛔ EN EL CLÍMAX Y RESOLUCIÓN: el protagonista DEBE resolver el
    conflicto principal con recursos, aliados, información y habilidades
    que ya estaban sembrados con presencia activa en capítulos previos.
    Para cada capítulo del último tercio, en su "objetivo_narrativo"
    o "beats" identifica explícitamente qué setup previo se está
    cosechando (e.g. "Marta usa el contacto policial que conoció en cap
    7"). Si un elemento clave aparece sin antecedente, REVISA y siembra
    antes (cap más temprano) o ELIMINA esa solución.

13. ⛔ NINGÚN capítulo puede resolver un conflicto mayor planteado en
    un solo capítulo previo. Mínimo 2-3 capítulos de tensión escalada
    antes de cualquier resolución parcial; mínimo 4-5 antes del clímax.
    Si la escaleta resuelve algo demasiado rápido, EXPANDE el setup
    (más obstáculos intermedios, más fracasos del protagonista) en
    lugar de acortar el conflicto.

14. ⛔ CADA resolución debe costar algo TANGIBLE al protagonista
    (pérdida física, emocional, moral, social, relacional, material).
    En el objetivo_narrativo del capítulo de resolución, NOMBRA
    explícitamente el coste. "Gana sin perder nada" = INVÁLIDO.

15. ⛔ PROHIBIDO usar revelaciones oportunas como motor de resolución
    ("¡resulta que tenía el antídoto!", "¡resulta que el villano era
    su hermano!", "¡aparece la caballería!") salvo que las pistas
    estén plantadas en MÍNIMO 2 capítulos previos como beats visibles
    al lector. Si planeas una revelación así, añade los capítulos de
    siembra ANTES en la escaleta o desecha la revelación.

16. ⛔ PROHIBIDAS las "salidas de comodín": personajes/poderes/objetos
    que aparecen en un cap del último tercio sin haber existido antes
    en la escaleta. Si en el cap 22 aparece un aliado que salva al
    prota, ese aliado debe haber estado en escena (con beat propio,
    no solo nombrado) en al menos 2 capítulos previos.

📋 AUDITORÍA OBLIGATORIA antes de devolver el JSON: recorre los caps
del último tercio. Para cada uno, identifica internamente los setups
de los que tira. Si encuentras una resolución sin setup previo, la
respuesta es INVÁLIDA — corrige antes de responder.

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
      "tipo_capitulo": "A",
      "epoca_id": "presente_o_id_que_corresponda_o_null_si_novela_mono_epoca",
      "cronologia": "Momento temporal",
      "ubicacion": "Lugar con detalles sensoriales",
      "elenco_presente": ["Personaje1", "Personaje2"],
      "funcion_estructural": "Rol del capítulo en la trama (etiqueta breve)",
      "objetivo_narrativo": "PÁRRAFO NARRATIVO de 100-200 palabras contando qué pasa en este capítulo: situación inicial, qué hace el protagonista, qué obstáculos encuentra, qué descubre, cómo termina. ESTO ES LO QUE LEERÁ EL NARRADOR para escribir — sin esto, escribe a ciegas. NO es una etiqueta, es prosa narrativa real.",
      "arcos_que_avanza": [{"arco": "nombre", "de": "estado_antes", "a": "estado_después"}],
      "informacion_nueva": "Revelación concreta que descubre el lector (≥40 caracteres, NUNCA 'ninguna' ni 'sin novedades')",
      "categoria_info_nueva": "testigo | evidencia_fisica | pista_falsa | revelacion_personal | antecedente_historico | conexion_red | amenaza | vinculo_emocional | setup_subtrama | ninguna",
      "forma_dominante": "investigacion_activa | confrontacion_directa | revelacion | introspeccion | accion_fisica | setback | atmosferica | pivote_relacional",
      "revelaciones_dosificadas": [
        {
          "hecho_revelado": "Solo si el cap contiene revelación importante; deja el array vacío si no",
          "personaje_revelador": "Nombre del personaje que lo revela",
          "dificultad": "alto | medio | bajo",
          "modo_extraccion": "presion_fisica | amenaza_a_tercero | evidencia_irrefutable | error_del_personaje | ofrecimiento_voluntario_motivado | sin_resistencia",
          "setup_capitulos": [3, 7]
        }
      ],
      "pregunta_dramatica": "Pregunta al terminar",
      "conflicto_central": "Descripción breve del conflicto y stakes",
      "beats": [
        "Beat 1: descripción concisa adaptada al TIPO del capítulo (1-3 oraciones)",
        "Beat 2: descripción concisa",
        "Beat 3: descripción concisa",
        "Beat 4: descripción concisa",
        "Beat 5: descripción concisa (último; no obligatoriamente cliffhanger)"
      ],
      "tipo_cierre": "cliffhanger | pregunta_abierta | escena_reposada | revelacion_silenciosa | cambio_pov | ambiguo",
      "tension_objetivo": 7,
      "dias_diegeticos": 1,
      "eventos_pivotales": ["Pivote 1: cambio irreversible que ocurre aquí (vacío si el cap no contiene pivotes)"],
      "siembra": ["IDs cortos de elementos plantados aquí que se cosecharán después (objeto, secreto, atmósfera, capacidad)"],
      "cosecha": ["IDs de elementos sembrados en capítulos previos que se activan aquí"],
      "justificacion_antagonica": "OPCIONAL — si en este capítulo el antagonista pierde control / cede algo crítico / subestima al protagonista, explica en ≥80 caracteres por qué FALLA esta vez (ego, prisa por evento X, presión externa concreta). Si no aplica, vacío.",
      "palabras_objetivo": 3000,
      "giro_emocional": "de [emoción] a [emoción]",
      "continuidad_entrada": "Estado al iniciar",
      "continuidad_salida": "Estado al terminar",
      "hook_final": "Descripción del gancho para el siguiente capítulo (puede ser ausencia de gancho si tipo_cierre=escena_reposada)",
      "nivel_tension": 7,
      "estado_identidades": "Quién sabe qué sobre identidades secretas en este punto. Ej: 'El lector sabe que X es Y, pero los personajes no' o 'null si no hay identidades dobles activas'"
    }
  ]
}

IMPORTANTE: NO copies literalmente las etiquetas de beats del ejemplo. Cada capítulo
tiene SU forma propia según su tipo_capitulo. Un capítulo "persecucion" no abre con
"Apertura tranquila" y un "intimo" no escala a "cliffhanger".

IMPORTANTE: Cada beat es un STRING conciso (1-3 oraciones), NO un objeto complejo.
IMPORTANTE: Si hay personajes con doble identidad, "estado_identidades" es OBLIGATORIO.

⚠️ INTEGRIDAD NARRATIVA (anti-críticas recurrentes — OBLIGATORIO):
A. FORESHADOWING: cualquier revelación importante del acto 2 o 3 (mística, mágica, sobrenatural, identidad oculta, capacidad latente, traición, parentesco) DEBE estar sembrada en al menos 2 capítulos del acto 1 vía "siembra". No dejes "cosecha" sin "siembra" previa registrada con el mismo ID corto.
B. ANTAGONISTA: si en algún capítulo el antagonista comete un error que le perjudica (delegar algo crítico a un subordinado dudoso, dejar evidencia, no actuar pudiendo) DEBES rellenar "justificacion_antagonica" con un motivo concreto sembrado antes (ego herido, evento externo X, distracción Y). Sin justificación es CONVENIENCIA DE TRAMA.
C. RITMO ACTO 3: distribuye "eventos_pivotales" sin que el acto 3 acumule >50% del total. Si una traición y su represalia ocurren con <2 capítulos de margen, mete decantación. "dias_diegeticos" del acto 3 NO debe colapsar a <1/3 del promedio de los actos 1-2 sin que un cap esté etiquetado explícitamente como compresión consciente.

⚠️ AUTO-CHEQUEO ANTES DE RESPONDER:
1. Lista mentalmente los tipo_capitulo en orden (1=A, 2=B, 3=B, 4=A, ...).
2. Verifica que NINGÚN tipo se repite 3 veces seguidas.
3. Verifica que el acto 2 (caps centrales) usa AL MENOS min(7, N) tipos distintos, donde N = número de caps del acto 2. Si N≥7 debes usar 7+; si N<7 usa todos distintos.
3b. Si N≥8, recorre el acto 2 buscando pares de letras (cap N + cap N+1) que se repitan: si encuentras 3 veces "…AB…AB…AB…" o cualquier otro par repetido, rompe la rotación intercalando tipos distintos. (Si N<8, salta este paso.)
3c. Cuenta cuántos caps del acto 2 comparten la MISMA "funcion_estructural". El máximo permitido es ceil(N/4) con tope de 3. Si algún rótulo lo supera, reescribe esos caps con funciones estructurales distintas.
4. Cuenta los "tipo_cierre" del acto 2: si alguno supera el 50% de los caps del acto medio (con N≥4), redistribúyelos.
5. Verifica que toda "cosecha" tiene su "siembra" en capítulos anteriores con el mismo ID.
6. Verifica que toda decisión perjudicial del antagonista lleva "justificacion_antagonica" rellena.
7. Verifica que el acto 3 no concentra >50% de "eventos_pivotales".
8. [Fix92-F] Recorre el acto 2 con una ventana deslizante de 4 caps: en cada ventana, cuenta cuántas veces aparece cada "forma_dominante". Si algún valor supera 2 apariciones, REESCRIBE esos caps cambiando su forma (manteniendo el avance de trama).
9. [Fix92-L] Recorre el acto 2/3 buscando pares de caps consecutivos con "informacion_nueva" vacía, < 40 caracteres o con frases de relleno ("ninguna", "sin novedades", "no obtiene nada", "callejón sin salida"). Si encuentras un par, reescribe al menos uno con una pieza concreta que el lector pueda anotar mentalmente.
10. [Fix92-L] Recorre el acto 2 con ventana de 4 caps: si alguna "categoria_info_nueva" supera 2 apariciones en una ventana, diversifica (alterna testigo / evidencia_fisica / vinculo_emocional / revelacion_personal / pista_falsa). "ninguna" nunca puede aparecer 2 caps seguidos.
11. [Fix92-D] Recorre cada "revelaciones_dosificadas" del proyecto: verifica que NINGUNA revelación con dificultad "alto" tiene modo_extraccion "sin_resistencia" y verifica que TODAS tienen al menos 1 cap en "setup_capitulos". Verifica que ningún cap acumula ≥3 revelaciones de dificultad "alto". Verifica que ningún personaje antagonista/cómplice revela ≥3 hechos en un único cap.
12. [Fix93-S] Para cada revelación de dificultad "alto", abre TÚ MISMO los caps listados en "setup_capitulos" y comprueba que su "informacion_nueva", "objetivo_narrativo" o "eventos_pivotales" MENCIONAN tokens concretos del "hecho_revelado" (no basta con declarar el array — debe haber texto real). Exigencia: ≥3 caps con siembra textual real para dificultad "alto", ≥2 para "medio". Si no se cumple, añade las siembras o baja la dificultad.
13. [Fix94-T] Para cada personaje del world_bible cuyo "rol" contenga topo / traidor / falso_aliado / antagonista_oculto / complice_oculto / infiltrado / doble_agente: localiza el cap de revelación de su traición y comprueba (A) que ocurre en el último 40% de la novela (cap ≥ 60% del total) y (B) que existe al menos UN cap anterior con "forma_dominante" = "introspeccion" o "pivote_relacional" o "categoria_info_nueva" = "vinculo_emocional" donde el personaje aparezca en escena humanizado (foto familiar, llamada cansada, miedo aparentemente sincero, conflicto íntimo). Si no, mueve el reveal o inserta la escena de humanización antes de devolver el JSON.
Si algo falla, REGENERA antes de responder. Esto es lo más importante.

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
    // Fase 1 (World Bible): 12 min son de sobra (~32K tokens out).
    // Fase 2 (escaleta detallada de N capítulos, hasta 65k tokens de salida):
    // tras [Fix18] cada capítulo lleva 6 campos extra (siembra, cosecha,
    // tension_objetivo, dias_diegeticos, eventos_pivotales, justificacion_antagonica),
    // lo que en novelas grandes (40+ caps) hizo que 12 min se quedaran cortos
    // y el sistema entrara en bucle de timeouts. Por eso Fase 2 sube su timeout
    // a 18 min via override puntual (ver `phase2`). El watchdog del orquestador
    // (queue-manager.ts HEARTBEAT_TIMEOUT_MS=22min) deja un margen de 4 min
    // sobre el peor caso de Fase 2 antes de marcar el proyecto como congelado.
    this.timeoutMs = 12 * 60 * 1000;
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
    ${input.plotIntegrityFeedback ? `
    ═══════════════════════════════════════════════════════════════════
    FEEDBACK DEL AUDITOR DE INTEGRIDAD NARRATIVA (PRIORIDAD MÁXIMA)
    ═══════════════════════════════════════════════════════════════════
    Tu escaleta anterior tiene problemas de integridad detectados por un auditor
    especializado en tres áreas: (1) presagios/foreshadowing, (2) coherencia del
    antagonista, (3) ritmo del tercer acto. DEBES rediseñar aplicando LITERALMENTE
    las correcciones siguientes sin romper la estructura ni la voz. Conserva los
    capítulos aprobados; modifica solo lo que el auditor señala.

    ${input.plotIntegrityFeedback}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.structuralAuditFeedback ? `
    ═══════════════════════════════════════════════════════════════════
    FEEDBACK DEL AUDITOR ESTRUCTURAL (FORMA / LEDGER / DOSIFICACIÓN) — PRIORIDAD MÁXIMA
    ═══════════════════════════════════════════════════════════════════
    Tu escaleta anterior falla en una o varias de estas tres dimensiones (críticas
    recurrentes del Lector Beta sobre el segundo acto):
      (1) VARIEDAD DE FORMA DE ESCENA en el acto 2.
      (2) LEDGER DE INFORMACIÓN NUEVA por capítulo (anti "el prota va, no obtiene nada, vuelve" x4).
      (3) DOSIFICACIÓN DE REVELACIONES con resistencia documentada (anti "el villano se vacía de golpe").
    DEBES rediseñar aplicando LITERALMENTE las correcciones siguientes Y declarar los
    tres campos obligatorios por capítulo: "forma_dominante", "categoria_info_nueva",
    "revelaciones_dosificadas" (este último solo en caps con revelación importante).

    ${input.structuralAuditFeedback}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.betaReaderFeedback ? `
    ═══════════════════════════════════════════════════════════════════
    📖 FEEDBACK DEL LECTOR BETA DE ESCALETAS (PRIORIDAD MÁXIMA) 📖
    ═══════════════════════════════════════════════════════════════════
    Tu escaleta anterior ya fue evaluada por un Lector Beta cualificado del género.
    Su puntuación fue insuficiente (< 8/10). DEBES rediseñar la escaleta aplicando
    LITERALMENTE las correcciones que vienen abajo, y diseñar pensando en el perfil
    de lector objetivo que el Beta ha definido. NO ignores ningún punto.

    ${input.betaReaderFeedback}

    Mantén la premisa esencial, género y longitud pedidos, pero rediseña pacing,
    arcos, hooks y subtramas según el feedback. La nueva escaleta debe sentirse
    pensada para el lector objetivo definido arriba.
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
    ${input.seriesUnifiedWorldBible ? `
    ═══════════════════════════════════════════════════════════════════
    🔒 BIBLIA DE SERIE — PERSONAJES Y MUNDO YA ESTABLECIDOS 🔒
    ═══════════════════════════════════════════════════════════════════
    Esta es la BIBLIA OFICIAL de la serie, consolidada a partir de TODOS los
    volúmenes ya publicados. Contiene las fichas canónicas de cada personaje
    (nombre exacto, físico, edad, profesión, familia, voz, motivación, arco)
    y del mundo (lugares, léxico, reglas).

    ⛔ REGLAS INVIOLABLES PARA EL DISEÑO DE ESTE NUEVO VOLUMEN:
    0. EL PROTAGONISTA DE LA SERIE ES EL QUE FIGURA COMO "🌟 PROTAGONISTA ÚNICO"
       en la biblia inyectada más abajo. La escaleta de este nuevo volumen DEBE
       girar en torno a ese personaje: él lleva el arco vertebrador, abre y
       cierra el libro, toma la decisión final. PROHIBIDO "ascender" a un
       personaje secundario (love interest, sidekick, mentor, antagonista
       carismático) al rol de protagonista — esos personajes siguen siendo
       secundarios aunque tengan mucho tiempo en pantalla. La cámara y el POV
       narrativo permanecen con el protagonista oficial.
    1. PROHIBIDO renombrar a un personaje establecido — usa el nombre EXACTO.
    2. PROHIBIDO cambiarle el físico, la edad, la profesión, la familia o la
       motivación nuclear. Si necesitas evolución, debe ser CONSISTENTE con
       lo establecido (envejecer un año, ascender de rango, no "tener ahora
       los ojos verdes cuando antes eran marrones").
    3. PROHIBIDO inventar parejas, hijos, hermanos o relaciones que NO
       aparezcan ya en la biblia o como hilo claramente abierto.
    4. PROHIBIDO renombrar lugares, organizaciones, magia o tecnología
       establecidos. Usa el léxico canónico tal cual.
    5. SI la biblia y el texto íntegro entran en conflicto, gana la BIBLIA
       (ya está consolidada y deduplicada). Reporta la contradicción en
       "incoherencias_detectadas" si la encuentras.
    6. SÍ puedes y DEBES darles NUEVOS arcos, conflictos, decisiones, etapas
       de evolución y secundarios. La biblia limita IDENTIDAD, no destino.

    Esta biblia es de USO OBLIGATORIO. Diséñala en la nueva escaleta como si
    estos personajes y este mundo fueran inamovibles desde el cap 1.

${input.seriesUnifiedWorldBible}
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    ${input.seriesMilestonesAndThreads ? `
    ═══════════════════════════════════════════════════════════════════
    🎯 HITOS E HILOS DE LA SERIE — PLANIFICACIÓN INVIOLABLE 🎯
    ═══════════════════════════════════════════════════════════════════
    Estos son los HITOS NARRATIVOS planeados para ESTE volumen y los HILOS
    ARGUMENTALES de la serie tal y como están registrados a partir de la
    guía oficial. Tu escaleta DEBE:
    - PLANIFICAR cada hito [OBLIGATORIO] dentro de los capítulos de este
      libro, asignándolo a una escena concreta (preferiblemente con un
      capítulo concreto en mente). NO los dejes implícitos.
    - CONTINUAR los hilos abiertos: hazlos avanzar, da pistas, profundízalos.
      NO los cierres salvo que un hito de este volumen indique resolución.
    - PROHIBIDO adelantar hitos reservados a volúmenes posteriores. Esos
      pertenecen a libros futuros y deben permanecer pendientes aquí.

${input.seriesMilestonesAndThreads}
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
    cuando aplique y/o IMITE LA VOZ del autor cuando sea su material.

    ⚠️ ALCANCE ESTRICTO — ES MATERIAL DE REFERENCIA, NO LA PREMISA:
    Aunque este material contenga la trama, personajes o género de OTRA
    novela del autor, NO debes copiarlos a esta novela. La novela que estás
    diseñando es la definida arriba en TÍTULO + GÉNERO + IDEA. Concretamente:
    - NO cambies el GÉNERO declarado (si arriba pone "romance", no diseñes fantasía
      aunque el material de referencia sea una novela de fantasía).
    - NO copies personajes, lugares ni la trama del material de referencia
      como personajes, lugares ni trama de esta novela.
    - SÍ puedes imitar la VOZ NARRATIVA, el RITMO, el LÉXICO y el ESTILO del
      material si pertenece al mismo autor.
    - SÍ puedes usar DATOS HISTÓRICOS, técnicos o de contexto que aparezcan
      en el material como referencia factual.

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
          message: `📐 El Arquitecto — Fase 1/2: generando World Bible (personajes, lugares, arcos, estructura). Timeout: 12 min.`,
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
      ⚠️ COHERENCIA DE CALENDARIO (obligatoria si la novela usa fechas concretas):
      Si fijas una fecha real (ej: "domingo 14 de enero de 2024"), TODAS las
      menciones posteriores de día de la semana DEBEN derivarse del calendario
      real. Antes de incluir una fecha "viernes 19 de enero" verifica que el
      19 de enero de ese año cae realmente en viernes; si no, ajusta el día,
      la fecha o ambos. La incoherencia entre fecha-y-día-de-semana es uno de
      los errores que el Revisor Final marca como "lesión persistente" y
      degrada el veredicto a "APROBADO CON RESERVAS" (caso real: novela "La
      Herrumbre de los Días" donde Caradec muere domingo 14 enero pero
      apariciones posteriores de viernes/jueves/lunes no encajaban). Si no
      necesitas precisión de calendario, usa marcadores relativos ("tres días
      después", "la semana siguiente") en lugar de fechas absolutas.
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
    const phase1Response = await this.generateContent(phase1Prompt, input.projectId);

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
          message: `📐 El Arquitecto — Fase 2/2: generando escaleta detallada de ${input.chapterCount} capítulos. Timeout: 18 min.`,
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

    // [Fix90] Modo rango vs modo exacto. Si el usuario fijó un rango válido
    // (min < max), el Arquitecto decide el número dentro de [min, max] tras
    // autoauditoría de densidad. Si no, comportamiento clásico exacto.
    const minRange = typeof input.minChapterCount === "number" ? input.minChapterCount : null;
    const maxRange = typeof input.maxChapterCount === "number" ? input.maxChapterCount : null;
    const isRangeMode =
      minRange !== null && maxRange !== null && minRange > 0 && maxRange > minRange;
    const promptCountLabel = isRangeMode
      ? `${minRange}-${maxRange} CAPÍTULOS (rango aprobado por el usuario)`
      : `EXACTAMENTE ${input.chapterCount} CAPÍTULOS`;
    // Para el cálculo de extensión/concisión usamos el peor caso del rango
    // (maxRange) cuando aplica; el resto del prompt sigue refiriéndose a
    // `chapterCount` como número de referencia para el slider del usuario.
    const referenceCount = isRangeMode ? maxRange! : input.chapterCount;

    const phase2Prompt = `
    ${commonContext}

    ═══════════════════════════════════════════════════════════════════
    CONTEXTO DE LA FASE 1 (World Bible y estructura ya creadas):
    ═══════════════════════════════════════════════════════════════════
    ${phase1Summary}

    ═══════════════════════════════════════════════════════════════════
    ⛔ REQUISITO ABSOLUTO: ${promptCountLabel} ⛔
    ═══════════════════════════════════════════════════════════════════
    ${isRangeMode ? `
    EL USUARIO HA APROBADO UN RANGO de capítulos para que TÚ decidas el número
    final según cuántos hilos argumentales aguante la premisa de forma orgánica.
    Esto significa que NO debes rellenar capítulos vacíos: si la historia se
    sostiene con ${minRange} capítulos densos, entrega ${minRange}; si admite
    ${maxRange} sin caer en repetición, entrega ${maxRange}.

    🔍 AUTOAUDITORÍA OBLIGATORIA DE DENSIDAD (paso interno antes de responder):
    Tras esbozar la escaleta, REVISA SECUENCIAS DE 3+ CAPÍTULOS CONSECUTIVOS
    donde el progreso narrativo sea REDUNDANTE (mismo conflicto sin escalada,
    misma escena en sitios distintos, mismo subgrupo de personajes repitiendo
    dinámica, capítulos puente sin información nueva). Si detectas esa zona:
    - INTENTA primero refundir 2-3 capítulos en uno con más densidad
    - Si tras refundir aún quedan caps débiles, REDUCE el total hacia ${minRange}
    - SOLO sube el total hacia ${maxRange} si tienes hilos+subtramas+giros
      suficientes para mantener "información nueva + escalada" en cada cap

    ⛔ PROHIBIDO inflar para llegar al máximo del rango con capítulos puente,
    repetición de conflictos ya planteados o subtramas decorativas sin impacto.
    El Holístico y el Lector Beta posteriormente PENALIZAN duramente el
    decaimiento de ritmo, y la corrección a posteriori (podar/fusionar caps)
    no se puede aplicar automáticamente.

    📋 REPORTE OBLIGATORIO EN EL JSON: incluye además del array
    "escaleta_capitulos" un campo "decision_numero_capitulos" con la forma:
    {
      "elegido": <número entre ${minRange} y ${maxRange}>,
      "rango_aprobado": [${minRange}, ${maxRange}],
      "justificacion": "<2-4 frases explicando por qué ese número es el óptimo: cuántos hilos activos sostienen la novela, dónde estaría el riesgo de relleno si subieras, dónde quedaría tema sin desarrollar si bajaras>"
    }
    ` : `
    EL NÚMERO DE CAPÍTULOS NO ES TU DECISIÓN. DEBES generar EXACTAMENTE ${input.chapterCount} entradas en "escaleta_capitulos", numeradas del 1 al ${input.chapterCount}.

    Si la historia te parece "terminada" antes del capítulo ${input.chapterCount}:
    - Expande subtramas existentes
    - Añade complicaciones y obstáculos
    - Desarrolla más los arcos de personajes secundarios
    `}
    ${input.hasPrologue ? "ADEMÁS: Prólogo como capítulo número 0." : ""}
    ${input.hasEpilogue ? "ADEMÁS: Epílogo como capítulo número -1." : ""}

    CADA capítulo debe tener:
    - ⛔ TÍTULO OBLIGATORIO: Campo "titulo" con valor literario (2-6 palabras), NUNCA vacío
    - ⛔ OBJETIVO_NARRATIVO OBLIGATORIO: párrafo narrativo de ${referenceCount > 25 ? "60-120" : "100-200"} palabras (no etiqueta) describiendo qué ocurre realmente en el capítulo. Sin esto el Narrador no tiene sinopsis y escribe a ciegas.
    - Beats detallados (mínimo ${referenceCount > 25 ? "4" : "6"} por capítulo, cada beat 1-2 oraciones concisas)
    - Información nueva
    - Conflicto central
    - Continuidad de entrada/salida
    ${referenceCount > 25 ? `
    ⚡ ESCALETA LARGA (hasta ${referenceCount} capítulos) — concisión obligatoria:
    Para que la respuesta no se trunque por output cap (65K tokens), cada capítulo
    debe ser CONCISO. NO escribas 200 palabras de objetivo_narrativo si caben 80;
    NO escribas 8 beats si bastan 4-5 bien elegidos. Calidad > extensión. El Narrador
    luego expande cada capítulo a 2000-4000 palabras con esta semilla. Tu trabajo es
    semilla narrativa, no la novela.` : ""}

    ⚠️ VERIFICACIÓN FINAL: Antes de responder, CUENTA las entradas en escaleta_capitulos.
    ${isRangeMode
      ? `El total debe estar DENTRO del rango [${minRange}, ${maxRange}]. Fuera del rango la respuesta es INVÁLIDA.`
      : `Si no hay EXACTAMENTE ${input.chapterCount} capítulos, tu respuesta es INVÁLIDA.`}
    Verifica también que CADA capítulo tenga "objetivo_narrativo" con >= ${referenceCount > 25 ? "60" : "100"} palabras de prosa y "beats" con >= ${referenceCount > 25 ? "4" : "6"} entradas. Sin esto la respuesta es INVÁLIDA.

    Responde ÚNICAMENTE con el JSON que contenga "escaleta_capitulos"${isRangeMode ? " y \"decision_numero_capitulos\"" : ""}.
    `;

    this.config.systemPrompt = PHASE2_SYSTEM_PROMPT;
    // La escaleta puede ser muy larga (60+ capítulos). Subimos el cap para Fase 2,
    // mientras Fase 1 (constructor) se queda en 32K para forzar concisión en la WB.
    const previousMaxOut = this.config.maxOutputTokens;
    this.config.maxOutputTokens = 65536;
    // [Fix20] Override puntual del timeout para Fase 2: tras añadir los 6 campos
    // de [Fix18] (siembra/cosecha/etc.) por capítulo, el JSON crece bastante y
    // 12 min se quedan cortos en novelas grandes. Subimos a 18 min sólo aquí.
    const previousTimeoutMs = this.timeoutMs;
    this.timeoutMs = 18 * 60 * 1000;
    let phase2Response;
    try {
      phase2Response = await this.generateContent(phase2Prompt, input.projectId);
    } finally {
      this.config.maxOutputTokens = previousMaxOut;
      this.timeoutMs = previousTimeoutMs;
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
            message: `⚠️ El Arquitecto — Fase 2/2 falló tras ${phase2ElapsedSec}s: ${phase2Response.timedOut ? "timeout (18 min)" : (phase2Response.error || "respuesta vacía")}.`,
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
