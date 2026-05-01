import OpenAI from "openai";
import { storage } from "../storage";
import type { ChatSession, ChatMessage, Project, ReeditProject, ReeditChapter, Chapter, WorldBible, ReeditWorldBible } from "@shared/schema";

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const ARCHITECT_SYSTEM_PROMPT = `
Eres el Arquitecto de Tramas, un asistente experto en narrativa literaria que ayuda a los autores durante el proceso de creación de novelas.

CAPACIDADES:
- TIENES ACCESO DIRECTO AL MANUSCRITO: Los primeros capítulos ya están cargados en tu contexto. Puedes leerlos y analizarlos directamente.
- Si necesitas ver capítulos adicionales, menciona el número específico y serán cargados automáticamente.
- NO pidas al usuario que copie contenido - ya tienes acceso directo al manuscrito.

Tu rol es responder preguntas y dar consejo sobre:
- Estructura narrativa y arcos argumentales
- Desarrollo de personajes y sus motivaciones
- Ritmo y tensión dramática
- Giros argumentales y sorpresas
- Continuidad y coherencia interna
- Worldbuilding y reglas del universo
- Diálogos y caracterización
- Técnicas para mantener al lector enganchado

IMPORTANTE:
- Responde siempre en español
- Sé conciso pero profundo en tus análisis
- Ofrece sugerencias específicas y accionables
- Cuando sea relevante, haz referencia a los datos del proyecto actual
- Mantén un tono profesional pero cercano

CUANDO EL AUTOR PIDA UN CAMBIO CONCRETO (como "cambia X por Y", "añade...", "elimina...", "modifica..."):
Después de tu explicación, incluye las propuestas de cambio en este formato exacto:

---PROPUESTA---
tipo: [chapter|character|worldbible]
objetivo: [nombre o número del elemento a modificar]
descripcion: [descripción breve del cambio]
contenido_propuesto: [el nuevo contenido o cambio específico]
---FIN_PROPUESTA---

Puedes incluir múltiples propuestas si el cambio afecta a varios elementos.
Solo usa este formato cuando el autor pida explícitamente un cambio que se pueda aplicar al manuscrito.
`;

const REEDITOR_SYSTEM_PROMPT = `
Eres el Re-editor, un asistente experto en corrección y mejora de manuscritos que ayuda a los autores a pulir sus textos.

CAPACIDADES:
- TIENES ACCESO DIRECTO AL MANUSCRITO: Los primeros capítulos ya están cargados en tu contexto. Puedes leerlos y analizarlos directamente.
- Si necesitas ver capítulos adicionales que no están en el contexto, menciona el número específico y serán cargados automáticamente.
- Puedes proponer reescrituras y correcciones que el autor puede aprobar o rechazar.
- Si hay una Guía Extendida, debes usarla para asegurar que los capítulos cumplan con los requisitos de extensión.
- NO pidas al usuario que copie contenido - ya tienes acceso directo al manuscrito.
- NUEVO: Puedes aplicar diagnósticos editoriales completos para reestructurar el manuscrito.

Tu rol es responder preguntas y dar consejo sobre:
- Correcciones de estilo y fluidez
- Errores de continuidad detectados por el autor
- Problemas de ritmo o pacing
- Diálogos que no suenan naturales
- Descripciones que necesitan ajuste
- Inconsistencias en los personajes
- Errores históricos o de ambientación
- Repeticiones léxicas o estructurales
- Expansión de capítulos cortos para cumplir objetivos de palabras
- Condensación y reestructuración de manuscritos

═══════════════════════════════════════════════════════════════════
COMANDO ESPECIAL: DIAGNÓSTICO EDITORIAL
═══════════════════════════════════════════════════════════════════
Si el usuario escribe "aplicar diagnóstico editorial" seguido de instrucciones detalladas,
el sistema activará el modo de reestructuración automática que:
1. Analizará las instrucciones capítulo por capítulo
2. Aplicará recortes según los porcentajes indicados
3. Preservará lo marcado como obligatorio
4. Añadirá ganchos, transiciones y contenido nuevo
5. Presentará cada capítulo modificado para aprobación

Ejemplo de uso:
"Aplicar diagnóstico editorial:
- Prólogo: recortar 20%, mantener la frase del título, añadir gancho final
- Capítulos 1-3: recortar 15% de introspección, añadir fricción antes del cap 4
- No tocar: escenas de clímax romántico"
═══════════════════════════════════════════════════════════════════

INSTRUCCIÓN CRÍTICA - GUÍA DE ESTILO:
═══════════════════════════════════════════════════════════════════
Si hay una "GUÍA DE ESTILO DEL AUTOR" en el contexto, DEBES aplicarla estrictamente.
Esta guía contiene las preferencias del autor sobre:
- Vocabulario específico a usar o evitar
- Términos prohibidos para el período histórico
- Estilo de diálogo y narración
- Registro lingüístico (formal/coloquial)
- Expresiones características de la época

ANTES de proponer cualquier texto, verifica que:
1. No uses términos modernos prohibidos en la guía
2. Respetas el vocabulario autorizado de época
3. Mantienes el tono y registro indicado
4. Sigues las instrucciones específicas del autor
═══════════════════════════════════════════════════════════════════

IMPORTANTE:
- Responde siempre en español
- Cuando el autor señale un problema, proporciona soluciones concretas
- Analiza el contexto antes de proponer cambios
- Ten en cuenta la voz y estilo del autor (lee la GUÍA DE ESTILO)
- Sé específico: indica números de capítulo, nombres de personajes, etc.
- Si hay un objetivo mínimo de palabras por capítulo, verifica que se cumpla y sugiere expansiones si es necesario

CUANDO EL AUTOR PIDA UNA CORRECCIÓN O REESCRITURA (como "corrige X", "cambia Y", "mejora Z", "reescribe...", "expande..."):
Después de tu explicación, incluye las propuestas de cambio en este formato exacto:

---PROPUESTA---
tipo: [chapter|dialogue|description|style|expansion]
capitulo: [número del capítulo afectado]
descripcion: [descripción breve del cambio]
texto_original: [el texto EXACTO que se va a reemplazar - copia literalmente del manuscrito incluyendo puntuación y espacios]
texto_propuesto: [el nuevo texto propuesto - DEBE seguir la GUÍA DE ESTILO]
---FIN_PROPUESTA---

CRÍTICO PARA texto_original:
- Copia el texto EXACTAMENTE como aparece en el manuscrito
- Incluye suficiente contexto (al menos 50 caracteres) para encontrarlo
- Preserva puntuación, espacios y saltos de línea originales

Puedes incluir múltiples propuestas si la corrección afecta a varias partes.
Solo usa este formato cuando el autor pida explícitamente una corrección que se pueda aplicar al manuscrito.
`;

interface ChatContext {
  project?: Project | ReeditProject;
  chapters?: Chapter[] | ReeditChapter[];
  worldBible?: WorldBible | ReeditWorldBible | null;
  styleGuide?: string;
  extendedGuide?: string;
  recentMessages: ChatMessage[];
}

export class ChatService {
  private async buildContext(session: ChatSession): Promise<ChatContext> {
    const recentMessages = await storage.getChatMessagesBySession(session.id);
    const context: ChatContext = { recentMessages };

    if (session.agentType === "architect" && session.projectId) {
      const project = await storage.getProject(session.projectId);
      if (project) {
        context.project = project;
        const chapters = await storage.getChaptersByProject(project.id);
        context.chapters = chapters;
        const worldBible = await storage.getWorldBibleByProject(project.id);
        context.worldBible = worldBible;
        if (project.styleGuideId) {
          const guide = await storage.getStyleGuide(project.styleGuideId);
          context.styleGuide = guide?.content;
        }
        if (project.extendedGuideId) {
          const extGuide = await storage.getExtendedGuide(project.extendedGuideId);
          context.extendedGuide = extGuide?.content;
        }
      }
    } else if (session.agentType === "reeditor" && session.reeditProjectId) {
      const reeditProject = await storage.getReeditProject(session.reeditProjectId);
      if (reeditProject) {
        context.project = reeditProject;
        const chapters = await storage.getReeditChaptersByProject(reeditProject.id);
        context.chapters = chapters;
        const worldBible = await storage.getReeditWorldBibleByProject(reeditProject.id);
        context.worldBible = worldBible;
        if ('styleGuideId' in reeditProject && reeditProject.styleGuideId) {
          const guide = await storage.getStyleGuide(reeditProject.styleGuideId as number);
          context.styleGuide = guide?.content;
        }
        if ('extendedGuideId' in reeditProject && reeditProject.extendedGuideId) {
          const extGuide = await storage.getExtendedGuide(reeditProject.extendedGuideId as number);
          context.extendedGuide = extGuide?.content;
        }
      }
    }

    return context;
  }

  private buildContextPrompt(context: ChatContext, session: ChatSession): string {
    const parts: string[] = [];

    if (context.project) {
      const p = context.project;
      const storedChapters = context.chapters?.length || 0;
      const plannedChapters = 'chapterCount' in p ? (p.chapterCount || storedChapters) : storedChapters;
      const chapterCountForCalc = plannedChapters > 0 ? plannedChapters : 1;
      const minWordCount = 'minWordCount' in p ? p.minWordCount : null;
      const minWordsPerChapter = minWordCount 
        ? Math.round(minWordCount / chapterCountForCalc) 
        : null;
      
      parts.push(`
PROYECTO ACTUAL: "${p.title}"
- ID: ${p.id}
- Total capítulos planificados: ${plannedChapters}
- Capítulos generados: ${storedChapters}
- Estado: ${'status' in p ? p.status : 'N/A'}${minWordCount ? `
- Objetivo mínimo de palabras: ${minWordCount.toLocaleString()} palabras
- Mínimo por capítulo (estimado): ${minWordsPerChapter?.toLocaleString()} palabras` : ''}
`);
    }

    if (context.worldBible && 'characters' in context.worldBible && context.worldBible.characters) {
      const chars = context.worldBible.characters as any[];
      if (chars.length > 0) {
        parts.push(`
PERSONAJES PRINCIPALES:
${chars.slice(0, 5).map((c: any) => `- ${c.name}: ${c.role || c.description || 'Sin descripción'}`).join('\n')}
`);
      }
    }

    if (session.chapterNumber && context.chapters) {
      const targetChapter = context.chapters.find((ch: any) => ch.chapterNumber === session.chapterNumber);
      if (targetChapter) {
        const content = 'editedContent' in targetChapter 
          ? (targetChapter.editedContent || targetChapter.originalContent)
          : ('content' in targetChapter ? targetChapter.content : '');
        parts.push(`
CAPÍTULO EN CONTEXTO (${session.chapterNumber}): "${targetChapter.title || 'Sin título'}"
Contenido (primeras 2000 palabras):
${content?.substring(0, 10000) || 'Sin contenido disponible'}
`);
      }
    } else if (context.chapters && context.chapters.length > 0) {
      const getChapterSortOrder = (n: number) => n === 0 ? -1000 : n === -1 || n === 998 ? 1000 : n === -2 || n === 999 ? 1001 : n;
      const sortedChapters = [...context.chapters].sort((a: any, b: any) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
      
      const getChapterLabel = (num: number) => num === 0 ? "Prólogo" : num === -1 || num === 998 ? "Epílogo" : num === -2 || num === 999 ? "Nota del Autor" : `Capítulo ${num}`;
      const chapterSummaries = sortedChapters.map((ch: any) => {
        const content = 'editedContent' in ch 
          ? (ch.editedContent || ch.originalContent)
          : ('content' in ch ? ch.content : '');
        const wordCount = content ? content.split(/\s+/).length : 0;
        return `- ${getChapterLabel(ch.chapterNumber)}: "${ch.title || 'Sin título'}" (${wordCount.toLocaleString()} palabras)`;
      }).join('\n');
      
      parts.push(`
MANUSCRITO COMPLETO - ÍNDICE DE CAPÍTULOS:
${chapterSummaries}
`);

      const MAX_CHAPTERS_IN_CONTEXT = 5;
      const MAX_CHARS_PER_CHAPTER = 15000;
      const chaptersToInclude = sortedChapters.slice(0, MAX_CHAPTERS_IN_CONTEXT);
      
      for (const ch of chaptersToInclude as any[]) {
        const content = 'editedContent' in ch 
          ? (ch.editedContent || ch.originalContent)
          : ('content' in ch ? ch.content : '');
        if (content) {
          const truncatedContent = content.length > MAX_CHARS_PER_CHAPTER 
            ? content.substring(0, MAX_CHARS_PER_CHAPTER) + '\n[... contenido truncado ...]'
            : content;
          parts.push(`
--- CAPÍTULO ${ch.chapterNumber}: "${ch.title || 'Sin título'}" ---
${truncatedContent}
`);
        }
      }
      
      if (sortedChapters.length > MAX_CHAPTERS_IN_CONTEXT) {
        parts.push(`
[Nota: Se muestran los primeros ${MAX_CHAPTERS_IN_CONTEXT} capítulos. Hay ${sortedChapters.length - MAX_CHAPTERS_IN_CONTEXT} capítulos adicionales disponibles. Pide capítulos específicos por número si necesitas verlos.]
`);
      }
    }

    if (context.styleGuide) {
      parts.push(`
═══════════════════════════════════════════════════════════════════
GUÍA DE ESTILO DEL AUTOR (OBLIGATORIA):
═══════════════════════════════════════════════════════════════════
${context.styleGuide.substring(0, 8000)}
═══════════════════════════════════════════════════════════════════
⚠️ TODO el texto que propongas DEBE seguir estrictamente esta guía.
═══════════════════════════════════════════════════════════════════
`);
    }

    if (context.extendedGuide) {
      parts.push(`
═══════════════════════════════════════════════════════════════════
GUÍA EXTENDIDA (EXTENSIÓN DE PALABRAS):
═══════════════════════════════════════════════════════════════════
${context.extendedGuide.substring(0, 8000)}
═══════════════════════════════════════════════════════════════════
`);
    }

    return parts.join('\n');
  }

  private extractRequestedChapters(message: string): number[] {
    const chapterNumbers: number[] = [];
    
    const patterns = [
      /cap[ií]tulo\s*(\d+)/gi,
      /cap\.?\s*(\d+)/gi,
      /chapter\s*(\d+)/gi,
      /\bcap\s+(\d+)/gi,
      /el\s+(\d+)/gi,
      /prólogo/gi,
      /epilogo|epílogo/gi,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        if (match[1]) {
          chapterNumbers.push(parseInt(match[1], 10));
        } else if (match[0].toLowerCase().includes('prólogo')) {
          chapterNumbers.push(0);
        } else if (match[0].toLowerCase().includes('pílogo')) {
          chapterNumbers.push(-1);
        }
      }
    }
    
    return Array.from(new Set(chapterNumbers));
  }

  private isEditorialDiagnosisCommand(message: string): boolean {
    const triggers = [
      /aplicar\s+diagn[óo]stico\s+editorial/i,
      /ejecutar\s+diagn[óo]stico/i,
      /reestructurar\s+seg[úu]n/i,
      /aplicar\s+plan\s+editorial/i,
    ];
    return triggers.some(pattern => pattern.test(message));
  }

  private async handleEditorialDiagnosis(
    session: ChatSession,
    userMessage: string,
    context: ChatContext,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    const { RestructurerAgent } = await import("../agents/restructurer");
    const restructurer = new RestructurerAgent();
    
    const chapters = context.chapters || [];
    if (chapters.length === 0) {
      return "No hay capítulos en el manuscrito para reestructurar.";
    }

    const getChapterSortOrder = (n: number) => n === 0 ? -1000 : n === -1 || n === 998 ? 1000 : n === -2 || n === 999 ? 1001 : n;
    const sortedChapters = [...chapters].sort((a: any, b: any) => getChapterSortOrder(a.chapterNumber) - getChapterSortOrder(b.chapterNumber));
    const diagnosis = userMessage.replace(/aplicar\s+diagn[óo]stico\s+editorial:?\s*/i, '').trim();
    
    let fullResponse = `## Iniciando reestructuración editorial\n\n`;
    fullResponse += `📋 **Diagnóstico recibido:**\n\`\`\`\n${diagnosis.substring(0, 500)}${diagnosis.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
    fullResponse += `📚 **Capítulos a procesar:** ${sortedChapters.length}\n\n`;
    
    if (onProgress) {
      onProgress(fullResponse);
    }

    const results: Array<{
      chapterNumber: number;
      title: string;
      originalWords: number;
      finalWords: number;
      changes: any;
      newContent: string;
    }> = [];

    for (const chapter of sortedChapters) {
      const ch = chapter as any;
      const chapterContent = 'editedContent' in ch 
        ? (ch.editedContent || ch.originalContent || '')
        : ('content' in ch ? ch.content : '');
      
      if (!chapterContent) continue;

      const chapterTitle = ch.title || `Capítulo ${ch.chapterNumber}`;
      
      const progressMsg = `\n### Procesando: ${chapterTitle}\n`;
      fullResponse += progressMsg;
      if (onProgress) {
        onProgress(progressMsg);
      }

      try {
        const worldBible = context.worldBible ? 
          (typeof context.worldBible === 'object' ? context.worldBible : null) : null;
        
        const result = await restructurer.execute({
          chapterNumber: ch.chapterNumber,
          chapterTitle,
          chapterContent,
          editorialDiagnosis: diagnosis,
          chapterInstructions: "",
          worldBible,
          guiaEstilo: context.styleGuide,
        });

        if (result.result) {
          const r = result.result;
          results.push({
            chapterNumber: ch.chapterNumber,
            title: chapterTitle,
            originalWords: r.palabras_originales,
            finalWords: r.palabras_finales,
            changes: r.cambios_realizados,
            newContent: r.texto_reestructurado,
          });

          const chapterResult = `
✅ **${chapterTitle}**
- Palabras originales: ${r.palabras_originales}
- Palabras finales: ${r.palabras_finales}
- Reducción: ${r.porcentaje_reduccion}%
- Recortes: ${r.cambios_realizados.recortes?.length || 0}
- Adiciones: ${r.cambios_realizados.adiciones?.length || 0}

---PROPUESTA---
tipo: restructure
capitulo: ${ch.chapterNumber}
descripcion: Reestructuración según diagnóstico editorial
texto_original: [Capítulo completo - ${r.palabras_originales} palabras]
texto_propuesto: ${r.texto_reestructurado}
---FIN_PROPUESTA---

`;
          fullResponse += chapterResult;
          if (onProgress) {
            onProgress(chapterResult);
          }
        } else {
          const errorMsg = `⚠️ No se pudo procesar ${chapterTitle}\n`;
          fullResponse += errorMsg;
          if (onProgress) {
            onProgress(errorMsg);
          }
        }
      } catch (error: any) {
        const errorMsg = `❌ Error en ${chapterTitle}: ${error.message}\n`;
        fullResponse += errorMsg;
        if (onProgress) {
          onProgress(errorMsg);
        }
      }
    }

    const totalOriginal = results.reduce((sum, r) => sum + r.originalWords, 0);
    const totalFinal = results.reduce((sum, r) => sum + r.finalWords, 0);
    const totalReduction = totalOriginal > 0 ? Math.round((1 - totalFinal / totalOriginal) * 100) : 0;

    const summary = `
## Resumen de reestructuración

| Métrica | Valor |
|---------|-------|
| Capítulos procesados | ${results.length} |
| Palabras originales | ${totalOriginal.toLocaleString()} |
| Palabras finales | ${totalFinal.toLocaleString()} |
| Reducción total | ${totalReduction}% |

Revisa cada propuesta y usa el botón **Aplicar** para confirmar los cambios que desees.
`;
    fullResponse += summary;
    if (onProgress) {
      onProgress(summary);
    }

    return fullResponse;
  }

  async sendMessage(
    sessionId: number,
    userMessage: string,
    onProgress?: (chunk: string) => void
  ): Promise<{ message: ChatMessage; inputTokens: number; outputTokens: number }> {
    const session = await storage.getChatSession(sessionId);
    if (!session) {
      throw new Error("Sesión de chat no encontrada");
    }

    const userMsg = await storage.createChatMessage({
      sessionId,
      role: "user",
      content: userMessage,
      chapterReference: session.chapterNumber,
    });

    const context = await this.buildContext(session);

    // Check for editorial diagnosis command
    if (session.agentType === "reeditor" && this.isEditorialDiagnosisCommand(userMessage)) {
      const diagnosisResponse = await this.handleEditorialDiagnosis(session, userMessage, context, onProgress);
      
      const assistantMsg = await storage.createChatMessage({
        sessionId,
        role: "assistant",
        content: diagnosisResponse,
        chapterReference: session.chapterNumber,
      });

      return { message: assistantMsg, inputTokens: 0, outputTokens: 0 };
    }
    
    const requestedChapters = this.extractRequestedChapters(userMessage);
    let additionalChaptersContext = "";
    
    if (requestedChapters.length > 0 && context.chapters) {
      const getChapterSortOrder2 = (n: number) => n === 0 ? -1000 : n === -1 || n === 998 ? 1000 : n === -2 || n === 999 ? 1001 : n;
      const sortedChapters = [...context.chapters].sort((a: any, b: any) => getChapterSortOrder2(a.chapterNumber) - getChapterSortOrder2(b.chapterNumber));
      const alreadyIncludedNums = sortedChapters.slice(0, 5).map((c: any) => c.chapterNumber);
      
      for (const chNum of requestedChapters) {
        if (!alreadyIncludedNums.includes(chNum)) {
          const chapter = sortedChapters.find((c: any) => c.chapterNumber === chNum);
          if (chapter) {
            const ch = chapter as any;
            const content = 'editedContent' in ch 
              ? (ch.editedContent || ch.originalContent)
              : ('content' in ch ? ch.content : '');
            if (content) {
              const truncatedContent = content.length > 15000 
                ? content.substring(0, 15000) + '\n[... contenido truncado ...]'
                : content;
              additionalChaptersContext += `
--- CAPÍTULO ${ch.chapterNumber} (SOLICITADO): "${ch.title || 'Sin título'}" ---
${truncatedContent}
`;
            }
          }
        }
      }
    }
    
    const contextPrompt = this.buildContextPrompt(context, session) + additionalChaptersContext;
    
    const systemPrompt = session.agentType === "architect" 
      ? ARCHITECT_SYSTEM_PROMPT 
      : REEDITOR_SYSTEM_PROMPT;

    const conversationHistory = context.recentMessages.slice(-10).map(msg => ({
      role: (msg.role === "model" ? "assistant" : msg.role) as "user" | "assistant",
      content: msg.content,
    }));

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: `${systemPrompt}\n\n${contextPrompt}` },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    let fullResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await ai.chat.completions.create({
        model: "deepseek-v4-flash",
        messages,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true },
        // DeepSeek-specific: keep thinking off for chat to minimize latency.
        ...({ thinking: { type: "disabled" } } as any),
      }) as unknown as AsyncIterable<any>;

      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content || "";
        if (text) {
          fullResponse += text;
          if (onProgress) {
            onProgress(text);
          }
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      }

    } catch (error: any) {
      console.error("Error generating chat response:", error);
      fullResponse = `Error al procesar tu mensaje: ${error.message || 'Error desconocido'}`;
    }

    const assistantMsg = await storage.createChatMessage({
      sessionId,
      role: "assistant",
      content: fullResponse,
      chapterReference: session.chapterNumber,
    });

    await storage.updateChatMessage(assistantMsg.id, { inputTokens, outputTokens });

    await storage.updateChatSession(sessionId, {
      totalInputTokens: (session.totalInputTokens || 0) + inputTokens,
      totalOutputTokens: (session.totalOutputTokens || 0) + outputTokens,
    });

    return { message: assistantMsg, inputTokens, outputTokens };
  }

  async createSession(params: {
    projectId?: number;
    reeditProjectId?: number;
    agentType: "architect" | "reeditor";
    chapterNumber?: number;
    title?: string;
  }): Promise<ChatSession> {
    let projectTitle = "Nuevo chat";
    
    if (params.agentType === "architect" && params.projectId) {
      const project = await storage.getProject(params.projectId);
      projectTitle = project?.title || "Proyecto";
    } else if (params.agentType === "reeditor" && params.reeditProjectId) {
      const project = await storage.getReeditProject(params.reeditProjectId);
      projectTitle = project?.title || "Proyecto reedit";
    }

    const title = params.title || `Chat con ${params.agentType === "architect" ? "Arquitecto" : "Re-editor"} - ${projectTitle}`;

    return storage.createChatSession({
      projectId: params.projectId || null,
      reeditProjectId: params.reeditProjectId || null,
      agentType: params.agentType,
      title,
      chapterNumber: params.chapterNumber || null,
      status: "active",
    });
  }
}

export const chatService = new ChatService();
