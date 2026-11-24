import mongoose, { Model } from "mongoose";
import { IMessage } from "./interfaces.js";

// Límites de CHAT_FEATURE.md §2.1.
export const MESSAGE_LIMITS = {
  TEXT_MAX_LENGTH: 1000,
} as const;

// Mensaje del chat de un evento. La relación vive acá (Message.event): el
// evento no guarda messages[]. Autor y hora los fija el servidor.
const messageSchema: mongoose.Schema<IMessage> = new mongoose.Schema<IMessage>({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    immutable: true,
  },

  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    immutable: true,
  },

  // required rechaza el texto vacío, también el que queda vacío tras el trim.
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: MESSAGE_LIMITS.TEXT_MAX_LENGTH,
  },

  createdAt: { type: Date, default: Date.now, immutable: true },
});

// Historial paginado del más nuevo al más viejo (§4).
messageSchema.index({ event: 1, createdAt: -1, _id: -1 });

const Message: Model<IMessage> = mongoose.model<IMessage>("Message", messageSchema);

export { Message };
