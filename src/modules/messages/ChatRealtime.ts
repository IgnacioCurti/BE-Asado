import Ably from "ably";
import { IMessage } from "../../models/interfaces.js";

// Realtime del chat (CHAT_FEATURE.md §6). El servicio depende de esta interfaz,
// no de Ably: los tests usan un doble y cambiar de proveedor solo toca la
// implementación de abajo.
export interface ChatRealtime {
  publish(eventId: string, message: IMessage): Promise<void>;
  createTokenRequest(eventId: string, userId: string): Promise<Ably.TokenRequest>;
}

export const CHAT_MESSAGE_EVENT: string = "message";
export const CHAT_TOKEN_TTL_MS: number = 15 * 60 * 1000;

export function chatChannel(eventId: string): string {
  return `event:${eventId}`;
}

export class AblyChatRealtime implements ChatRealtime {
  private readonly client: Ably.Rest;

  constructor(apiKey: string) {
    // Vercel congela la función al responder: la publicación se espera, así
    // que no puede colgar el request (por defecto Ably espera 10 s y reintenta).
    this.client = new Ably.Rest({ key: apiKey, httpRequestTimeout: 3000, httpMaxRetryCount: 1 });
  }

  async publish(eventId: string, message: IMessage): Promise<void> {
    // Mismo JSON que devuelve la API (ObjectId y Date como string).
    const data: unknown = JSON.parse(JSON.stringify(message));
    await this.client.channels.get(chatChannel(eventId)).publish(CHAT_MESSAGE_EVENT, data);
  }

  // Se firma localmente con la key, sin llamar a Ably. El cliente solo puede
  // escuchar el canal de ese evento; publicar pasa siempre por la API.
  createTokenRequest(eventId: string, userId: string): Promise<Ably.TokenRequest> {
    return this.client.auth.createTokenRequest({
      clientId: userId,
      capability: { [chatChannel(eventId)]: ["subscribe"] },
      ttl: CHAT_TOKEN_TTL_MS,
    });
  }
}
