import type { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import {
  streamReply,
  requireApiKey,
  takeRecentHistory,
  type ChatMessage,
} from "@/lib/claude";
import { persistSessionId, readSessionId } from "@/lib/session";
import { validateChatRequest, type ChatRequestBody } from "@/lib/chat-request";
import { chatRateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateChatRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { sessionId, message, images } = validation;

  if (!chatRateLimiter.check(sessionId)) {
    return Response.json(
      { error: "Too many messages. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  await persistSessionId(sessionId);

  try {
    await connectDB();
  } catch (error) {
    console.error("Failed to connect to the database", error);
    return Response.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    await Message.create({
      sessionId,
      role: "user",
      content: message,
      images: images.length > 0 ? images : undefined,
    });
  } catch (error) {
    console.error("Failed to save user message", error);
    return Response.json({ error: "Failed to save message" }, { status: 500 });
  }

  try {
    requireApiKey();
  } catch (error) {
    console.error("Claude API is not configured", error);
    return Response.json({ error: "Claude API unavailable" }, { status: 500 });
  }

  const history = await Message.find({ sessionId })
    .sort({ createdAt: 1 })
    .lean();
  const chatMessages: ChatMessage[] = takeRecentHistory(
    history.map((entry) => ({
      role: entry.role as ChatMessage["role"],
      content: entry.content as string,
      images: (entry.images as ChatMessage["images"])?.length
        ? (entry.images as ChatMessage["images"])
        : undefined,
    }))
  );

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamingFailed = false;
      try {
        for await (const chunk of streamReply(chatMessages)) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error("Claude API streaming error", error);
        streamingFailed = true;
        controller.error(error);
      }

      if (!streamingFailed) {
        controller.close();
      }

      // Persist whatever text made it out, even on a mid-stream failure, so
      // a partial reply isn't silently lost from the conversation history.
      if (assistantText) {
        try {
          await Message.create({
            sessionId,
            role: "assistant",
            content: assistantText,
          });
        } catch (error) {
          console.error("Failed to save assistant message", error);
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Clears the current session's conversation history ("새 대화 시작"). Scoped
// to the session cookie rather than a client-supplied id, consistent with
// the cookie being the only thing that scopes a conversation (see
// CLAUDE.md's security notes).
export async function DELETE() {
  const sessionId = await readSessionId();
  if (!sessionId) {
    return Response.json({ ok: true });
  }

  try {
    await connectDB();
    await Message.deleteMany({ sessionId });
  } catch (error) {
    console.error("Failed to clear conversation history", error);
    return Response.json(
      { error: "Failed to clear conversation" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
