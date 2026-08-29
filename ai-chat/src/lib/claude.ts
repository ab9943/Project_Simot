import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsStreaming,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { ChatImage } from "@/lib/chat-request";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

// How many of the most recent messages to send as context. The full
// conversation is still persisted in MongoDB — this only bounds what gets
// sent (and billed) to the Claude API on each turn, since a session's
// history has no other limit and can grow indefinitely.
export const MAX_HISTORY_MESSAGES = 20;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

// Pure: keeps only the most recent `limit` messages, preserving order.
export function takeRecentHistory(
  messages: ChatMessage[],
  limit: number = MAX_HISTORY_MESSAGES
): ChatMessage[] {
  return limit <= 0 ? [] : messages.slice(-limit);
}

// Converts one chat message to the Anthropic content shape: plain text when
// there are no images, otherwise a content block array (text block first,
// then one image block per attachment) as required by the Messages API's
// multimodal format.
function toApiContent(m: ChatMessage): MessageParam["content"] {
  if (!m.images || m.images.length === 0) {
    return m.content;
  }

  return [
    ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
    ...m.images.map((image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.mediaType,
        data: image.data,
      },
    })),
  ];
}

// Pure: builds the request payload sent to the Anthropic Messages API.
export function buildMessageRequest(
  messages: ChatMessage[]
): MessageCreateParamsStreaming {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    messages: messages.map(
      (m): MessageParam => ({ role: m.role, content: toApiContent(m) })
    ),
  };
}

let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireApiKey() });
  }
  return client;
}

// Validates the API key is configured. Call this before opening a streaming
// Response so a missing key produces a normal error response instead of
// throwing after headers have started streaming (which aborts the
// connection and drops any Set-Cookie header already queued on it).
export function requireApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return apiKey;
}

// Streams Claude's reply as successive text deltas.
export async function* streamReply(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  const stream = getClient().messages.stream(buildMessageRequest(messages));
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
