"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-request";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatAppProps {
  sessionId: string;
  initialMessages: ChatMessage[];
}

export default function ChatApp({ sessionId, initialMessages }: ChatAppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // Drops the trailing empty assistant placeholder added optimistically by
  // sendMessage, if the request failed before any text streamed in.
  function dropEmptyAssistantPlaceholder() {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.content === "") {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }

  async function sendMessage(text: string) {
    setError(null);
    setFailedMessage(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        dropEmptyAssistantPlaceholder();
      } else {
        dropEmptyAssistantPlaceholder();
        setError("메시지를 보내는 중 오류가 발생했습니다. 다시 시도해주세요.");
        setFailedMessage(text);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    void sendMessage(text);
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleRetry() {
    if (!failedMessage) return;
    void sendMessage(failedMessage);
  }

  async function handleNewConversation() {
    if (isStreaming) return;
    setError(null);
    setFailedMessage(null);
    try {
      const response = await fetch("/api/chat", { method: "DELETE" });
      if (!response.ok) throw new Error("failed to clear conversation");
      setMessages([]);
    } catch {
      setError("대화를 초기화하는 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="flex h-full w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          AI Chat
        </h1>
        <button
          type="button"
          onClick={handleNewConversation}
          disabled={isStreaming || messages.length === 0}
          className="text-sm text-gray-500 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400"
        >
          새 대화 시작
        </button>
      </div>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto"
      >
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-gray-400">
            메시지를 보내 대화를 시작하세요.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid="chat-message"
            className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
            }`}
          >
            {m.content ? (
              m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none prose-p:leading-normal dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Markdown>{m.content}</Markdown>
                </div>
              ) : (
                m.content
              )
            ) : isStreaming && i === messages.length - 1 ? (
              "…"
            ) : (
              ""
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-500">
          {error}
          {failedMessage && (
            <button
              type="button"
              onClick={handleRetry}
              className="ml-2 underline underline-offset-2 hover:no-underline"
            >
              다시 시도
            </button>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
          disabled={isStreaming}
          maxLength={MAX_MESSAGE_LENGTH}
          className="flex-1 rounded-full border border-gray-300 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-700"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={handleStop}
            className="rounded-full bg-gray-600 px-5 py-2 font-medium text-white"
          >
            중단
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="rounded-full bg-blue-600 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            전송
          </button>
        )}
      </form>
    </div>
  );
}
