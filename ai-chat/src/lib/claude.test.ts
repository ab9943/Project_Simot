import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      stream: vi.fn().mockReturnValue(
        (async function* () {
          yield { type: "message_start" };
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "안녕" },
          };
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "하세요" },
          };
          yield {
            type: "content_block_delta",
            delta: { type: "input_json_delta", partial_json: "{}" },
          };
          yield { type: "message_stop" };
        })()
      ),
    };
  },
}));

import {
  buildMessageRequest,
  requireApiKey,
  streamReply,
  takeRecentHistory,
} from "./claude";

describe("buildMessageRequest", () => {
  it("maps chat messages to Anthropic message params in order", () => {
    const request = buildMessageRequest([
      { role: "user", content: "안녕" },
      { role: "assistant", content: "반가워요" },
      { role: "user", content: "오늘 날씨 어때?" },
    ]);

    expect(request.messages).toEqual([
      { role: "user", content: "안녕" },
      { role: "assistant", content: "반가워요" },
      { role: "user", content: "오늘 날씨 어때?" },
    ]);
  });

  it("always requests a streaming response", () => {
    const request = buildMessageRequest([{ role: "user", content: "hi" }]);
    expect(request.stream).toBe(true);
  });

  it("sets a model and a positive max_tokens", () => {
    const request = buildMessageRequest([{ role: "user", content: "hi" }]);
    expect(typeof request.model).toBe("string");
    expect(request.model.length).toBeGreaterThan(0);
    expect(request.max_tokens).toBeGreaterThan(0);
  });

  it("handles an empty message list", () => {
    const request = buildMessageRequest([]);
    expect(request.messages).toEqual([]);
  });

  it("converts a message with images into text + image content blocks", () => {
    const request = buildMessageRequest([
      {
        role: "user",
        content: "이 사진 봐줘",
        images: [{ mediaType: "image/png", data: "aGVsbG8=" }],
      },
    ]);

    expect(request.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "이 사진 봐줘" },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
          },
        ],
      },
    ]);
  });

  it("omits the text block when an image-only message has no text", () => {
    const request = buildMessageRequest([
      {
        role: "user",
        content: "",
        images: [{ mediaType: "image/jpeg", data: "aGVsbG8=" }],
      },
    ]);

    expect(request.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: "aGVsbG8=" },
          },
        ],
      },
    ]);
  });

  it("keeps plain string content for messages with no images", () => {
    const request = buildMessageRequest([
      { role: "user", content: "hi", images: [] },
    ]);
    expect(request.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("takeRecentHistory", () => {
  const messages = Array.from({ length: 5 }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `message ${i}`,
  }));

  it("returns all messages when under the limit", () => {
    expect(takeRecentHistory(messages, 10)).toEqual(messages);
  });

  it("keeps only the most recent messages, in order, when over the limit", () => {
    expect(takeRecentHistory(messages, 2)).toEqual(messages.slice(-2));
  });

  it("returns an empty array for a non-positive limit", () => {
    expect(takeRecentHistory(messages, 0)).toEqual([]);
  });

  it("defaults to MAX_HISTORY_MESSAGES when no limit is given", () => {
    expect(takeRecentHistory(messages)).toEqual(messages);
  });
});

describe("requireApiKey", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("returns the key when it is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    expect(requireApiKey()).toBe("sk-test-key");
  });

  it("throws when the key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => requireApiKey()).toThrow(
      "ANTHROPIC_API_KEY environment variable is not set"
    );
  });
});

describe("streamReply", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("yields only the text_delta chunks from the Anthropic event stream, in order", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    const chunks: string[] = [];
    for await (const chunk of streamReply([{ role: "user", content: "hi" }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["안녕", "하세요"]);
  });
});
