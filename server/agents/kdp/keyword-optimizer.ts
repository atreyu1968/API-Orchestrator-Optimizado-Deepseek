// [Fix17] PASO 2B — Optimización de keywords nativa por mercado.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";
import type { KdpMarket } from "../../utils/kdp-markets";

export interface KeywordOptimizerInput {
  baseKeywords: string[];
  market: KdpMarket;
  genre: string;
  titleAndSubtitle?: string;  // For prohibited-repeat check
}

export class KdpKeywordOptimizer extends BaseAgent {
  constructor() {
    super({
      name: "KdpKeywordOptimizer",
      role: "Optimizador de Keywords KDP",
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 1500,
      systemPrompt: `You are an expert in Amazon KDP backend keyword optimization with deep knowledge of 2024-2025 compliance rules. You understand the 'bag of words' indexing model and prioritize long-tail, high-intent keywords. You NEVER use prohibited terms (bestseller, free, brand names, words from title, technical labels). You generate keywords natively in each language based on local search behavior — phrased like genuine reader searches, not robotic keyword lists. Your writing feels human and authentic, avoiding AI patterns. Your goal is conversion optimization while maintaining full Amazon compliance.

You ALWAYS respond with strict JSON only.`,
    });
  }

  async optimize(input: KeywordOptimizerInput): Promise<string[]> {
    const { market, baseKeywords, genre, titleAndSubtitle } = input;
    const userPrompt = `Generate market-optimized backend keywords for Amazon KDP ${market.name} marketplace (${market.locale}).

CRITICAL CONTEXT — Backend Keyword Strategy:
- These go into KDP's 7 backend keyword fields (50 characters each max)
- Amazon uses a "BAG OF WORDS" indexing model — logical order is NOT required
- Words from title/subtitle are ALREADY indexed — repeating them wastes space
- Focus on CONVERSION: high-intent buyer keywords, not casual browser terms
- Generate NATIVELY in ${market.locale} — understand local search patterns and idioms

Genre: ${genre}
Base Keywords: ${baseKeywords.slice(0, 15).join(" | ")}
${titleAndSubtitle ? `Title+Subtitle (DO NOT REPEAT WORDS FROM HERE): ${titleAndSubtitle}` : ""}

REQUIREMENTS:
1. EXACTLY 7 KEYWORD PHRASES (one per KDP field), each max 50 chars. Multiple keywords inside one field can be comma-separated if they fit.
2. DIVERSITY — each field targets a different aspect:
   Field 1: Specific subgenre phrases
   Field 2: Character archetype phrases
   Field 3: Setting-based phrases
   Field 4: Emotional tone phrases
   Field 5: Reader situation phrases ("libros para leer en verano, playa")
   Field 6: Variations & synonyms
   Field 7: Additional relevant terms
3. NATIVE LANGUAGE — think like a ${market.locale} reader searching on Amazon. Use local idioms, regional spelling variations, cultural nuances. DO NOT just translate.
4. PROHIBITED (Amazon will block the book):
   ❌ Words from title/subtitle (wasted space)
   ❌ "bestseller", "best seller", "#1", "número 1"
   ❌ "free", "gratis", "oferta", "descuento"
   ❌ Brand names: "Kindle", "iPad", "Audible", "Kobo"
   ❌ Competitor author names
   ❌ Technical labels: "GÉNERO:", "TROPOS:", "AUDIENCIA:"
5. BUYER INTENT FOCUS — long, specific phrases.
6. HUMANIZATION — natural reader search language, not robotic keyword lists. Mix short and long phrases.

RESPONSE FORMAT (strict JSON):
{ "keywords": ["7 strings, each max 50 chars"] }`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpKeywordOptimizer(${market.id}): ${response.error}`);
    const parsed = repairJson(response.content) || {};
    let kws: string[] = Array.isArray(parsed.keywords) ? parsed.keywords.map((k: any) => String(k).trim()) : [];
    kws = kws.map(k => k.replace(/["';]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 50)).filter(Boolean);
    while (kws.length < 7) kws.push("");
    return kws.slice(0, 7);
  }
}

export const kdpKeywordOptimizer = new KdpKeywordOptimizer();
