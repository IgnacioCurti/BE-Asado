import https from "node:https";
import { EventEmitter } from "node:events";
import { vi } from "vitest";

// Doble de prueba para la API HTTP de Brevo. src/utils/utils.ts llama a
// https.request(...), así que interceptamos ahí y guardamos cada mail "enviado".

export interface SentEmail {
  url: string;
  method: string;
  headers: Record<string, unknown>;
  payload: {
    sender: { name: string; email: string };
    to: { email: string; name: string }[];
    subject: string;
    htmlContent: string;
  };
  rawBody: string;
}

export const sentEmails: SentEmail[] = [];

let responseStatus: number = 201;
let networkError: Error | null = null;

export function setBrevoResponseStatus(status: number): void {
  responseStatus = status;
}

export function failBrevoWithNetworkError(error: Error): void {
  networkError = error;
}

export function installMailerMock(): void {
  sentEmails.length = 0;
  responseStatus = 201;
  networkError = null;
  vi.spyOn(https, "request").mockImplementation(((
    url: string,
    options: { method: string; headers: Record<string, unknown> },
    callback: (res: EventEmitter & { statusCode: number }) => void
  ) => {
    const req = new EventEmitter() as EventEmitter & {
      write: (chunk: string, encoding?: string) => boolean;
      end: () => void;
    };
    let rawBody: string = "";
    req.write = (chunk: string) => {
      rawBody += chunk;
      return true;
    };
    req.end = () => {
      const status: number = responseStatus;
      const error: Error | null = networkError;
      setImmediate(() => {
        if (error) {
          req.emit("error", error);
          return;
        }
        sentEmails.push({
          url: String(url),
          method: options.method,
          headers: options.headers,
          payload: JSON.parse(rawBody),
          rawBody,
        });
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = status;
        callback(res);
        res.emit("data", Buffer.from("{}"));
        res.emit("end");
      });
    };
    return req;
  }) as unknown as typeof https.request);
}

export function emailsTo(address: string): SentEmail[] {
  return sentEmails.filter((mail) =>
    mail.payload.to.some((recipient) => recipient.email === address)
  );
}
