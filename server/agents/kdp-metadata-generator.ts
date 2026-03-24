import { BaseAgent } from "./base-agent";
import { repairJson } from "../utils/json-repair";

interface MetadataContext {
  title: string;
  genre: string;
  tone: string;
  premise?: string;
  chapterCount?: number;
  wordCount?: number;
  worldBibleSummary?: string;
  seriesTitle?: string;
  seriesDescription?: string;
  seriesNumber?: number;
  pseudonymName?: string;
  language: string;
  targetMarketplace: string;
}

interface KdpMetadataResult {
  subtitle: string;
  description: string;
  keywords: string[];
  bisacCategories: string[];
  seriesName: string | null;
  seriesNumber: number | null;
  seriesDescription: string | null;
  aiDisclosure: string;
  contentWarnings: string | null;
}

export class KdpMetadataGenerator extends BaseAgent {
  constructor() {
    super({
      name: "KdpMetadataGenerator",
      role: "Generador de Metadatos KDP",
      model: "gemini-2.5-flash",
      useThinking: true,
      maxOutputTokens: 8192,
      systemPrompt: `Eres un experto en publicación de libros en Amazon KDP. Tu trabajo es generar metadatos optimizados para maximizar la visibilidad y ventas en la tienda Kindle.

REGLAS DE AMAZON KDP QUE DEBES CUMPLIR ESTRICTAMENTE:

1. DESCRIPCIÓN DEL LIBRO:
   - Máximo 4000 caracteres INCLUYENDO etiquetas HTML
   - HTML permitido: <b>, <i>, <em>, <strong>, <br>, <p>, <h4>, <h5>, <h6>, <ul>, <ol>, <li>
   - NO usar <h1>, <h2>, <h3>
   - PROHIBIDO incluir: información de contacto, reseñas, testimonios, información temporal ("nuevo", "en oferta"), afirmaciones de calidad ("el mejor", "más vendido"), llamadas a acción ("compra ahora"), marcas de Amazon
   - La descripción debe enganchar al lector sin revelar spoilers
   - Usar formato HTML para buena legibilidad

2. PALABRAS CLAVE (7 slots):
   - Cada keyword puede tener hasta 50 caracteres
   - Usar frases descriptivas de 5-7 palabras, no palabras sueltas
   - NO repetir lo que ya está en el título o categoría
   - NO usar marcas registradas ni nombres de otros autores
   - NO usar "kindle", "ebook", "gratis"
   - Mezclar: 3 keywords específicas del contenido, 2 de género/subgénero, 2 de audiencia/tono
   - Las keywords deben ser en el IDIOMA del marketplace destino

3. CATEGORÍAS BISAC:
   - Elegir 2 categorías BISAC relevantes
   - Ser lo más específico posible (subcategorías mejor que categorías generales)
   - Formato: "FICTION / Genre / Subgenre" o similar

4. SUBTÍTULO:
   - Complementa el título principal
   - Añade contexto de género o gancho emocional
   - No debe ser redundante con el título

5. SERIES EN KDP:
   - El nombre de la serie debe ser IDÉNTICO en todos los libros
   - NO incluir números de volumen en el nombre de la serie
   - Solo el nombre: "Crónicas de..." NO "Crónicas de... Libro 1"
   - Número de serie: solo dígitos (1, 2, 3), sin texto adicional

6. DIVULGACIÓN DE IA:
   - "ai-generated": contenido creado completamente por IA
   - "ai-assisted": IA utilizada como herramienta de asistencia (edición, ideas, corrección)
   - Amazon requiere divulgación pero es confidencial (no se muestra públicamente)
   - Para libros escritos con asistencia de agentes IA, lo correcto es "ai-assisted"

RESPONDE SIEMPRE EN JSON con este formato:
{
  "subtitle": "subtítulo atractivo",
  "description": "descripción HTML formateada (max 4000 chars)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7"],
  "bisacCategories": ["FICTION / Category / Subcategory", "FICTION / Category2 / Subcategory2"],
  "seriesName": "nombre de la serie" o null,
  "seriesNumber": 1 o null,
  "seriesDescription": "descripción de la serie para la página de serie en KDP" o null,
  "aiDisclosure": "ai-assisted",
  "contentWarnings": "advertencias de contenido si aplica" o null
}`
    });
  }

  async generateMetadata(context: MetadataContext): Promise<KdpMetadataResult> {
    let userPrompt = `Genera los metadatos KDP optimizados para VENDER el siguiente libro en Amazon.\n\n`;
    userPrompt += `REGLAS ABSOLUTAS:
1. SOLO usa información que aparezca explícitamente en los datos proporcionados abajo.
2. NUNCA inventes personajes, lugares, hechos ni situaciones que no estén en los datos.
3. Si no tienes suficiente información, mantén la descripción genérica usando solo el género y el tono.
4. La descripción debe ser un GANCHO COMERCIAL (texto de contraportada), NO un resumen de la trama.
5. NO reveles spoilers ni giros argumentales.\n\n`;
    
    userPrompt += `TÍTULO: "${context.title}"\n`;
    userPrompt += `GÉNERO: ${context.genre}\n`;
    userPrompt += `TONO: ${context.tone}\n`;
    userPrompt += `IDIOMA: ${context.language}\n`;
    userPrompt += `MARKETPLACE: ${context.targetMarketplace}\n`;
    
    if (context.wordCount) {
      userPrompt += `EXTENSIÓN: ~${context.wordCount} palabras\n`;
    }
    
    if (context.premise) {
      userPrompt += `\nPREMISA (solo para entender el libro, NO para copiar en la descripción):\n${context.premise.substring(0, 2000)}\n`;
    }
    
    if (context.worldBibleSummary) {
      userPrompt += `\nDATOS REALES DEL LIBRO (usa SOLO esta información, NO inventes nada más):\n${context.worldBibleSummary.substring(0, 3000)}\n`;
    }
    
    if (context.seriesTitle) {
      userPrompt += `\nSERIE: "${context.seriesTitle}"\n`;
      if (context.seriesDescription) {
        userPrompt += `Descripción de la serie: ${context.seriesDescription.substring(0, 1500)}\n`;
      }
      if (context.seriesNumber) {
        userPrompt += `Número en la serie: ${context.seriesNumber}\n`;
      }
    }
    
    if (context.pseudonymName) {
      userPrompt += `\nAUTOR (seudónimo): ${context.pseudonymName}\n`;
    }

    userPrompt += `\nINSTRUCCIONES PARA LA DESCRIPCIÓN:
- Escribe como TEXTO DE CONTRAPORTADA: engancha al lector con misterio, emoción y promesa
- Presenta al protagonista y su conflicto principal SIN resolver nada
- Usa preguntas retóricas, tensión y ganchos emocionales
- NO cuentes la historia ni reveles giros argumentales
- Termina con una frase que deje al lector queriendo más
- Formato HTML (max 4000 chars incluyendo tags)

INSTRUCCIONES PARA KEYWORDS:
- Piensa como un LECTOR buscando libros similares en Amazon
- Usa frases que un comprador escribiría en el buscador
- Mezcla: subgéneros, ambientación, público objetivo, comparables de tono
- Las keywords y la descripción en ${context.language === "es" ? "ESPAÑOL" : context.language === "en" ? "INGLÉS" : context.language}
- 7 keywords de máximo 50 caracteres cada una

- Las categorías BISAC en formato estándar internacional
- Responder SOLO con JSON válido
- Marketplace destino: ${context.targetMarketplace}`;

    const response = await this.generateContent(userPrompt);
    
    if (response.error) {
      throw new Error(`Error generando metadatos KDP: ${response.error}`);
    }

    const parsed = repairJson(response.content);
    
    let keywords = (parsed.keywords || []).slice(0, 7).map((k: string) => 
      typeof k === "string" ? k.substring(0, 50) : String(k).substring(0, 50)
    );
    keywords = this.sanitizeKeywords(keywords, context.title);
    while (keywords.length < 7) {
      keywords.push("");
    }
    
    let description = this.sanitizeDescription(parsed.description || "");

    const seriesName = this.sanitizeSeriesName(parsed.seriesName || null);

    const aiDisclosure = ["ai-generated", "ai-assisted"].includes(parsed.aiDisclosure)
      ? parsed.aiDisclosure
      : "ai-assisted";

    return {
      subtitle: (parsed.subtitle || "").substring(0, 200),
      description,
      keywords,
      bisacCategories: (parsed.bisacCategories || []).slice(0, 2).map((c: string) => String(c).substring(0, 200)),
      seriesName,
      seriesNumber: typeof parsed.seriesNumber === "number" ? parsed.seriesNumber : null,
      seriesDescription: parsed.seriesDescription ? String(parsed.seriesDescription).substring(0, 500) : null,
      aiDisclosure,
      contentWarnings: parsed.contentWarnings || null,
    };
  }

  private sanitizeDescription(description: string): string {
    const KDP_ALLOWED_TAGS = new Set(["b", "i", "em", "strong", "br", "p", "h4", "h5", "h6", "ul", "ol", "li", "hr"]);
    description = description.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi, (match, tag) => {
      return KDP_ALLOWED_TAGS.has(tag.toLowerCase()) ? match : "";
    });

    const forbiddenPatterns = [
      /compra\s+ahora/gi,
      /haz\s+clic/gi,
      /buy\s+now/gi,
      /click\s+here/gi,
      /el\s+mejor/gi,
      /más\s+vendido/gi,
      /best\s*seller/gi,
      /número\s+1/gi,
      /#1/g,
      /en\s+oferta/gi,
      /precio\s+especial/gi,
      /por\s+tiempo\s+limitado/gi,
      /gratis/gi,
      /free/gi,
      /descuento/gi,
      /★+/g,
      /⭐+/g,
    ];
    for (const pattern of forbiddenPatterns) {
      description = description.replace(pattern, "");
    }

    description = description.replace(/\s{2,}/g, " ").trim();

    if (description.length > 4000) {
      const lastTag = description.lastIndexOf("<", 3990);
      if (lastTag > 3500) {
        description = description.substring(0, lastTag);
      } else {
        description = description.substring(0, 3997) + "...";
      }
    }

    return description;
  }

  private sanitizeKeywords(keywords: string[], title: string): string[] {
    const forbiddenTerms = ["kindle", "ebook", "e-book", "amazon", "gratis", "free", "bestseller", "best seller"];
    const titleWords = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    return keywords.map(kw => {
      let cleaned = kw;
      for (const term of forbiddenTerms) {
        const regex = new RegExp(`\\b${term}\\b`, "gi");
        cleaned = cleaned.replace(regex, "").trim();
      }
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
      return cleaned.substring(0, 50);
    }).filter(kw => {
      if (!kw || kw.length < 2) return false;
      const kwLower = kw.toLowerCase();
      const kwWords = kwLower.split(/\s+/);
      const allInTitle = kwWords.every(w => titleWords.has(w));
      if (allInTitle && kwWords.length <= 2) return false;
      return true;
    });
  }

  private sanitizeSeriesName(name: string | null): string | null {
    if (!name) return null;
    let cleaned = name.replace(/\b(libro|book|vol(umen)?|volume|tomo|parte|part)\s*\.?\s*\d+\b/gi, "").trim();
    cleaned = cleaned.replace(/\s*[,\-–—]\s*$/, "").trim();
    return cleaned || null;
  }
}

export const kdpMetadataGenerator = new KdpMetadataGenerator();
