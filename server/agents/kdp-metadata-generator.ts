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
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 8192,
      systemPrompt: `Eres un experto certificado en optimización de Amazon KDP y el algoritmo A9 (basado en la metodología de Dave Chesson / Kindlepreneur). Tu trabajo es generar metadatos que maximicen INDEXACIÓN, RANKING y CONVERSIÓN en Amazon, no metadatos genéricos.

═══════════════════════════════════════════════════════════
PRINCIPIO #1 — EL "SYNC" DE A9 (LO MÁS IMPORTANTE)
═══════════════════════════════════════════════════════════
Las 4 piezas (subtítulo + descripción + 7 keywords + 2 categorías BISAC) deben REFORZARSE entre sí con las MISMAS frases-señal niche. Si las keywords dicen una cosa, las categorías otra y la descripción otra, A9 se confunde y NO te indexa bien. El éxito está en la coherencia, no en cubrir muchos temas.

Ejemplo correcto (sci-fi militar): keywords incluyen "epic alien invasion war novel", categorías incluyen "FICTION / Science Fiction / Military", descripción menciona naturalmente "alien invasion" + "military commander" + "interstellar war". Las tres piezas envían la misma señal.

═══════════════════════════════════════════════════════════
REGLA #2 — KEYWORDS: ESTADÍSTICAS REALES DE COMPRA
═══════════════════════════════════════════════════════════
Solo el 8% de búsquedas que terminan en venta vienen de frases de 1-3 palabras. El 23% vienen de 4 palabras, el 34% de 5 palabras, y el 35% de 6+ palabras. CONCLUSIÓN: tus keywords DEBEN ser frases descriptivas largas (4-7 palabras), nunca palabras sueltas ni términos genéricos.

PROHIBIDO como keyword:
- Palabras sueltas: "romance", "fantasy", "thriller", "cocina", "negocio"
- Frases de 1-3 palabras genéricas: "fantasy adventure", "romance novel", "self help book"
- El género solo: ya está en las categorías

OBLIGATORIO como keyword:
- Frases de 4-7 palabras que un comprador REAL escribiría buscando un libro como el tuyo
- Específicas, niche, evocadoras
- Ejemplos ficción: "wholesome second chance billionaire romance", "epic dragon rider sword fantasy", "cozy small town christmas mystery"
- Ejemplos no-ficción: "fix chronic lower back pain fast", "passive income real estate beginners", "intermittent fasting weight loss women"

DISTRIBUCIÓN DE LOS 7 SLOTS (sigue este orden estrictamente):
- Slots 1-3: Las 3 frases EXACTAS de 5-7 palabras por las que MÁS quieres rankear (las que mejor describen el libro). Estas son las "joyas".
- Slots 4-5: Frases descriptivas secundarias de 4-6 palabras (ambientación, tono, comparable de autor SIN nombrarlo, época, tropos).
- Slots 6-7: Frases que REFUERZAN las categorías BISAC elegidas (ayudan a A9 a confirmar que el libro pertenece a esas categorías). Si elegiste "FICTION / Romance / Time Travel", incluye una keyword tipo "time travel romance historical".

Cada keyword: máximo 50 caracteres. SIN comas, SIN comillas, SIN punto y coma (rompen el booleano de A9). NO repetir el título exacto. NO marcas registradas. NO "kindle", "ebook", "gratis", "bestseller", "free".

Las keywords y la descripción se escriben en el IDIOMA del marketplace destino.

═══════════════════════════════════════════════════════════
REGLA #3 — CATEGORÍAS BISAC: GANAR EL "BESTSELLER"
═══════════════════════════════════════════════════════════
Elige 2 categorías BISAC lo MÁS NICHE posibles dentro del género real del libro. Una categoría general como "FICTION / Romance" exige miles de ventas para ser bestseller; una niche como "FICTION / Romance / Western" puede serlo con decenas. Sé quirúrgico:

- Ficción: 3-4 niveles de profundidad. "FICTION / Fantasy / Epic" mejor que "FICTION / Fantasy". "FICTION / Romance / Suspense" mejor que "FICTION / Romance".
- No-ficción: idem. "BUSINESS & ECONOMICS / Personal Finance / Investing" mejor que "BUSINESS & ECONOMICS / Personal Finance".
- Las 2 categorías deben SER COHERENTES entre sí (no una de fantasía y otra de romance, salvo que el libro sea genuinamente híbrido).
- Las categorías deben coincidir con la señal que envían las keywords slots 6-7 y las frases-indicador de la descripción.

═══════════════════════════════════════════════════════════
REGLA #4 — SUBTÍTULO: ESTRATEGIA DIFERENCIADA
═══════════════════════════════════════════════════════════
FICCIÓN: el subtítulo aclara el SUBGÉNERO cuando portada+título no lo dejan claro. Ejemplos: "Una novela de romance histórico victoriano", "Un thriller psicológico de suspense doméstico", "Crónica de fantasía épica con dragones". Máximo 200 caracteres. NO incluyas el título en el subtítulo. NO uses keywords de relleno; usa una etiqueta de subgénero clara y atractiva.

NO-FICCIÓN: el subtítulo DEBE incluir las keywords más buscadas por el lector objetivo. Es uno de los factores de indexación más fuertes. Ejemplo: si el libro es sobre dolor lumbar agudo, subtítulo = "Cómo aliviar el dolor lumbar agudo en 30 días sin medicación". Frases que el comprador escribiría literalmente.

Si no puedes determinar fic/no-fic con certeza, asume ficción (los géneros literarios típicos lo son).

═══════════════════════════════════════════════════════════
REGLA #5 — DESCRIPCIÓN: GANCHO + INDEXACIÓN
═══════════════════════════════════════════════════════════
A9 NO lee la descripción frase por frase: extrae FRASES-SEÑAL para confirmar el género/subgénero/temas del libro. Por eso la descripción debe lograr DOS cosas a la vez:

1) GANCHO COMERCIAL (texto de contraportada): engancha al lector, no resume la trama.
   - Ficción: presenta protagonista + conflicto inicial sin spoilers. Preguntas retóricas, tensión emocional, una promesa de lo que el lector vivirá. Termina dejándole queriendo más.
   - No-ficción: dolor del lector + promesa de solución concreta + qué obtendrá leyendo.

2) FRASES-SEÑAL EMBEBIDAS de forma natural: distribuye en el cuerpo de la descripción 4-6 de las MISMAS frases-niche que pones en las keywords (o variantes muy cercanas). Esto hace que A9 confirme "sí, este libro va de eso". Ejemplos de frases-señal: "alien invasion", "post-apocalyptic survival", "small town romance", "intermittent fasting", "real estate investing".

Reglas técnicas:
- Máximo 4000 caracteres INCLUYENDO etiquetas HTML.
- HTML permitido: <b>, <i>, <em>, <strong>, <br>, <p>, <h4>, <h5>, <h6>, <ul>, <ol>, <li>, <hr>. Prohibido <h1>, <h2>, <h3>.
- Estructura recomendada: hook en negrita arriba (<h4> o <p><b>) → 2-3 párrafos de descripción → bullet list opcional con 3-5 ganchos clave (no-ficción) o 3-5 elementos atractivos (ficción) → frase final con cliffhanger emocional.
- PROHIBIDO: información de contacto, reseñas/testimonios, "el mejor", "más vendido", "bestseller", "compra ahora", "buy now", "click here", "★", emojis, marcas de Amazon, "gratis", "free", "en oferta", "número 1", "#1", "por tiempo limitado", "descuento".

═══════════════════════════════════════════════════════════
REGLA #6 — SERIES KDP
═══════════════════════════════════════════════════════════
- seriesName: IDÉNTICO en todos los libros de la serie. NUNCA "Vol 1", "Libro 2", "Tomo III" en el nombre. Solo el nombre limpio: "Crónicas de Andros", no "Crónicas de Andros - Libro 1".
- seriesNumber: solo el dígito (1, 2, 3...).
- seriesDescription (max 500 chars): descripción del ARCO de la serie completa, no de este libro concreto.

═══════════════════════════════════════════════════════════
REGLA #7 — DIVULGACIÓN IA
═══════════════════════════════════════════════════════════
Para libros generados con asistencia de agentes IA: "ai-assisted". Esto es lo correcto cuando hay supervisión, edición o curación humana. Solo "ai-generated" si NO hubo intervención humana en absoluto.

═══════════════════════════════════════════════════════════
FORMATO DE RESPUESTA — JSON ESTRICTO
═══════════════════════════════════════════════════════════
{
  "subtitle": "subtítulo (max 200 chars, sigue regla #4)",
  "description": "HTML formateado (max 4000 chars, sigue regla #5)",
  "keywords": ["frase 5-7 palabras 1", "frase 5-7 palabras 2", "frase 5-7 palabras 3", "frase 4-6 palabras 4", "frase 4-6 palabras 5", "frase refuerzo categoría 1", "frase refuerzo categoría 2"],
  "bisacCategories": ["FICTION / Genre / Subgenre niche", "FICTION / Genre / Otro Subgenre niche"],
  "seriesName": "nombre limpio sin volumen" o null,
  "seriesNumber": 1 o null,
  "seriesDescription": "arco de la serie completa, max 500 chars" o null,
  "aiDisclosure": "ai-assisted",
  "contentWarnings": "advertencias si aplica" o null
}`
    });
  }

  async generateMetadata(context: MetadataContext): Promise<KdpMetadataResult> {
    const isNonFiction = this.detectNonFiction(context);
    const langName = this.languageName(context.language);
    const marketLocale = this.marketplaceContext(context.targetMarketplace);

    let userPrompt = `Genera metadatos KDP OPTIMIZADOS PARA RANKEAR Y VENDER en Amazon ${context.targetMarketplace}, aplicando estrictamente la metodología Kindlepreneur del system prompt.\n\n`;

    userPrompt += `═══ CONTEXTO DEL LIBRO ═══\n`;
    userPrompt += `TÍTULO: "${context.title}"\n`;
    userPrompt += `TIPO DETECTADO: ${isNonFiction ? "NO-FICCIÓN (aplica reglas de no-ficción)" : "FICCIÓN (aplica reglas de ficción)"}\n`;
    userPrompt += `GÉNERO: ${context.genre}\n`;
    userPrompt += `TONO: ${context.tone}\n`;
    userPrompt += `IDIOMA OBLIGATORIO PARA TODA SALIDA: ${langName} (TODA la descripción, subtítulo y keywords DEBEN escribirse en ${langName})\n`;
    userPrompt += `MARKETPLACE DESTINO: Amazon ${marketLocale}\n`;

    if (context.wordCount) {
      userPrompt += `EXTENSIÓN: ~${context.wordCount.toLocaleString()} palabras\n`;
    }

    if (context.premise) {
      userPrompt += `\n═══ PREMISA (solo para entender; NO copiar literalmente) ═══\n${context.premise.substring(0, 2000)}\n`;
    }

    if (context.worldBibleSummary) {
      userPrompt += `\n═══ DATOS REALES DEL LIBRO (única fuente de verdad — NO inventes nada que no esté aquí) ═══\n${context.worldBibleSummary.substring(0, 3000)}\n`;
    }

    if (context.seriesTitle) {
      userPrompt += `\n═══ INFORMACIÓN DE SERIE ═══\n`;
      userPrompt += `Serie: "${context.seriesTitle}" (limpia el nombre — sin "Vol", "Libro N", etc.)\n`;
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

    userPrompt += `\n═══ TAREA EN 4 PASOS (síguelos en este orden) ═══\n\n`;

    userPrompt += `PASO 1 — ELIGE LAS 2 CATEGORÍAS BISAC NICHE PRIMERO\n`;
    userPrompt += `Antes que nada, decide las 2 categorías BISAC más NICHE que encajen genuinamente con el libro. Ve 3-4 niveles de profundidad. Estas categorías serán el ancla de coherencia para todo lo demás. ${isNonFiction ? 'Para no-ficción usa árboles tipo "BUSINESS & ECONOMICS / ...", "HEALTH & FITNESS / ...", "SELF-HELP / ...", etc.' : 'Para ficción usa árboles tipo "FICTION / Romance / Contemporary", "FICTION / Fantasy / Epic", "FICTION / Mystery & Detective / Cozy", etc.'}\n\n`;

    userPrompt += `PASO 2 — DISEÑA 7 KEYWORDS CON LA DISTRIBUCIÓN DEL SYSTEM PROMPT\n`;
    userPrompt += `Recuerda: 4-7 palabras cada una, en ${langName}, sin comas/comillas. Slots 1-3 = exact phrases prioritarias. Slots 4-5 = secundarias descriptivas. Slots 6-7 = refuerzo directo de las 2 categorías BISAC que elegiste en el paso 1. Cada keyword debe ser una búsqueda real que un comprador en Amazon ${marketLocale} escribiría.\n\n`;

    userPrompt += `PASO 3 — SUBTÍTULO DIFERENCIADO\n`;
    if (isNonFiction) {
      userPrompt += `NO-FICCIÓN: el subtítulo es CRÍTICO para indexación. Inclúyele 2-3 keywords reales que el lector escribiría buscando solucionar su problema. Promesa concreta + beneficio. Ejemplo de patrón: "Cómo [resolver problema] en [tiempo/método] sin [obstáculo común]". Max 200 chars en ${langName}.\n\n`;
    } else {
      userPrompt += `FICCIÓN: el subtítulo aclara el SUBGÉNERO cuando portada+título no lo dejan claro. NO uses keywords de relleno; usa una etiqueta de subgénero clara. Ejemplos: "Una novela de fantasía épica con dragones", "Un thriller psicológico de suspense doméstico". Si el título ya deja clarísimo el subgénero, usa el subtítulo para añadir gancho emocional. Max 200 chars en ${langName}.\n\n`;
    }

    userPrompt += `PASO 4 — DESCRIPCIÓN: GANCHO + EMBEBIDO DE FRASES-SEÑAL\n`;
    userPrompt += `Escribe la descripción HTML (max 4000 chars con tags) que (a) enganche emocionalmente como contraportada y (b) embebida 4-6 de las frases-señal niche que pusiste en las keywords (o variantes muy cercanas), DE FORMA NATURAL en el cuerpo del texto. ${isNonFiction ? "Estructura sugerida no-ficción: <h4>Promesa potente</h4> + 1-2 párrafos del problema y la solución + <ul> con 4-6 bullets de qué aprenderá el lector + párrafo final con call to read." : "Estructura sugerida ficción: <h4>Hook misterioso de 1 línea</h4> + 2-3 párrafos presentando protagonista y conflicto sin spoilers + cliffhanger emocional final. Opcionalmente <ul> con 3-4 elementos atractivos del libro."} TODO en ${langName}.\n\n`;

    userPrompt += `═══ VERIFICACIÓN FINAL ANTES DE RESPONDER ═══\n`;
    userPrompt += `□ Las 2 categorías, las 7 keywords y la descripción envían LA MISMA SEÑAL (mismas frases-niche aparecen en al menos 2 de las 3 piezas).\n`;
    userPrompt += `□ Ninguna keyword es de 1-3 palabras genéricas.\n`;
    userPrompt += `□ Las keywords slots 6-7 contienen claramente términos de las 2 categorías BISAC elegidas.\n`;
    userPrompt += `□ Subtítulo aplica la regla correcta (${isNonFiction ? "no-ficción: keywords directas" : "ficción: subgénero claro"}).\n`;
    userPrompt += `□ Descripción no contiene frases prohibidas (bestseller, gratis, free, ★, "compra ahora", etc.).\n`;
    userPrompt += `□ Toda la salida está en ${langName}.\n`;
    userPrompt += `□ Solo usaste información de los DATOS REALES; no inventaste nada.\n\n`;

    userPrompt += `Responde SOLO con el JSON estricto definido en el system prompt.`;

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
      cleaned = cleaned.replace(/[",;'"`]+/g, " ");
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
      return cleaned.substring(0, 50);
    }).filter(kw => {
      if (!kw || kw.length < 2) return false;
      const kwLower = kw.toLowerCase();
      const kwWords = kwLower.split(/\s+/).filter(w => w.length > 0);
      if (kwWords.length < 4) return false;
      const allInTitle = kwWords.every(w => titleWords.has(w));
      if (allInTitle) return false;
      return true;
    });
  }

  private detectNonFiction(context: MetadataContext): boolean {
    const haystack = `${context.genre || ""} ${context.tone || ""} ${context.premise || ""}`.toLowerCase();
    const nonFictionMarkers = [
      "non-fiction", "non fiction", "nonfiction", "no ficción", "no-ficción", "no ficcion",
      "ensayo", "essay", "self-help", "autoayuda", "self help",
      "memoir", "memorias", "biografía", "biography", "biografia",
      "business", "negocio", "finanzas", "finance",
      "history", "historia documental",
      "salud", "health", "fitness", "nutrición", "nutricion",
      "guía", "guia", "guide", "manual", "tutorial", "how to", "how-to",
      "cookbook", "recetario", "recetas",
      "psychology", "psicología", "psicologia",
      "self-improvement", "desarrollo personal",
      "spiritual", "espiritual", "religion",
      "travel", "viajes",
      "academic", "académico", "academico",
    ];
    return nonFictionMarkers.some(m => haystack.includes(m));
  }

  private languageName(code: string): string {
    const map: Record<string, string> = {
      es: "ESPAÑOL",
      en: "INGLÉS",
      pt: "PORTUGUÉS",
      fr: "FRANCÉS",
      de: "ALEMÁN",
      it: "ITALIANO",
      ja: "JAPONÉS",
      nl: "NEERLANDÉS",
    };
    return map[code?.toLowerCase()] || code?.toUpperCase() || "ESPAÑOL";
  }

  private marketplaceContext(marketplace: string): string {
    const map: Record<string, string> = {
      "amazon.com": "EE.UU. (.com)",
      "amazon.es": "España (.es)",
      "amazon.com.mx": "México (.com.mx)",
      "amazon.co.uk": "Reino Unido (.co.uk)",
      "amazon.de": "Alemania (.de)",
      "amazon.fr": "Francia (.fr)",
      "amazon.it": "Italia (.it)",
      "amazon.com.br": "Brasil (.com.br)",
      "amazon.co.jp": "Japón (.co.jp)",
      "amazon.ca": "Canadá (.ca)",
      "amazon.com.au": "Australia (.com.au)",
      "amazon.nl": "Países Bajos (.nl)",
      "amazon.in": "India (.in)",
    };
    return map[marketplace?.toLowerCase()] || marketplace || "global";
  }

  private sanitizeSeriesName(name: string | null): string | null {
    if (!name) return null;
    let cleaned = name.replace(/\b(libro|book|vol(umen)?|volume|tomo|parte|part)\s*\.?\s*\d+\b/gi, "").trim();
    cleaned = cleaned.replace(/\s*[,\-–—]\s*$/, "").trim();
    return cleaned || null;
  }
}

export const kdpMetadataGenerator = new KdpMetadataGenerator();
