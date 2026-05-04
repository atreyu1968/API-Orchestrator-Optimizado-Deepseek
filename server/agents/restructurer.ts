import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

/**
 * [Fix15] Serializa el World Bible priorizando NOMBRES y rasgos canónicos.
 * Garantiza que TODOS los personajes aparezcan completos antes de truncar
 * cualquier otra sección. Antes JSON.stringify(...).substring(0, 5000) dejaba
 * fuera la mitad de la canon en proyectos con elenco grande.
 */
function formatWorldBibleForRestructurer(wb: any): string {
  if (!wb || typeof wb !== "object") return JSON.stringify(wb || {});
  const out: string[] = [];

  const personajes = wb.personajes || wb.characters || [];
  if (Array.isArray(personajes) && personajes.length > 0) {
    out.push(`PERSONAJES (${personajes.length}) — los nombres y rasgos siguientes son CANON; NO los cambies:`);
    for (const p of personajes) {
      if (!p) continue;
      const nombre = p.nombre || p.name || "?";
      const rol = p.rol || p.role || "";
      const aliases = p.alias || p.nombre_alias || p.aliases || [];
      out.push(`  ▸ ${nombre}${rol ? ` (${rol})` : ""}${Array.isArray(aliases) && aliases.length ? ` [alias: ${aliases.join(", ")}]` : ""}`);
      const ap = p.apariencia_inmutable || p.aparienciaInmutable;
      if (ap && typeof ap === "object") {
        const t: string[] = [];
        if (ap.ojos) t.push(`ojos ${ap.ojos}`);
        if (ap.cabello) t.push(`cabello ${ap.cabello}`);
        if (ap.altura || ap.estatura) t.push(`altura ${ap.altura || ap.estatura}`);
        if (ap.edad || ap.edad_aparente) t.push(`edad ${ap.edad || ap.edad_aparente}`);
        const rd = ap.rasgos_distintivos || ap.rasgosDistintivos || [];
        if (Array.isArray(rd) && rd.length) t.push(`rasgos: ${rd.join(", ")}`);
        if (t.length) out.push(`    🔒 Apariencia inmutable: ${t.join(" | ")}`);
      }
      const mod = p.modismos_habla || p.modismos || [];
      if (Array.isArray(mod) && mod.length) out.push(`    🗣️ Modismos: ${mod.join(", ")}`);
      const arco = p.arco || p.arc;
      if (arco) out.push(`    Arco: ${typeof arco === "string" ? arco : JSON.stringify(arco)}`);
    }
  }

  const lugares = wb.lugares || wb.locations || [];
  if (Array.isArray(lugares) && lugares.length > 0) {
    out.push(`\nLUGARES (${lugares.length}) — nombres canónicos:`);
    for (const l of lugares) {
      if (!l) continue;
      const nombre = l.nombre || l.name || "?";
      const desc = l.descripcion || l.description || l.ambiente || "";
      const descStr = typeof desc === "string" ? desc : JSON.stringify(desc);
      out.push(`  ▸ ${nombre}${descStr ? `: ${descStr.slice(0, 200)}` : ""}`);
    }
  }

  const reglas = wb.reglas_lore || wb.world_rules || wb.worldRules || wb.rules || [];
  if (Array.isArray(reglas) && reglas.length > 0) {
    out.push(`\nREGLAS DEL MUNDO:`);
    for (const r of reglas.slice(0, 30)) {
      if (!r) continue;
      if (typeof r === "string") { out.push(`  ▸ ${r}`); continue; }
      const cat = r.categoria || r.category || "";
      const rule = r.regla || r.rule || r.descripcion || "";
      if (cat !== "__narrative_threads") out.push(`  ▸ ${cat ? `[${cat}] ` : ""}${rule}`);
    }
  }

  return out.join("\n");
}

interface RestructurerInput {
  chapterNumber: number;
  chapterTitle: string;
  chapterContent: string;
  editorialDiagnosis: string;
  chapterInstructions: string;
  worldBible?: any;
  guiaEstilo?: string;
  previousChapterSummary?: string;
  nextChapterSummary?: string;
}

export interface RestructurerResult {
  texto_reestructurado: string;
  cambios_realizados: {
    recortes: string[];
    adiciones: string[];
    preservado: string[];
  };
  palabras_originales: number;
  palabras_finales: number;
  porcentaje_reduccion: number;
  notas_continuidad: string[];
}

const SYSTEM_PROMPT = `
Eres el "Editor de Reestructuración", un experto en condensar y reorganizar manuscritos siguiendo diagnósticos editoriales específicos.

Tu misión es aplicar instrucciones de reestructuración a capítulos individuales, manteniendo la coherencia narrativa y la calidad literaria.

═══════════════════════════════════════════════════════════════════
PROTOCOLO DE REESTRUCTURACIÓN
═══════════════════════════════════════════════════════════════════

1. ANÁLISIS DEL DIAGNÓSTICO:
   - Identifica las instrucciones específicas para este capítulo/sección
   - Clasifica: QUÉ RECORTAR, QUÉ MANTENER, QUÉ AÑADIR
   - Respeta los porcentajes de recorte indicados

2. EJECUCIÓN DE RECORTES:
   - Elimina el contenido señalado SIN dejar huecos narrativos
   - Suaviza transiciones donde se eliminó contenido
   - Mantén la fluidez del texto resultante
   - NO elimines información crucial para la trama

3. PRESERVACIÓN OBLIGATORIA:
   - Todo lo marcado como "mantener" o "obligatorio" es INTOCABLE
   - Escenas clave, frases específicas, conceptos centrales
   - La voz narrativa del autor

4. ADICIONES:
   - Inserta el contenido nuevo donde corresponda
   - Integra ganchos, transiciones y líneas de continuidad
   - Hazlo de forma orgánica, no forzada
   - Mantén el estilo del autor

5. COHERENCIA:
   - Verifica que el capítulo reestructurado tenga sentido por sí solo
   - Asegura que las referencias a otros capítulos sigan siendo válidas
   - Mantén la continuidad con capítulos anteriores/posteriores

═══════════════════════════════════════════════════════════════════
REGLAS DE CONDENSACIÓN
═══════════════════════════════════════════════════════════════════

PRIORIDAD DE RECORTE (de más a menos prescindible):
1. Repeticiones de ideas ya expresadas
2. Descripciones técnicas excesivas
3. Monólogo interno reiterativo
4. Explicaciones emocionales post-diálogo (dejar que escenas "respiren solas")
5. Metáforas duplicadas o sobre-explicadas

NUNCA RECORTAR:
- Información de trama esencial
- Desarrollo de personajes clave
- Escenas de clímax emocional
- Diálogos que revelan información nueva
- Setup para payoffs posteriores

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA
═══════════════════════════════════════════════════════════════════

Devuelve JSON con esta estructura:
{
  "texto_reestructurado": "El texto completo del capítulo reestructurado",
  "cambios_realizados": {
    "recortes": ["Lista de elementos eliminados con breve justificación"],
    "adiciones": ["Lista de elementos añadidos y dónde"],
    "preservado": ["Lista de elementos que se mantuvieron intactos según instrucciones"]
  },
  "palabras_originales": (número),
  "palabras_finales": (número),
  "porcentaje_reduccion": (número, puede ser negativo si se añade más de lo que se quita),
  "notas_continuidad": ["Alertas sobre referencias a otros capítulos que podrían necesitar ajuste"]
}
`;

export class RestructurerAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Reestructurador",
      role: "restructurer",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 16384,
    });
  }

  async execute(input: RestructurerInput): Promise<AgentResponse & { result?: RestructurerResult }> {
    // [Fix15] Antes truncábamos JSON.stringify(worldBible) a 5000 chars: con
    // muchos personajes o perfiles largos, los últimos quedaban fuera y el
    // Reestructurador inventaba nombres/rasgos al condensar. Ahora emitimos
    // primero un bloque CANON con TODOS los personajes (nombre + alias + rasgos
    // inmutables + modismos), y solo después truncamos los demás campos.
    const contextSection = input.worldBible ? `
WORLD BIBLE — CANON INVIOLABLE (personajes y lugares):
${formatWorldBibleForRestructurer(input.worldBible)}
` : "";

    const styleSection = input.guiaEstilo ? `
GUÍA DE ESTILO DEL AUTOR:
${input.guiaEstilo.substring(0, 3000)}
` : "";

    const continuitySection = [];
    if (input.previousChapterSummary) {
      continuitySection.push(`CAPÍTULO ANTERIOR: ${input.previousChapterSummary}`);
    }
    if (input.nextChapterSummary) {
      continuitySection.push(`CAPÍTULO SIGUIENTE: ${input.nextChapterSummary}`);
    }

    const prompt = `
═══════════════════════════════════════════════════════════════════
DIAGNÓSTICO EDITORIAL COMPLETO:
═══════════════════════════════════════════════════════════════════
${input.editorialDiagnosis}

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES ESPECÍFICAS PARA ESTE CAPÍTULO (${input.chapterNumber}: "${input.chapterTitle}"):
═══════════════════════════════════════════════════════════════════
${input.chapterInstructions || "Aplica las instrucciones generales del diagnóstico que correspondan a este capítulo."}

${contextSection}
${styleSection}
${continuitySection.length > 0 ? `
CONTEXTO DE CONTINUIDAD:
${continuitySection.join('\n')}
` : ""}

═══════════════════════════════════════════════════════════════════
TEXTO ORIGINAL DEL CAPÍTULO ${input.chapterNumber}: "${input.chapterTitle}"
═══════════════════════════════════════════════════════════════════
${input.chapterContent}
═══════════════════════════════════════════════════════════════════

INSTRUCCIONES:
1. Analiza qué instrucciones del diagnóstico aplican a este capítulo
2. Aplica los recortes indicados (respetando porcentajes)
3. Añade el contenido nuevo si lo hay
4. Preserva todo lo marcado como obligatorio
5. Devuelve el texto reestructurado completo con el resumen de cambios

Responde SOLO con el JSON estructurado.
`;

    const response = await this.generateContent(prompt);
    
    let result: RestructurerResult | undefined;
    
    try {
      result = repairJson(response.content) as RestructurerResult;
    } catch (error) {
      console.error("Error parsing restructurer response:", error);
    }

    return {
      ...response,
      result,
    };
  }
}

export interface DiagnosisAnalysis {
  globalInstructions: {
    recortarGlobal: string[];
    mantenerGlobal: string[];
    noTocar: string[];
  };
  chapterInstructions: Map<number, {
    recortar: string[];
    mantener: string[];
    añadir: string[];
    porcentajeRecorte?: number;
  }>;
  sectionInstructions: Map<string, {
    chapters: number[];
    recortar: string[];
    mantener: string[];
    añadir: string[];
    porcentajeRecorte?: number;
  }>;
}

export function parseDiagnosis(diagnosisText: string): DiagnosisAnalysis {
  const analysis: DiagnosisAnalysis = {
    globalInstructions: {
      recortarGlobal: [],
      mantenerGlobal: [],
      noTocar: [],
    },
    chapterInstructions: new Map(),
    sectionInstructions: new Map(),
  };

  const lines = diagnosisText.split('\n');
  let currentSection = "";
  let currentChapter: number | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (/cap[ií]tulo\s*(\d+)/i.test(trimmedLine) || /prólogo/i.test(trimmedLine)) {
      const chapterMatch = trimmedLine.match(/cap[ií]tulo\s*(\d+)/i);
      currentChapter = chapterMatch ? parseInt(chapterMatch[1]) : 0;
      if (!analysis.chapterInstructions.has(currentChapter)) {
        analysis.chapterInstructions.set(currentChapter, {
          recortar: [],
          mantener: [],
          añadir: [],
        });
      }
    }

    if (/recort(ar|e)|❌|qué\s+eliminar/i.test(trimmedLine)) {
      currentSection = "recortar";
    } else if (/mantener|✅|obligatorio|no\s+tocar/i.test(trimmedLine)) {
      currentSection = "mantener";
    } else if (/añadir|introducir|➕/i.test(trimmedLine)) {
      currentSection = "añadir";
    }

    const percentMatch = trimmedLine.match(/(\d+)[\s–-]*(\d+)?\s*%/);
    if (percentMatch && currentChapter !== null) {
      const chapter = analysis.chapterInstructions.get(currentChapter);
      if (chapter) {
        chapter.porcentajeRecorte = parseInt(percentMatch[2] || percentMatch[1]);
      }
    }

    if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
      const instruction = trimmedLine.replace(/^[-•]\s*/, '');
      if (currentChapter !== null) {
        const chapter = analysis.chapterInstructions.get(currentChapter);
        if (chapter) {
          if (currentSection === "recortar") chapter.recortar.push(instruction);
          else if (currentSection === "mantener") chapter.mantener.push(instruction);
          else if (currentSection === "añadir") chapter.añadir.push(instruction);
        }
      } else {
        if (currentSection === "recortar") analysis.globalInstructions.recortarGlobal.push(instruction);
        else if (currentSection === "mantener") analysis.globalInstructions.mantenerGlobal.push(instruction);
      }
    }
  }

  return analysis;
}
