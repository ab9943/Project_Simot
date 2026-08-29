import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatApp from "./ChatApp";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-request";

// Builds a fetch Response-like object whose body streams the given text
// chunks one at a time, mirroring how /api/chat streams Claude's reply.
function fakeStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i < chunks.length) {
              const value = encoder.encode(chunks[i]);
              i += 1;
              return { done: false, value };
            }
            return { done: true, value: undefined };
          },
        };
      },
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatApp", () => {
  it("renders initial messages passed in from the server", () => {
    render(
      <ChatApp
        sessionId="s1"
        initialMessages={[
          { role: "user", content: "안녕" },
          { role: "assistant", content: "반가워요" },
        ]}
      />
    );

    expect(screen.getByText("안녕")).toBeInTheDocument();
    expect(screen.getByText("반가워요")).toBeInTheDocument();
  });

  it("sends a message and streams the assistant reply in", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeStreamResponse(["안녕", "하세요"]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    const input = screen.getByPlaceholderText("메시지를 입력하세요");
    await user.type(input, "hi");
    await user.click(screen.getByRole("button", { name: "전송" }));

    expect(input).toHaveValue("");
    await waitFor(() => {
      expect(screen.getByText("안녕하세요")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "s1", message: "hi" }),
      })
    );
  });

  it("removes the empty assistant placeholder and offers a retry on failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(fakeStreamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    await user.type(screen.getByPlaceholderText("메시지를 입력하세요"), "hi");
    await user.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생했습니다/)).toBeInTheDocument();
    });

    // Only the user's own bubble should remain — no leftover empty
    // assistant placeholder from the failed request.
    expect(screen.getAllByTestId("chat-message")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops a streaming reply without showing an error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    await user.type(screen.getByPlaceholderText("메시지를 입력하세요"), "hi");
    await user.click(screen.getByRole("button", { name: "전송" }));

    const stopButton = await screen.findByRole("button", { name: "중단" });
    await user.click(stopButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "전송" })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/오류가 발생했습니다/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("chat-message")).toHaveLength(1);
  });

  it("clears the conversation when starting a new one", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ChatApp
        sessionId="s1"
        initialMessages={[{ role: "user", content: "안녕" }]}
      />
    );

    await user.click(screen.getByRole("button", { name: "새 대화 시작" }));

    await waitFor(() => {
      expect(screen.queryByText("안녕")).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", { method: "DELETE" });
  });

  it("renders markdown formatting in assistant replies", () => {
    render(
      <ChatApp
        sessionId="s1"
        initialMessages={[{ role: "assistant", content: "**bold**" }]}
      />
    );

    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("caps the message input at MAX_MESSAGE_LENGTH", () => {
    render(<ChatApp sessionId="s1" initialMessages={[]} />);
    const input = screen.getByPlaceholderText("메시지를 입력하세요");
    expect(input).toHaveAttribute("maxlength", String(MAX_MESSAGE_LENGTH));
  });

  it("previews an attached image and allows removing it before sending", async () => {
    const user = userEvent.setup();
    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
    const fileInput = screen.getByTestId("image-file-input");
    await user.upload(fileInput, file);

    expect(await screen.findByAltText("photo.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "이미지 제거" }));
    expect(screen.queryByAltText("photo.png")).not.toBeInTheDocument();
  });

  it("sends a message with an attached image encoded as base64", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    const file = new File(["hello"], "photo.png", { type: "image/png" });
    await user.upload(screen.getByTestId("image-file-input"), file);
    await screen.findByAltText("photo.png");

    await user.type(screen.getByPlaceholderText("메시지를 입력하세요"), "이 사진 봐줘");
    await user.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.sessionId).toBe("s1");
    expect(sentBody.message).toBe("이 사진 봐줘");
    expect(sentBody.images).toHaveLength(1);
    expect(sentBody.images[0].mediaType).toBe("image/png");
    expect(typeof sentBody.images[0].data).toBe("string");

    // The optimistic user bubble should render the attached image.
    expect(await screen.findAllByAltText("첨부 이미지")).toHaveLength(1);
  });

  it("allows sending an image with no text", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp sessionId="s1" initialMessages={[]} />);

    const file = new File(["hello"], "photo.png", { type: "image/png" });
    await user.upload(screen.getByTestId("image-file-input"), file);
    await screen.findByAltText("photo.png");

    expect(screen.getByRole("button", { name: "전송" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "전송" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string).message).toBe("");
  });
});
