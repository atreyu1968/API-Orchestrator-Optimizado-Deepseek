// [Fix17] PASO 3 — Kit de Marketing Orgánico.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";
import type { KdpMarket } from "../../utils/kdp-markets";

export interface MarketingKitInput {
  title: string;
  genre: string;
  themes: string[];
  tropes: string[];
  emotionalHooks: string[];
  targetAudienceInsights: string[];
  isFiction: boolean;
  market: KdpMarket;       // primary market for the kit (locale)
}

export interface NicheCategorySuggestion {
  category: string;
  competitiveness: "baja" | "media" | "alta";
  reason: string;
}

export interface ThirtyDayTask {
  day: number;
  task: string;
  platform?: string;
}

export interface MarketingKit {
  tiktokHooks: string[];           // 5
  instagramPosts: string[];        // 5
  pinterestDescriptions: string[]; // 3
  hashtags: { general: string[]; specific: string[] }; // 10 + 10
  leadMagnetIdeas: string[];       // 3
  reviewCTA: string;
  freePromoStrategy: string;
  bookQuotes: string[];            // 5
  nicheCategories: NicheCategorySuggestion[]; // 5
  facebookGroupContent: string[];  // 5
  thirtyDayPlan: ThirtyDayTask[];  // 30
}

export class KdpMarketingKitGenerator extends BaseAgent {
  constructor() {
    super({
      name: "KdpMarketingKit",
      role: "Generador de Kit de Marketing Orgánico",
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 8000,
      systemPrompt: `You are an expert in organic book marketing and social media strategy for independent publishers. You understand BookTok, Bookstagram, and Pinterest algorithms. You create viral-worthy content hooks and engagement-driving strategies. You write natively in the requested language and understand the nuances of that book community. Your goal is to help authors build visibility without paid advertising.

You ALWAYS respond with strict JSON only — no prose, no markdown fences.`,
    });
  }

  async generate(input: MarketingKitInput): Promise<MarketingKit> {
    const { market, title, genre, themes, tropes, emotionalHooks, targetAudienceInsights, isFiction } = input;

    const userPrompt = `Generate a comprehensive ORGANIC MARKETING KIT for a ${genre} book in ${market.locale}.

CONTEXT — Zero-Budget Marketing Strategy:
This kit is for independent publishers using organic (free) marketing strategies. The goal is to convert TIME + KNOWLEDGE into VISIBILITY without paid ads.

BOOK INFORMATION:
- Title: "${title}"
- Type: ${isFiction ? "FICTION" : "NON-FICTION"}
- Themes: ${themes.join(", ")}
- Literary Tropes: ${tropes.join(", ")}
- Emotional Hooks: ${emotionalHooks.join(", ")}
- Target Audience: ${targetAudienceInsights.join(" | ")}

GENERATE:
1. TIKTOK HOOKS (5 viral-worthy hooks) — first 3 seconds critical. Provocative questions, bold statements, pattern interrupts. Specific to THIS book.
2. INSTAGRAM POST IDEAS (5 concepts) — mix of formats: quote graphics, carousels, reels. Include post type + concept + caption hook.
3. PINTEREST DESCRIPTIONS (3 SEO-optimized) — long-tail keywords, mini-sales pitches, reader benefit/promise.
4. HASHTAGS — general (10 broad reach) and specific (10 niche to genre/themes).
5. LEAD MAGNET IDEAS (3) — free content for email capture (specific to THIS book).
6. REVIEW REQUEST CTA — text for end of ebook; warm, non-pushy, personal.
7. FREE PROMO STRATEGY (KDP Select 5-Day Free) — step-by-step plan + where to promote + timeline + post-promo follow-up.
8. QUOTABLE BOOK QUOTES (5) — perfect for quote graphics; can be inferred from themes/hooks.
9. NICHE CATEGORIES (5) for Author Central — additional categories to request via KDP Support; LESS COMPETITIVE deep paths. For each: { category, competitiveness ("baja"|"media"|"alta"), reason }.
10. FACEBOOK GROUP CONTENT (5 posts) — value-first community posts that naturally lead to mentioning the book.
11. 30-DAY MARKETING PLAN (30 daily tasks):
    - Week 1: Foundation (audit web, research keywords, set up tools)
    - Week 2: Content creation (mockups, videos, posts)
    - Week 3: Community building (engagement, outreach)
    - Week 4: Promotion campaign (KDP Select free promo if applicable)
    Each day: { day, task, platform (optional) }. Tasks achievable in 15-30 min.

LANGUAGE: ALL content natively in ${market.locale} with cultural relevance.

RESPONSE FORMAT (strict JSON only):
{
  "tiktokHooks": ["5 strings"],
  "instagramPosts": ["5 strings"],
  "pinterestDescriptions": ["3 strings"],
  "hashtags": { "general": ["10 strings"], "specific": ["10 strings"] },
  "leadMagnetIdeas": ["3 strings"],
  "reviewCTA": "string",
  "freePromoStrategy": "string",
  "bookQuotes": ["5 strings"],
  "nicheCategories": [{ "category": "string", "competitiveness": "baja|media|alta", "reason": "string" }],
  "facebookGroupContent": ["5 strings"],
  "thirtyDayPlan": [{ "day": 1, "task": "string", "platform": "optional string" }]
}`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpMarketingKit: ${response.error}`);
    const parsed = repairJson(response.content) || {};

    const sArr = (v: any, n: number) => Array.isArray(v) ? v.map((x: any) => String(x).trim()).filter(Boolean).slice(0, n) : [];
    const niche: NicheCategorySuggestion[] = Array.isArray(parsed.nicheCategories)
      ? (parsed.nicheCategories as any[]).slice(0, 5).map((c: any) => ({
          category: String(c?.category || "").trim().slice(0, 200),
          competitiveness: ["baja","media","alta"].includes(String(c?.competitiveness)) ? String(c.competitiveness) as any : "media",
          reason: String(c?.reason || "").trim().slice(0, 400),
        })).filter(c => c.category)
      : [];
    const plan: ThirtyDayTask[] = Array.isArray(parsed.thirtyDayPlan)
      ? (parsed.thirtyDayPlan as any[]).slice(0, 30).map((p: any, i: number) => ({
          day: typeof p?.day === "number" ? p.day : i + 1,
          task: String(p?.task || "").trim().slice(0, 500),
          platform: p?.platform ? String(p.platform).trim().slice(0, 60) : undefined,
        })).filter(p => p.task)
      : [];

    return {
      tiktokHooks: sArr(parsed.tiktokHooks, 5),
      instagramPosts: sArr(parsed.instagramPosts, 5),
      pinterestDescriptions: sArr(parsed.pinterestDescriptions, 3),
      hashtags: {
        general: sArr(parsed?.hashtags?.general, 10),
        specific: sArr(parsed?.hashtags?.specific, 10),
      },
      leadMagnetIdeas: sArr(parsed.leadMagnetIdeas, 3),
      reviewCTA: String(parsed.reviewCTA || "").trim().slice(0, 1500),
      freePromoStrategy: String(parsed.freePromoStrategy || "").trim().slice(0, 4000),
      bookQuotes: sArr(parsed.bookQuotes, 5),
      nicheCategories: niche,
      facebookGroupContent: sArr(parsed.facebookGroupContent, 5),
      thirtyDayPlan: plan,
    };
  }
}

export const kdpMarketingKitGenerator = new KdpMarketingKitGenerator();
