/**
 * Gemini Request Scheduler & Rate Limiter
 * Ensures all Gemini video extraction calls adhere to strict concurrency limits (maxConcurrent = 1),
 * enforces inter-call delays to avoid per-second bursts, parses 429 RESOURCE_EXHAUSTED retry headers/messages,
 * and manages exponential backoff with jitter and bounded retries.
 */

export interface SchedulerOptions {
  maxConcurrent?: number;
  minDelayBetweenCallsMs?: number;
  maxRetriesPerPass?: number;
  rateLimitBackoffCapMs?: number;
}

export interface ModelCooldownInfo {
  modelId: string;
  isRateLimited: boolean;
  retryAfterSeconds: number;
  cooldownUntil: number; // timestamp ms
  lastError: string;
}

export class GeminiRateLimitError extends Error {
  public readonly passName: string;
  public readonly retryAfterSeconds: number;
  public readonly errorCode: string;
  public readonly modelId?: string;

  constructor(params: {
    passName: string;
    retryAfterSeconds: number;
    message: string;
    modelId?: string;
  }) {
    super(`RATE_LIMITED_PASS: ${params.passName} hit quota limits. Retry after ${params.retryAfterSeconds}s. (${params.message})`);
    this.name = 'GeminiRateLimitError';
    this.passName = params.passName;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.errorCode = 'RATE_LIMIT';
    this.modelId = params.modelId;
  }
}

class GeminiRequestScheduler {
  private maxConcurrent: number;
  private minDelayBetweenCallsMs: number;
  private maxRetriesPerPass: number;
  private rateLimitBackoffCapMs: number;

  private activeRequests = 0;
  private queue: Array<() => void> = [];
  private lastCallCompletedAt = 0;
  private modelCooldowns = new Map<string, ModelCooldownInfo>();

  constructor(options: SchedulerOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 1;
    this.minDelayBetweenCallsMs = options.minDelayBetweenCallsMs ?? 1500;
    this.maxRetriesPerPass = options.maxRetriesPerPass ?? 2;
    this.rateLimitBackoffCapMs = options.rateLimitBackoffCapMs ?? 120000;
  }

  /**
   * Parses retry delay in seconds from Gemini 429 error messages, status, or details.
   */
  public parseRetryDelay(error: any): number {
    if (!error) return 60;

    const errMsg = error?.message || String(error);
    const errDetails = JSON.stringify(error?.error || error?.details || '');
    const combined = `${errMsg} ${errDetails}`;

    // 1. Regex match: retryDelay: 59 seconds / retryDelay: "59s" / retryDelay: 59.5s
    const matchDelay = combined.match(/retryDelay"?\s*:\s*"?([0-9.]+)\s*(?:s|seconds)?/i);
    if (matchDelay && matchDelay[1]) {
      const val = parseFloat(matchDelay[1]);
      if (!isNaN(val) && val > 0) {
        return Math.ceil(val);
      }
    }

    // 2. Regex match: retry in 59s / retry after 59 seconds
    const matchRetryIn = combined.match(/retry\s+(?:in|after)\s+([0-9.]+)\s*(?:s|seconds)?/i);
    if (matchRetryIn && matchRetryIn[1]) {
      const val = parseFloat(matchRetryIn[1]);
      if (!isNaN(val) && val > 0) {
        return Math.ceil(val);
      }
    }

    // 3. Regex match: quota reset in 59s
    const matchResetIn = combined.match(/reset\s+in\s+([0-9.]+)\s*(?:s|seconds)?/i);
    if (matchResetIn && matchResetIn[1]) {
      const val = parseFloat(matchResetIn[1]);
      if (!isNaN(val) && val > 0) {
        return Math.ceil(val);
      }
    }

    // Default safe cooldown
    return 60;
  }

  /**
   * Determines whether an error is a 429 quota exhaustion or rate limit error
   */
  public isRateLimitError(error: any): boolean {
    if (!error) return false;
    if (error instanceof GeminiRateLimitError) return true;
    if (error?.status === 429 || error?.code === 429) return true;

    const msg = (error?.message || String(error)).toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('rate_limit') ||
      msg.includes('too many requests')
    );
  }

  /**
   * Checks whether a model is currently in a known quota cooldown period
   */
  public getModelCooldown(modelId: string): ModelCooldownInfo | null {
    const info = this.modelCooldowns.get(modelId);
    if (!info) return null;

    const remainingMs = info.cooldownUntil - Date.now();
    if (remainingMs <= 0) {
      this.modelCooldowns.delete(modelId);
      return null;
    }

    return {
      ...info,
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  /**
   * Records a quota cooldown for a model
   */
  public recordModelCooldown(modelId: string, retryAfterSeconds: number, errorMsg: string): void {
    const safeSeconds = Math.max(5, Math.min(180, retryAfterSeconds));
    const cooldownUntil = Date.now() + safeSeconds * 1000;
    this.modelCooldowns.set(modelId, {
      modelId,
      isRateLimited: true,
      retryAfterSeconds: safeSeconds,
      cooldownUntil,
      lastError: errorMsg.slice(0, 200),
    });
  }

  /**
   * Clears cooldown status for a model
   */
  public clearModelCooldown(modelId: string): void {
    this.modelCooldowns.delete(modelId);
  }

  /**
   * Helper sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Schedules and executes a Gemini API call through the global serialized queue
   * with inter-call delays, 429 rate limit parsing, jittered exponential backoff,
   * and bounded retries.
   */
  public async schedule<T>(
    operation: () => Promise<T>,
    params: {
      passName: string;
      modelId: string;
      maxRetries?: number;
    }
  ): Promise<T> {
    const { passName, modelId, maxRetries = this.maxRetriesPerPass } = params;

    // Acquire lock in serialized queue
    await this.acquireSlot();

    try {
      // Check if model is in active cooldown
      const existingCooldown = this.getModelCooldown(modelId);
      if (existingCooldown && existingCooldown.retryAfterSeconds > 5) {
        console.warn(`[GeminiScheduler] Model ${modelId} is in cooldown for ${existingCooldown.retryAfterSeconds}s. Waiting before ${passName}...`);
        await this.sleep(existingCooldown.retryAfterSeconds * 1000);
      }

      // Enforce inter-call minimum delay
      const elapsedSinceLastCall = Date.now() - this.lastCallCompletedAt;
      if (elapsedSinceLastCall < this.minDelayBetweenCallsMs) {
        const delay = this.minDelayBetweenCallsMs - elapsedSinceLastCall;
        await this.sleep(delay);
      }

      let attempt = 0;
      let lastErr: any = null;

      while (attempt <= maxRetries) {
        attempt++;
        try {
          console.log(`[GeminiScheduler] Executing ${passName} (Attempt ${attempt}/${maxRetries + 1}) [Model: ${modelId}]`);
          const result = await operation();
          this.lastCallCompletedAt = Date.now();
          // Successful call clears cooldown
          this.clearModelCooldown(modelId);
          return result;
        } catch (err: any) {
          lastErr = err;
          this.lastCallCompletedAt = Date.now();

          const isRateLimit = this.isRateLimitError(err);
          const rawMsg = err?.message || String(err);

          if (isRateLimit) {
            const retrySeconds = this.parseRetryDelay(err);
            this.recordModelCooldown(modelId, retrySeconds, rawMsg);

            console.warn(
              `[GeminiScheduler] 429 RESOURCE_EXHAUSTED in ${passName} (attempt ${attempt}/${maxRetries + 1}). Retry after ${retrySeconds}s.`
            );

            if (attempt <= maxRetries) {
              // Bounded retry: wait parsed retry seconds + jitter
              const jitterMs = 500 + Math.floor(Math.random() * 1000);
              const waitMs = Math.min(this.rateLimitBackoffCapMs, retrySeconds * 1000 + jitterMs);

              console.log(`[GeminiScheduler] Waiting ${Math.round(waitMs / 1000)}s before retry attempt ${attempt + 1}...`);
              await this.sleep(waitMs);
              continue;
            } else {
              // Retries exhausted for this pass: Throw structured GeminiRateLimitError
              throw new GeminiRateLimitError({
                passName,
                retryAfterSeconds: retrySeconds,
                message: rawMsg,
                modelId,
              });
            }
          }

          // Non-rate-limit error (e.g. transient 500/503 network error)
          const isTransient = rawMsg.includes('500') || rawMsg.includes('503') || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('ECONNRESET');
          if (isTransient && attempt <= maxRetries) {
            const backoffMs = 2000 * Math.pow(2, attempt - 1);
            console.warn(`[GeminiScheduler] Transient error in ${passName}: ${rawMsg}. Retrying in ${backoffMs}ms...`);
            await this.sleep(backoffMs);
            continue;
          }

          // Unrecoverable or fatal error
          throw err;
        }
      }

      throw lastErr;
    } finally {
      this.releaseSlot();
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return Promise.resolve();
    }

    return new Promise<void>(resolve => {
      this.queue.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeRequests--;
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Global Singleton Instance
export const geminiScheduler = new GeminiRequestScheduler({
  maxConcurrent: 1, // Strict global concurrency limit: 1 extraction request at a time
  minDelayBetweenCallsMs: 1500, // 1.5s inter-call cooldown
  maxRetriesPerPass: 2, // Max 2 bounded retries per pass
  rateLimitBackoffCapMs: 120000, // Max 2 min wait cap
});
