import { vi } from "vitest";
import { AblyChatRealtime } from "../../src/modules/messages/ChatRealtime.js";

// Doble de la publicación en Ably: ningún test publica de verdad. Guarda lo
// "publicado" para verificarlo. createTokenRequest queda real: firma con la key
// de prueba sin salir a la red.

export interface PublishedMessage {
  eventId: string;
  message: Record<string, unknown>;
}

export const publishedMessages: PublishedMessage[] = [];

export function installRealtimeMock(): void {
  publishedMessages.length = 0;
  vi.spyOn(AblyChatRealtime.prototype, "publish").mockImplementation(async (eventId, message) => {
    publishedMessages.push({ eventId, message: JSON.parse(JSON.stringify(message)) });
  });
}

export function failRealtimePublish(message: string): void {
  vi.spyOn(AblyChatRealtime.prototype, "publish").mockRejectedValue(new Error(message));
}
