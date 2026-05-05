// [Fix17] PASO 2A — Generación de metadata KDP por mercado.
// Devuelve title (mantiene original), subtitle, descripción HTML 3800-4000,
// 7 keywords (max 50 chars cada una), 3 categorías oficiales.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";
import type { KdpMarket } from "../../utils/kdp-markets";
import type { ManuscriptAnalysis } from "./manuscript-analyzer";

export interface MarketMetadataInput {
  originalTitle: string;
  market: KdpMarket;
  genre: string;
  analysis: ManuscriptAnalysis;
  pseudonymName?: string;
  seriesName?: string;
  seriesNumber?: number;
}

export interface MarketMetadata {
  title: string;
  subtitle: string;
  description: string;        // HTML
  keywords: string[];         // EXACTLY 7, each <= 50 chars
  categories: string[];       // 3 official KDP category paths
}

export class KdpMarketMetadataGenerator extends BaseAgent {
  constructor() {
    super({
      name: "KdpMarketMetadata",
      role: "Generador de Metadata KDP por Mercado",
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 7000,
      systemPrompt: `You are an expert Amazon KDP conversion specialist AND skilled human copywriter. You deeply understand Amazon's 2024-2025 compliance rules that actively block books for metadata violations. You NEVER use purchase instructions (click, buy, scroll up), competitor mentions (Apple Books, Kobo, Barnes & Noble), bestseller claims, sales claims, prices, brand names (Kindle, iPad, Audible), or any prohibited terms. Your writing is HUMAN — you avoid AI patterns: generic superlatives ("imprescindible", "fascinante"), formulaic lists, clichéd openings ("En un mundo donde…"), robotic transitions ("Además", "Por otro lado") in every paragraph. You write with natural voice variation, conversational fragments, rhetorical questions and visceral emotional language. You ALWAYS respond with strict JSON only, no prose, no markdown fences.`,
    });
  }

  async generate(input: MarketMetadataInput): Promise<MarketMetadata> {
    const { market, originalTitle, genre, analysis } = input;
    const fictionLabel = analysis.isFiction ? "FICTION" : "NON-FICTION";
    const entitiesBlock = analysis.entities.length > 0
      ? `\n═══════════════════════════════════════════════════════════════════
⚠️ MANDATORY CHARACTER/ENTITY NAMES — YOU MUST USE THESE EXACTLY:
${analysis.entities.slice(0, 30).map(e => `• ${e}`).join("\n")}
═══════════════════════════════════════════════════════════════════
🚫 NEVER invent, modify, or hallucinate character names!
🚫 NEVER use placeholder names like "María", "Juan", "Elena" unless they appear above!
✅ ONLY reference the names listed above in your description!\n`
      : "";

    const seriesBlock = input.seriesName
      ? `\nSERIES: "${input.seriesName}"${input.seriesNumber ? ` — book #${input.seriesNumber}` : ""}`
      : "";
    const authorBlock = input.pseudonymName ? `\nAUTHOR: ${input.pseudonymName}` : "";

    const userPrompt = `Generate conversion-optimized Amazon KDP metadata for a ${genre} book targeting ${market.name} (${market.locale}).

CRITICAL CONTEXT - Amazon's A9 Algorithm:
- Prioritizes CONVERSION and SALES VELOCITY over traditional SEO
- First impressions drive click-through rate (CTR), which impacts ranking
- Write ALL content NATIVELY in ${market.locale} — DO NOT translate from another language

BOOK TYPE: ${fictionLabel}
Original Title: ${originalTitle}${authorBlock}${seriesBlock}
Target Audience: ${analysis.targetAudienceInsights.join(" | ")}
Seed Keywords (top 20): ${analysis.seedKeywords.slice(0, 20).join(" | ")}
Themes: ${analysis.themes.join(" | ")}
Literary Tropes: ${analysis.tropes.join(" | ")}
Emotional Hooks: ${analysis.emotionalHooks.join(" | ")}
${entitiesBlock}

REQUIREMENTS:

1. TITLE — Keep "${originalTitle}" exactly. Max 80 chars recommended.

2. SUBTITLE (CRITICAL for conversion):
   - Place the MOST IMPORTANT long-tail keyword phrase at the START.
   - Include a clear PROMISE/TRANSFORMATION.
   - ${analysis.isFiction
        ? "Evoke genre and emotional experience."
        : "Promise a concrete BENEFIT (\"How to X in Y time\")."}
   - Combined title + subtitle MUST be under 200 chars total.
   - MUST be persuasive, NOT keyword stuffing.

3. HTML DESCRIPTION (THIS IS COPYWRITING, NOT A PLOT SUMMARY):
   ⚠️ Do NOT summarize the plot. The description is a SALES PAGE.
   ⚠️ If character names were provided above, USE THEM EXACTLY. NEVER invent names.

   Structure: HOOK → CONFLICT/PROBLEM → STAKES → BENEFITS (bullet list) → CLOSING (no purchase instructions).

   A) HOOK (first 150 chars visible in search results): start with <b>bold text</b> that GRABS attention. Provocative question, shocking statement or emotional trigger.
      Fiction example: "¿Qué harías si descubrieras que tu mejor amigo es un asesino?"
      Non-fiction example: "El 90% de los emprendedores fracasan en su primer año. Este libro te enseña a ser del otro 10%."
   B) CONFLICT/PROBLEM: ${analysis.isFiction
        ? "central conflict without spoilers; make readers FEEL the tension. Use <i>italics</i> for emotional emphasis."
        : "identify the reader's PAIN POINT; make them feel understood. Use <i>italics</i> for emphasis."}
   C) STAKES: ${analysis.isFiction
        ? "what does the protagonist lose if they fail?"
        : "what does the reader lose if they don't act? Create urgency."}
   D) BENEFITS — <ul><li>3-5 compelling reasons to buy</li></ul>.
      ${analysis.isFiction
        ? "Examples: \"Giros inesperados que te mantendrán despierto\", \"Personajes que nunca olvidarás\"."
        : "Examples: \"Estrategias probadas por expertos\", \"Ejercicios prácticos paso a paso\"."}
   E) CLOSING: emotional statement or promise — NO call to action.
      ❌ FORBIDDEN: "Desplaza hacia arriba", "Haz clic", "Compra ahora", "Add to cart"
      ✅ ALLOWED: "Tu aventura comienza aquí", "La verdad te espera entre estas páginas"

   FORMAT RULES:
   - Allowed tags ONLY: <b>, <i>, <u>, <br>, <p>, <h4>, <h5>, <h6>, <ul><li>, <ol><li>
   - MINIMUM 3800 chars, MAXIMUM 4000 chars (USE 95%+ of available space)
   - 5-7 paragraphs with <p></p>
   - Multiple <ul><li> lists with 4-6 items each
   - Add a "Perfect for readers who love…" / "Para lectores que aman…" section
   - NEVER reveal ending or major twists
   ⚠️ If your description is under 3500 chars you are FAILING — expand with more emotional hooks, benefits and details.

4. AMAZON KDP PROHIBITED TERMS — CRITICAL COMPLIANCE (2024-2025):
   IN TITLE/SUBTITLE: ❌ keyword stuffing, ❌ "Bestseller/Best-seller/#1/Número 1/El mejor libro/5 estrellas",
     ❌ "Gratis/Free/Oferta/$0.99/Descuento", ❌ other author names ("Al estilo de Stephen King"),
     ❌ competitor stores ("Apple Books", "Kobo", "Barnes & Noble").
   IN DESCRIPTION: ❌ purchase instructions, ❌ competitor mentions, ❌ time-limited claims,
     ❌ guaranteed health/money promises ("Te hará rico", "Perderás peso garantizado").
   IN BACKEND KEYWORDS: ❌ repeating words from title/subtitle, ❌ trademarks ("Kindle", "iPad", "Audible"),
     ❌ technical labels ("GÉNERO:", "TROPOS:", "AUDIENCIA:"), ❌ competitor author names.

5. BACKEND KEYWORDS — Apply 4-TYPE STRATEGY. EXACTLY 7 phrases (one per KDP field, max 50 chars each):
   - Field 1 GENRE: specific subgenre phrase (e.g., "cozy mystery amateur sleuth")
   - Field 2 AUDIENCE: reader identity (e.g., "libros para mujeres 40+")
   - Field 3 TROPES: literary trope (e.g., "enemies to lovers slow burn")
   - Field 4 SETTING/SOLUTION: atmosphere or problem solved
   - Field 5 EMOTION: emotional benefit (e.g., "feel-good heartwarming")
   - Field 6 SYNONYMS: variations and related terms
   - Field 7 COMP: comparable books/authors readers search

6. CATEGORIES — 3 suggestions: 1 main broad + 2 niche/specific subcategories (less competitive, easier to rank #1). Select from official KDP category paths.

7. HUMANIZATION (CRITICAL FOR AI DETECTION AVOIDANCE):
   - Vary sentence length dramatically (mix 5-word and 25-word sentences).
   - Use conversational fragments: "¿El resultado? Una historia que no podrás soltar."
   - Include rhetorical questions readers ask themselves.
   - Avoid AI tells: generic superlatives, clichéd openings, formulaic lists, robotic transitions.
   - Use specific visceral words ("un nudo en el estómago" instead of "emocionante").
   - Use expressions natural to ${market.locale} speakers (not translated phrases).

RESPONSE FORMAT (strict JSON only):
{
  "title": "${originalTitle}",
  "subtitle": "string (max 200 chars)",
  "description": "string (HTML, 3800-4000 chars)",
  "keywords": ["7 strings, each max 50 chars"],
  "categories": ["3 official KDP category paths"]
}

Write natively in ${market.locale}. Every word should turn a browser into a buyer.`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpMarketMetadata(${market.id}): ${response.error}`);
    const parsed = repairJson(response.content) || {};

    return sanitize({
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : originalTitle,
      subtitle: String(parsed.subtitle || "").trim(),
      description: String(parsed.description || "").trim(),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String) : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories.map(String) : [],
    });
  }
}

import { sanitizeKdpDescription } from "../../utils/kdp-sanitize";

function sanitize(m: MarketMetadata): MarketMetadata {
  m.subtitle = m.subtitle.slice(0, 200);
  m.description = sanitizeKdpDescription(m.description);

  const cleanedKw = m.keywords.map(k => String(k).replace(/["';]/g, "").trim().slice(0, 50)).filter(Boolean);
  while (cleanedKw.length < 7) cleanedKw.push("");
  m.keywords = cleanedKw.slice(0, 7);

  m.categories = m.categories.map(c => String(c).trim().slice(0, 200)).filter(Boolean).slice(0, 3);
  return m;
}

export const kdpMarketMetadataGenerator = new KdpMarketMetadataGenerator();
