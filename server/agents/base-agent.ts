import OpenAI from "openai";
import { calculateRealCost, formatCostForStorage } from "../cost-calculator";
import { storage } from "../storage";

const ai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface AgentResponse {
  content: string;
  thoughtSignature?: string;
  tokenUsage?: TokenUsage;
  timedOut?: boolean;
  error?: string;
}

export type DeepSeekModel = "deepseek-v4-flash" | "deepseek-v4-pro";

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  model?: DeepSeekModel;
  useThinking?: boolean;
  thinkingBudget?: number;
  maxOutputTokens?: number;
  includeThoughts?: boolean;
}

const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

const NETWORK_ERROR_MAX_RETRIES = 5;
const NETWORK_ERROR_DELAYS_MS = [10000, 20000, 30000, 45000, 60000];

const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_DELAYS_MS = [30000, 60000, 90000, 120000, 180000];

function isNetworkError(error: any): boolean {
  const message = (error?.message || String(error)).toLowerCase();
  return message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("enotfound");
}

function isRateLimitError(error: any): boolean {
  const errorStr = String(error?.message || error || "");
  const status = (error as any)?.status;
  return status === 429 ||
         errorStr.includes("RATELIMIT_EXCEEDED") ||
         errorStr.includes("429") ||
         errorStr.includes("Rate limit") ||
         errorStr.includes("rate limit");
}

const activeAbortControllers = new Map<number, AbortController>();

export function registerProjectAbortController(projectId: number): AbortController {
  const controller = new AbortController();
  activeAbortControllers.set(projectId, controller);
  return controller;
}

export function cancelProject(projectId: number): boolean {
  const controller = activeAbortControllers.get(projectId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(projectId);
    return true;
  }
  return false;
}

export function isProjectCancelled(projectId: number): boolean {
  const controller = activeAbortControllers.get(projectId);
  return controller?.signal.aborted ?? false;
}

export async function isProjectCancelledFromDb(projectId: number): Promise<boolean> {
  if (isProjectCancelled(projectId)) {
    return true;
  }

  try {
    const project = await storage.getProject(projectId);
    if (!project) return true;

    const cancelledStatuses = ["idle", "cancelled", "completed", "paused"];
    if (cancelledStatuses.includes(project.status)) {
      console.log(`[BaseAgent] Project ${projectId} cancelled via DB status: ${project.status}`);
      return true;
    }
  } catch (error) {
    console.error(`[BaseAgent] Error checking project status:`, error);
  }

  return false;
}

export function clearProjectAbortController(projectId: number): void {
  activeAbortControllers.delete(projectId);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${operationName} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected ai = ai;
  protected timeoutMs = DEFAULT_TIMEOUT_MS;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get role(): string {
    return this.config.role;
  }

  protected async generateContent(prompt: string, projectId?: number, options?: { temperature?: number }): Promise<AgentResponse> {
    let lastError: Error | null = null;
    const temperature = options?.temperature ?? 1.0;
    let rateLimitAttempts = 0;
    let networkErrorAttempts = 0;

    const maxAttempts = MAX_RETRIES + RATE_LIMIT_MAX_RETRIES + NETWORK_ERROR_MAX_RETRIES + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (projectId && isProjectCancelled(projectId)) {
        return {
          content: "",
          error: "CANCELLED: Project generation was cancelled",
          timedOut: false,
        };
      }

      try {
        const modelToUse = this.config.model || "deepseek-v4-flash";
        const useThinking = this.config.useThinking === true;

        const defaultMaxOutput = 32768;
        const maxOutput = this.config.maxOutputTokens || defaultMaxOutput;

        // DeepSeek V4 thinking mode: enabled by default. We control it explicitly per agent.
        // - useThinking=true  -> thinking enabled, reasoning_effort = "high" (or "max" if thinkingBudget >= 8192)
        // - useThinking=false -> thinking disabled (most agents — keeps cost & latency low)
        const reasoningEffort: "high" | "max" = (this.config.thinkingBudget && this.config.thinkingBudget >= 8192) ? "max" : "high";

        const startTime = Date.now();
        console.log(`[${this.config.name}] Starting API call (attempt ${attempt + 1}, model=${modelToUse}, maxOut=${maxOutput}, thinking=${useThinking})...`);

        // Build request. `thinking` and `reasoning_effort` are DeepSeek-specific extensions
        // not in the official OpenAI types — cast to any to inject them.
        const requestBody: any = {
          model: modelToUse,
          messages: [
            { role: "system", content: this.config.systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: maxOutput,
          stream: false,
        };

        if (useThinking) {
          requestBody.thinking = { type: "enabled" };
          requestBody.reasoning_effort = reasoningEffort;
          // Note: DeepSeek silently ignores temperature/top_p in thinking mode.
        } else {
          requestBody.thinking = { type: "disabled" };
          requestBody.temperature = temperature;
          requestBody.top_p = 0.95;
        }

        const generatePromise = this.ai.chat.completions.create(requestBody);

        const response: any = await withTimeout(
          generatePromise,
          this.timeoutMs,
          `${this.config.name} AI generation`
        );

        const elapsedMs = Date.now() - startTime;
        console.log(`[${this.config.name}] API call completed in ${Math.round(elapsedMs / 1000)}s`);

        const choice = response.choices?.[0];
        const content = choice?.message?.content || "";
        const thoughtSignature = choice?.message?.reasoning_content || "";

        const usage = response.usage || {};
        const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;
        const tokenUsage: TokenUsage = {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: Math.max((usage.completion_tokens || 0) - reasoningTokens, 0),
          thinkingTokens: reasoningTokens,
        };

        if (projectId && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0 || tokenUsage.thinkingTokens > 0)) {
          const costs = calculateRealCost(
            modelToUse,
            tokenUsage.inputTokens,
            tokenUsage.outputTokens,
            tokenUsage.thinkingTokens
          );

          try {
            await storage.createAiUsageEvent({
              projectId,
              agentName: this.config.name,
              model: modelToUse,
              inputTokens: tokenUsage.inputTokens,
              outputTokens: tokenUsage.outputTokens,
              thinkingTokens: tokenUsage.thinkingTokens,
              inputCostUsd: formatCostForStorage(costs.inputCost),
              outputCostUsd: formatCostForStorage(costs.outputCost + costs.thinkingCost),
              totalCostUsd: formatCostForStorage(costs.totalCost),
              operation: "generate",
            });
          } catch (err) {
            console.error(`[${this.config.name}] Failed to log AI usage event:`, err);
          }
        }

        return { content, thoughtSignature, tokenUsage };
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || String(error);

        if (isRateLimitError(error)) {
          rateLimitAttempts++;
          if (rateLimitAttempts <= RATE_LIMIT_MAX_RETRIES) {
            const delayMs = RATE_LIMIT_DELAYS_MS[Math.min(rateLimitAttempts - 1, RATE_LIMIT_DELAYS_MS.length - 1)];
            console.log(`[${this.config.name}] Rate limit hit (attempt ${rateLimitAttempts}/${RATE_LIMIT_MAX_RETRIES}). Waiting ${delayMs / 1000}s before retry...`);
            await sleep(delayMs);
            continue;
          }
          console.error(`[${this.config.name}] Rate limit exceeded after ${RATE_LIMIT_MAX_RETRIES} retries`);
          return {
            content: "",
            error: `RATE_LIMIT: ${errorMessage}`,
            timedOut: false,
          };
        }

        if (isNetworkError(error)) {
          networkErrorAttempts++;
          if (networkErrorAttempts <= NETWORK_ERROR_MAX_RETRIES) {
            const delayMs = NETWORK_ERROR_DELAYS_MS[Math.min(networkErrorAttempts - 1, NETWORK_ERROR_DELAYS_MS.length - 1)];
            console.log(`[${this.config.name}] Network error (attempt ${networkErrorAttempts}/${NETWORK_ERROR_MAX_RETRIES}): ${errorMessage}. Waiting ${delayMs / 1000}s before retry...`);
            await sleep(delayMs);
            continue;
          }
          console.error(`[${this.config.name}] Network error persists after ${NETWORK_ERROR_MAX_RETRIES} retries: ${errorMessage}`);
          return {
            content: "",
            error: `NETWORK_ERROR: ${errorMessage}`,
            timedOut: false,
          };
        }

        console.error(`[${this.config.name}] Attempt ${attempt + 1} failed:`, errorMessage);

        if (errorMessage.includes("not found") || errorMessage.includes("not supported") ||
            errorMessage.includes("does not exist") || errorMessage.includes("invalid model") ||
            errorMessage.includes("is not available") || errorMessage.includes("INVALID_ARGUMENT")) {
          console.error(`[${this.config.name}] ❌ MODEL ERROR: Model "${this.config.model}" may not be available. Error: ${errorMessage}`);
          return {
            content: "",
            error: `MODEL_ERROR: ${errorMessage}`,
            timedOut: false,
          };
        }

        if (errorMessage.startsWith("TIMEOUT:")) {
          if (attempt < MAX_RETRIES) {
            console.log(`[${this.config.name}] Retrying after timeout...`);
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          return {
            content: "",
            error: errorMessage,
            timedOut: true,
          };
        }

        if (attempt < MAX_RETRIES) {
          console.log(`[${this.config.name}] Retrying after error...`);
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
      }
    }

    return {
      content: "",
      error: lastError?.message || "Unknown error after all retries",
      timedOut: false,
    };
  }

  async execute(input: any): Promise<AgentResponse> {
    throw new Error(`${this.config.name} does not implement execute()`);
  }
}
