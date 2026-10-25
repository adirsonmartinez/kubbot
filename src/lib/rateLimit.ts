// Request limits for the public API routes, so nobody can burn the owner's keys. In memory (one server):
// a window per client, a ceiling for the whole server per minute (the spend circuit-breaker) and a daily
// budget per client and for the whole server. Expired entries are evicted; the map is never wiped.
// No React, no I/O.

export type LimitVerdict = "ok" | "rate" | "busy";

// The client address. Render (and most proxies) APPEND the real peer to x-forwarded-for, so the rightmost
// hop is the one the platform wrote; the leftmost is whatever the client chose to send.
export function clientKey(headers: Headers): string {
  const hop = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const real = headers.get("x-real-ip")?.trim();
  return (hop || real || "local").slice(0, 64);
}

// Counts events per key in fixed windows. At `maxKeys` the expired keys go first, then the oldest.
export class WindowCounter {
  private seen = new Map<string, { count: number; resetAt: number }>();
  private windowMs: number;
  private max: number;
  private maxKeys: number;

  constructor(windowMs: number, max: number, maxKeys = 5000) {
    this.windowMs = windowMs;
    this.max = max;
    this.maxKeys = maxKeys;
  }

  // Counts one event; true while the key is within its allowance
  hit(key: string, now: number): boolean {
    const entry = this.seen.get(key);
    if (!entry || entry.resetAt <= now) {
      this.seen.delete(key);
      this.evict(now);
      this.seen.set(key, { count: 1, resetAt: now + this.windowMs });
      return this.max >= 1;
    }
    entry.count++;
    return entry.count <= this.max;
  }

  private evict(now: number) {
    if (this.seen.size < this.maxKeys) return;
    for (const [k, v] of this.seen) if (v.resetAt <= now) this.seen.delete(k);
    for (const k of this.seen.keys()) {
      if (this.seen.size < this.maxKeys) break;
      this.seen.delete(k); // oldest first (insertion order)
    }
  }

  get size() {
    return this.seen.size;
  }
}

export type LimiterOptions = {
  perMinute: number; // per client
  perDay: number; // per client
  globalPerMinute: number; // the whole server: the circuit-breaker
  globalPerDay: number;
  maxKeys?: number;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const GLOBAL = "*";

export function createLimiter(options: LimiterOptions) {
  const minute = new WindowCounter(MINUTE, options.perMinute, options.maxKeys);
  const day = new WindowCounter(DAY, options.perDay, options.maxKeys);
  const globalMinute = new WindowCounter(MINUTE, options.globalPerMinute, 1);
  const globalDay = new WindowCounter(DAY, options.globalPerDay, 1);
  // "busy" = the server as a whole is over its ceiling; "rate" = this client is
  return {
    check(key: string, now = Date.now()): LimitVerdict {
      // The client first, so one abusive address uses up its own allowance before the shared ceiling
      if (!minute.hit(key, now) || !day.hit(key, now)) return "rate";
      if (!globalMinute.hit(GLOBAL, now) || !globalDay.hit(GLOBAL, now)) return "busy";
      return "ok";
    },
  };
}

export type Limiter = ReturnType<typeof createLimiter>;
