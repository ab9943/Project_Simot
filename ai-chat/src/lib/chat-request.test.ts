import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_LENGTH, validateChatRequest } from "./chat-request";

describe("validateChatRequest", () => {
  it("accepts a well-formed request and trims the message", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "  hello  ",
    });

    expect(result).toEqual({
      ok: true,
      sessionId: "session-1",
      message: "hello",
    });
  });

  it("rejects a missing sessionId", () => {
    const result = validateChatRequest({ message: "hello" });
    expect(result).toEqual({ ok: false, error: "sessionId is required" });
  });

  it("rejects a blank sessionId", () => {
    const result = validateChatRequest({ sessionId: "   ", message: "hi" });
    expect(result).toEqual({ ok: false, error: "sessionId is required" });
  });

  it("rejects a non-string sessionId", () => {
    const result = validateChatRequest({ sessionId: 42, message: "hi" });
    expect(result).toEqual({ ok: false, error: "sessionId is required" });
  });

  it("rejects a missing message", () => {
    const result = validateChatRequest({ sessionId: "session-1" });
    expect(result).toEqual({ ok: false, error: "message is required" });
  });

  it("rejects a whitespace-only message", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "   ",
    });
    expect(result).toEqual({ ok: false, error: "message is required" });
  });

  it("rejects a non-string message", () => {
    const result = validateChatRequest({ sessionId: "session-1", message: 1 });
    expect(result).toEqual({ ok: false, error: "message is required" });
  });

  it("accepts a message exactly at the length limit", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH);
    const result = validateChatRequest({ sessionId: "session-1", message });
    expect(result.ok).toBe(true);
  });

  it("rejects a message longer than the length limit", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    const result = validateChatRequest({ sessionId: "session-1", message });
    expect(result).toEqual({
      ok: false,
      error: `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    });
  });
});
