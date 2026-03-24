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
    let userPrompt = `Genera los metadatos KDP optimizados para el siguiente libro:\n\n`;
    
    userPrompt += `TÍTULO: "${context.title}"\n`;
    userPrompt += `GÉNERO: ${context.genre}\n`;
    userPrompt += `TONO: ${context.tone}\n`;
    userPrompt += `IDIOMA: ${context.language}\n`;
    userPrompt += `MARKETPLACE: ${context.targetMarketplace}\n`;
    
    if (context.chapterCount) {
      userPrompt += `CAPÍTULOS: ${context.chapterCount}\n`;
    }
    if (context.wordCount) {
      userPrompt += `PALABRAS APROXIMADAS: ${context.wordCount}\n`;
    }
    
    if (context.premise) {
      userPrompt += `\nPREMISA:\n${context.premise.substring(0, 3000)}\n`;
    }
    
    if (context.worldBibleSummary) {
      userPrompt += `\nMUNDO/PERSONAJES (resumen):\n${context.worldBibleSummary.substring(0, 4000)}\n`;
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

    userPrompt += `\nIMPORTANTE:
- Las keywords y la descripción deben estar en ${context.language === "es" ? "ESPAÑOL" : context.language === "en" ? "INGLÉS" : context.language}
- Las categorías BISAC en formato estándar internacional
- La descripción en HTML (max 4000 chars incluyendo tags)
- 7 keywords de máximo 50 caracteres cada una
- Responder SOLO con JSON válido
- Marketplace destino: ${context.targetMarketplace}`;

    const response = await this.generateContent(userPrompt);
    
    if (response.error) {
      throw new Error(`Error generando metadatos KDP: ${response.error}`);
    }

    const parsed = repairJson(response.content);
    
    const keywords = (parsed.keywords || []).slice(0, 7).map((k: string) => 
      typeof k === "string" ? k.substring(0, 50) : String(k).substring(0, 50)
    );
    while (keywords.length < 7) {
      keywords.push("");
    }
    
    let description = parsed.description || "";
    if (description.length > 4000) {
      const lastTag = description.lastIndexOf("<", 3990);
      if (lastTag > 3500) {
        description = description.substring(0, lastTag);
      } else {
        description = description.substring(0, 3997) + "...";
      }
    }

    return {
      subtitle: parsed.subtitle || "",
      description,
      keywords,
      bisacCategories: (parsed.bisacCategories || []).slice(0, 2),
      seriesName: parsed.seriesName || null,
      seriesNumber: parsed.seriesNumber || null,
      seriesDescription: parsed.seriesDescription || null,
      aiDisclosure: parsed.aiDisclosure || "ai-assisted",
      contentWarnings: parsed.contentWarnings || null,
    };
  }
}

export const kdpMetadataGenerator = new KdpMetadataGenerator();
