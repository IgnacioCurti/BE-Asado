import { BadRequestError, ConflictError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IEvent, IMessage } from "../../models/interfaces.js";
import { MESSAGE_LIMITS } from "../../models/message.js";
import { EventRepository } from "../events/EventRepository.js";
import { MessageRepository } from "./MessageRepository.js";
import { ChatRealtime } from "./ChatRealtime.js";
import type { TokenRequest } from "ably";

// CHAT_FEATURE.md §1 y §4.
export const READ_ONLY_STATES: string[] = ["finished", "cancelled"];
export const PAGE_SIZE = { DEFAULT: 50, MAX: 100 } as const;

export interface MessagePage {
  messages: IMessage[];
  hasMore: boolean;
}

// Chat de un evento. La autorización (leer: eventViewer; escribir:
// eventParticipant) la resuelven los middlewares de la ruta.
export class MessageService {
  constructor(
    private readonly events: Pick<EventRepository, "findById">,
    private readonly messages: Pick<MessageRepository, "findInEvent" | "findPage" | "createWithAuthor">,
    private readonly realtime: ChatRealtime
  ) {}

  // Historial del más nuevo al más viejo. `before` es el _id del último mensaje
  // de la página anterior.
  async list(eventId: string, query: { before?: unknown; limit?: unknown }): Promise<MessagePage> {
    this.assertValidIds(eventId);
    const limit: number = this.parseLimit(query.limit);
    let cursor: IMessage | undefined;
    if (query.before !== undefined) {
      if (typeof query.before !== "string" || !isValidId(query.before))
        throw new BadRequestError("Invalid ObjectID");
      cursor = (await this.messages.findInEvent(query.before, eventId)) ?? undefined;
      if (!cursor) throw new BadRequestError("The cursor message does not belong to the event.");
    }
    // Se pide uno de más para saber si quedan mensajes anteriores.
    const page: IMessage[] = await this.messages.findPage(eventId, limit + 1, cursor);
    return { messages: page.slice(0, limit), hasMore: page.length > limit };
  }

  async send(eventId: string, authorId: string, text: unknown): Promise<IMessage> {
    this.assertValidIds(eventId);
    const event: IEvent | null = await this.events.findById(eventId);
    if (!event) throw new NotFoundError("The event with the given ID does not exist.");
    if (READ_ONLY_STATES.includes(event.state))
      throw new ConflictError("The event is finished or cancelled. Its chat is read-only.");
    const content: string = this.parseText(text);
    const message: IMessage = await this.messages.createWithAuthor({ event: eventId, author: authorId, text: content });
    // El mensaje ya está guardado: si Ably falla, se loguea y se responde igual.
    // Los clientes lo recuperan al volver a pedir el historial (§6.3 y §6.4).
    try {
      await this.realtime.publish(eventId, message);
    } catch (error) {
      console.error(`Could not publish chat message ${message._id} to the realtime channel:`, error);
    }
    return message;
  }

  // Token para escuchar el canal del evento. La regla de lectura (eventViewer)
  // la aplica la ruta, y se vuelve a aplicar en cada renovación del token.
  createChatToken(eventId: string, userId: string): Promise<TokenRequest> {
    this.assertValidIds(eventId);
    return this.realtime.createTokenRequest(eventId, userId);
  }

  private parseLimit(limit: unknown): number {
    if (limit === undefined) return PAGE_SIZE.DEFAULT;
    const value: number = typeof limit === "string" && /^\d+$/.test(limit) ? Number(limit) : NaN;
    if (!(value >= 1 && value <= PAGE_SIZE.MAX))
      throw new BadRequestError(`The limit must be an integer between 1 and ${PAGE_SIZE.MAX}.`);
    return value;
  }

  private parseText(text: unknown): string {
    const content: string = typeof text === "string" ? text.trim() : "";
    if (!content) throw new BadRequestError("The message text is required.");
    if (content.length > MESSAGE_LIMITS.TEXT_MAX_LENGTH)
      throw new BadRequestError(
        `The message text must be at most ${MESSAGE_LIMITS.TEXT_MAX_LENGTH} characters.`
      );
    return content;
  }

  private assertValidIds(...ids: string[]): void {
    if (!ids.every((id) => isValidId(id))) throw new BadRequestError("Invalid ObjectID");
  }
}
