import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";
import { buildCanonNamesBlock } from "../utils/world-bible-format";

interface ContinuitySentinelInput {
  projectTitle: string;
  checkpointNumber: number;
  chaptersInScope: Array<{
    numero: number;
    titulo: string;
    contenido: string;
    continuityState: any;
  }>;
  worldBible: any;
  previousCheckpointIssues?: string[];
  // [Fix27] Texto íntegro de capítulos PREVIOS al tramo en análisis.
  // Aprovecha el 1M ctx de DeepSeek V4 para reducir falsos positivos
  // (ej: lo que parece "personaje desaparecido" puede haber sido despedido
  // explícitamente en un capítulo anterior al tramo).
  previousChaptersFullText?: string;
}

export interface ContinuityIssue {
  tipo: "timeline" | "ubicacion" | "estado_personaje" | "objeto_perdido" | "muerte_resucitada";
  capitulos_afectados: number[];
  descripcion: string;
  evidencia_textual: string;
  severidad: "critica" | "mayor" | "menor";
  elementos_a_preservar: string;
  fix_sugerido: string;
}

export interface ContinuitySentinelResult {
  checkpoint_aprobado: boolean;
  puntuacion: number;
  resumen: string;
  issues: ContinuityIssue[];
  capitulos_para_revision: number[];
  continuity_fix_plan: string;
}

const SYSTEM_PROMPT = `
Eres el "Centinela de Continuidad", un agente especializado en detectar ERRORES DE CONTINUIDAD que ABARCAN MÚLTIPLES CAPÍTULOS.

CONTEXTO IMPORTANTE:
El Editor ya ha verificado la continuidad de cada capítulo individualmente (timeline, ubicación,
estado de personajes, objetos, filtración de conocimiento) contra el capítulo anterior.
Tu rol es detectar patrones que el Editor NO PUEDE ver porque requieren una visión PANORÁMICA
de varios capítulos a la vez.

═══════════════════════════════════════════════════════════════════
QUÉ DEBES VERIFICAR (SOLO ERRORES MULTI-CAPÍTULO)
═══════════════════════════════════════════════════════════════════

1. DERIVAS TEMPORALES ACUMULADAS:
   - ¿La cronología GLOBAL del tramo es coherente? (ej: pasaron 3 días en cap 1-3 pero en cap 5 dicen "la semana pasada")
   - Contradicciones de fechas que solo se ven al comparar capítulos NO consecutivos

2. PERSONAJES QUE DESAPARECEN Y REAPARECEN:
   - ¿Un personaje desaparece durante 3+ capítulos sin explicación y reaparece como si nada?
   - ¿Un personaje herido en cap N aparece perfectamente sano en cap N+3 sin curación?

3. HILOS NARRATIVOS ABANDONADOS:
   - ¿Se planteó una amenaza/misterio en cap N que se olvida completamente en capítulos posteriores?
   - ¿Un objeto clave mencionado en un capítulo desaparece del radar durante todo el tramo?

4. CONTRADICCIONES A DISTANCIA:
   - Información que se presenta de forma diferente en capítulos separados
   - Datos del mundo (geografía, reglas, relaciones entre personajes) que cambian sin justificación

═══════════════════════════════════════════════════════════════════
QUÉ NO DEBES VERIFICAR (ya lo hizo el Editor)
═══════════════════════════════════════════════════════════════════
- Continuidad entre capítulos CONSECUTIVOS (ya verificada)
- Cumplimiento de beats del arquitecto
- Calidad literaria, estilo, o ritmo
- Errores entre un capítulo y su inmediato anterior

═══════════════════════════════════════════════════════════════════
CÓMO ANALIZAR
═══════════════════════════════════════════════════════════════════

1. Lee el ESTADO DE CONTINUIDAD de cada capítulo (characterStates, locationState, etc.)
2. Compara estados entre capítulos NO consecutivos (cap 1 vs cap 4, cap 2 vs cap 5)
3. Busca PATRONES que se degradan a lo largo del tramo
4. Solo reporta errores con EVIDENCIA TEXTUAL (citas exactas de AL MENOS 2 capítulos distantes)

SEVERIDAD:
- CRÍTICA: Personaje muerto aparece vivo capítulos después, contradicción temporal imposible
- MAYOR: Hilo narrativo completamente abandonado, objeto clave perdido sin explicación
- MENOR: Pequeñas derivas de estado emocional o detalles menores

SISTEMA DE PUNTUACIÓN:
- 10/10: CERO issues de cualquier tipo. Continuidad panorámica PERFECTA.
- 9/10: Solo 1-2 issues MENORES.
- 8/10: 3+ issues menores o 1 MAYOR.
- 7/10: 2 issues MAYORES.
- 6/10 o menos: Cualquier issue CRÍTICO o 3+ mayores.

APROBACIÓN:
- APROBADO: Puntuación >= 8 (issues menores no bloquean).
- REQUIERE REVISIÓN: Solo si hay issues MAYORES o CRÍTICOS.

═══════════════════════════════════════════════════════════════════
SALIDA OBLIGATORIA (JSON)
═══════════════════════════════════════════════════════════════════

{
  "checkpoint_aprobado": boolean,
  "puntuacion": (1-10),
  "resumen": "Análisis breve del estado de continuidad",
  "issues": [
    {
      "tipo": "ubicacion",
      "capitulos_afectados": [5, 6],
      "descripcion": "Elena termina en el aeropuerto (cap 5) pero aparece en su oficina sin transición (cap 6)",
      "evidencia_textual": "Cap 5: 'Elena atravesó las puertas del aeropuerto...' / Cap 6: 'Desde su escritorio, Elena observaba...'",
      "severidad": "mayor",
      "elementos_a_preservar": "El resto del capítulo 6 está perfecto. Solo modificar las primeras 2-3 líneas para añadir la transición.",
      "fix_sugerido": "SOLO añadir 1-2 oraciones al inicio del cap 6 mencionando el viaje de regreso. Ej: 'Tras el vuelo de regreso, Elena se dejó caer en su silla de oficina.' El resto del capítulo permanece INTACTO."
    }
  ],
  "capitulos_para_revision": [6],
  "continuity_fix_plan": "Instrucciones detalladas para corregir cada issue"
}
`;

export class ContinuitySentinelAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Centinela",
      role: "continuity-sentinel",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 4096,
    });
  }

  async execute(input: ContinuitySentinelInput): Promise<AgentResponse & { result?: ContinuitySentinelResult }> {
    // Helper to get proper chapter label based on number
    const getChapterLabel = (num: number): string => {
      if (num === 0) return "Prólogo";
      if (num === -1) return "Epílogo";
      if (num === -2) return "Nota del Autor";
      return `Capítulo ${num}`;
    };
    
    // Sort chapters in narrative order (prologue first, epilogue/author note last)
    const getChapterSortOrder = (n: number): number => {
      if (n === 0) return -1000;
      if (n === -1) return 1000;
      if (n === -2) return 1001;
      return n;
    };
    
    const sortedChapters = [...input.chaptersInScope].sort((a, b) => 
      getChapterSortOrder(a.numero) - getChapterSortOrder(b.numero)
    );
    
    const chaptersText = sortedChapters.map(c => `
===== ${getChapterLabel(c.numero)}: ${c.titulo} =====
ESTADO DE CONTINUIDAD REGISTRADO:
${JSON.stringify(c.continuityState, null, 2)}

TEXTO DEL CAPÍTULO:
${c.contenido}
`).join("\n\n---\n\n");

    const previousIssuesSection = input.previousCheckpointIssues?.length 
      ? `\nISSUES DE CHECKPOINTS ANTERIORES (verificar si persisten):\n${input.previousCheckpointIssues.map(i => `- ${i}`).join("\n")}`
      : "";

    // [Fix27] Bloque opcional con el texto íntegro de capítulos previos al
    // tramo. Se inserta ANTES del scope y con instrucción explícita de NO
    // reportar issues sobre estos capítulos (son contexto, no objeto de auditoría).
    const previousFullSection = input.previousChaptersFullText && input.previousChaptersFullText.trim()
      ? `\n═══════════════════════════════════════════════════════════════════\nCAPÍTULOS PREVIOS AL TRAMO (TEXTO ÍNTEGRO — solo CONTEXTO, NO auditar):\n═══════════════════════════════════════════════════════════════════\n${input.previousChaptersFullText}\n`
      : "";

    const prompt = `
${buildCanonNamesBlock(input.worldBible)}
PROYECTO: ${input.projectTitle}
CHECKPOINT #${input.checkpointNumber} - Análisis de continuidad

WORLD BIBLE (Datos Canónicos):
${JSON.stringify(input.worldBible, null, 2)}
${previousIssuesSection}
${previousFullSection}
═══════════════════════════════════════════════════════════════════
CAPÍTULOS A ANALIZAR (${input.chaptersInScope.length} capítulos):
═══════════════════════════════════════════════════════════════════
${chaptersText}

INSTRUCCIONES (VISIÓN PANORÁMICA — NO verificar capítulos consecutivos):
1. Compara estados de continuidad entre capítulos NO consecutivos (cap 1 vs cap 4, cap 2 vs cap 5)
2. Busca DERIVAS ACUMULADAS en la cronología global del tramo
3. Detecta personajes que desaparecen y reaparecen sin explicación a lo largo de VARIOS capítulos
4. Identifica hilos narrativos o objetos mencionados al inicio del tramo que se abandonan completamente
5. Solo reporta errores con EVIDENCIA TEXTUAL de AL MENOS 2 capítulos distantes
6. NO reportes problemas entre capítulos consecutivos (ya los verificó el Editor)

⚠️ REGLA OBLIGATORIA SOBRE NÚMEROS DE CAPÍTULO:
- Cada issue DEBE incluir en "capitulos_afectados" los números exactos de los capítulos involucrados (mínimo 2 capítulos distantes).
- "capitulos_para_revision" DEBE listar los capítulos que necesitan ser reescritos para corregir los issues.
- Si hay issues pero no hay capítulos que corregir, "capitulos_para_revision" puede estar vacío.
- NUNCA dejes "capitulos_afectados" como array vacío [] — si reportas un issue, SIEMPRE especifica qué capítulos están afectados usando sus números del scope.

Responde ÚNICAMENTE con el JSON estructurado.
`;

    const response = await this.generateContent(prompt);
    
    try {
      const result = repairJson(response.content) as ContinuitySentinelResult;
      return { ...response, result };
    } catch (e) {
      console.error("[ContinuitySentinel] Failed to parse JSON response — marking as NOT approved for safety");
    }

    const chapterNumbers = input.chaptersInScope.map(c => c.numero);
    return { 
      ...response, 
      result: { 
      checkpoint_aprobado: false,
      puntuacion: 0,
      resumen: "Checkpoint NO aprobado — error de parseo JSON. Requiere re-verificación.",
      issues: [{
        tipo: "timeline" as const,
        capitulos_afectados: chapterNumbers,
        descripcion: `Error de parseo en checkpoint #${input.checkpointNumber}. Capítulos ${chapterNumbers.join(", ")} no verificados.`,
        evidencia_textual: "",
        severidad: "mayor" as const,
        elementos_a_preservar: "",
        fix_sugerido: "Re-ejecutar verificación de continuidad",
      }],
      capitulos_para_revision: [],
      continuity_fix_plan: "Re-ejecutar verificación de continuidad"
      } 
    };
  }
}
