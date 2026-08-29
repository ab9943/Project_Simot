// Shared with src/models/Message.ts so the DB constraint and the API/UI
// validation agree on the same limit. The same field also stores assistant
// replies, so this must comfortably fit claude.ts's MAX_TOKENS (1024) worth
// of output — not just be sized for a reasonable user message.
export const MAX_MESSAGE_LENGTH = 8000;

// Image formats accepted by the Anthropic Messages API.
export const ALLOWED_IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type ImageMediaType = (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number];

export const MAX_IMAGES_PER_MESSAGE = 4;

// Limits are checked against the *encoded* base64 length (no need to decode
// attacker-controlled input just to reject it) and are sized so that one
// message's images, once base64-encoded and stored on the Message document,
// stay safely under MongoDB's 16MB per-document limit.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB decoded, per image
export const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB decoded, per message

export interface ChatImage {
  mediaType: ImageMediaType;
  data: string; // base64-encoded image bytes, no "data:" prefix
}

export interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
  images?: unknown;
}

export type ChatRequestValidation =
  | { ok: true; sessionId: string; message: string; images: ChatImage[] }
  | { ok: false; error: string };

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// Computes the decoded byte length of a base64 string without decoding it.
function base64DecodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function validateImages(
  raw: unknown
): { ok: true; images: ChatImage[] } | { ok: false; error: string } {
  if (typeof raw === "undefined") {
    return { ok: true, images: [] };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, error: "images must be an array" };
  }

  if (raw.length > MAX_IMAGES_PER_MESSAGE) {
    return {
      ok: false,
      error: `at most ${MAX_IMAGES_PER_MESSAGE} images are allowed per message`,
    };
  }

  const images: ChatImage[] = [];
  let totalBytes = 0;

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "each image must be an object" };
    }

    const { mediaType, data } = entry as { mediaType?: unknown; data?: unknown };

    if (
      typeof mediaType !== "string" ||
      !(ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)
    ) {
      return {
        ok: false,
        error: `image mediaType must be one of ${ALLOWED_IMAGE_MEDIA_TYPES.join(", ")}`,
      };
    }

    if (typeof data !== "string" || data.length === 0 || !BASE64_PATTERN.test(data)) {
      return { ok: false, error: "image data must be a base64-encoded string" };
    }

    const bytes = base64DecodedByteLength(data);
    if (bytes > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `each image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
      };
    }

    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      return {
        ok: false,
        error: `images must total at most ${MAX_TOTAL_IMAGE_BYTES / (1024 * 1024)}MB per message`,
      };
    }

    images.push({ mediaType: mediaType as ImageMediaType, data });
  }

  return { ok: true, images };
}

// Pure: validates and normalizes a raw /api/chat request body.
export function validateChatRequest(
  body: ChatRequestBody
): ChatRequestValidation {
  const { sessionId, message, images: rawImages } = body;

  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    return { ok: false, error: "sessionId is required" };
  }

  if (typeof message !== "undefined" && typeof message !== "string") {
    return { ok: false, error: "message must be a string" };
  }

  const trimmed = typeof message === "string" ? message.trim() : "";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  const imagesResult = validateImages(rawImages);
  if (!imagesResult.ok) {
    return imagesResult;
  }

  if (trimmed === "" && imagesResult.images.length === 0) {
    return { ok: false, error: "message or at least one image is required" };
  }

  return { ok: true, sessionId, message: trimmed, images: imagesResult.images };
}
