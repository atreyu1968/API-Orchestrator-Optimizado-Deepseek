import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface CoverContext {
  title: string;
  genre: string;
  tone: string;
  premise?: string;
  worldBibleSummary?: string;
  seriesTitle?: string;
  seriesDescription?: string;
  seriesDesignSystem?: any;
  pseudonymName?: string;
  pseudonymGenre?: string;
  existingCovers?: Array<{ title: string; style: string; colorPalette: string; mood: string }>;
  scope: "project" | "series" | "pseudonym" | "independent";
}

interface CoverPromptResult {
  prompt: string;
  negativePrompt: string;
  style: string;
  colorPalette: string;
  mood: string;
  typography: string;
  composition: string;
  seriesDesignSystem?: {
    commonElements: string;
    colorScheme: string;
    typographyStyle: string;
    layoutPattern: string;
    brandingNotes: string;
  };
}

export class CoverPromptDesigner extends BaseAgent {
  constructor() {
    super({
      name: "CoverPromptDesigner",
      role: "Diseñador de Prompts de Portadas",
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 8192,
      systemPrompt: `Eres un experto diseñador de portadas de libros especializado en crear prompts detallados para generación de portadas con IA (Midjourney, DALL-E, Stable Diffusion, Ideogram, Leonardo AI).

CONOCIMIENTOS CLAVE:
- Las portadas se publican en Amazon KDP
- Especificaciones técnicas KDP: 2560x1600 píxeles, 300 DPI, RGB, JPEG/TIFF, formato vertical (portrait)
- La portada debe funcionar como miniatura pequeña (~150px) en Amazon - el título debe ser legible a tamaño reducido
- Alto contraste entre texto y fondo
- Zona segura: elementos importantes alejados de los bordes

REGLAS PARA PROMPTS:
1. Genera prompts en INGLÉS (los modelos de IA funcionan mejor en inglés)
2. Incluye siempre: estilo artístico, composición, iluminación, paleta de colores, atmósfera
3. Especifica "book cover design", "portrait orientation", "high contrast"
4. NO incluyas texto real en el prompt (el título se añade después) - di "space for title text at top" 
5. Piensa en el GÉNERO: thriller=oscuro/misterioso, romance=cálido/suave, fantasía=épico/detallado, ciencia ficción=futurista/tecnológico
6. Para SERIES: mantén coherencia visual (misma paleta, misma composición general, mismo estilo)
7. Incluye "negative prompt" para evitar elementos no deseados

PARA SERIES - SISTEMA DE DISEÑO:
Cuando generes para una serie, primero define un "sistema de diseño" que incluya:
- Elementos comunes (marco, borde, motivo recurrente)
- Esquema de colores compartido
- Estilo tipográfico sugerido (sans-serif moderna, serif elegante, etc.)
- Patrón de composición (dónde va el título, dónde la imagen principal)
- Notas de branding (qué hace reconocible esta serie)

RESPONDE SIEMPRE EN JSON con este formato:
{
  "prompt": "prompt principal en inglés, detallado y específico",
  "negativePrompt": "elementos a evitar",
  "style": "estilo artístico principal",
  "colorPalette": "descripción de la paleta de colores",
  "mood": "atmósfera/estado de ánimo",
  "typography": "sugerencia de estilo tipográfico para el título",
  "composition": "descripción de la composición visual",
  "seriesDesignSystem": null o { "commonElements": "...", "colorScheme": "...", "typographyStyle": "...", "layoutPattern": "...", "brandingNotes": "..." }
}`
    });
  }

  async generateCoverPrompt(context: CoverContext): Promise<CoverPromptResult> {
    let userPrompt = `Genera un prompt detallado para la portada de un libro con las siguientes características:\n\n`;
    
    userPrompt += `TÍTULO: "${context.title}"\n`;
    userPrompt += `GÉNERO: ${context.genre}\n`;
    userPrompt += `TONO: ${context.tone}\n`;
    
    if (context.premise) {
      userPrompt += `\nPREMISA:\n${context.premise.substring(0, 2000)}\n`;
    }
    
    if (context.worldBibleSummary) {
      userPrompt += `\nMUNDO/AMBIENTACIÓN (resumen):\n${context.worldBibleSummary.substring(0, 3000)}\n`;
    }
    
    if (context.scope === "series") {
      userPrompt += `\nÁMBITO: SERIE COMPLETA\n`;
      userPrompt += `Serie: "${context.seriesTitle}"\n`;
      if (context.seriesDescription) {
        userPrompt += `Descripción de la serie: ${context.seriesDescription.substring(0, 1500)}\n`;
      }
      if (context.seriesDesignSystem) {
        userPrompt += `\nSISTEMA DE DISEÑO EXISTENTE DE LA SERIE (mantener coherencia):\n${JSON.stringify(context.seriesDesignSystem, null, 2)}\n`;
      }
      userPrompt += `\nDebe incluir un "seriesDesignSystem" en la respuesta que defina los elementos visuales comunes para toda la serie.\n`;
    }
    
    if (context.scope === "pseudonym") {
      userPrompt += `\nÁMBITO: MARCA DE AUTOR\n`;
      userPrompt += `Seudónimo: "${context.pseudonymName}"\n`;
      if (context.pseudonymGenre) {
        userPrompt += `Género habitual: ${context.pseudonymGenre}\n`;
      }
      userPrompt += `El prompt debe reflejar una identidad visual consistente para este autor.\n`;
    }
    
    if (context.existingCovers && context.existingCovers.length > 0) {
      userPrompt += `\nPORTADAS EXISTENTES EN LA MISMA SERIE/AUTOR (para coherencia):\n`;
      for (const cover of context.existingCovers) {
        userPrompt += `- "${cover.title}": estilo=${cover.style}, colores=${cover.colorPalette}, mood=${cover.mood}\n`;
      }
      userPrompt += `\nMantén coherencia visual con las portadas existentes.\n`;
    }
    
    userPrompt += `\nRecuerda: 
- El prompt debe ser en INGLÉS
- Formato vertical (portrait) para KDP (2560x1600)
- Debe funcionar como miniatura pequeña
- NO incluir texto literal del título en el prompt
- Incluir "negative prompt"
- Responder SOLO con JSON válido`;

    const response = await this.generateContent(userPrompt);
    
    if (response.error) {
      throw new Error(`Error generando prompt de portada: ${response.error}`);
    }

    const parsed = repairJson(response.content);
    
    return {
      prompt: parsed.prompt || "",
      negativePrompt: parsed.negativePrompt || "",
      style: parsed.style || "realistic",
      colorPalette: parsed.colorPalette || "",
      mood: parsed.mood || "",
      typography: parsed.typography || "",
      composition: parsed.composition || "",
      seriesDesignSystem: parsed.seriesDesignSystem || null,
    };
  }
}

export const coverPromptDesigner = new CoverPromptDesigner();
