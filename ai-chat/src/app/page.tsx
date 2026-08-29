import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { readSessionId, resolveSessionId } from "@/lib/session";
import ChatApp, { type ChatMessage } from "@/components/ChatApp";

export default async function Home() {
  const sessionId = resolveSessionId(await readSessionId());

  let initialMessages: ChatMessage[] = [];
  try {
    await connectDB();
    const history = await Message.find({ sessionId })
      .sort({ createdAt: 1 })
      .lean();
    initialMessages = history.map((entry) => ({
      role: entry.role as ChatMessage["role"],
      content: entry.content as string,
      images: (entry.images as ChatMessage["images"])?.length
        ? (entry.images as ChatMessage["images"])
        : undefined,
    }));
  } catch (error) {
    console.error("Failed to load conversation history", error);
  }

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <ChatApp sessionId={sessionId} initialMessages={initialMessages} />
    </div>
  );
}
