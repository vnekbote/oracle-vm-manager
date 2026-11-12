export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, nowMs: number = Date.now()): RateLimitResult {
    const cutoff = nowMs - this.windowMs;
    const existing = this.buckets.get(key);
    const recent = existing
      ? existing.timestamps.filter((ts) => ts > cutoff)
      : [];

    if (recent.length >= this.maxRequests) {
      const oldestInWindow = recent[0] ?? nowMs;
      const retryAfterMs = Math.max(1000, oldestInWindow + this.windowMs - nowMs);
      this.buckets.set(key, { timestamps: recent });
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    recent.push(nowMs);
    this.buckets.set(key, { timestamps: recent });
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - recent.length),
      retryAfterSeconds: 0,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}

// 5 login attempts per 15 minutes per IP/username key
export const loginRateLimiter = new SlidingWindowRateLimiter(5, 15 * 60 * 1000);

// 30 mutation requests per minute per session/IP
export const mutationRateLimiter = new SlidingWindowRateLimiter(30, 60 * 1000);

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

