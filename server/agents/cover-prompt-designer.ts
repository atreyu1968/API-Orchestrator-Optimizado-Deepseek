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
  authorBranding?: any;
  pseudonymName?: string;
  pseudonymGenre?: string;
  pseudonymTone?: string;
  pseudonymBio?: string;
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
  authorBranding?: {
    visualIdentity: string;
    colorScheme: string;
    typographyStyle: string;
    moodAndTone: string;
    brandingNotes: string;
  };
}

export class CoverPromptDesigner extends BaseAgent {
  constructor() {
    super({
      name: "CoverPromptDesigner",
      role: "Diseñador de Prompts de Portadas",
      model: "deepseek-v4-flash",
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
2. El prompt se usará para generar una imagen real con IA (Gemini). Debe ser CONCRETO y VISUAL, no abstracto.
3. Describe ESCENAS CONCRETAS: objetos, paisajes, personajes silueteados, elementos tangibles. NUNCA uses "abstract representation" ni "symbolic depiction".
4. Especifica "book cover design", "portrait orientation 2:3 aspect ratio", "high contrast"
5. Indica CLARAMENTE dónde debe ir el texto (título arriba/centro, autor abajo) - di "clear space for prominent title text at top" y "space for author name at bottom"
6. Piensa en el GÉNERO: thriller=oscuro/misterioso, romance=cálido/suave, fantasía=épico/detallado, ciencia ficción=futurista/tecnológico
7. Para SERIES: mantén coherencia visual (misma paleta, misma composición general, mismo estilo)
8. Incluye "negative prompt" para evitar elementos no deseados
9. IMPORTANTE: El prompt debe describir algo que se pueda DIBUJAR literalmente. Por ejemplo: "A dark lake at night with a silhouetted figure standing on a pier" NO "An abstract symbolic representation of darkness and mystery"

PARA SEUDÓNIMOS - BRANDING DE AUTOR:
Cuando generes para un seudónimo (scope="pseudonym"), define un "branding de autor" que incluya:
- Identidad visual (estética general del autor, qué lo distingue visualmente)
- Esquema de colores característico del autor
- Estilo tipográfico preferido
- Mood/tono visual general
- Notas de branding (qué hace reconocible a este autor visualmente)

PARA SERIES - SISTEMA DE DISEÑO:
Cuando generes para una serie, define un "sistema de diseño" que incluya:
- Elementos comunes (marco, borde, motivo recurrente)
- Esquema de colores compartido
- Estilo tipográfico sugerido (sans-serif moderna, serif elegante, etc.)
- Patrón de composición (dónde va el título, dónde la imagen principal)
- Notas de branding (qué hace reconocible esta serie)

COHERENCIA EN CADENA:
- Si recibes un "authorBranding" existente, DEBES respetarlo y construir sobre él
- Si recibes un "seriesDesignSystem" existente, DEBES mantener coherencia con él
- La jerarquía es: Author Branding → Series Design → Project Cover
- Cada nivel hereda del anterior y añade especificidad

RESPONDE SIEMPRE EN JSON con este formato:
{
  "prompt": "prompt principal en inglés, detallado y específico",
  "negativePrompt": "elementos a evitar",
  "style": "estilo artístico principal",
  "colorPalette": "descripción de la paleta de colores",
  "mood": "atmósfera/estado de ánimo",
  "typography": "sugerencia de estilo tipográfico para el título",
  "composition": "descripción de la composición visual",
  "seriesDesignSystem": null o { "commonElements": "...", "colorScheme": "...", "typographyStyle": "...", "layoutPattern": "...", "brandingNotes": "..." },
  "authorBranding": null o { "visualIdentity": "...", "colorScheme": "...", "typographyStyle": "...", "moodAndTone": "...", "brandingNotes": "..." }
}`
    });
  }

  async generateCoverPrompt(context: CoverContext): Promise<CoverPromptResult> {
    let userPrompt = `Genera un prompt detallado para la portada de un libro con las siguientes características:\n\n`;
    
    userPrompt += `REGLAS ABSOLUTAS:
1. SOLO usa información que aparezca explícitamente en los datos proporcionados abajo.
2. NUNCA inventes personajes, escenarios, objetos ni elementos visuales que no estén en los datos.
3. Si no tienes suficiente información, basa la portada en el GÉNERO y el TONO únicamente.
4. La portada debe reflejar la ATMÓSFERA REAL del libro, no una versión inventada.\n\n`;
    
    userPrompt += `TÍTULO: "${context.title}"\n`;
    userPrompt += `GÉNERO: ${context.genre}\n`;
    userPrompt += `TONO: ${context.tone}\n`;
    
    if (context.premise) {
      userPrompt += `\nPREMISA REAL DEL LIBRO:\n${context.premise.substring(0, 2000)}\n`;
    }
    
    if (context.worldBibleSummary) {
      userPrompt += `\nDATOS REALES DEL LIBRO (usa SOLO esta información, NO inventes nada más):\n${context.worldBibleSummary.substring(0, 3000)}\n`;
    }

    if (context.authorBranding) {
      userPrompt += `\n═══ BRANDING DE AUTOR EXISTENTE (OBLIGATORIO respetar) ═══\n`;
      userPrompt += JSON.stringify(context.authorBranding, null, 2);
      userPrompt += `\n\nDEBES mantener coherencia con el branding de autor existente. Todas las portadas de este autor comparten esta identidad visual.\n`;
      userPrompt += `Incluye "authorBranding" en tu respuesta con los mismos valores (puedes refinar pero no contradecir).\n`;
    }
    
    if (context.seriesTitle) {
      if (context.scope === "series") {
        userPrompt += `\nÁMBITO: SERIE COMPLETA\n`;
      } else {
        userPrompt += `\nSERIE: Este libro pertenece a la serie "${context.seriesTitle}"\n`;
      }
      userPrompt += `Serie: "${context.seriesTitle}"\n`;
      if (context.seriesDescription) {
        userPrompt += `Descripción de la serie: ${context.seriesDescription.substring(0, 1500)}\n`;
      }
      if (context.seriesDesignSystem) {
        userPrompt += `\n═══ SISTEMA DE DISEÑO DE SERIE EXISTENTE (OBLIGATORIO mantener coherencia) ═══\n${JSON.stringify(context.seriesDesignSystem, null, 2)}\n`;
        userPrompt += `\nDEBES mantener coherencia visual con el sistema de diseño existente de la serie.\n`;
      }
      if (context.scope === "series") {
        userPrompt += `\nDebe incluir un "seriesDesignSystem" en la respuesta que defina los elementos visuales comunes para toda la serie.\n`;
      } else if (!context.seriesDesignSystem) {
        userPrompt += `\nEste es el primer libro de la serie con portada. Incluye un "seriesDesignSystem" que defina los elementos visuales comunes para futuros libros.\n`;
      }
    }
    
    if (context.pseudonymName) {
      if (context.scope === "pseudonym") {
        userPrompt += `\nÁMBITO: MARCA DE AUTOR\n`;
        userPrompt += `Estás creando la IDENTIDAD VISUAL del autor "${context.pseudonymName}".\n`;
        if (context.pseudonymBio) {
          userPrompt += `Biografía del autor: ${context.pseudonymBio.substring(0, 500)}\n`;
        }
        userPrompt += `DEBES incluir un "authorBranding" completo en tu respuesta.\n`;
      } else {
        userPrompt += `\nAUTOR: `;
      }
      userPrompt += `Seudónimo: "${context.pseudonymName}"\n`;
      if (context.pseudonymGenre) {
        userPrompt += `Género habitual del autor: ${context.pseudonymGenre}\n`;
      }
      if (context.pseudonymTone) {
        userPrompt += `Tono habitual del autor: ${context.pseudonymTone}\n`;
      }
      userPrompt += `La portada debe reflejar la identidad visual del autor "${context.pseudonymName}".\n`;
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
- Indicar zonas claras para texto (título y autor) pero NO escribir el texto literal del título
- Incluir "negative prompt"
- Responder SOLO con JSON válido`;

    const response = await this.generateContent(userPrompt);
    
    if (response.error) {
      throw new Error(`Error generando prompt de portada: ${response.error}`);
    }

    const parsed = repairJson(response.content);
    
    let prompt = String(parsed.prompt || "").trim();
    prompt = this.sanitizeCoverPrompt(prompt, context.title);

    return {
      prompt,
      negativePrompt: String(parsed.negativePrompt || "").substring(0, 2000),
      style: String(parsed.style || "realistic").substring(0, 100),
      colorPalette: String(parsed.colorPalette || "").substring(0, 500),
      mood: String(parsed.mood || "").substring(0, 200),
      typography: String(parsed.typography || "").substring(0, 500),
      composition: String(parsed.composition || "").substring(0, 500),
      seriesDesignSystem: parsed.seriesDesignSystem || null,
      authorBranding: parsed.authorBranding || null,
    };
  }

  private sanitizeCoverPrompt(prompt: string, title: string): string {
    const titleLower = title.toLowerCase();
    const promptLower = prompt.toLowerCase();
    if (promptLower.includes(`"${titleLower}"`) || promptLower.includes(`'${titleLower}'`)) {
      prompt = prompt.replace(new RegExp(`["']${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, "gi"), "[book title text]");
    }

    const kdpTerms = [
      /\b2560\s*x\s*1600\b/g,
      /\b1600\s*x\s*2560\b/g,
      /\b300\s*dpi\b/gi,
      /\brgb\s+color\s+space\b/gi,
      /\bjpeg\b/gi,
      /\btiff\b/gi,
    ];
    for (const term of kdpTerms) {
      prompt = prompt.replace(term, "");
    }

    prompt = prompt.replace(/\s{2,}/g, " ").trim();

    if (!promptLower.includes("portrait") && !promptLower.includes("vertical")) {
      prompt += ", vertical portrait orientation";
    }

    if (!promptLower.includes("book cover")) {
      prompt = "Book cover design, " + prompt;
    }

    return prompt.substring(0, 5000);
  }
}

export const coverPromptDesigner = new CoverPromptDesigner();
