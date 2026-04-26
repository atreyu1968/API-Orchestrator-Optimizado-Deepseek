export class AIRateLimiter {
  private static instance: AIRateLimiter;
  private lastRequestTime: number = 0;
  private minDelayMs: number = 5000;
  private currentBackoffMs: number = 5000;
  private maxBackoffMs: number = 300000;
  private consecutiveErrors: number = 0;
  private isLocked: boolean = false;
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  private constructor() {}

  static getInstance(): AIRateLimiter {
    if (!AIRateLimiter.instance) {
      AIRateLimiter.instance = new AIRateLimiter();
    }
    return AIRateLimiter.instance;
  }

  private async processQueue(): Promise<void> {
    if (this.isLocked || this.queue.length === 0) return;
    
    this.isLocked = true;
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    }
  }

  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      if (!this.isLocked) {
        this.processQueue();
      }
    });
  }

  release(success: boolean): void {
    if (success) {
      this.consecutiveErrors = 0;
      this.currentBackoffMs = this.minDelayMs;
    } else {
      this.consecutiveErrors++;
      this.currentBackoffMs = Math.min(
        this.currentBackoffMs * 2 + Math.random() * 1000,
        this.maxBackoffMs
      );
    }
    
    this.lastRequestTime = Date.now();
    this.isLocked = false;
    
    setTimeout(() => {
      this.processQueue();
    }, this.currentBackoffMs);
  }

  getDelayMs(): number {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const requiredDelay = this.currentBackoffMs - timeSinceLastRequest;
    return Math.max(0, requiredDelay);
  }

  getStatus(): { consecutiveErrors: number; currentBackoffMs: number; queueLength: number } {
    return {
      consecutiveErrors: this.consecutiveErrors,
      currentBackoffMs: this.currentBackoffMs,
      queueLength: this.queue.length,
    };
  }

  async waitForSlot(): Promise<void> {
    const delay = this.getDelayMs();
    if (delay > 0) {
      console.log(`[RateLimiter] Waiting ${Math.round(delay / 1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await this.acquire();
  }

  reset(): void {
    this.consecutiveErrors = 0;
    this.currentBackoffMs = this.minDelayMs;
    this.isLocked = false;
    this.queue = [];
  }
}

export const aiRateLimiter = AIRateLimiter.getInstance();
