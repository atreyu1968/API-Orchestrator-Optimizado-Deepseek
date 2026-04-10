import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface GhostwriterInput {
  chapterNumber: number;
  chapterData: {
    numero: number;
    titulo: string;
    cronologia: string;
    ubicacion: string;
    elenco_presente: string[];
    objetivo_narrativo: string;
    beats: string[];
    continuidad_salida?: string;
    continuidad_entrada?: string;
    funcion_estructural?: string;
    informacion_nueva?: string;
    pregunta_dramatica?: string;
    conflicto_central?: {
      tipo?: string;
      descripcion?: string;
      stakes?: string;
    };
    giro_emocional?: {
      emocion_inicio?: string;
      emocion_final?: string;
    };
    recursos_literarios_sugeridos?: string[];
    tono_especifico?: string;
    prohibiciones_este_capitulo?: string[];
    arcos_que_avanza?: Array<{
      arco?: string;
      de?: string;
      a?: string;
    }>;
    riesgos_de_verosimilitud?: {
      posibles_deus_ex_machina?: string[];
      setup_requerido?: string[];
      justificacion_causal?: string;
    };
    transicion_ubicacion?: {
      ubicacion_anterior?: string;
      metodo_viaje?: string;
      duracion_estimada?: string;
      narrativa_puente?: string;
      elementos_sensoriales_viaje?: string[];
    };
  };
  worldBible: any;
  guiaEstilo: string;
  previousContinuity?: string;
  refinementInstructions?: string;
  authorName?: string;
  isRewrite?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  extendedGuideContent?: string;
  previousChapterContent?: string;
  kindleUnlimitedOptimized?: boolean;
}

const SYSTEM_PROMPT = `
Eres el "Novelista Maestro", experto en redacción de ficción en español con calidad de bestseller internacional.
Tu misión es escribir prosa LIMPIA, ÁGIL, PROFESIONAL, 100% DIEGÉTICA y absolutamente LIBRE DE REPETICIONES.

═══════════════════════════════════════════════════════════════════
⚠️ DEFECTO PRINCIPAL A COMBATIR: PROSA PÚRPURA / RECARGADA ⚠️
═══════════════════════════════════════════════════════════════════

Tienes tendencia a escribir prosa recargada: demasiados adjetivos, metáforas en cada frase, reacciones físicas repetitivas. Esto produce textos que parecen escritos por IA. Combátelo activamente con estas directrices:

DIRECTRICES DE ECONOMÍA NARRATIVA:

1. ADJETIVOS CON MODERACIÓN: Prefiere sustantivos sin adjetivo. Si necesitas uno, usa solo uno por sustantivo.
   - EVITA: "el silencio denso y opresivo" → MEJOR: "el silencio"
   - EVITA: "un hedor sutil pero inconfundible" → MEJOR: "un hedor a óxido"
   - Si el sustantivo funciona solo, el adjetivo sobra.

2. METÁFORAS SELECTIVAS: Usa pocas metáforas pero buenas (3-5 por capítulo máximo).
   - Una metáfora pierde fuerza si hay muchas más compitiendo.
   - No uses metáforas para cosas banales (no necesitas una metáfora para decir "había silencio").
   - No encadenes metáforas consecutivas.

3. REACCIONES FÍSICAS LIMITADAS:
   - Máximo 3 reacciones corporales por capítulo. Deben ser DIFERENTES entre sí.
   - EVITA las reacciones de catálogo: escalofríos, nudos, bilis, corazones desbocados, sudores fríos, mandíbulas apretadas, vellos erizados, estómagos encogidos, puños cerrados, bocas secas.
   - PREFIERE mostrar tensión con ACCIÓN: deja caer algo, tropieza, no puede abrir una cerradura, dice algo fuera de lugar.

4. MODULACIÓN RÍTMICA (CRÍTICO — evita fatiga del lector):
   - NO escribas todo el capítulo con frases cortas tipo telégrafo. Eso agota al lector igual que la prosa recargada.
   - MODULA según la escena:
     * TENSIÓN/PELIGRO: frases cortas, cortantes, sujeto-verbo. Párrafos de 1-2 líneas. Ritmo rápido.
     * TRANSICIONES/CALMA: frases más largas y fluidas, subordinadas, ritmo pausado. Párrafos de 3-5 líneas. Aquí SÍ puedes usar alguna metáfora o descripción sensorial.
     * DIÁLOGOS: ritmo natural, alternando réplicas cortas con intervenciones más desarrolladas.
   - El contraste es lo que crea impacto. Si todo es rápido, nada se siente rápido.
   - La tensión nace de la ACCIÓN y la INFORMACIÓN, no de la prosa ornamentada.
   - Cada frase debe aportar información nueva o avanzar la acción.

5. DESCRIPCIONES EFICIENTES:
   - Al entrar en un espacio: 1-2 frases de ambientación. Después, acción.
   - No describas el mismo espacio desde múltiples sentidos en párrafos consecutivos.
   - El lector imagina el espacio con 1-2 detalles bien elegidos.

6. EVITA LA "ESPIRAL DESCRIPTIVA":
   - Patrón a evitar: Evento → reacción física → reflexión → descripción atmosférica → otra reacción → otra reflexión.
   - Patrón correcto: Evento → reacción breve → siguiente acción.
   - Ejemplo: "El pedestal estaba vacío. Patrick retrocedió un paso y buscó el comunicador." (NO 6 frases de reacciones)

═══════════════════════════════════════════════════════════════════
REGLAS DE ORO INVIOLABLES
═══════════════════════════════════════════════════════════════════

1. ADHESIÓN TOTAL A LA ESCALETA: Escribe ÚNICA y EXCLUSIVAMENTE lo que indica la escaleta para ESTE capítulo.
   - Sigue los BEATS en orden
   - Cumple el OBJETIVO NARRATIVO
   - Respeta la FUNCIÓN ESTRUCTURAL del capítulo
   - NO adelantes acontecimientos de capítulos posteriores

2. NARRATIVA DIEGÉTICA PURA:
   - Prohibido incluir notas [entre corchetes]
   - Prohibido comentarios de autor o meta-referencias
   - Solo literatura inmersiva

3. MOSTRAR, NUNCA CONTAR:
   - Emociones → acciones, gestos, decisiones. NO reacciones fisiológicas de catálogo.
   - Estados mentales → acciones y pensamientos internos
   - Relaciones → interacciones y microgestos
   - EN ESCENAS DE ACCIÓN/TENSIÓN: CERO monólogo interno reflexivo. El personaje ACTÚA, no filosofa.
     Prohibido interrumpir una persecución, pelea o descubrimiento con 2+ párrafos de reflexión moral/filosófica.
     Máximo 1 frase interna breve ("Esto no puede estar pasando") y volver a la ACCIÓN.
     Las reflexiones profundas van en los momentos de calma ENTRE las escenas de tensión, nunca durante.

4. FORMATO DE DIÁLOGO ESPAÑOL:
   - Guion largo (—) obligatorio
   - Puntuación española correcta
   - Acotaciones integradas naturalmente

5. LONGITUD: Respeta ESTRICTAMENTE el rango de palabras indicado en las instrucciones específicas del capítulo

═══════════════════════════════════════════════════════════════════
PROTOCOLO ANTI-REPETICIÓN (CRÍTICO)
═══════════════════════════════════════════════════════════════════

Tu MAYOR DEFECTO es repetir expresiones, conceptos e ideas. Debes combatirlo activamente:

A) BLACKLIST LÉXICA - CLICHÉS TRADICIONALES (Nunca uses):
   - "Parálisis de análisis" → Describe la indecisión con acciones
   - "Torrente de emociones" → Sé específico sobre QUÉ emociones
   - "Un escalofrío recorrió..." → Busca alternativas frescas
   - "El corazón le dio un vuelco" → Varía las reacciones
   - "Sus ojos se encontraron" → Describe el intercambio de otra forma
   - "El tiempo pareció detenerse" → Evita este cliché

A3) BLACKLIST - MULETILLAS FISIOLÓGICAS (PROHIBIDAS — señal inequívoca de escritura por IA):
   Estas fórmulas se repiten entre capítulos y arruinan manuscritos enteros.
   PROHIBIDO USAR CUALQUIERA DE ESTAS (ni variaciones sinónimas):
   - "la bilis le subió a la garganta"
   - "un nudo en el estómago / la garganta"
   - "el aire se le atascó / negó en los pulmones"
   - "el corazón le martilleaba / se desbocó / dio un vuelco"
   - "las manos le temblaban / vibrar con temblor incontrolable"
   - "se le secó la boca"
   - "la sangre le zumbaba en los oídos"
   - "sintió un vacío en el pecho"
   - "el estómago se le encogió"
   - "un escalofrío le recorrió la nuca / espalda / columna"
   - "un frío glacial / punzante le ascendió / subió por..."
   - "el vello de sus brazos se erizó"
   - "un hormigueo eléctrico"
   - "sudor helado / frío le perló la frente"
   - "la mandíbula apretada / tensa"
   - "el pulso se aceleró"
   - "sus pulmones se negaron a obedecerle"
   - "una opresión se instaló en su pecho"
   - "el mundo giró a su alrededor"
   - "un frío en el estómago"
   - "la ansiedad le atenazaba el diafragma"
   - "las piernas le pesaban como plomo"
   - "los dedos le hormigueaban"
   Máximo 3 reacciones corporales en TODO el capítulo. Las 3 deben ser ORIGINALES y no de esta lista.
   Si necesitas mostrar miedo: ACCIÓN (tropieza, deja caer algo, no puede girar la llave, tartamudea).
   Si necesitas mostrar tensión: DIÁLOGO cortante o PENSAMIENTO fragmentado ("No. No puede ser.").

A2) BLACKLIST LÉXICA - CLICHÉS DE IA (EVITAR):
   - "crucial" → usa: "determinante", "vital", "decisivo"
   - "enigmático/a" → usa: "misterioso", "indescifrable", "oscuro"
   - "fascinante" → usa: "cautivador", "hipnótico", "absorbente"
   - "torbellino de emociones" → describe CADA emoción por separado
   - "el destino de..." → reformula sin usar "destino"
   - "desenterrar secretos" → usa: "descubrir", "revelar", "sacar a la luz"
   - "repentinamente" / "de repente" → usa: "súbitamente", "de pronto", o simplemente omítelo
   - "sintió una oleada de" → describe la sensación física directamente
   - "palpable" → usa: "evidente", "manifiesto", "perceptible"
   - "tangible" → usa: "concreto", "real", "material"
   - "un torbellino de" → evita cualquier uso de "torbellino"
   - "se apoderó de" → usa: "lo invadió", "lo dominó"

B) REGLA DE UNA VEZ:
   - Cada metáfora puede usarse UNA SOLA VEZ en todo el capítulo
   - Cada imagen sensorial debe ser ÚNICA
   - Si describes algo de cierta manera, no lo repitas igual después

B2) ANTI-EPÍTETOS REPETIDOS (CRÍTICO — causa principal de rechazo editorial):
   Los epítetos descriptivos (rasgos físicos, accesorios, gestos habituales) son tu PEOR muletilla.
   REGLAS INVIOLABLES:
   - Cada rasgo físico de un personaje puede mencionarse MÁXIMO 1 VEZ en TODO EL LIBRO (no por capítulo: en TODA la novela)
   - La PRIMERA aparición de un personaje en la novela: describe 1-2 rasgos clave. NUNCA MÁS.
   - En capítulos posteriores: PROHIBIDO repetir descripción física. El lector YA SABE cómo es el personaje.
   - Accesorios (gafas, anillos, cicatrices, tatuajes) → menciónalo SOLO cuando sea relevante para la ACCIÓN ("se quitó las gafas para frotarse los ojos cansados"), nunca como etiqueta identificativa
   - NUNCA uses el mismo epíteto para reintroducir a un personaje en cada escena. Varía: nombre propio, cargo, relación ("su compañero", "la detective"), acción ("la mujer que acababa de entrar")
   - PROHIBIDO: "sus ojos [color]" como forma de referirse al personaje. Usa su NOMBRE.
   - Si los capítulos anteriores ya mencionaron un rasgo (ojos, pelo, cicatriz, gafas) → NO lo repitas. CONFÍA en que el lector lo recuerda de capítulos anteriores
   - AUTOTEST: al terminar el capítulo, pregúntate "¿Mencioné el color de ojos, pelo o algún accesorio de algún personaje?" Si la respuesta es SÍ y no es la primera aparición → ELIMÍNALO

C) VARIEDAD ESTRUCTURAL:
   - Alterna longitud de oraciones: cortas tensas / largas descriptivas
   - Varía inicios de párrafo: nunca dos párrafos seguidos empezando igual
   - Usa diferentes técnicas: narración, diálogo, monólogo interno, descripción

D) INFORMACIÓN NO REPETIDA:
   - Si ya estableciste un hecho, NO lo repitas
   - El lector recuerda, no necesita que le repitan
   - Cada oración debe añadir información NUEVA

E) ANTI-REITERACIÓN ATMOSFÉRICA Y SENSORIAL (CRÍTICO):
   - NO describas el mismo ambiente/atmósfera más de una vez por escena
   - Si ya dijiste que hacía calor, NO vuelvas a mencionar el sudor, el sol abrasador ni la sequedad tres párrafos después
   - Si ya estableciste tensión con una imagen (silencio, oscuridad, frío), NO repitas la misma idea con sinónimos
   - Patrón PROHIBIDO: abrir párrafo con descripción atmosférica → diálogo → cerrar párrafo con otra descripción atmosférica similar
   - Máximo 1 detalle sensorial/atmosférico por cada 3-4 párrafos en escenas de diálogo o acción
   - Las descripciones de luz, temperatura, olores y sonidos NO deben repetirse aunque uses palabras diferentes — es la misma información

═══════════════════════════════════════════════════════════════════
PROHIBICIONES ABSOLUTAS - VEROSIMILITUD NARRATIVA
═══════════════════════════════════════════════════════════════════
El peor error es el DEUS EX MACHINA. NUNCA escribas:

1. RESCATES CONVENIENTES:
   - Un personaje NO puede aparecer "justo a tiempo" si no estaba ya establecido en la escena
   - Ningún objeto/habilidad puede salvar al protagonista si no fue mencionado ANTES
   - Los aliados deben tener razón lógica para estar ahí

2. COINCIDENCIAS FORZADAS:
   - Prohibido: "casualmente encontró", "por suerte apareció", "justo en ese momento"
   - El protagonista debe GANARSE sus soluciones con acciones previas
   - Los problemas no se resuelven solos

3. REVELACIONES SIN FUNDAMENTO:
   - No revelar información crucial sin haberla sembrado antes
   - No introducir poderes/habilidades nuevas en el momento que se necesitan
   - Todo giro debe ser "sorprendente pero inevitable"

4. VERIFICACIÓN DE SETUP:
   - Antes de resolver un conflicto, pregúntate: "¿Esto fue establecido antes?"
   - Si la respuesta es NO, busca otra solución que SÍ esté fundamentada
   - Consulta los "riesgos_de_verosimilitud" del Arquitecto si los hay

═══════════════════════════════════════════════════════════════════
TRANSICIONES DE UBICACIÓN (OBLIGATORIAS)
═══════════════════════════════════════════════════════════════════
Cuando hay cambio de ubicación entre capítulos, el inicio DEBE incluir una transición narrativa:
- NUNCA comiences un capítulo con el personaje ya en la nueva ubicación sin narrar el viaje
- Describe el trayecto: método de viaje, duración, sensaciones físicas (fatiga, clima, olores)
- Si el Arquitecto proporciona "transicion_ubicacion", DEBES usarla como guía obligatoria
- La transición debe integrarse naturalmente, no como un bloque informativo separado

Ejemplo INCORRECTO: "Lucius entró en el Anfiteatro..." (sin transición desde ubicación anterior)
Ejemplo CORRECTO: "El sol del mediodía castigaba sus hombros mientras Lucius atravesaba la Via Sacra. Una hora de caminata lo separaba del Atrium, tiempo suficiente para que el sudor empapara su túnica. Cuando finalmente divisó las columnas del Anfiteatro..."

═══════════════════════════════════════════════════════════════════
NOMBRES DE PERSONAJES - FIDELIDAD AL WORLD BIBLE
═══════════════════════════════════════════════════════════════════
- Usa EXACTAMENTE los nombres definidos en el World Bible. No los cambies, no los "mejores", no los sustituyas por nombres más comunes.
- Si el Arquitecto eligió un nombre inusual, RESPÉTALO — fue elegido a propósito para ser original.
- NUNCA inventes personajes nuevos que no existan en el World Bible o la escaleta.

═══════════════════════════════════════════════════════════════════
LÉXICO HISTÓRICO - VOZ DE ÉPOCA (CRÍTICO)
═══════════════════════════════════════════════════════════════════
Consulta SIEMPRE la sección "lexico_historico" del World Bible:
- NUNCA uses términos de "terminos_anacronicos_prohibidos" - son palabras modernas inaceptables
- PRIORIZA el "vocabulario_epoca_autorizado" para mantener la voz histórica auténtica
- Respeta el "registro_linguistico" indicado (formal/coloquial/técnico de época)
- Cuando dudes sobre una palabra, elige la alternativa más antigua/clásica

TÉRMINOS MODERNOS PROHIBIDOS EN FICCIÓN HISTÓRICA (lista por defecto):
"burguesa", "estrés", "impacto" (metafórico), "enfocarse", "rol", "empoderamiento", "básico", 
"literal", "problemática", "dinámico", "autoestima", "productivo", "agenda" (metafórico), 
"contexto", "paradigma", "priorizar", "gestionar", "implementar", "escenario" (metafórico)

═══════════════════════════════════════════════════════════════════
REGLAS DE CONTINUIDAD FÍSICA
═══════════════════════════════════════════════════════════════════

1. RASGOS FÍSICOS CANÓNICOS: Consulta SIEMPRE la ficha "apariencia_inmutable" de cada personaje.
   - Color de ojos: INMUTABLE
   - Color/textura de cabello: INMUTABLE
   - Rasgos distintivos: INMUTABLES
   - NO inventes ni modifiques estos datos bajo ninguna circunstancia

2. POSICIÓN ESPACIAL: Respeta dónde está cada personaje físicamente.
   - Un personaje no puede aparecer sin haberse movido
   - Respeta la ubicación indicada en la escaleta

3. CONTINUIDAD TEMPORAL: Respeta la cronología establecida.

═══════════════════════════════════════════════════════════════════
⛔ CONTINUITY GATE - VERIFICACIÓN OBLIGATORIA (CRÍTICO)
═══════════════════════════════════════════════════════════════════
ANTES de escribir UNA SOLA LÍNEA de prosa, DEBES verificar el estado de CADA personaje:

1. ESTADO VITAL: ¿Está VIVO, MUERTO, HERIDO, INCONSCIENTE, DESAPARECIDO?
   - Si un personaje murió en capítulos anteriores → NO PUEDE APARECER (excepto flashback explícito)
   - Si está herido → La herida DEBE afectar sus acciones
   - Si está inconsciente → NO PUEDE actuar hasta que despierte

2. UBICACIÓN: ¿Dónde está físicamente cada personaje?
   - Un personaje en Roma NO PUEDE aparecer en Egipto sin viaje narrado
   - Respeta la última ubicación conocida del capítulo anterior

3. OBJETOS POSEÍDOS: ¿Qué tiene cada personaje?
   - Si soltó un arma → NO la tiene hasta que la recupere
   - Si perdió algo → NO puede usarlo

4. CONOCIMIENTO DE PERSONAJES: ¿Qué sabe cada personaje?
   - Cada personaje SOLO puede actuar/hablar con la información que ÉL ha adquirido
   - Si el LECTOR sabe un secreto pero el PERSONAJE no estuvo presente → el personaje NO LO SABE
   - Verificar knowledgeGained del estado anterior: un personaje NO puede mencionar/reaccionar a información que solo otro personaje descubrió
   - Esto aplica también a pronombres: si "ella" dice algo que solo "él" sabe → VIOLACIÓN

5. APARIENCIA INMUTABLE: Consulta apariencia_inmutable del World Bible
   - Rasgos físicos (ojos, pelo, cicatrices, estatura) NUNCA cambian sin justificación narrativa explícita
   - Si describes un rasgo físico, DEBE coincidir exactamente con la ficha canónica

6. IDENTIDADES DOBLES/SECRETAS (CRÍTICO — causa principal de rechazos irrecuperables):
   Si un personaje tiene el campo "identidad" en el World Bible con "tiene_doble_identidad: true":
   a) ANTES de la revelación (según capitulo_revelacion_lector):
      - El narrador se refiere al personaje SOLO con "nombre_narrador_antes_revelacion"
      - NUNCA filtrar al lector la identidad real antes del capítulo indicado
      - Los demás personajes interactúan con la identidad pública — sus diálogos y pensamientos reflejan SOLO lo que ellos creen
   b) EN el capítulo de revelación:
      - Debe haber un beat narrativo EXPLÍCITO donde la verdad se descubre
      - Transición clara: el narrador pasa de usar un nombre a otro
      - Las reacciones de los personajes presentes deben ser coherentes con su nivel de sorpresa
   c) DESPUÉS de la revelación:
      - El narrador SOLO usa "nombre_narrador_despues_revelacion"
      - NUNCA volver al nombre anterior salvo en diálogos donde un personaje aún no lo sepa
      - Otros personajes que NO estuvieron en la revelación siguen usando el nombre antiguo hasta enterarse
   d) REGLA DE ORO: En cada párrafo pregúntate "¿quién sabe qué en este momento?" y escribe SOLO desde ese conocimiento
   Si la escaleta tiene campo "estado_identidades", úsalo como guía obligatoria para el capítulo actual.

⚠️ Si detectas CUALQUIER conflicto entre el estado anterior y lo que pide la escaleta:
   - NO escribas el capítulo
   - Indica el conflicto en tu respuesta
   - El Editor rechazará automáticamente cualquier violación de continuidad vital

═══════════════════════════════════════════════════════════════════
🛡️ LEXICAL SHIELD - AUDITORÍA DE VOCABULARIO (OBLIGATORIO)
═══════════════════════════════════════════════════════════════════
Para ficción histórica, ANTES de escribir, prepara mentalmente sustituciones para:

PROHIBIDO → USAR EN SU LUGAR:
- "física" (ciencia) → "naturaleza", "la mecánica del cuerpo"
- "shock" → "estupor", "parálisis del espanto", "el golpe del horror"
- "microscópico" → "invisible al ojo", "diminuto", "imperceptible"
- "psicológico" → "del ánimo", "del espíritu", "mental"
- "trauma" → "herida del alma", "cicatriz invisible", "la marca"
- "estrés" → "tensión", "agobio", "peso del momento"
- "impacto" → "golpe", "efecto", "consecuencia"

Si dudas de una palabra: ¿Existía en la época? Si no → busca alternativa.

═══════════════════════════════════════════════════════════════════
⚔️ ACTION RULEBOOK - FACTIBILIDAD FÍSICA (PARA ESCENAS DE ACCIÓN)
═══════════════════════════════════════════════════════════════════
En escenas de combate o acción física:

1. CAPACIDADES DEL PERSONAJE: Consulta su ficha en World Bible
   - Un escriba no lucha como un gladiador
   - Un anciano no corre como un joven
   - Una herida previa LIMITA las acciones

2. REALISMO MÉDICO:
   - Un brazo herido NO puede sostener peso
   - La pérdida de sangre causa debilidad progresiva
   - El dolor afecta la concentración

3. CAUSALIDAD MECÁNICA:
   - Cada golpe tiene consecuencia física visible
   - La fatiga se acumula
   - Las armas se pierden, se rompen, se atascan

═══════════════════════════════════════════════════════════════════
ESTÁNDAR DE EXCELENCIA EDITORIAL (OBJETIVO: 9/10 EN PRIMERA ESCRITURA)
═══════════════════════════════════════════════════════════════════
Tu texto será evaluado por un Editor con estándar de excelencia (umbral 9/10).
Para aprobar a la primera SIN reescrituras, cumple ESTOS criterios:

A) PROSA DE AUTOR HUMANO (NO de IA):
   - Cada personaje habla con VOZ PROPIA: vocabulario, ritmo, muletillas únicas
   - El narrador tiene PERSONALIDAD: no es una cámara neutral, sino una voz con textura
   - Escribe con IRREGULARIDADES HUMANAS: frases a medio terminar, pensamientos que se desvían
   - Un párrafo de 5 líneas seguido de uno de 1 línea. Un diálogo largo seguido de un silencio descrito
   - Evita la "prosa de informe": nunca narres como si resumieras, VIVE la escena

B) ECONOMÍA SENSORIAL ESTRICTA:
   - PROHIBIDO: "Sintió miedo" / "El ambiente era tenso" → Usa ACCIÓN
   - UNA pincelada sensorial al entrar en un espacio. NUNCA MÁS en esa escena.
   - PROHIBIDO activar múltiples sentidos seguidos (olor + sonido + tacto + luz = prosa de IA)
   - PROHIBIDO párrafos enteros de ambientación. Máximo 1 frase de contexto, luego ACCIÓN.
   - La tensión la crean las ACCIONES y los DIÁLOGOS, no las descripciones del ambiente.
   - Si ya describiste el espacio, CONFÍA en que el lector lo recuerda. No repitas.
   - Ratio objetivo: 70% acción/diálogo, 20% pensamiento, 10% descripción. Si tienes más de 10% descripción, estás recargando.

C) SUBTEXTO EN DIÁLOGOS (lo que NO se dice):
   - Los personajes RARA VEZ dicen exactamente lo que piensan
   - Escribir subtexto: lo que dicen vs lo que quieren decir vs lo que sienten
   - Incluye silencios, evasiones, cambios de tema, respuestas indirectas
   - El monólogo interno puede CONTRADECIR lo que el personaje dice en voz alta
   - Un buen diálogo tiene tensión DEBAJO de las palabras

D) ARCO EMOCIONAL CON PROGRESIÓN (no plano):
   - El capítulo debe tener VALLES y CIMAS emocionales, no un tono constante
   - Alterna tensión con momentos de respiro (pero breves)
   - El estado emocional del protagonista al final DEBE ser diferente al del inicio
   - Las transiciones emocionales son GRADUALES: no pases de calma a terror sin escalones intermedios

E) GANCHO DE APERTURA + CIERRE MEMORABLE:
   - Las primeras 3 frases determinan si el lector sigue. Empieza IN MEDIA RES o con una imagen potente
   - Las últimas 3 frases del capítulo deben dejar una MARCA: pregunta sin respuesta, revelación, giro, imagen persistente
   - NUNCA abras con descripción genérica del clima o del lugar
   - NUNCA cierres con el personaje simplemente "yéndose a dormir" o "pensando en lo ocurrido"

F) CADA BEAT = UNA ESCENA COMPLETA:
   - Un beat NO es un párrafo de resumen. Es una ESCENA con entrada, desarrollo y salida
   - Incluye en cada beat: descripción del espacio, acciones físicas, diálogos o pensamientos, y una micro-resolución o escalada
   - Si un beat dice "X descubre Y", NO escribas "X descubrió Y". Narra el PROCESO del descubrimiento

═══════════════════════════════════════════════════════════════════
PROCESO DE ESCRITURA (Thinking Level: High)
═══════════════════════════════════════════════════════════════════

ANTES DE ESCRIBIR:
1. Lee la "apariencia_inmutable" de cada personaje presente. Memoriza sus rasgos EXACTOS.
2. Revisa la "World Bible" para entender motivaciones y arcos de los personajes.
3. Verifica la "continuidad_entrada" para situar personajes correctamente.
4. Estudia la "informacion_nueva" que DEBE revelarse en este capítulo.
5. Comprende el "giro_emocional" que debe experimentar el lector.
6. Revisa las "prohibiciones_este_capitulo" si las hay.
7. Planifica la CURVA EMOCIONAL del capítulo: ¿dónde están los valles, las cimas y los giros?
8. Decide la PRIMERA y ÚLTIMA frase del capítulo ANTES de escribir el resto.

MIENTRAS ESCRIBES:
9. Sigue los BEATS en orden, desarrollando cada uno como escena COMPLETA con acción, diálogo y emoción (pinceladas sensoriales puntuales, sin saturar).
10. Implementa los "recursos_literarios_sugeridos" si los hay.
11. Mantén un registro mental de expresiones ya usadas para NO repetirlas.
12. AUTOAUDITA cada párrafo: ¿suena a IA o a autor humano? ¿Es concreto o abstracto? ¿Repite algo previo?

AL TERMINAR:
13. Verifica que la "continuidad_salida" queda establecida.
14. Confirma que la "pregunta_dramatica" queda planteada.
15. Revisa que NO hayas repetido frases, metáforas o conceptos.
16. RELEE las primeras y últimas 3 frases: ¿enganchan? ¿Son memorables?
`;

export class GhostwriterAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Narrador",
      role: "ghostwriter",
      systemPrompt: SYSTEM_PROMPT,
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 65536,
    });
  }

  private formatWorldBibleForPrompt(wb: any): string {
    if (!wb || typeof wb !== 'object') {
      return `CONTEXTO DEL MUNDO (World Bible): ${JSON.stringify(wb || {})}`;
    }
    
    const parts: string[] = [];
    const mappedKeys = new Set<string>();
    
    parts.push(`═══════════════════════════════════════════════════════════════════`);
    parts.push(`📖 WORLD BIBLE COMPLETA (REFERENCIA OBLIGATORIA)`);
    parts.push(`═══════════════════════════════════════════════════════════════════`);

    mappedKeys.add('_author_notes');
    if (Array.isArray(wb._author_notes) && wb._author_notes.length > 0) {
      parts.push(`\n⚠️⚠️⚠️ INSTRUCCIONES DEL AUTOR (OBLIGATORIAS) ⚠️⚠️⚠️`);
      parts.push(`Las siguientes notas son restricciones EXPLÍCITAS del autor. DEBES respetarlas SIEMPRE:`);
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
      const sorted = [...wb._author_notes].sort((a: any, b: any) => 
        (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
      );
      for (const note of sorted) {
        if (!note) continue;
        const priorityLabel = note.priority === "critical" ? "🔴 CRÍTICA" : 
                              note.priority === "high" ? "🟠 ALTA" : 
                              note.priority === "normal" ? "🟢" : "⚪";
        const catLabel = note.category === "continuity" ? "Continuidad" :
                        note.category === "character" ? "Personaje" :
                        note.category === "plot" ? "Trama" :
                        note.category === "style" ? "Estilo" :
                        note.category === "worldbuilding" ? "Mundo" : note.category || "";
        parts.push(`  ${priorityLabel} [${catLabel}]: ${note.text}`);
      }
      parts.push(``);
    }

    const personajes = wb.personajes || wb.characters || [];
    mappedKeys.add('personajes'); mappedKeys.add('characters');
    if (Array.isArray(personajes) && personajes.length > 0) {
      parts.push(`\n👥 PERSONAJES (${personajes.length}):`);
      for (const p of personajes) {
        const name = p.nombre || p.name || "Sin nombre";
        const role = p.rol || p.role || "";
        parts.push(`\n  ▸ ${name} (${role})`);
        
        const perfil = p.perfil_psicologico || p.psychologicalProfile || "";
        if (perfil) parts.push(`    Perfil: ${typeof perfil === 'string' ? perfil : JSON.stringify(perfil)}`);
        
        const arco = p.arco || p.arco_transformacion || p.arc || "";
        if (arco) parts.push(`    Arco: ${typeof arco === 'string' ? arco : JSON.stringify(arco)}`);

        const contraCliche = p.contra_cliche || "";
        if (contraCliche) parts.push(`    ⚡ Anti-arquetipo: ${contraCliche}`);

        const modismos = p.modismos_habla || [];
        if (Array.isArray(modismos) && modismos.length > 0) parts.push(`    🗣️ Modismos de habla: ${modismos.join(", ")}`);
        
        const relaciones = p.relaciones || p.relationships || [];
        if (relaciones.length > 0) parts.push(`    Relaciones: ${JSON.stringify(relaciones)}`);
        
        const ap = p.apariencia_inmutable || p.aparienciaInmutable || {};
        if (ap && Object.keys(ap).length > 0) {
          const traits = [];
          if (ap.ojos) traits.push(`ojos: ${ap.ojos}`);
          if (ap.cabello) traits.push(`cabello: ${ap.cabello}`);
          if (ap.altura || ap.estatura) traits.push(`altura: ${ap.altura || ap.estatura}`);
          if (ap.edad || ap.edad_aparente) traits.push(`edad: ${ap.edad || ap.edad_aparente}`);
          const rasgos = ap.rasgos_distintivos || ap.rasgosDistintivos || [];
          if (rasgos.length > 0) traits.push(`rasgos: ${rasgos.join(", ")}`);
          if (traits.length > 0) parts.push(`    🔒 Apariencia INMUTABLE: ${traits.join(" | ")}`);
        }
        
        if (p.estado_actual || p.currentStatus) {
          const status = p.estado_actual || p.currentStatus;
          const icon = status === "dead" || p.vivo === false || p.isAlive === false ? "💀" : 
                       status === "injured" ? "🩹" : "✅";
          parts.push(`    ${icon} Estado: ${status}`);
        }
        if (p.ubicacion_actual || p.lastLocation) {
          parts.push(`    📍 Ubicación actual: ${p.ubicacion_actual || p.lastLocation}`);
        }
        if (p.objetos_actuales?.length > 0 || p.currentItems?.length > 0) {
          parts.push(`    🎒 Objetos: [${(p.objetos_actuales || p.currentItems).join(", ")}]`);
        }
        if (p.heridas_activas?.length > 0 || p.activeInjuries?.length > 0) {
          parts.push(`    🩹 Heridas activas: [${(p.heridas_activas || p.activeInjuries).join(", ")}]`);
        }
        if (p.conocimiento_acumulado?.length > 0 || p.accumulatedKnowledge?.length > 0) {
          const knowledge = p.conocimiento_acumulado || p.accumulatedKnowledge;
          parts.push(`    🧠 Sabe: [${knowledge.join("; ")}]`);
        }
        if (p.estado_emocional || p.currentEmotionalState) {
          parts.push(`    💭 Emocional: ${p.estado_emocional || p.currentEmotionalState}`);
        }
        if (p.ultimo_capitulo || p.lastSeenChapter) {
          parts.push(`    📄 Última aparición: Cap ${p.ultimo_capitulo || p.lastSeenChapter}`);
        }
      }
    }

    const lugares = wb.lugares || wb.locations || [];
    mappedKeys.add('lugares'); mappedKeys.add('locations');
    if (Array.isArray(lugares) && lugares.length > 0) {
      parts.push(`\n🏛️ LUGARES:`);
      for (const l of lugares) {
        if (!l) continue;
        const name = l.nombre || l.name || "";
        const desc = l.descripcion || l.description || l.ambiente || "";
        parts.push(`  ▸ ${name}: ${typeof desc === 'string' ? desc : JSON.stringify(desc)}`);
      }
    }

    const reglas = wb.reglas_lore || wb.rules || wb.world_rules || wb.worldRules || [];
    mappedKeys.add('reglas_lore'); mappedKeys.add('rules'); mappedKeys.add('world_rules'); mappedKeys.add('worldRules');
    if (Array.isArray(reglas) && reglas.length > 0) {
      parts.push(`\n📜 REGLAS DEL MUNDO:`);
      for (const r of reglas) {
        if (!r) continue;
        const cat = r.categoria || r.category || "";
        const rule = r.regla || r.rule || r.descripcion || "";
        if (cat !== "__narrative_threads") {
          parts.push(`  ▸ [${cat}] ${rule}`);
          const constraints = r.restricciones || r.constraints || [];
          if (Array.isArray(constraints) && constraints.length > 0) parts.push(`    Restricciones: ${constraints.join(", ")}`);
        }
      }
    }

    const lexico = wb.lexico_historico || wb.historicalVocabulary || null;
    mappedKeys.add('lexico_historico'); mappedKeys.add('historicalVocabulary');
    if (lexico && typeof lexico === 'object' && Object.keys(lexico).length > 0) {
      parts.push(`\n📝 LÉXICO HISTÓRICO:`);
      if (lexico.autorizado || lexico.allowed) {
        parts.push(`  Autorizado: ${JSON.stringify(lexico.autorizado || lexico.allowed)}`);
      }
      if (lexico.prohibido || lexico.forbidden) {
        parts.push(`  Prohibido: ${JSON.stringify(lexico.prohibido || lexico.forbidden)}`);
      }
    }

    mappedKeys.add('_hilos_pendientes'); mappedKeys.add('_hilos_resueltos');
    if (Array.isArray(wb._hilos_pendientes) && wb._hilos_pendientes.length > 0) {
      parts.push(`\n🔄 HILOS NARRATIVOS PENDIENTES:`);
      wb._hilos_pendientes.forEach((h: string) => parts.push(`  ▸ ${h}`));
    }
    if (Array.isArray(wb._hilos_resueltos) && wb._hilos_resueltos.length > 0) {
      parts.push(`\n✅ HILOS NARRATIVOS RESUELTOS:`);
      wb._hilos_resueltos.forEach((h: string) => parts.push(`  ▸ ${h}`));
    }

    mappedKeys.add('_plot_decisions');
    if (Array.isArray(wb._plot_decisions) && wb._plot_decisions.length > 0) {
      parts.push(`\n⚖️ DECISIONES DE TRAMA ESTABLECIDAS (NO contradecir):`);
      for (const d of wb._plot_decisions) {
        if (!d) continue;
        parts.push(`  ▸ ${d.decision || d.descripcion || JSON.stringify(d)} (Cap ${d.capitulo_establecido || "?"})`);
      }
    }

    mappedKeys.add('_persistent_injuries');
    if (Array.isArray(wb._persistent_injuries) && wb._persistent_injuries.length > 0) {
      parts.push(`\n🩹 LESIONES PERSISTENTES DETECTADAS:`);
      for (const inj of wb._persistent_injuries) {
        if (!inj) continue;
        parts.push(`  ▸ ${inj.personaje || "?"}: ${inj.tipo_lesion || "?"} (Cap ${inj.capitulo_ocurre || "?"}) → ${inj.efecto_esperado || "?"}`);
      }
    }

    mappedKeys.add('_timeline');
    if (Array.isArray(wb._timeline) && wb._timeline.length > 0) {
      parts.push(`\n📅 LÍNEA TEMPORAL:`);
      for (const t of wb._timeline) {
        if (!t) continue;
        parts.push(`  ▸ Cap ${t.chapter || "?"}: ${t.event || "?"} [${Array.isArray(t.characters) ? t.characters.join(", ") : ""}]`);
      }
    }

    mappedKeys.add('_series_hilos_no_resueltos'); mappedKeys.add('_series_eventos_clave_previos');
    if (Array.isArray(wb._series_hilos_no_resueltos) && wb._series_hilos_no_resueltos.length > 0) {
      parts.push(`\n═══════════════════════════════════════════════════════════════════`);
      parts.push(`🔴 HILOS NO RESUELTOS DE LIBROS ANTERIORES DE LA SERIE`);
      parts.push(`═══════════════════════════════════════════════════════════════════`);
      parts.push(`Estos hilos DEBEN progresar o resolverse. NO ignorarlos:`);
      wb._series_hilos_no_resueltos.forEach((h: string, i: number) => parts.push(`  ${i + 1}. ${h}`));
      parts.push(`⛔ Si un hilo de estos es relevante para este capítulo, DEBES hacer referencia a él o avanzarlo.`);
    }
    if (Array.isArray(wb._series_eventos_clave_previos) && wb._series_eventos_clave_previos.length > 0) {
      parts.push(`\n📚 EVENTOS CLAVE DE LIBROS ANTERIORES (contexto de serie):`);
      wb._series_eventos_clave_previos.slice(0, 15).forEach((e: string) => parts.push(`  ▸ ${e}`));
    }

    mappedKeys.add('premisa'); mappedKeys.add('estructura_tres_actos');
    mappedKeys.add('escaleta_capitulos'); mappedKeys.add('terminos_anacronicos_prohibidos');
    if (wb.premisa) {
      parts.push(`\n📌 PREMISA: ${typeof wb.premisa === 'string' ? wb.premisa : JSON.stringify(wb.premisa)}`);
    }
    if (wb.estructura_tres_actos) {
      parts.push(`\n🎭 ESTRUCTURA: ${JSON.stringify(wb.estructura_tres_actos)}`);
    }

    const unmappedKeys = Object.keys(wb).filter(k => !mappedKeys.has(k));
    if (unmappedKeys.length > 0) {
      parts.push(`\n📋 DATOS ADICIONALES:`);
      for (const key of unmappedKeys) {
        try {
          const val = wb[key];
          if (val !== null && val !== undefined && val !== "" && 
              !(Array.isArray(val) && val.length === 0) &&
              !(typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0)) {
            const str = typeof val === 'string' ? val : JSON.stringify(val);
            if (str.length < 2000) {
              parts.push(`  ${key}: ${str}`);
            } else {
              parts.push(`  ${key}: ${str.substring(0, 2000)}...`);
            }
          }
        } catch {
          parts.push(`  ${key}: [datos disponibles]`);
        }
      }
    }

    parts.push(`\n═══════════════════════════════════════════════════════════════════`);
    return parts.join("\n");
  }

  async execute(input: GhostwriterInput): Promise<AgentResponse> {
    const worldBibleFormatted = this.formatWorldBibleForPrompt(input.worldBible);
    
    let prompt = `
    ${worldBibleFormatted}
    GUÍA DE ESTILO: ${input.guiaEstilo}
    
    ${input.previousContinuity ? `
    ═══════════════════════════════════════════════════════════════════
    ⛔ ESTADO DE CONTINUIDAD DEL CAPÍTULO ANTERIOR (VERIFICACIÓN OBLIGATORIA)
    ═══════════════════════════════════════════════════════════════════
    ${input.previousContinuity}
    
    ⚠️ ANTES DE ESCRIBIR, verifica que NINGÚN personaje listado como "dead" aparezca activo.
    ⚠️ Respeta las ubicaciones finales de cada personaje.
    ⚠️ Si un personaje tiene heridas o limitaciones, DEBEN afectar sus acciones.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    `;

    const minWords = input.minWordCount || 2500;
    // Reduced from 1.4 to 1.15 to prevent manuscripts from exceeding target by more than 15%
    const maxWords = input.maxWordCount || Math.round(minWords * 1.15);
    
    prompt += `
    ╔═══════════════════════════════════════════════════════════════════╗
    ║  🚨🚨🚨 REQUISITO CRÍTICO DE EXTENSIÓN - LEE ESTO PRIMERO 🚨🚨🚨  ║
    ╠═══════════════════════════════════════════════════════════════════╣
    ║                                                                   ║
    ║   EXTENSIÓN MÍNIMA OBLIGATORIA: ${String(minWords).padStart(5)} PALABRAS               ║
    ║   EXTENSIÓN MÁXIMA RECOMENDADA: ${String(maxWords).padStart(5)} PALABRAS               ║
    ║                                                                   ║
    ║   ⛔ CUALQUIER CAPÍTULO MENOR A ${minWords} PALABRAS SERÁ         ║
    ║      RECHAZADO AUTOMÁTICAMENTE Y DEBERÁS REESCRIBIRLO            ║
    ║                                                                   ║
    ║   TÉCNICAS PARA ALCANZAR LA EXTENSIÓN:                           ║
    ║   • Desarrolla CADA beat con 300-500 palabras mínimo             ║
    ║   • Incluye descripciones sensoriales detalladas                 ║
    ║   • Escribe diálogos extensos con acotaciones ricas              ║
    ║   • Añade monólogo interno en beats de CALMA (nunca en acción)   ║
    ║   • Describe el entorno, la atmósfera, los olores, sonidos      ║
    ║   • NO resumas - NARRA con detalle cada momento                  ║
    ║                                                                   ║
    ╚═══════════════════════════════════════════════════════════════════╝
    `;

    if (input.extendedGuideContent) {
      prompt += `
    ═══════════════════════════════════════════════════════════════════
    GUÍA DE EXTENSIÓN DEL AUTOR (CRÍTICO):
    ═══════════════════════════════════════════════════════════════════
    ${input.extendedGuideContent}
    ═══════════════════════════════════════════════════════════════════
    `;
    }

    if (input.kindleUnlimitedOptimized) {
      prompt += `
    ═══════════════════════════════════════════════════════════════════
    ⚡⚡⚡ OPTIMIZACIÓN KINDLE UNLIMITED (ACTIVA) ⚡⚡⚡
    ═══════════════════════════════════════════════════════════════════
    Este proyecto está OPTIMIZADO para Kindle Unlimited. Aplica estas técnicas de escritura:
    
    1. PROSA ADICTIVA Y DIRECTA:
       - Frases cortas y punzantes que aceleran el ritmo
       - Mínima descripción ambiental, máxima acción y diálogo
       - Cada párrafo debe impulsar al lector hacia adelante
       - Evita digresiones y reflexiones extensas
    
    2. CLIFFHANGER OBLIGATORIO AL FINAL:
       - El capítulo DEBE terminar con un gancho irresistible
       - Técnicas: revelación parcial, peligro inminente, pregunta sin respuesta, giro inesperado
       - El lector debe NECESITAR pasar al siguiente capítulo
       - Ejemplos efectivos:
         • "Y entonces vi quién estaba detrás de la puerta."
         • "Lo que encontré me heló la sangre."
         • "Sabía que solo tenía una oportunidad. Esta."
    
    3. TÉCNICA PAGE-TURNER:
       - Empezar in media res (en mitad de la acción)
       - Tensión constante, sin momentos de respiro prolongados
       - Revelar información en dosis pequeñas (dosificar secretos)
       - Crear múltiples líneas de tensión simultáneas
    
    4. ESTRUCTURA DE CAPÍTULO KU:
       - Apertura: Hook inmediato en las primeras 2 frases
       - Desarrollo: Acción/conflicto creciente
       - Cierre: Cliffhanger que obliga a continuar
    
    5. RITMO FRENÉTICO:
       - Diálogos rápidos y tensos
       - Decisiones constantes del protagonista
       - Cada página debe aportar algo nuevo (revelación, peligro, giro)
    
    ⚠️ RECUERDA: En Kindle Unlimited cada página leída = ingresos.
    El lector NO PUEDE sentir que es buen momento para dejar de leer.
    ═══════════════════════════════════════════════════════════════════
    `;
    }

    if (input.refinementInstructions) {
      prompt += `
    
    ========================================
    INSTRUCCIONES DE REESCRITURA (PLAN QUIRÚRGICO DEL EDITOR):
    ========================================
    ${input.refinementInstructions}
    
    ⚠️ REGLAS DE REESCRITURA (CRÍTICAS):
    1. PRESERVA las fortalezas y pasajes efectivos del borrador anterior
    2. APLICA solo las correcciones específicas indicadas
    3. NO reduzcas la extensión - mantén o aumenta el número de palabras
    4. NO reescribas desde cero - es una EDICIÓN QUIRÚRGICA, no una reescritura total
    5. Si algo funcionaba bien, MANTENLO INTACTO
    ========================================
    `;

      if (input.previousChapterContent) {
        const truncatedPrevious = input.previousChapterContent.length > 20000 
          ? input.previousChapterContent.substring(0, 20000) + "\n[...contenido truncado...]"
          : input.previousChapterContent;
        prompt += `
    ========================================
    BORRADOR ANTERIOR (BASE PARA EDICIÓN):
    ========================================
    ${truncatedPrevious}
    ========================================
    
    INSTRUCCIÓN: Usa este borrador como BASE. Modifica SOLO lo que indican las instrucciones de corrección.
    `;
      }
    }

    const chapterData = input.chapterData;
    
    prompt += `
    ═══════════════════════════════════════════════════════════════════
    TAREA ACTUAL: CAPÍTULO ${chapterData.numero} - "${chapterData.titulo}"
    ═══════════════════════════════════════════════════════════════════
    
    DATOS BÁSICOS:
    - Cronología: ${chapterData.cronologia}
    - Ubicación: ${chapterData.ubicacion}
    - Elenco Presente: ${chapterData.elenco_presente.join(", ")}
    ${chapterData.tono_especifico ? `- Tono específico: ${chapterData.tono_especifico}` : ""}
    ${chapterData.funcion_estructural ? `- Función estructural: ${chapterData.funcion_estructural}` : ""}
    
    ${chapterData.transicion_ubicacion ? `
    ═══════════════════════════════════════════════════════════════════
    TRANSICIÓN DE UBICACIÓN (OBLIGATORIO AL INICIO DEL CAPÍTULO)
    ═══════════════════════════════════════════════════════════════════
    El capítulo DEBE comenzar narrando la transición desde la ubicación anterior:
    - Ubicación anterior: ${chapterData.transicion_ubicacion.ubicacion_anterior || "No especificada"}
    - Método de viaje: ${chapterData.transicion_ubicacion.metodo_viaje || "No especificado"}
    - Duración estimada: ${chapterData.transicion_ubicacion.duracion_estimada || "No especificada"}
    - Narrativa puente sugerida: ${chapterData.transicion_ubicacion.narrativa_puente || "No especificada"}
    - Elementos sensoriales del viaje: ${chapterData.transicion_ubicacion.elementos_sensoriales_viaje?.join(", ") || "No especificados"}
    
    IMPORTANTE: No comiences directamente en la nueva ubicación. Narra el trayecto.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    OBJETIVO NARRATIVO:
    ${chapterData.objetivo_narrativo}
    
    ${chapterData.informacion_nueva ? `
    ═══════════════════════════════════════════════════════════════════
    INFORMACIÓN NUEVA A REVELAR (OBLIGATORIA):
    ${chapterData.informacion_nueva}
    Esta revelación DEBE aparecer en el capítulo.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    ${chapterData.conflicto_central ? `
    CONFLICTO CENTRAL DE ESTE CAPÍTULO:
    ${typeof chapterData.conflicto_central === 'string' 
      ? chapterData.conflicto_central 
      : `- Tipo: ${chapterData.conflicto_central.tipo || "externo"}\n    - Descripción: ${chapterData.conflicto_central.descripcion || ""}\n    - Lo que está en juego: ${chapterData.conflicto_central.stakes || ""}`}
    ` : ""}
    
    ${chapterData.giro_emocional ? `
    ARCO EMOCIONAL DEL LECTOR:
    ${typeof chapterData.giro_emocional === 'string'
      ? chapterData.giro_emocional
      : `- Al inicio del capítulo: ${chapterData.giro_emocional.emocion_inicio || "neutral"}\n    - Al final del capítulo: ${chapterData.giro_emocional.emocion_final || "intrigado"}`}
    ` : ""}
    
    ${chapterData.arcos_que_avanza && chapterData.arcos_que_avanza.length > 0 ? `
    ARCOS QUE DEBE AVANZAR ESTE CAPÍTULO:
    ${chapterData.arcos_que_avanza.map(a => `- ${a.arco}: de "${a.de}" a "${a.a}"`).join("\n")}
    ` : ""}
    
    BEATS NARRATIVOS (SIGUE EN ORDEN - DESARROLLA CADA UNO CON 300-500 PALABRAS):
    ${chapterData.beats.map((beat: any, i: number) => {
      // Handle both string and object beat formats
      if (typeof beat === 'string') {
        return `${i + 1}. ${beat}`;
      } else {
        // Object format with rich details
        let beatText = `${beat.numero || i + 1}. [${beat.tipo?.toUpperCase() || 'BEAT'}] ${beat.descripcion || ''}`;
        if (beat.personajes_activos?.length) beatText += `\n      Personajes: ${beat.personajes_activos.join(', ')}`;
        if (beat.accion_principal) beatText += `\n      Acción: ${beat.accion_principal}`;
        if (beat.elementos_sensoriales?.length) beatText += `\n      Elementos sensoriales a incluir: ${beat.elementos_sensoriales.join(', ')}`;
        if (beat.dialogo_sugerido) beatText += `\n      Diálogo sugerido: ${beat.dialogo_sugerido}`;
        if (beat.subtrama_tocada) beatText += `\n      Subtrama: ${beat.subtrama_tocada}`;
        if (beat.monologo_interno) beatText += `\n      Monólogo interno: ${beat.monologo_interno}`;
        if (beat.informacion_nueva) beatText += `\n      Información a revelar: ${beat.informacion_nueva}`;
        if (beat.tipo_hook) beatText += `\n      Tipo de hook: ${beat.tipo_hook}`;
        if (beat.pregunta_abierta) beatText += `\n      Pregunta para el lector: ${beat.pregunta_abierta}`;
        return beatText;
      }
    }).join("\n\n")}
    
    ${chapterData.pregunta_dramatica ? `
    PREGUNTA DRAMÁTICA (debe quedar planteada al final):
    ${chapterData.pregunta_dramatica}
    ` : ""}
    
    ${chapterData.recursos_literarios_sugeridos && chapterData.recursos_literarios_sugeridos.length > 0 ? `
    RECURSOS LITERARIOS SUGERIDOS PARA ESTE CAPÍTULO:
    ${chapterData.recursos_literarios_sugeridos.join(", ")}
    ` : ""}
    
    ${chapterData.prohibiciones_este_capitulo && chapterData.prohibiciones_este_capitulo.length > 0 ? `
    ═══════════════════════════════════════════════════════════════════
    PROHIBICIONES PARA ESTE CAPÍTULO (NO USAR):
    ${chapterData.prohibiciones_este_capitulo.join(", ")}
    Estos recursos ya se usaron en capítulos anteriores. Encuentra alternativas.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    ${chapterData.riesgos_de_verosimilitud ? `
    ═══════════════════════════════════════════════════════════════════
    ALERTAS DE VEROSIMILITUD DEL ARQUITECTO (CRÍTICO):
    ═══════════════════════════════════════════════════════════════════
    Posibles DEUS EX MACHINA a evitar:
    ${chapterData.riesgos_de_verosimilitud.posibles_deus_ex_machina?.length ? chapterData.riesgos_de_verosimilitud.posibles_deus_ex_machina.map((item: string) => `- ${item}`).join("\n    ") : "- Ninguno identificado"}
    
    SETUP REQUERIDO (debe haberse establecido en capítulos anteriores):
    ${chapterData.riesgos_de_verosimilitud.setup_requerido?.length ? chapterData.riesgos_de_verosimilitud.setup_requerido.map((item: string) => `- ${item}`).join("\n    ") : "- Ninguno específico"}
    
    Justificación causal: ${chapterData.riesgos_de_verosimilitud.justificacion_causal || "No especificada"}
    
    IMPORTANTE: Cada resolución debe ser SORPRENDENTE pero INEVITABLE en retrospectiva.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    ${chapterData.continuidad_entrada ? `
    ═══════════════════════════════════════════════════════════════════
    ⛔ ESTADO OBLIGATORIO AL INICIAR (DEL ARQUITECTO) ⛔
    ═══════════════════════════════════════════════════════════════════
    ${chapterData.continuidad_entrada}
    
    VERIFICACIÓN OBLIGATORIA ANTES DE ESCRIBIR:
    - ¿Dónde están físicamente los personajes al comenzar?
    - ¿Qué heridas/limitaciones tienen? DEBEN afectar sus acciones.
    - ¿Qué objetos poseen? No pueden usar lo que no tienen.
    - ¿Qué hora/día es? Debe ser coherente con el capítulo anterior.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    ${chapterData.continuidad_salida ? `
    ═══════════════════════════════════════════════════════════════════
    ESTADO OBLIGATORIO AL TERMINAR (PARA SIGUIENTE CAPÍTULO)
    ═══════════════════════════════════════════════════════════════════
    ${chapterData.continuidad_salida}
    El capítulo DEBE dejar a los personajes en este estado exacto.
    ═══════════════════════════════════════════════════════════════════
    ` : ""}
    
    ═══════════════════════════════════════════════════════════════════
    ⚠️ CHECKLIST DE CONTINUIDAD (VERIFICAR ANTES DE ESCRIBIR) ⚠️
    ═══════════════════════════════════════════════════════════════════
    1. UBICACIÓN: ¿El capítulo empieza donde terminó el anterior?
    2. TIEMPO: ¿La cronología es coherente (no hay saltos sin explicar)?
    3. PERSONAJES PRESENTES: ¿Solo aparecen los del "Elenco Presente"?
    4. PERSONAJES MUERTOS: ¿Ningún personaje marcado como "dead" aparece activo?
    5. HERIDAS: ¿Las lesiones del capítulo anterior siguen afectando?
    6. OBJETOS: ¿Los personajes solo usan objetos que realmente poseen?
    7. CONOCIMIENTO: ¿Nadie sabe información que no debería saber?
    
    ⛔ VIOLACIONES DE CONTINUIDAD = CAPÍTULO RECHAZADO ⛔
    ═══════════════════════════════════════════════════════════════════
    
    ═══════════════════════════════════════════════════════════════════
    🚨 RECORDATORIO FINAL: ESCRIBE EL CAPÍTULO COMPLETO 🚨
    ═══════════════════════════════════════════════════════════════════
    Comienza directamente con la narrativa. Sin introducción ni comentarios.
    
    🚫 ANTI-REPETICIÓN (OBLIGATORIO):
    - NO repitas expresiones, metáforas o imágenes usadas en capítulos anteriores
    - NO repitas la ESTRUCTURA de escenas previas (si el anterior tuvo "llegada → descubrimiento → huida", usa otro patrón)
    - NO repitas patrones de diálogo (si el anterior empezó con una pregunta retórica, no lo hagas aquí)
    - NO repitas el MECANISMO de revelaciones o giros (si el anterior usó "carta encontrada", usa otro recurso)
    - NO repitas el TIPO de final de capítulo (si el anterior terminó en cliffhanger, usa cierre emocional u otro)
    - Cada capítulo debe sentirse FRESCO y DIFERENTE en su ejecución narrativa
    - Lee el contexto de capítulos anteriores y asegúrate de NO duplicar sus recursos literarios
    
    ⚠️ TU CAPÍTULO DEBE TENER MÍNIMO ${minWords} PALABRAS ⚠️
    Si escribes menos, serás obligado a reescribir. Desarrolla cada escena con detalle.

    ═══════════════════════════════════════════════════════════════════
    🔍 AUTO-REVISIÓN OBLIGATORIA (ANTES DE ENTREGAR)
    ═══════════════════════════════════════════════════════════════════
    Cuando termines de escribir, RELEE tu texto y verifica:
    
    □ APERTURA: ¿Las primeras 3 frases enganchan? ¿Evito empezar con clima/paisaje genérico?
    □ CIERRE: ¿Las últimas 3 frases dejan marca? ¿Hay gancho, revelación o imagen persistente?
    □ SENTIDOS: ¿Cada escena activa al menos 3 sentidos (no solo vista)?
    □ SHOW DON'T TELL: ¿Todas las emociones se MUESTRAN con el cuerpo, nunca se DICEN?
    □ DIÁLOGOS: ¿Tienen subtexto? ¿Cada personaje tiene voz propia?
    □ RITMO: ¿Alterno frases cortas/largas? ¿Hay valles y cimas emocionales?
    □ BEATS: ¿Cada beat es una escena completa, no un resumen?
    □ CLICHÉS IA: ¿Usé "crucial", "enigmático", "fascinante", "torbellino", "palpable"? → ELIMINAR
    □ REPETICIONES: ¿Repetí alguna metáfora, expresión o estructura dentro del capítulo?
    □ CONTINUIDAD: ¿Los estados de personajes son coherentes con el capítulo anterior?
    
    Si algún punto falla, CORRIGE antes de entregar. El Editor rechazará por debajo de 9/10.
    
    ═══════════════════════════════════════════════════════════════════
    ESTADO DE CONTINUIDAD (OBLIGATORIO AL FINAL)
    ═══════════════════════════════════════════════════════════════════
    DESPUÉS de escribir el capítulo, DEBES incluir un bloque JSON con el estado de continuidad.
    Este bloque DEBE estar al final, después del texto narrativo, separado por:
    
    ---CONTINUITY_STATE---
    {
      "characterStates": {
        "Nombre del Personaje": {
          "location": "Dónde termina este personaje",
          "status": "alive|dead|injured|unconscious|missing|imprisoned",
          "hasItems": ["objetos que posee"],
          "emotionalState": "estado emocional al final",
          "knowledgeGained": ["información nueva que sabe"],
          "injuries": ["heridas o limitaciones físicas activas"]
        }
      },
      "narrativeTime": "Fecha/hora narrativa al terminar el capítulo",
      "keyReveals": ["revelaciones importantes hechas en este capítulo"],
      "pendingThreads": ["hilos narrativos abiertos pendientes de resolver"],
      "resolvedThreads": ["hilos narrativos cerrados en este capítulo"],
      "locationState": {
        "Nombre ubicación": "estado actual de la ubicación"
      },
      "scenePatterns": {
        "openingType": "cómo abre el capítulo (despertar/acción/diálogo/atmosférica/flashback/in-media-res)",
        "closingType": "cómo cierra el capítulo (cliffhanger/revelación/decisión/reflexión/cierre-emocional)",
        "revelationMechanism": "cómo se revela información clave (confesión/documento/espionaje/deducción/visión/ninguna)",
        "mainSceneStructures": ["tipos de escenas: confrontación/persecución/exploración/negociación/intimidad/descubrimiento"]
      },
      "keyDecisions": ["decisiones narrativas importantes tomadas que NO deben contradecirse"]
    }
    
    INCLUYE TODOS los personajes que aparecen en el capítulo, no solo el protagonista.
    Este estado es CRÍTICO para mantener la continuidad entre capítulos.
    `;

    const temperature = input.isRewrite ? 0.7 : 1.0;
    return this.generateContent(prompt, undefined, { temperature });
  }
  
  extractContinuityState(content: string): { cleanContent: string; continuityState: any | null } {
    if (!content || content.trim().length === 0) {
      console.warn("[Ghostwriter] extractContinuityState called with empty content");
      return { cleanContent: "", continuityState: null };
    }
    
    const separator = "---CONTINUITY_STATE---";
    const lastSepIdx = content.lastIndexOf(separator);
    
    if (lastSepIdx === -1) {
      console.log("[Ghostwriter] No continuity state separator found in content");
      return { cleanContent: content.trim(), continuityState: null };
    }
    
    let chapterText = content.substring(0, lastSepIdx).trim();
    const afterLastSep = content.substring(lastSepIdx + separator.length).trim();
    
    if (chapterText.startsWith(separator)) {
      chapterText = chapterText.substring(separator.length).trim();
    }
    while (chapterText.includes(separator)) {
      chapterText = chapterText.split(separator).join("").trim();
    }
    
    const chapterWordCount = chapterText.split(/\s+/).filter((w: string) => w.length > 0).length;
    
    if (chapterWordCount === 0 && afterLastSep.length > 200) {
      console.warn(`[Ghostwriter] Chapter text empty after separator extraction. After-separator content is ${afterLastSep.length} chars. Treating full content as chapter text (no continuity state).`);
      const fullClean = content.replace(new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
      return { cleanContent: fullClean, continuityState: null };
    }
    
    let continuityState = null;
    if (afterLastSep.length > 0) {
      try {
        continuityState = JSON.parse(afterLastSep);
        console.log("[Ghostwriter] Successfully extracted continuity state:", Object.keys(continuityState.characterStates || {}));
      } catch (e) {
        console.log("[Ghostwriter] Failed to parse continuity state JSON:", e);
        try {
          continuityState = repairJson(afterLastSep);
          console.log("[Ghostwriter] Extracted continuity state via repairJson");
        } catch (e2) {
          console.log("[Ghostwriter] repairJson extraction also failed");
        }
      }
    }
    
    return { cleanContent: chapterText || content.trim(), continuityState };
  }
}
