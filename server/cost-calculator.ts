// Real pricing per model (per 1M tokens)
// Source: Google AI pricing as of Jan 2025

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  thinkingPerMillion: number; // Some models have separate thinking costs
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 3 Pro Preview - Most expensive, best quality
  "gemini-3-pro-preview": {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    thinkingPerMillion: 3.0, // Thinking tokens billed separately at lower rate
  },
  // Gemini 3 Flash - Fast, medium cost
  "gemini-3-flash": {
    inputPerMillion: 0.50,
    outputPerMillion: 3.0,
    thinkingPerMillion: 1.5,
  },
  // Gemini 2.5 Flash - Cheapest option
  "gemini-2.5-flash": {
    inputPerMillion: 0.30,
    outputPerMillion: 2.5,
    thinkingPerMillion: 1.0,
  },
  // Gemini 2.0 Flash - Legacy
  "gemini-2.0-flash": {
    inputPerMillion: 0.30,
    outputPerMillion: 2.5,
    thinkingPerMillion: 1.0,
  },
  // Default fallback
  "default": {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    thinkingPerMillion: 2.0,
  },
};

export function calculateRealCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number = 0
): { inputCost: number; outputCost: number; thinkingCost: number; totalCost: number } {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["default"];
  
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const thinkingCost = (thinkingTokens / 1_000_000) * pricing.thinkingPerMillion;
  const totalCost = inputCost + outputCost + thinkingCost;
  
  return {
    inputCost: Math.round(inputCost * 1000000) / 1000000,
    outputCost: Math.round(outputCost * 1000000) / 1000000,
    thinkingCost: Math.round(thinkingCost * 1000000) / 1000000,
    totalCost: Math.round(totalCost * 1000000) / 1000000,
  };
}

export function formatCostForStorage(cost: number): string {
  return cost.toFixed(6);
}

// Agent to model mapping for reference
export const AGENT_MODEL_MAPPING: Record<string, string> = {
  "architect": "gemini-2.5-flash",
  "ghostwriter": "gemini-2.5-flash",
  "editor": "gemini-2.5-flash",
  "copyeditor": "gemini-2.5-flash",
  "final-reviewer": "gemini-2.5-flash",
  "continuity-sentinel": "gemini-2.5-flash",
  "voice-auditor": "gemini-2.5-flash",
  "semantic-detector": "gemini-2.5-flash",
  "translator": "gemini-2.5-flash",
  "arc-validator": "gemini-2.5-flash",
  "series-thread-fixer": "gemini-2.5-flash",
  "restructurer": "gemini-2.5-flash",
  "chapter-expander": "gemini-2.5-flash",
  "manuscript-analyzer": "gemini-2.0-flash",
};
