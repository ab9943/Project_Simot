import { describe, expect, it } from "vitest";
import { isValidSessionId, resolveSessionId } from "./session";

describe("isValidSessionId", () => {
  it("accepts a well-formed UUID", () => {
    expect(isValidSessionId("7b2ded2e-acfa-45d4-8013-0d93c459ec5b")).toBe(
      true
    );
  });

  it("accepts an uppercase UUID", () => {
    expect(isValidSessionId("7B2DED2E-ACFA-45D4-8013-0D93C459EC5B")).toBe(
      true
    );
  });

  it.each([undefined, null, "", "not-a-uuid", "7b2ded2e-acfa-45d4-8013"])(
    "rejects invalid input: %p",
    (value) => {
      expect(isValidSessionId(value)).toBe(false);
    }
  );
});

describe("resolveSessionId", () => {
  it("returns the existing id when it is a valid UUID", () => {
    const existing = "7b2ded2e-acfa-45d4-8013-0d93c459ec5b";
    expect(resolveSessionId(existing)).toBe(existing);
  });

  it.each([undefined, null, "", "not-a-uuid"])(
    "generates a fresh valid UUID when the existing value is %p",
    (existing) => {
      const generated = resolveSessionId(existing);
      expect(isValidSessionId(generated)).toBe(true);
    }
  );

  it("generates a different id on each call when there is no existing id", () => {
    expect(resolveSessionId(undefined)).not.toBe(resolveSessionId(undefined));
  });
});
