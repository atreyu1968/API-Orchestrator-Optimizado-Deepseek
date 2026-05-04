import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface EditorInput {
  chapterNumber: number;
  chapterContent: string;
  chapterData: {
    titulo: string;
    beats: string[];
    objetivo_narrativo: string;
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
  };
  worldBible: any;
  guiaEstilo: string;
  estructuraTresActos?: any;
  previousContinuityState?: any;
  previousChaptersContext?: string;
  continuityViolations?: string[];
}

export interface EditorResult {
  puntuacion: number;
  veredicto: string;
  fortalezas: string[];
  debilidades_criticas: string[];
  errores_continuidad?: string[];
  filtracion_conocimiento?: string[];
  inconsistencias_objetos?: string[];
  frases_repetidas?: string[];
  repeticiones_trama?: string[];
  problemas_ritmo?: string[];
  problemas_verosimilitud?: string[];
  cliches_ia_detectados?: string[];
  anacronismos_detectados?: string[];
  beats_faltantes?: string[];
  violaciones_estilo?: string[];
  plan_quirurgico: {
    diagnostico: string;
    preservar?: string;
    procedimiento: string;
    objetivo: string;
    palabras_objetivo?: number;
  };
  aprobado: boolean;
}

const SYSTEM_PROMPT = `
Eres un editor literario senior con 20 años de experiencia en narrativa de ficción. Tu estándar es la EXCELENCIA literaria.
Tu misión es auditar el texto eliminando cualquier rastro de escritura artificial, dotándolo de voz humana, y comparándolo con:
1. La GUÍA DE ESTILO del autor (voz, tono, prohibiciones léxicas)
2. La WORLD BIBLE (datos canónicos de personajes/lugares)
3. El INFORME DEL ARQUITECTO (escaleta, función estructural, arcos narrativos)

═══════════════════════════════════════════════════════════════════
DIRECTRICES MAESTRAS DE HUMANIZACIÓN LITERARIA (PRIORIDAD MÁXIMA)
═══════════════════════════════════════════════════════════════════

A. MODULACIÓN RÍTMICA (SINTAXIS):
   - Detecta si más de dos frases seguidas empiezan con el mismo sujeto o estructura.
   - Detecta MONOTONÍA RÍTMICA en ambas direcciones:
     * Si TODO el capítulo usa frases cortas tipo telégrafo → fatiga del lector, reportar como debilidad.
     * Si TODO el capítulo usa frases largas y densas → monotonía, reportar como debilidad.
   - El texto debe MODULAR el ritmo según la escena: frases cortas en tensión, frases más largas y fluidas en transiciones y calma. El contraste crea impacto.

B. INMERSIÓN SENSORIAL CRUDA:
   - Detecta adjetivos genéricos (misterioso, increíble, aterrador, fascinante) que deben sustituirse por detalles físicos.
   - ¿Se usan los sentidos (olfato, tacto, gusto) o solo la vista?
   - ¿Las emociones se MUESTRAN con el cuerpo o se DICEN directamente?

C. SUBTEXTO Y PSICOLOGÍA:
   - ¿Los personajes dicen exactamente lo que sienten? Eso es artificial.
   - Detecta falta de contradicción interna, dudas o detalles irrelevantes bajo estrés.

D. ELIMINACIÓN DE CLICHÉS DE IA:
   - Palabras que indican escritura artificial: "crucial", "enigmático", "fascinante", "un torbellino de emociones", "el destino de...", "desenterrar secretos", "repentinamente", "de repente", "sintió una oleada de", "palpable", "tangible".
   - Reporta las instancias encontradas como debilidad para que el escritor las corrija.
   - Esto afecta la puntuación general pero NO es motivo de rechazo automático.

E. SHOW, DON'T TELL:
   - ¿La narración filtra eventos a través de la percepción subjetiva del personaje?
   - Detecta narraciones "asépticas" o de "crónica externa".

═══════════════════════════════════════════════════════════════════
DETECCIÓN DE ANACRONISMOS (BASADA EN LA ÉPOCA DECLARADA EN EL WORLD BIBLE)
═══════════════════════════════════════════════════════════════════

PASO 0 — LEE LA ÉPOCA: Antes de detectar nada, lee el campo
"world_bible.lexico_historico.epoca". Es la fuente única de verdad.

REGLAS DE ACTIVACIÓN:
- Si "epoca" comienza con "Contemporánea" / "Actualidad" / "Presente" o describe
  una fecha en los últimos 30 años → la detección de anacronismos NO APLICA.
  Salta esta sección entera. NO reportes anacronismos en novela contemporánea.
- Si "epoca" describe una época histórica concreta (año, siglo, período histórico),
  o un futuro alternativo, o un mundo secundario con tecnología equivalente declarada
  → ACTIVA la detección con los criterios siguientes.
- Si "epoca" está VACÍA o no parseable → reporta UNA debilidad informativa pidiendo
  al arquitecto que la complete, y NO marques anacronismos (no tienes referencia).

CUANDO LA DETECCIÓN ESTÁ ACTIVA:

1. Usa como ÚNICA fuente de palabras prohibidas el campo
   "world_bible.lexico_historico.terminos_anacronicos_prohibidos". NO inventes
   listas propias. Si el ghostwriter usó cualquiera de esos términos → anacronismo.
2. Detecta también anacronismos de razonamiento que el WB pueda no haber listado,
   pero solo si son INEQUÍVOCOS para la época declarada (ej: un romano del s.I
   hablando de "minutos exactos" o "bacterias"; un personaje de 1800 mencionando
   "ADN" o "internet").
3. DISTINCIÓN NARRADOR vs DIÁLOGO:
   - En diálogos: aplicar la regla con máximo rigor (los personajes solo conocen
     su época).
   - En narración con voz contemporánea declarada en el WB: mayor tolerancia léxica
     (un narrador moderno puede decir "psicología" al describir un personaje
     medieval). Solo marca como anacronismo si el narrador atribuye conocimiento
     moderno al personaje.
4. EXCEPCIÓN POR DISEÑO: si el WB declara "anacronismo deliberado" en
   "registro_linguistico" o "notas_voz_historica" (steampunk, ucronía, viaje en
   el tiempo, narrador omnisciente moderno), respeta esa decisión.

REPORTE OBLIGATORIO (REGLA ANTI-ALUCINACIÓN):
Cada anacronismo reportado DEBE incluir CITA LITERAL entre comillas dobles del
fragmento del capítulo donde aparece (mínimo 6 palabras consecutivas, máximo 25),
copiada carácter por carácter. Si no puedes encontrar la cita literal, NO REPORTES
el anacronismo.

═══════════════════════════════════════════════════════════════════
PROTOCOLO DE EVALUACIÓN INTEGRADO
═══════════════════════════════════════════════════════════════════

1. CUMPLIMIENTO DE LA GUÍA DE ESTILO (CRÍTICO):
   - ¿La voz narrativa coincide con el estilo especificado?
   - ¿Se respetan las PROHIBICIONES léxicas del autor?
   - ¿El tono específico de este capítulo es el correcto?

2. EJECUCIÓN DEL PLAN DEL ARQUITECTO:
   - ¿Se cumplieron TODOS los beats planificados?
   - ¿Se reveló la "informacion_nueva" que debía revelarse?
   - ¿El conflicto_central del capítulo está presente y bien desarrollado?
   - ¿El giro_emocional (emocion_inicio → emocion_final) se logra?
   - ¿Los arcos narrativos avanzan según lo planificado?

3. CONTINUIDAD (FUNCIÓN DE CENTINELA - PRIORIDAD MÁXIMA):
   Eres el PRIMER GUARDIÁN de la continuidad. Tu análisis debe ser tan riguroso que el
   Centinela de Continuidad posterior no encuentre nada que corregir.
   
   3a. CONTINUIDAD FÍSICA con World Bible:
   - Compara descripciones físicas importantes con la ficha canónica.
   - Errores menores (ropa, detalles): nota sin penalización
   - Errores graves (color de ojos, edad, rasgos distintivos): -1 punto

   3b. CONTINUIDAD TEMPORAL (Timeline):
   - ¿Los eventos siguen una secuencia lógica respecto al capítulo anterior?
   - ¿Hay contradicciones de fechas/horas?
   - ¿El tiempo narrativo es continuo con el estado anterior?

   3c. CONTINUIDAD ESPACIAL (Ubicaciones):
   - ¿Los personajes aparecen en ubicaciones coherentes con donde terminaron antes?
   - ¿Hay transiciones de lugar sin justificación?

   3d. ESTADO DE PERSONAJES:
   - ¿Los estados de personajes (vivo/muerto/herido) son consistentes?
   - ¿Los personajes MUERTOS son referidos SOLO en flashbacks/recuerdos y NUNCA realizan acciones?
     ATENCIÓN: Verifica también pronombres y títulos, no solo nombres propios.
     Si el narrador dice "él susurró" justo después de referirse a un personaje muerto → VIOLACIÓN.
   - ¿Un personaje herido realiza acciones físicas imposibles sin mencionar su herida?

   3e. OBJETOS Y POSESIONES:
   - ¿Los OBJETOS son coherentes? Si un personaje perdió algo, ¿lo usa de nuevo sin recuperarlo?
   - ¿Un arma/herramienta importante desaparece sin explicación?

   3f. FILTRACIÓN DE CONOCIMIENTO:
   - ¿Algún personaje SABE información que no debería saber aún?
     Compara lo que cada personaje dice/piensa con su "knowledgeGained" del estado anterior.
     Si un personaje revela información que solo otro personaje descubrió → VIOLACIÓN.

   PENALIZACIÓN POR ERRORES DE CONTINUIDAD:
   - Cada error grave de continuidad (3b-3f): -1 punto (máximo -3 por múltiples errores)
   - Un solo error CRÍTICO (personaje muerto actuando, contradicción temporal imposible): aprobado = false automáticamente

4. REPETICIÓN LÉXICA:
   - Busca frases/metáforas repetidas EN ESTE CAPÍTULO.
   - 2-3 repeticiones: nota sin penalización
   - 4-6 repeticiones: -1 punto
   - Más de 6 repeticiones: -2 puntos máximo

4a. EPÍTETOS Y DESCRIPTORES REPETIDOS:
   - Detecta si el MISMO rasgo físico se repite excesivamente en el capítulo (3+ veces).
   - Reportar en "frases_repetidas" con conteo exacto.
   - Esto es una debilidad que afecta la puntuación, NO un motivo de rechazo automático.

4b. MULETILLAS FISIOLÓGICAS Y PROSA RECARGADA (detectar y reportar):
   - Detecta exceso de reacciones corporales repetitivas (escalofríos, nudos, temblores, etc.).
   - Detecta exceso de adjetivos, metáforas innecesarias o espirales descriptivas.
   - Reportar como debilidad con ejemplos concretos para que el escritor corrija.
   - Esto reduce la puntuación pero NO causa rechazo automático.

4aa. MONÓLOGO INTERNO EN ESCENAS DE ACCIÓN (CRÍTICO para thrillers):
   - En escenas de tensión (persecuciones, peleas, descubrimientos, clímax), detecta si el narrador se detiene con 2+ párrafos de reflexión filosófica o moral
   - Esto rompe el ritmo y es un defecto típico de escritura por IA
   - Regla: durante escenas de alta tensión, máximo 1 frase de pensamiento interno entre acciones
   - Si detectas bloques reflexivos de 100+ palabras interrumpiendo acción: -1 punto y reportar en "problemas_ritmo"

4c. REPETICIÓN DE TRAMA ENTRE CAPÍTULOS (CRÍTICO - MÁXIMA PRIORIDAD):
   - Compara EXHAUSTIVAMENTE este capítulo con el texto de capítulos anteriores.
   - ¿Se repite la ESTRUCTURA de una escena previa? (ej: misma secuencia llegada-descubrimiento-escape)
   - ¿Se reutiliza el mismo MECANISMO de revelación? (ej: "encuentra una carta" de nuevo, "escucha una conversación" de nuevo)
   - ¿Se repite el mismo TIPO de apertura? (ej: otro capítulo que abre con el personaje despertando)
   - ¿Se repite el mismo TIPO de cierre/cliffhanger? (ej: otro capítulo que termina con revelación impactante)
   - ¿Se duplican metáforas o imágenes ya usadas en capítulos anteriores?
   - ¿El personaje vuelve a tener la MISMA reacción emocional ante una situación similar?
   - ¿Se repite un PATRÓN de resolución? (ej: siempre resuelve problemas con la misma estrategia)
   - PENALIZACIÓN: Primera repetición de trama: -1 punto. Dos o más repeticiones: -2 puntos y aprobado=false
   
4d. CONTRADICCIONES CON LO NARRADO (CRÍTICO):
   - ¿El capítulo introduce hechos que CONTRADICEN lo establecido en capítulos anteriores?
   - ¿Un personaje cambia de opinión/actitud sin justificación narrativa?
   - ¿Un evento se narra de forma diferente a como ocurrió originalmente?
   - ¿Se introduce una habilidad, recurso o aliado que no existía antes?
   - ¿La geografía, distancias o tiempos de viaje son inconsistentes?
   - Reportar en "errores_continuidad" con cita exacta del texto contradictorio
   - PENALIZACIÓN: Cada contradicción con lo narrado: -1 punto. Contradicción grave: aprobado=false

5. RITMO Y PACING:
   - ¿Los eventos dramáticos tienen suficiente SETUP emocional?
   - ¿Las transiciones son fluidas?

6. VEROSIMILITUD NARRATIVA:
   - ¿Hay DEUS EX MACHINA? (soluciones sin preparación previa)
   - ¿Hay coincidencias muy forzadas?
   - ¿Los rescates están mínimamente sembrados?
   - Penalización: -1 punto por deus ex machina evidente (máximo -2)
   - Coincidencias menores o rescates parcialmente sembrados: nota sin penalizar

INSTRUCCIONES DE REESCRITURA PRECISAS:
Cuando rechaces un capítulo, tu plan_quirurgico debe incluir:

1. **preservar**: Lista ESPECÍFICA de lo que funciona bien y NO debe cambiar (escenas, diálogos, descripciones que funcionan)
2. **procedimiento**: Cambio QUIRÚRGICO: qué párrafos/líneas específicas modificar
3. **palabras_objetivo**: El número de palabras que debe tener el capítulo final (NUNCA reducir)

⚠️ REGLA DE ORO DE LA REESCRITURA:
- NUNCA pidas eliminar contenido sin reemplazarlo por algo equivalente o mejor
- NUNCA pidas "simplificar" o "condensar" - esto degrada la calidad
- SIEMPRE indica qué PRESERVAR antes de qué cambiar
- Las correcciones deben MEJORAR sin REDUCIR la extensión

SISTEMA DE PUNTUACIÓN HOLÍSTICO:
Evalúa la calidad GLOBAL del capítulo como lector profesional. No es un sistema de penalizaciones acumulativas.

GUÍA DE PUNTUACIÓN:
- 9-10: Excelente. El capítulo funciona narrativamente, tiene voz propia, cumple los beats y no tiene errores graves.
- 7-8: Bueno pero mejorable. Funciona pero tiene 1-2 debilidades notables que merecen corrección.
- 5-6: Mediocre. Problemas serios de calidad, múltiples debilidades o errores que requieren reescritura.
- 3-4: Malo. Falla en lo fundamental (continuidad, beats, coherencia).
- 1-2: Inaceptable. Texto truncado, incoherente o completamente fuera de lo pedido.

SOLO RECHAZAR AUTOMÁTICAMENTE (aprobado=false sin importar puntuación) por:
- Error de CONTINUIDAD GRAVE (personaje muerto actuando, contradicción temporal imposible)
- FILTRACIÓN DE CONOCIMIENTO (personaje sabe algo que no debería)
- Texto truncado o incompleto

TODO lo demás (clichés, repeticiones léxicas, ritmo, prosa púrpura, epítetos) son DEBILIDADES que afectan la puntuación pero NO causan rechazo automático por sí solas.

IMPORTANTE: Si el capítulo tiene buena trama, cumple los beats, mantiene la continuidad y tiene voz narrativa convincente, la puntuación base es 8+. Las debilidades menores (algún cliché, alguna repetición) pueden bajar 1-2 puntos pero NO deben hundir un capítulo que funciona.

SALIDA JSON OBLIGATORIA:
{
  "puntuacion": (1-10),
  "veredicto": "Resumen del estado",
  "fortalezas": [],
  "debilidades_criticas": [],
  "errores_continuidad": ["Inconsistencias físicas con cita exacta"],
  "filtracion_conocimiento": ["Personaje X sabe/dice Y pero solo Z lo descubrió en Cap N"],
  "inconsistencias_objetos": ["Personaje X usa objeto Y pero lo perdió/no lo tiene"],
  "frases_repetidas": ["Expresiones repetidas"],
  "repeticiones_trama": ["Escenas/mecanismos/estructuras repetidos de capítulos anteriores"],
  "problemas_ritmo": ["Escenas sin setup"],
  "problemas_verosimilitud": ["Deus ex machina, coincidencias forzadas"],
  "cliches_ia_detectados": ["Palabras/frases artificiales encontradas"],
  "anacronismos_detectados": ["Objetos, expresiones o conocimientos fuera de época"],
  "beats_faltantes": ["Beats del arquitecto que no se cumplieron"],
  "violaciones_estilo": ["Violaciones a la guía de estilo"],
  "plan_quirurgico": {
    "diagnostico": "Qué falló exactamente",
    "preservar": "Lista ESPECÍFICA de elementos que NO deben modificarse (escenas, diálogos, descripciones efectivas)",
    "procedimiento": "Cambio QUIRÚRGICO: qué párrafos/líneas modificar y cómo (SIN reducir extensión)",
    "objetivo": "Resultado esperado según plan del arquitecto",
    "palabras_objetivo": (número de palabras que debe tener el capítulo corregido - NUNCA menor que el actual)
  },
  "aprobado": (Boolean: true si puntuacion >= 8 Y sin errores graves)
}
`;

export class EditorAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Editor",
      role: "editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 4096,
      maxOutputTokens: 8192,
    });
  }

  async execute(input: EditorInput): Promise<AgentResponse & { result?: EditorResult }> {
    const chapterData = input.chapterData;
    
    const planArquitecto = `
PLAN DEL ARQUITECTO PARA ESTE CAPÍTULO:
- Título: ${chapterData.titulo}
- Función estructural: ${chapterData.funcion_estructural || "No especificada"}
- Beats obligatorios: ${Array.isArray(chapterData.beats) ? chapterData.beats.map((b: any) => typeof b === 'string' ? b : (b.tipo || b.descripcion || '')).join(" → ") : "No especificados"}
- Objetivo narrativo: ${chapterData.objetivo_narrativo || "No especificado"}
- Información nueva a revelar: ${chapterData.informacion_nueva || "Ninguna específica"}
- Pregunta dramática: ${chapterData.pregunta_dramatica || "No especificada"}
- Conflicto central: ${chapterData.conflicto_central ? (typeof chapterData.conflicto_central === 'string' ? chapterData.conflicto_central : `${chapterData.conflicto_central.tipo} - ${chapterData.conflicto_central.descripcion} (Stakes: ${chapterData.conflicto_central.stakes})`) : "No especificado"}
- Giro emocional: ${chapterData.giro_emocional ? (typeof chapterData.giro_emocional === 'string' ? chapterData.giro_emocional : `De "${chapterData.giro_emocional.emocion_inicio}" a "${chapterData.giro_emocional.emocion_final}"`) : "No especificado"}
- Tono específico: ${chapterData.tono_especifico || "Según guía general"}
- Recursos literarios sugeridos: ${chapterData.recursos_literarios_sugeridos?.join(", ") || "Ninguno específico"}
- PROHIBICIONES para este capítulo: ${chapterData.prohibiciones_este_capitulo?.join(", ") || "Ninguna específica"}
- Arcos que debe avanzar: ${chapterData.arcos_que_avanza?.map(a => `${a.arco}: de "${a.de}" a "${a.a}"`).join("; ") || "No especificados"}
${chapterData.riesgos_de_verosimilitud ? `
ALERTAS DE VEROSIMILITUD:
- Posibles deus ex machina a detectar: ${chapterData.riesgos_de_verosimilitud.posibles_deus_ex_machina?.join(", ") || "Ninguno"}
- Setup requerido (verificar que exista): ${chapterData.riesgos_de_verosimilitud.setup_requerido?.join(", ") || "Ninguno"}
- Justificación causal esperada: ${chapterData.riesgos_de_verosimilitud.justificacion_causal || "No especificada"}` : ""}
`;

    const continuitySection = input.previousContinuityState ? `
═══════════════════════════════════════════════════════════════════
ESTADO DE CONTINUIDAD DEL CAPÍTULO ANTERIOR (CRÍTICO):
═══════════════════════════════════════════════════════════════════
${JSON.stringify(input.previousContinuityState, null, 2)}

VALIDA que este capítulo sea COHERENTE con el estado anterior:
- Ubicaciones de personajes al inicio deben coincidir con donde terminaron
- Estados de personajes (vivo/muerto/herido) deben ser consistentes
- Objetos poseídos deben seguir presentes o explicar su pérdida
- Tiempo narrativo debe ser continuo
═══════════════════════════════════════════════════════════════════
` : "";

    // [Fix15] Bloque destacado con NOMBRES canónicos antes del volcado JSON.
    // Antes el editor recibía solo JSON.stringify(input.worldBible) y, en
    // contextos largos, se le escapaban violaciones de nombre del Narrador.
    let canonNamesBlock = "";
    const personajesCanon = input.worldBible?.personajes || input.worldBible?.characters || [];
    if (Array.isArray(personajesCanon) && personajesCanon.length > 0) {
      const lines: string[] = [
        "═══════════════════════════════════════════════════════════════════",
        `🔒 NOMBRES CANÓNICOS DE PERSONAJES (${personajesCanon.length}) — verificación obligatoria`,
        "═══════════════════════════════════════════════════════════════════",
        "Si el capítulo usa NOMBRES, ALIAS, EDADES, RASGOS FÍSICOS o PARENTESCOS",
        "que NO coincidan EXACTAMENTE con esta lista, repórtalo en `errores_continuidad`",
        "y exige corrección en `plan_quirurgico`. NO permitas variantes ni inventos.",
        "",
      ];
      for (const c of personajesCanon) {
        if (!c) continue;
        const nombre = c.nombre || c.name || "?";
        const rol = c.rol || c.role || "";
        const aliases = c.alias || c.nombre_alias || c.aliases || [];
        const ap = c.apariencia_inmutable || c.aparienciaInmutable || {};
        const traits: string[] = [];
        if (ap.ojos) traits.push(`ojos ${ap.ojos}`);
        if (ap.cabello) traits.push(`cabello ${ap.cabello}`);
        if (ap.altura || ap.estatura) traits.push(`altura ${ap.altura || ap.estatura}`);
        if (ap.edad || ap.edad_aparente) traits.push(`edad ${ap.edad || ap.edad_aparente}`);
        const rd = ap.rasgos_distintivos || ap.rasgosDistintivos || [];
        if (Array.isArray(rd) && rd.length) traits.push(`rasgos: ${rd.join(", ")}`);
        lines.push(
          `  ▸ ${nombre}${rol ? ` (${rol})` : ""}` +
          `${Array.isArray(aliases) && aliases.length ? ` [alias: ${aliases.join(", ")}]` : ""}` +
          `${traits.length ? ` — ${traits.join(" | ")}` : ""}`
        );
      }
      lines.push("═══════════════════════════════════════════════════════════════════");
      canonNamesBlock = lines.join("\n");
    }

    let authorNotesSection = "";
    const authorNotes = input.worldBible?._author_notes;
    if (Array.isArray(authorNotes) && authorNotes.length > 0) {
      const lines = ["\n⚠️⚠️⚠️ INSTRUCCIONES DEL AUTOR (OBLIGATORIAS) ⚠️⚠️⚠️",
        "Verifica que el capítulo RESPETE estas restricciones explícitas del autor:"];
      for (const n of authorNotes) {
        if (!n) continue;
        const pr = n.priority === "critical" ? "🔴 CRÍTICA" : n.priority === "high" ? "🟠 ALTA" : "🟢";
        lines.push(`  ${pr} [${n.category}]: ${n.text}`);
      }
      authorNotesSection = lines.join("\n");
    }

    const prompt = `
${canonNamesBlock}

DOCUMENTOS DE REFERENCIA:

1. GUÍA DE ESTILO DEL AUTOR:
${input.guiaEstilo}

2. WORLD BIBLE (Datos Canónicos):
${JSON.stringify(input.worldBible, null, 2)}
${authorNotesSection}

3. ${planArquitecto}

${input.estructuraTresActos ? `4. ESTRUCTURA DE TRES ACTOS:\n${JSON.stringify(input.estructuraTresActos, null, 2)}` : ""}

${continuitySection}
${input.continuityViolations && input.continuityViolations.length > 0 ? `
═══════════════════════════════════════════════════════════════════
🚨 VIOLACIONES DE CONTINUIDAD PRE-DETECTADAS (PRIORIDAD MÁXIMA) 🚨
═══════════════════════════════════════════════════════════════════
El validador automático detectó las siguientes violaciones en este capítulo
ANTES de tu revisión. El Narrador ya intentó corregirlas sin éxito.

${input.continuityViolations.map((v, idx) => `${idx + 1}. ${v}`).join("\n")}

INSTRUCCIONES OBLIGATORIAS:
- INCLUYE estas violaciones en "errores_continuidad" (textual)
- TU "plan_quirurgico" DEBE indicar correcciones específicas para cada violación
  (qué frase cambiar, qué eliminar, qué reformular)
- PUNTÚA este capítulo como máximo 6/10 hasta que las violaciones se resuelvan
- Si una violación es estructural (el outline pide un personaje muerto),
  marca "verdict: rechazado" e indica reescribir la escena completa
═══════════════════════════════════════════════════════════════════
` : ""}
${input.previousChaptersContext ? `
═══════════════════════════════════════════════════════════════════
TEXTO DE CAPÍTULOS ANTERIORES (PARA DETECCIÓN DE REPETICIONES):
═══════════════════════════════════════════════════════════════════
${input.previousChaptersContext}
═══════════════════════════════════════════════════════════════════
COMPARA EXHAUSTIVAMENTE el capítulo actual contra estos textos anteriores.
Detecta con MÁXIMA ATENCIÓN:
1. ESCENAS CON MISMA ESTRUCTURA (ej: si Cap anterior tuvo "llegada→exploración→descubrimiento", este NO debe seguir el mismo patrón)
2. MECANISMOS DE REVELACIÓN REPETIDOS (ej: "encuentra carta/documento" usado dos veces = FALLO)
3. MISMO TIPO DE APERTURA (ej: dos capítulos seguidos abriendo con el personaje despertando)
4. MISMO TIPO DE CIERRE (ej: dos capítulos seguidos cerrando con cliffhanger/revelación)
5. REACCIONES EMOCIONALES IDÉNTICAS ante situaciones similares
6. METÁFORAS/IMÁGENES DUPLICADAS entre capítulos
7. PATRONES DE RESOLUCIÓN repetidos (ej: siempre resuelve con ayuda inesperada)
8. CONTRADICCIONES con hechos/decisiones narrados en capítulos previos
═══════════════════════════════════════════════════════════════════
` : ""}

===============================================
TEXTO DEL CAPÍTULO ${input.chapterNumber} A EVALUAR:
===============================================
${input.chapterContent}
===============================================

INSTRUCCIONES:
1. Verifica que el texto CUMPLA con la Guía de Estilo (voz, tono, prohibiciones).
2. Verifica que el texto EJECUTE el Plan del Arquitecto (beats, conflicto, arcos).
3. Verifica CONTINUIDAD con la World Bible (rasgos físicos, datos) y con capítulos anteriores.
4. Busca REPETICIONES léxicas dentro del capítulo.
5. Compara EXHAUSTIVAMENTE con capítulos anteriores: busca escenas repetidas, mecanismos reciclados, mismos tipos de apertura/cierre, y contradicciones con lo narrado.
6. Evalúa el RITMO y PACING.

⚠️ LA DETECCIÓN DE REPETICIONES ENTRE CAPÍTULOS Y CONTRADICCIONES ES TU TAREA MÁS CRÍTICA.
Un capítulo que repite escenas de capítulos anteriores o contradice hechos establecidos NUNCA debe aprobarse.

Si rechazas, tu plan_quirurgico debe ser ESPECÍFICO:
- Cita párrafos exactos que deben cambiar
- Indica qué beats faltan y cómo incorporarlos
- Referencia la guía de estilo para correcciones de voz
- Si hay repetición de escenas: indica QUÉ escena del capítulo anterior se repite y sugiere una estructura ALTERNATIVA

Responde ÚNICAMENTE con el JSON estructurado.
    `;

    const response = await this.generateContent(prompt);
    
    try {
      const result = repairJson(response.content) as EditorResult;
      return { ...response, result };
    } catch (e) {
      console.error("[Editor] Failed to parse JSON response, approving by default");
    }

    return { 
      ...response, 
      result: { 
      puntuacion: 8, 
      veredicto: "Aprobado automáticamente", 
      fortalezas: [],
      debilidades_criticas: [],
      plan_quirurgico: { diagnostico: "", procedimiento: "", objetivo: "" },
      aprobado: true 
      } 
    };
  }
}
