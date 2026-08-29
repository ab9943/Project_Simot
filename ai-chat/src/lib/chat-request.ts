// Shared with src/models/Message.ts so the DB constraint and the API/UI
// validation agree on the same limit. The same field also stores assistant
// replies, so this must comfortably fit claude.ts's MAX_TOKENS (1024) worth
// of output — not just be sized for a reasonable user message.
export const MAX_MESSAGE_LENGTH = 8000;

export interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
}

export type ChatRequestValidation =
  | { ok: true; sessionId: string; message: string }
  | { ok: false; error: string };

// Pure: validates and normalizes a raw /api/chat request body.
export function validateChatRequest(
  body: ChatRequestBody
): ChatRequestValidation {
  const { sessionId, message } = body;

  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    return { ok: false, error: "sessionId is required" };
  }

  if (typeof message !== "string") {
    return { ok: false, error: "message is required" };
  }

  const trimmed = message.trim();
  if (trimmed === "") {
    return { ok: false, error: "message is required" };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    };
  }

  return { ok: true, sessionId, message: trimmed };
}
