// [Fix17] PASO 2C — SEO landing page por mercado.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";
import type { KdpMarket } from "../../utils/kdp-markets";

export interface SeoInput {
  bookTitle: string;
  subtitle?: string;
  genre: string;
  themes: string[];
  description?: string;
  market: KdpMarket;
}

export interface SeoMetadata {
  seoTitle: string;       // 50-60 chars
  seoDescription: string; // 150-160 chars
  seoKeywords: string[];  // 8-12
  ogTitle: string;        // 60-70 chars
  ogDescription: string;  // 100-150 chars
}

export class KdpSeoGenerator extends BaseAgent {
  constructor() {
    super({
      name: "KdpSeoGenerator",
      role: "Generador SEO Landing KDP",
      model: "deepseek-v4-flash",
      useThinking: false,
      maxOutputTokens: 1500,
      systemPrompt: `You are an expert in SEO optimization for book landing pages and author websites. You understand Google's search algorithms, meta tag best practices, and Open Graph optimization for social sharing. You write compelling, keyword-rich meta content that ranks well and drives clicks. You write natively in the requested language. You ALWAYS respond with strict JSON only.`,
    });
  }

  async generate(input: SeoInput): Promise<SeoMetadata> {
    const { market, bookTitle, subtitle, genre, themes, description } = input;
    const userPrompt = `Generate SEO metadata for a book landing page in ${market.locale}.

BOOK INFORMATION:
- Title: "${bookTitle}"
- Subtitle: "${subtitle || ""}"
- Genre: ${genre}
- Themes: ${themes.join(", ")}
- Book Description (for context): ${(description || "").replace(/<[^>]+>/g, "").slice(0, 500)}…

GENERATE:
1. SEO TITLE (50-60 chars): "[Book Title] — [Genre/Hook]" or "[Book Title]: [Compelling Promise]". Compelling for Google SERP.
2. SEO DESCRIPTION (150-160 chars): meta description; primary keywords naturally; end with hook/CTA.
3. SEO KEYWORDS (8-12): mix of head terms + long-tail.
4. OPEN GRAPH TITLE (60-70 chars): for Facebook/LinkedIn shares; can be more descriptive.
5. OPEN GRAPH DESCRIPTION (100-150 chars): for social previews; more emotional/casual.

LANGUAGE: ALL natively in ${market.locale}.

RESPONSE FORMAT (strict JSON):
{
  "seoTitle": "string (50-60)",
  "seoDescription": "string (150-160)",
  "seoKeywords": ["8-12 strings"],
  "ogTitle": "string (60-70)",
  "ogDescription": "string (100-150)"
}`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpSeoGenerator(${market.id}): ${response.error}`);
    const parsed = repairJson(response.content) || {};
    return {
      seoTitle: String(parsed.seoTitle || "").trim().slice(0, 80),
      seoDescription: String(parsed.seoDescription || "").trim().slice(0, 200),
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 12) : [],
      ogTitle: String(parsed.ogTitle || "").trim().slice(0, 100),
      ogDescription: String(parsed.ogDescription || "").trim().slice(0, 200),
    };
  }
}

export const kdpSeoGenerator = new KdpSeoGenerator();
