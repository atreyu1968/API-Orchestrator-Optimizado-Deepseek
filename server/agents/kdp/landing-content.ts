// [Fix17] PASO 4 — Contenido para landing page del autor.

import { BaseAgent } from "../base-agent";
import { repairJson } from "../../utils/json-repair";

export interface LandingInput {
  bookTitle: string;
  author?: string;
  genre: string;
  themes: string[];
  description?: string;
  manuscriptSample: string; // first 3000 chars from sampler
  language: string;         // locale (e.g., "Español")
}

export interface LandingContent {
  tagline: string;
  extendedSynopsis: string;       // markdown 400-600 words
  featuredCharacteristics: string[]; // 5-7
  memorableQuotes: string[];      // 4-6
  pressNotes: string;             // 200-300 words
}

export class KdpLandingContentGenerator extends BaseAgent {
  constructor() {
    super({
      name: "KdpLandingContent",
      role: "Generador de Contenido Landing Page",
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 5000,
      systemPrompt: `You are an expert book marketing copywriter and publishing professional. You craft compelling, emotionally resonant content that sells books. You understand reader psychology and what makes book marketing content convert. You write natively in any language with authentic cultural nuance. Your landing page content creates desire and urgency while maintaining literary quality.

You ALWAYS respond with strict JSON only — no prose, no markdown fences around the JSON.`,
    });
  }

  async generate(input: LandingInput): Promise<LandingContent> {
    const { bookTitle, author, genre, themes, description, manuscriptSample, language } = input;
    const userPrompt = `Generate compelling landing page content for a book in ${language}.

BOOK INFORMATION:
- Title: "${bookTitle}"
- Author: "${author || "—"}"
- Genre: ${genre}
- Themes: ${themes.join(", ")}
- Description: ${(description || "").replace(/<[^>]+>/g, "").slice(0, 800)}

MANUSCRIPT EXCERPT (for extracting authentic quotes):
${(manuscriptSample || "").slice(0, 3000)}

GENERATE:
1. TAGLINE (10-15 words max) — powerful, memorable. Movie poster style.
   Ex: "Donde termina la esperanza, comienza la supervivencia"
2. EXTENDED SYNOPSIS (Markdown, 400-600 words) with structure:
   ## El Comienzo
   [Hook + setting]

   ## El Conflicto
   [Main tension and stakes]

   ## Lo Que Está en Juego
   [Why readers should care]
   Use literary, evocative language. Create desire without spoilers. End with a compelling hook.
3. FEATURED CHARACTERISTICS (5-7 bullet points) — key selling points and unique features.
4. MEMORABLE QUOTES (4-6) — extract or craft impactful quotes from the manuscript. Standalone powerful sentences.
5. PRESS NOTES (200-300 words) — professional promotional material:
   * Author positioning
   * Comparable titles ("Perfecto para fans de…")
   * Target reader description
   * Unique selling proposition
   * Potential endorsement-style quotes

LANGUAGE: ALL content natively in ${language}. Do not translate.

RESPONSE FORMAT (strict JSON only):
{
  "tagline": "string",
  "extendedSynopsis": "string (markdown)",
  "featuredCharacteristics": ["5-7 strings"],
  "memorableQuotes": ["4-6 strings"],
  "pressNotes": "string (200-300 words)"
}`;

    const response = await this.generateContent(userPrompt);
    if (response.error) throw new Error(`KdpLandingContent: ${response.error}`);
    const parsed = repairJson(response.content) || {};

    return {
      tagline: String(parsed.tagline || "").trim().slice(0, 250),
      extendedSynopsis: String(parsed.extendedSynopsis || "").trim().slice(0, 8000),
      featuredCharacteristics: Array.isArray(parsed.featuredCharacteristics)
        ? parsed.featuredCharacteristics.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 7) : [],
      memorableQuotes: Array.isArray(parsed.memorableQuotes)
        ? parsed.memorableQuotes.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 6) : [],
      pressNotes: String(parsed.pressNotes || "").trim().slice(0, 3000),
    };
  }
}

export const kdpLandingContentGenerator = new KdpLandingContentGenerator();
