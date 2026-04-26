// Real pricing per model (per 1M tokens)
// Source: DeepSeek API pricing — updated April 2026

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  thinkingPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "deepseek-v4-flash": {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    thinkingPerMillion: 0.28, // DeepSeek bills reasoning tokens at the same output rate
  },
  "deepseek-v4-pro": {
    inputPerMillion: 1.74,
    outputPerMillion: 3.48,
    thinkingPerMillion: 3.48,
  },
  // Legacy Gemini entries kept for historical AI usage events stored in DB
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
  "gemini-3.1-flash-lite-preview": {
    inputPerMillion: 0.25,
    outputPerMillion: 1.50,
    thinkingPerMillion: 1.50,
  },
  "default": {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    thinkingPerMillion: 0.28,
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
  "architect": "deepseek-v4-flash",
  "ghostwriter": "deepseek-v4-flash",
  "editor": "deepseek-v4-flash",
  "copyeditor": "deepseek-v4-flash",
  "final-reviewer": "deepseek-v4-flash",
  "continuity-sentinel": "deepseek-v4-flash",
  "voice-auditor": "deepseek-v4-flash",
  "semantic-detector": "deepseek-v4-flash",
  "translator": "deepseek-v4-flash",
  "arc-validator": "deepseek-v4-flash",
  "series-thread-fixer": "deepseek-v4-flash",
  "restructurer": "deepseek-v4-flash",
  "chapter-expander": "deepseek-v4-flash",
  "manuscript-analyzer": "deepseek-v4-flash",
};
