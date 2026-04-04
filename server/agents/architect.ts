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
FASE 1: WORLD BIBLE + ESTRUCTURA GLOBAL
═══════════════════════════════════════════════════════════════════
En esta fase, genera SOLO la base de la novela: personajes, mundo, arcos y estructura de actos.
NO generes la escaleta de capítulos (eso vendrá en la Fase 2).

Genera un JSON con estas claves:

"world_bible": { 
  "personajes": [{ 
    "nombre": "",
    "rol": "protagonista/antagonista/aliado/mentor/etc",
    "perfil_psicologico": "Descripción profunda de motivaciones, miedos, deseos",
    "arco_transformacion": {
      "estado_inicial": "",
      "catalizador_cambio": "",
      "punto_crisis": "",
      "estado_final": ""
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
    "epoca": "",
    "terminos_anacronicos_prohibidos": [],
    "vocabulario_epoca_autorizado": [],
    "registro_linguistico": "",
    "notas_voz_historica": ""
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
5. Al menos 1 momento de reflexión interna del protagonista por capítulo.

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
      "nivel_tension": 7
    }
  ]
}

IMPORTANTE: Cada beat es un STRING conciso (1-3 oraciones), NO un objeto complejo. Esto reduce el JSON total.
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
