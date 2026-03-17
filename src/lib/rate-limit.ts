/**
 * Simple sliding-window rate limiter for Next.js API routes.
 *
 * In serverless environments (Vercel), each instance has its own Map,
 * so this provides per-instance protection. For distributed rate limiting,
 * replace with Upstash Redis (@upstash/ratelimit).
 *
 * Usage:
 *   const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return NextResponse.json({...}, { status: 429 });
 */

interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 10_000;

export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, WindowEntry>();

  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function ensureCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (now >= entry.resetAt) store.delete(key);
      }
      if (store.size === 0 && cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }, config.windowMs);
    if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
      cleanupTimer.unref();
    }
  }

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      if (store.size >= MAX_KEYS) {
        const firstKey = store.keys().next().value;
        if (firstKey) store.delete(firstKey);
      }

      const resetAt = now + config.windowMs;
      store.set(key, { count: 1, resetAt });
      ensureCleanup();
      return { allowed: true, remaining: config.limit - 1, resetAt };
    }

    entry.count += 1;
    if (entry.count > config.limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return {
      allowed: true,
      remaining: config.limit - entry.count,
      resetAt: entry.resetAt,
    };
  }

  return { check };
}

/** Generate API: 5 requests per minute per IP */
export const generateLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60_000,
});

/** General API: 60 requests per minute per IP */
export const apiLimiter = createRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

/** Auth API: 10 requests per minute per IP (prevent brute force) */
export const authLimiter = createRateLimiter({
  limit: 10,
  windowMs: 60_000,
});
