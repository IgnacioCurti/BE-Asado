import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MessageService } from "../../../../src/modules/messages/MessageService.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function message() {
  return { _id: id(), createdAt: new Date() } as any;
}

function setup({ event = { _id: id(), state: "available" } as any, page = [] as any[], cursor = null as any } = {}) {
  const events = { findById: vi.fn().mockResolvedValue(event) };
  const messages = {
    findInEvent: vi.fn().mockResolvedValue(cursor),
    findPage: vi.fn().mockResolvedValue(page),
    createWithAuthor: vi.fn(async (data: any) => ({ _id: id(), ...data })),
  };
  const realtime = {
    publish: vi.fn().mockResolvedValue(undefined),
    createTokenRequest: vi.fn(async (eventId: string, userId: string) => ({ eventId, userId })),
  };
  return { service: new MessageService(events as any, messages as any, realtime), events, messages, realtime };
}

describe("MessageService.list", () => {
  it("sin parámetros pide 50 (+1 para saber si hay más) desde el más nuevo", async () => {
    const page = Array.from({ length: 3 }, message);
    const { service, messages } = setup({ page });
    const eventId = String(id());

    const result = await service.list(eventId, {});

    expect(messages.findPage).toHaveBeenCalledWith(eventId, 51, undefined);
    expect(result).toEqual({ messages: page, hasMore: false });
  });

  it("si vuelve un mensaje de más, lo recorta y marca hasMore", async () => {
    const page = Array.from({ length: 3 }, message);
    const { service } = setup({ page });

    const result = await service.list(String(id()), { limit: "2" });

    expect(result).toEqual({ messages: page.slice(0, 2), hasMore: true });
  });

  it("con cursor, busca el mensaje en el evento y pagina desde él", async () => {
    const cursor = message();
    const { service, messages } = setup({ cursor });
    const eventId = String(id());

    await service.list(eventId, { before: String(cursor._id), limit: "10" });

    expect(messages.findInEvent).toHaveBeenCalledWith(String(cursor._id), eventId);
    expect(messages.findPage).toHaveBeenCalledWith(eventId, 11, cursor);
  });

  it("cursor que no es del evento -> 400", async () => {
    const { service } = setup({ cursor: null });
    await expect(service.list(String(id()), { before: String(id()) })).rejects.toThrow(
      new BadRequestError("The cursor message does not belong to the event.")
    );
  });

  it.each(["abc", ["x"], 3])("cursor %s mal formado -> 400", async (before) => {
    const { service, messages } = setup();
    await expect(service.list(String(id()), { before })).rejects.toThrow(new BadRequestError("Invalid ObjectID"));
    expect(messages.findPage).not.toHaveBeenCalled();
  });

  it.each(["0", "101", "2.5", "-1", "abc", ""])("limit %s inválido -> 400", async (limit) => {
    const { service } = setup();
    await expect(service.list(String(id()), { limit })).rejects.toThrow(
      new BadRequestError("The limit must be an integer between 1 and 100.")
    );
  });

  it("acepta los extremos 1 y 100", async () => {
    const { service, messages } = setup();
    await service.list(String(id()), { limit: "1" });
    await service.list(String(id()), { limit: "100" });
    expect(messages.findPage.mock.calls.map((call) => call[1])).toEqual([2, 101]);
  });
});

describe("MessageService.send", () => {
  it.each(["available", "closed", "readyforpayment"])("en estado %s guarda el texto recortado", async (state) => {
    const event = { _id: id(), state };
    const { service, messages } = setup({ event });
    const eventId = String(event._id);
    const author = String(id());

    const result = await service.send(eventId, author, "  Llevo el carbón  ");

    expect(messages.createWithAuthor).toHaveBeenCalledWith({ event: eventId, author, text: "Llevo el carbón" });
    expect(result).toMatchObject({ text: "Llevo el carbón" });
  });

  it.each(["finished", "cancelled"])("en estado %s el chat es de solo lectura -> 409", async (state) => {
    const { service, messages } = setup({ event: { _id: id(), state } });
    await expect(service.send(String(id()), String(id()), "Hola")).rejects.toThrow(
      new ConflictError("The event is finished or cancelled. Its chat is read-only.")
    );
    expect(messages.createWithAuthor).not.toHaveBeenCalled();
  });

  it("evento inexistente -> 404", async () => {
    const { service } = setup({ event: null });
    await expect(service.send(String(id()), String(id()), "Hola")).rejects.toThrow(NotFoundError);
  });

  it.each([undefined, null, "", "   ", 42, ["Hola"]])("texto %s inválido -> 400", async (text) => {
    const { service, messages } = setup();
    await expect(service.send(String(id()), String(id()), text)).rejects.toThrow(
      new BadRequestError("The message text is required.")
    );
    expect(messages.createWithAuthor).not.toHaveBeenCalled();
  });

  it("texto de más de 1000 caracteres -> 400 (1000 entra)", async () => {
    const { service } = setup();
    await expect(service.send(String(id()), String(id()), "a".repeat(1000))).resolves.toBeDefined();
    await expect(service.send(String(id()), String(id()), "a".repeat(1001))).rejects.toThrow(
      new BadRequestError("The message text must be at most 1000 characters.")
    );
  });

  it("id de evento mal formado -> 400", async () => {
    const { service } = setup();
    await expect(service.send("abc", String(id()), "Hola")).rejects.toThrow(new BadRequestError("Invalid ObjectID"));
  });
});

describe("MessageService.send: publicación en tiempo real", () => {
  it("publica en el canal del evento el mensaje guardado", async () => {
    const { service, realtime } = setup();
    const eventId = String(id());

    const result = await service.send(eventId, String(id()), "Hola");

    expect(realtime.publish).toHaveBeenCalledWith(eventId, result);
  });

  it("si la publicación falla, lo loguea y devuelve el mensaje igual", async () => {
    const { service, realtime } = setup();
    realtime.publish.mockRejectedValue(new Error("Ably caído"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(service.send(String(id()), String(id()), "Hola")).resolves.toMatchObject({ text: "Hola" });
    expect(log).toHaveBeenCalled();
  });

  it("no publica si el mensaje no se guarda", async () => {
    const { service, realtime } = setup({ event: { _id: id(), state: "finished" } });
    await expect(service.send(String(id()), String(id()), "Hola")).rejects.toThrow(ConflictError);
    expect(realtime.publish).not.toHaveBeenCalled();
  });
});

describe("MessageService.createChatToken", () => {
  it("pide el token para el evento y el usuario", async () => {
    const { service, realtime } = setup();
    const eventId = String(id());
    const userId = String(id());
    await expect(service.createChatToken(eventId, userId)).resolves.toEqual({ eventId, userId });
    expect(realtime.createTokenRequest).toHaveBeenCalledWith(eventId, userId);
  });

  it("id de evento mal formado -> 400", async () => {
    const { service } = setup();
    expect(() => service.createChatToken("abc", String(id()))).toThrow(new BadRequestError("Invalid ObjectID"));
  });
});
