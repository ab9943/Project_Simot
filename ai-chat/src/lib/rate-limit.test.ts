import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows requests up to the limit within the window", () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 100)).toBe(true);
    expect(limiter.check("a", 200)).toBe(true);
  });

  it("blocks a request once the limit is reached within the window", () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 100)).toBe(true);
    expect(limiter.check("a", 200)).toBe(false);
  });

  it("allows requests again once the window has passed", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("a", 500)).toBe(false);
    expect(limiter.check("a", 1001)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check("a", 0)).toBe(true);
    expect(limiter.check("b", 0)).toBe(true);
    expect(limiter.check("a", 0)).toBe(false);
  });
});
