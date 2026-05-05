// [Fix17] PASO 1 — Análisis del manuscrito (KDP Optimizer pipeline).
// Extrae seedKeywords (4-TYPE strategy), themes, entities, tropes,
// targetAudienceInsights, emotionalHooks e isFiction.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";
import { sampleManuscript } from "../../utils/manuscript-sampler";

export interface ManuscriptAnalysis {
  seedKeywords: string[];          // 25-35 long-tail
  themes: string[];                // 3-5 specific
  entities: string[];              // characters / places / objects
  tropes: string[];                // 5-8 literary tropes
  targetAudienceInsights: string[];// 4-6 reader profiles
  emotionalHooks: string[];        // 4-6 emotional promises
  isFiction: boolean;
  wasSampled: boolean;
  originalLength: number;
  sampledLength: number;
}

export interface ManuscriptAnalyzerInput {
  manuscriptText: string;
  language: string;   // "es", "en", ...
  genre: string;
  hintIsFiction?: boolean;
}

export class KdpManuscriptAnalyzer extends BaseAgent {
  constructor() {
    super({
      name: "KdpManuscriptAnalyzer",
      role: "Analista de Manuscrito KDP",
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 6000,
      systemPrompt: `You are an expert Amazon KDP marketing strategist specializing in conversion optimization. Your goal is to identify long-tail, high-intent keywords that attract buyers ready to purchase, not just browsers. You understand that Amazon's A9 algorithm prioritizes sales velocity and conversion rate over traditional SEO metrics.

You ALWAYS respond with strict JSON, no prose, no markdown fences.`,
    });
  }

  async analyze(input: ManuscriptAnalyzerInput): Promise<ManuscriptAnalysis> {
    const sampled = sampleManuscript(input.manuscriptText || "");
    const langName = languageName(input.language);
    const fictionHint = input.hintIsFiction === true ? "FICTION"
                      : input.hintIsFiction === false ? "NON-FICTION"
                      : "AUTO-DETECT";

    const userPrompt = `Analyze this ${input.genre} manuscript written in ${langName} for Amazon KDP optimization using the A9 algorithm principles.

CRITICAL CONTEXT - Amazon's A9 Algorithm:
- Prioritizes CONVERSION and SALES VELOCITY over traditional SEO
- Books that convert searchers into buyers get promoted
- Long-tail keywords (3-5 words) attract HIGH-INTENT buyers
- Generic single words attract browsers, not buyers

IMPORTANT: You are receiving STRATEGIC SAMPLES from the manuscript:
- BEGINNING section (introduction, characters, initial conflict)
- MIDDLE section (development, plot twists)
- ENDING section (climax, resolution)
${sampled.wasSampled ? "" : "(Manuscript was short enough to send fully — no sampling.)"}

BOOK TYPE: ${fictionHint}

Extract the following with DEEP ANALYSIS:

1. SEED KEYWORDS (25-35 diverse LONG-TAIL phrases) — Apply the 4-TYPE STRATEGY:
   TYPE A — GENRE (6-8 phrases): specific subgenre phrases, NOT generic.
     BAD: "Fantasy" | GOOD: "Fantasía urbana con brujas y romance"
   TYPE B — AUDIENCE (5-7 phrases): micro-segmented reader identity.
     BAD: "Para mujeres" | GOOD: "Libros para mujeres emprendedoras de 35+"
   TYPE C — TROPE/TONE (6-8 phrases): specific literary tropes readers search.
     Examples: "enemies to lovers slow burn", "found family adventure"
   TYPE D — SETTING/ATMOSPHERE (fiction) OR SOLUTION/BENEFIT (non-fiction) (6-8 phrases):
     Fiction: "Victorian London gaslight mystery"
     Non-fiction: "Recetas bajas en carbohidratos para principiantes"

2. LITERARY TROPES (5-8): recognizable narrative patterns readers search for.
3. TARGET AUDIENCE INSIGHTS (4-6): WHO would buy this? Be specific (demographics + psychographics + reading prefs).
4. EMOTIONAL HOOKS (4-6): emotional promises and transformations the book delivers.
5. MAIN THEMES (3-5): SPECIFIC themes, NOT generic ones like "love" or "redemption".
6. NAMED ENTITIES: character names with archetype, key locations/settings, important objects/symbols.

Manuscript samples:
${sampled.text}

RESPONSE FORMAT (strict JSON):
{
  "seedKeywords": [25-35 long-tail keyword phrases],
  "themes": [3-5 specific theme strings],
  "entities": [character/place/object strings],
  "tropes": [5-8 trope strings],
  "targetAudienceInsights": [4-6 reader profile strings],
  "emotionalHooks": [4-6 emotional promise strings],
  "isFiction": true|false
}`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpManuscriptAnalyzer: ${response.error}`);
    const parsed = repairJson(response.content) || {};

    return {
      seedKeywords: arr(parsed.seedKeywords).slice(0, 35),
      themes:       arr(parsed.themes).slice(0, 5),
      entities:     arr(parsed.entities).slice(0, 40),
      tropes:       arr(parsed.tropes).slice(0, 8),
      targetAudienceInsights: arr(parsed.targetAudienceInsights).slice(0, 6),
      emotionalHooks: arr(parsed.emotionalHooks).slice(0, 6),
      isFiction: typeof parsed.isFiction === "boolean" ? parsed.isFiction : (input.hintIsFiction ?? true),
      wasSampled: sampled.wasSampled,
      originalLength: sampled.originalLength,
      sampledLength: sampled.sampledLength,
    };
  }
}

function arr(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => typeof x === "string" ? x.trim() : String(x ?? "").trim()).filter(Boolean);
}

function languageName(code: string): string {
  const map: Record<string, string> = {
    es: "Spanish", en: "English", pt: "Portuguese", fr: "French",
    de: "German",  it: "Italian", ja: "Japanese", nl: "Dutch",
  };
  return map[(code || "").toLowerCase()] || "Spanish";
}

export const kdpManuscriptAnalyzer = new KdpManuscriptAnalyzer();
