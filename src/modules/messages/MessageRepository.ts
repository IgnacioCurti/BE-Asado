import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Message } from "../../models/message.js";
import { IMessage } from "../../models/interfaces.js";

// Datos públicos del autor que viajan con cada mensaje (CHAT_FEATURE.md §2.2).
// Si el autor borró su cuenta, el populate deja author en null.
const AUTHOR_FIELDS: string = "_id name lastName profilePicture";

export interface MessageCursor {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
}

export class MessageRepository extends BaseRepository<IMessage> {
  constructor() {
    super(Message);
  }

  findInEvent(messageId: string, eventId: string): Promise<IMessage | null> {
    return this.model.findOne({ _id: messageId, event: eventId }).exec();
  }

  // Página del historial, del más nuevo al más viejo. Con cursor, devuelve los
  // anteriores a ese mensaje; el _id desempata mensajes con la misma hora.
  findPage(eventId: string, limit: number, before?: MessageCursor): Promise<IMessage[]> {
    const filter: mongoose.FilterQuery<IMessage> = { event: eventId };
    if (before)
      filter.$or = [
        { createdAt: { $lt: before.createdAt } },
        { createdAt: before.createdAt, _id: { $lt: before._id } },
      ];
    return this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("author", AUTHOR_FIELDS)
      .exec();
  }

  async createWithAuthor(data: { event: string; author: string; text: string }): Promise<IMessage> {
    const message: IMessage = await this.model.create(data);
    return message.populate("author", AUTHOR_FIELDS);
  }
}
