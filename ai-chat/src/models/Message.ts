import { Schema, model, models, type InferSchemaType } from "mongoose";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
} from "@/lib/chat-request";

// Images are stored inline as base64 rather than uploaded to object storage,
// since each message is its own document and chat-request.ts already caps
// the total encoded size well under MongoDB's 16MB per-document limit. If
// image volume grows enough to matter, migrate this to a bucket + URL.
const imageSchema = new Schema(
  {
    mediaType: { type: String, required: true, enum: [...ALLOWED_IMAGE_MEDIA_TYPES] },
    data: { type: String, required: true },
  },
  { _id: false }
);

const messageSchema = new Schema({
  sessionId: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, default: "", maxlength: MAX_MESSAGE_LENGTH },
  images: {
    type: [imageSchema],
    default: undefined,
    validate: {
      validator: (value: unknown[]) => value.length <= MAX_IMAGES_PER_MESSAGE,
      message: `A message can include at most ${MAX_IMAGES_PER_MESSAGE} images`,
    },
  },
  createdAt: { type: Date, default: Date.now },
});

// Every read in this app fetches one session's history in createdAt order
// (see route.ts and page.tsx), so index on that access pattern directly
// rather than on sessionId alone.
messageSchema.index({ sessionId: 1, createdAt: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;

export default models.Message ?? model("Message", messageSchema);
