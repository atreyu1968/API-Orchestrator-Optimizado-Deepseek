// Real pricing per model (per 1M tokens)
// Source: Google AI pricing — updated March 2026

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  thinkingPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gemini-2.5-flash": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    thinkingPerMillion: 3.50,
  },
  "gemini-2.0-flash": {
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
    thinkingPerMillion: 0,
  },
  "gemini-2.5-pro": {
    inputPerMillion: 1.25,
    outputPerMillion: 10.00,
    thinkingPerMillion: 10.00,
  },
  "gemini-3-flash-preview": {
    inputPerMillion: 0.50,
    outputPerMillion: 3.00,
    thinkingPerMillion: 3.50,
  },
  "default": {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
    thinkingPerMillion: 3.50,
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
  "ghostwriter": "gemini-3-flash-preview",
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
