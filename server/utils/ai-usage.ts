/**
 * [Fix80] Util compartido para registrar consumo de tokens de llamadas
 * crudas a la API de DeepSeek (las que NO pasan por BaseAgent). Antes vivía
 * inline en `server/routes.ts`; lo extrajimos para que otros módulos
 * (como `series-milestones-extractor.ts`) puedan registrarse en
 * `ai_usage_events` sin romper imports circulares.
 */
import { storage } from "../storage";
import { calculateRealCost, formatCostForStorage } from "../cost-calculator";

export async function recordRawAiUsage(
  response: any,
  opts: { agentName: string; model: string; projectId?: number | null; operation?: string }
): Promise<void> {
  try {
    const usage = response?.usage || {};
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = Math.max((usage.completion_tokens || 0) - reasoningTokens, 0);
    const thinkingTokens = reasoningTokens;
    if (inputTokens === 0 && outputTokens === 0 && thinkingTokens === 0) return;
    const costs = calculateRealCost(opts.model, inputTokens, outputTokens, thinkingTokens);
    await storage.createAiUsageEvent({
      projectId: opts.projectId ?? null,
      agentName: opts.agentName,
      model: opts.model,
      inputTokens,
      outputTokens,
      thinkingTokens,
      inputCostUsd: formatCostForStorage(costs.inputCost),
      outputCostUsd: formatCostForStorage(costs.outputCost + costs.thinkingCost),
      totalCostUsd: formatCostForStorage(costs.totalCost),
      operation: opts.operation || "generate",
    });
  } catch (err) {
    console.error(`[recordRawAiUsage:${opts.agentName}] Failed to log AI usage event:`, err);
  }
}
