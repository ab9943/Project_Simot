import { describe, expect, it } from "vitest";
import {
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_TOTAL_IMAGE_BYTES,
  validateChatRequest,
} from "./chat-request";

// A tiny valid base64 payload (doesn't need to be a real image — validation
// never decodes pixel data, only checks format/size).
const SAMPLE_IMAGE = { mediaType: "image/png", data: "aGVsbG8=" };

// Builds a base64 string that decodes to exactly `bytes` bytes.
function base64OfByteLength(bytes: number): string {
  const fullGroups = Math.floor(bytes / 3);
  const remainder = bytes % 3;
  let result = "A".repeat(fullGroups * 4);
  if (remainder === 1) result += "AA==";
  else if (remainder === 2) result += "AAA=";
  return result;
}

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
      images: [],
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

  it("rejects a missing message with no images", () => {
    const result = validateChatRequest({ sessionId: "session-1" });
    expect(result).toEqual({
      ok: false,
      error: "message or at least one image is required",
    });
  });

  it("rejects a whitespace-only message with no images", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "   ",
    });
    expect(result).toEqual({
      ok: false,
      error: "message or at least one image is required",
    });
  });

  it("rejects a non-string message", () => {
    const result = validateChatRequest({ sessionId: "session-1", message: 1 });
    expect(result).toEqual({ ok: false, error: "message must be a string" });
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

  it("accepts an image-only message with no text", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      images: [SAMPLE_IMAGE],
    });
    expect(result).toEqual({
      ok: true,
      sessionId: "session-1",
      message: "",
      images: [SAMPLE_IMAGE],
    });
  });

  it("accepts a message with images", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "이 사진 봐줘",
      images: [SAMPLE_IMAGE],
    });
    expect(result).toEqual({
      ok: true,
      sessionId: "session-1",
      message: "이 사진 봐줘",
      images: [SAMPLE_IMAGE],
    });
  });

  it("rejects images that are not an array", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images: "nope",
    });
    expect(result).toEqual({ ok: false, error: "images must be an array" });
  });

  it("rejects more than MAX_IMAGES_PER_MESSAGE images", () => {
    const images = Array.from({ length: MAX_IMAGES_PER_MESSAGE + 1 }, () => SAMPLE_IMAGE);
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images,
    });
    expect(result).toEqual({
      ok: false,
      error: `at most ${MAX_IMAGES_PER_MESSAGE} images are allowed per message`,
    });
  });

  it("rejects an unsupported image mediaType", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images: [{ mediaType: "image/svg+xml", data: "aGVsbG8=" }],
    });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/mediaType must be one of/);
  });

  it("rejects image data that isn't valid base64", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images: [{ mediaType: "image/png", data: "not-base64!!" }],
    });
    expect(result).toEqual({
      ok: false,
      error: "image data must be a base64-encoded string",
    });
  });

  it("rejects a single image over MAX_IMAGE_BYTES", () => {
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images: [
        { mediaType: "image/png", data: base64OfByteLength(MAX_IMAGE_BYTES + 1) },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: `each image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
    });
  });

  it("rejects images whose combined size exceeds MAX_TOTAL_IMAGE_BYTES", () => {
    // Each image is right at the per-image limit (allowed on its own), but
    // three of them together exceed the total-per-message budget.
    const image = {
      mediaType: "image/png",
      data: base64OfByteLength(MAX_IMAGE_BYTES),
    };
    const result = validateChatRequest({
      sessionId: "session-1",
      message: "hi",
      images: [image, image, image],
    });
    expect(result).toEqual({
      ok: false,
      error: `images must total at most ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB per message`,
    });
  });
});
