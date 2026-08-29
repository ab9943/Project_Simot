import { Schema, model, models, type InferSchemaType } from "mongoose";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat-request";

const messageSchema = new Schema({
  sessionId: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true, maxlength: MAX_MESSAGE_LENGTH },
  createdAt: { type: Date, default: Date.now },
});

// Every read in this app fetches one session's history in createdAt order
// (see route.ts and page.tsx), so index on that access pattern directly
// rather than on sessionId alone.
messageSchema.index({ sessionId: 1, createdAt: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;

export default models.Message ?? model("Message", messageSchema);
