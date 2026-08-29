"use client";

// Chat images are base64 data URIs / blob: preview URLs, not static assets —
// next/image's optimizer doesn't apply here, so plain <img> is intentional.
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Markdown from "react-markdown";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_LENGTH,
  type ChatImage,
  type ImageMediaType,
} from "@/lib/chat-request";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

interface ChatAppProps {
  sessionId: string;
  initialMessages: ChatMessage[];
}

function isAcceptedImageType(type: string): type is ImageMediaType {
  return (ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(type);
}

// Reads a File as a base64 string (no "data:...;base64," prefix), matching
// the ChatImage shape the /api/chat route expects.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ChatApp({ sessionId, initialMessages }: ChatAppProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedSend, setFailedSend] = useState<{
    text: string;
    images: ChatImage[];
  } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Validates and stages files for attachment, revoking preview URLs for
  // anything that gets dropped once MAX_IMAGES_PER_MESSAGE is exceeded.
  function addFiles(files: File[]) {
    const accepted: File[] = [];
    for (const file of files) {
      if (!isAcceptedImageType(file.type)) {
        setError(`지원하지 않는 이미지 형식입니다: ${file.name}`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(
          `이미지는 최대 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB까지 첨부할 수 있습니다.`
        );
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    setAttachments((prev) => {
      const next = [
        ...prev,
        ...accepted.map((file) => ({
          id:
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      if (next.length > MAX_IMAGES_PER_MESSAGE) {
        setError(
          `이미지는 메시지당 최대 ${MAX_IMAGES_PER_MESSAGE}장까지 첨부할 수 있습니다.`
        );
        next
          .slice(MAX_IMAGES_PER_MESSAGE)
          .forEach((a) => URL.revokeObjectURL(a.previewUrl));
        return next.slice(0, MAX_IMAGES_PER_MESSAGE);
      }
      return next;
    });
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function clearAttachments() {
    setAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length > 0) addFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) addFiles(files);
  }

  async function sendMessage(text: string, images: ChatImage[]) {
    setError(null);
    setFailedSend(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, images: images.length ? images : undefined },
      { role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          images.length > 0
            ? { sessionId, message: text, images }
            : { sessionId, message: text }
        ),
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
        setFailedSend({ text, images });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStreaming) return;

    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const staged = attachments;
    setInput("");
    clearAttachments();

    const images: ChatImage[] = await Promise.all(
      staged.map(async (a) => ({
        mediaType: a.file.type as ImageMediaType,
        data: await fileToBase64(a.file),
      }))
    );
    void sendMessage(text, images);
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleRetry() {
    if (!failedSend) return;
    void sendMessage(failedSend.text, failedSend.images);
  }

  async function handleNewConversation() {
    if (isStreaming) return;
    setError(null);
    setFailedSend(null);
    try {
      const response = await fetch("/api/chat", { method: "DELETE" });
      if (!response.ok) throw new Error("failed to clear conversation");
      setMessages([]);
    } catch {
      setError("대화를 초기화하는 중 오류가 발생했습니다.");
    }
  }

  const canSend = (input.trim() !== "" || attachments.length > 0) && !isStreaming;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="flex h-full w-full max-w-2xl flex-1 flex-col gap-4 p-4"
    >
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
            메시지를 보내 대화를 시작하세요. 이미지를 첨부할 수도 있습니다.
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
            {m.images && m.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {m.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={`data:${img.mediaType};base64,${img.data}`}
                    alt="첨부 이미지"
                    className="h-24 w-24 rounded-lg border border-white/20 object-cover"
                  />
                ))}
              </div>
            )}
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
          {failedSend && (
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

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative">
              <img
                src={a.previewUrl}
                alt={a.file.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                aria-label="이미지 제거"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-xs text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          data-testid="image-file-input"
          accept={ALLOWED_IMAGE_MEDIA_TYPES.join(",")}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isStreaming || attachments.length >= MAX_IMAGES_PER_MESSAGE}
          aria-label="이미지 첨부"
          className="rounded-full border border-gray-300 px-3 py-2 text-gray-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
        >
          📎
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
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
            disabled={!canSend}
            className="rounded-full bg-blue-600 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            전송
          </button>
        )}
      </form>
    </div>
  );
}
