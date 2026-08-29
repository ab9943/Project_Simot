// Simple in-memory fixed-window rate limiter, keyed by an arbitrary string
// (e.g. session id). Good enough for a single dev/small-scale instance —
// state is per-process and does not survive a restart or scale across
// multiple instances, which is fine for now since this project has no
// deployment target decided yet (see TODO.md 9단계).
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  // Records a hit for `key` and returns whether it is allowed under the
  // limit. `now` is injectable so callers (and tests) don't depend on the
  // real clock.
  check(key: string, now: number = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    const existing = this.hits.get(key) ?? [];
    const recent = existing.filter((timestamp) => timestamp > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

// One request every 3 seconds on average, bursts up to 10 within a minute.
export const chatRateLimiter = new RateLimiter(10, 60_000);
