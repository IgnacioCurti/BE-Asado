import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import {
  addGroupMembers,
  countMessages,
  createEvent,
  createMessage,
  createUser,
  deleteUser,
  newId,
  removeGroupMember,
} from "../helpers/fixtures.js";

// CHAT_FEATURE.md: leen los miembros del grupo del evento, escriben los
// participantes del evento, y finished/cancelled es de solo lectura.
async function scenario(state = "available") {
  const participant = await createUser();
  const groupMember = await createUser();
  const outsider = await createUser();
  const event = await createEvent({ organizer: participant._id, members: [participant._id], state });
  await addGroupMembers(event.group, [groupMember._id]);
  return { participant, groupMember, outsider, event };
}

const getMessages = (eventId: string, token: string, query = "") =>
  api().get(`/api/messages/getMessages/${eventId}${query}`).set(auth(token));

const sendMessage = (eventId: string, token: string, body: unknown) =>
  api().post(`/api/messages/sendMessage/${eventId}`).set(auth(token)).send(body as object);

describe("POST /api/messages/sendMessage/:event", () => {
  it("un participante envía un mensaje: 201 con autor y hora del servidor", async () => {
    const { participant, event } = await scenario();
    const before = Date.now();

    const res = await sendMessage(event._id, participant.token, { text: "  Llevo el carbón  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      _id: expect.any(String),
      event: event._id,
      text: "Llevo el carbón",
      createdAt: expect.any(String),
      author: { _id: participant._id, name: participant.name, lastName: participant.lastName, profilePicture: null },
      __v: 0,
    });
    expect(new Date(res.body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await countMessages()).toBe(1);
  });

  it("ignora author, event y createdAt del body", async () => {
    const { participant, groupMember, event } = await scenario();
    const res = await sendMessage(event._id, participant.token, {
      text: "Hola",
      author: groupMember._id,
      event: newId(),
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ event: event._id, author: { _id: participant._id } });
    expect(res.body.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it.each(["closed", "readyforpayment"])("en estado %s se puede escribir", async (state) => {
    const { participant, event } = await scenario(state);
    expect((await sendMessage(event._id, participant.token, { text: "Hola" })).status).toBe(201);
  });

  it.each(["finished", "cancelled"])("en estado %s el chat es de solo lectura -> 409", async (state) => {
    const { participant, event } = await scenario(state);
    const res = await sendMessage(event._id, participant.token, { text: "Hola" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "The event is finished or cancelled. Its chat is read-only." });
    expect(await countMessages()).toBe(0);
  });

  it("un miembro del grupo que no participa del evento -> 403", async () => {
    const { groupMember, event } = await scenario();
    const res = await sendMessage(event._id, groupMember.token, { text: "Hola" });
    expect(res.status).toBe(403);
    expect(await countMessages()).toBe(0);
  });

  it("alguien de afuera del grupo -> 403", async () => {
    const { outsider, event } = await scenario();
    expect((await sendMessage(event._id, outsider.token, { text: "Hola" })).status).toBe(403);
  });

  it("sin token -> 401", async () => {
    const { event } = await scenario();
    const res = await api().post(`/api/messages/sendMessage/${event._id}`).send({ text: "Hola" });
    expect(res.status).toBe(401);
  });

  it.each([{}, { text: "   " }, { text: 5 }])("texto inválido %j -> 400", async (body) => {
    const { participant, event } = await scenario();
    const res = await sendMessage(event._id, participant.token, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The message text is required." });
  });

  it("texto de más de 1000 caracteres -> 400", async () => {
    const { participant, event } = await scenario();
    const res = await sendMessage(event._id, participant.token, { text: "a".repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The message text must be at most 1000 characters." });
  });

  it("evento inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    expect((await sendMessage(newId(), user.token, { text: "Hola" })).status).toBe(404);
    expect((await sendMessage("abc", user.token, { text: "Hola" })).status).toBe(400);
  });
});

describe("GET /api/messages/getMessages/:event", () => {
  async function withHistory(n: number) {
    const ctx = await scenario();
    const base = new Date("2030-01-01T00:00:00.000Z").getTime();
    const messages = [];
    for (let i = 0; i < n; i++)
      messages.push(
        await createMessage({ event: ctx.event._id, author: ctx.participant._id, text: `m${i}`, createdAt: new Date(base + i * 1000) })
      );
    return { ...ctx, messages };
  }

  it("un miembro del grupo lee el historial, del más nuevo al más viejo, con el autor", async () => {
    const { groupMember, participant, event } = await withHistory(3);

    const res = await getMessages(event._id, groupMember.token);

    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.messages.map((m: any) => m.text)).toEqual(["m2", "m1", "m0"]);
    expect(res.body.messages[0].author).toEqual({ _id: participant._id, name: participant.name, lastName: participant.lastName, profilePicture: null });
  });

  it("no mezcla mensajes de otros eventos", async () => {
    const { participant, event } = await withHistory(1);
    const other = await createEvent({ organizer: participant._id });
    await createMessage({ event: other._id, author: participant._id, text: "otro" });

    const res = await getMessages(event._id, participant.token);

    expect(res.body.messages.map((m: any) => m.text)).toEqual(["m0"]);
  });

  it("pagina con limit y before hasta agotar el historial", async () => {
    const { participant, event } = await withHistory(5);

    const first = await getMessages(event._id, participant.token, "?limit=2");
    expect(first.body.messages.map((m: any) => m.text)).toEqual(["m4", "m3"]);
    expect(first.body.hasMore).toBe(true);

    const second = await getMessages(event._id, participant.token, `?limit=2&before=${first.body.messages[1]._id}`);
    expect(second.body.messages.map((m: any) => m.text)).toEqual(["m2", "m1"]);
    expect(second.body.hasMore).toBe(true);

    const last = await getMessages(event._id, participant.token, `?limit=2&before=${second.body.messages[1]._id}`);
    expect(last.body.messages.map((m: any) => m.text)).toEqual(["m0"]);
    expect(last.body.hasMore).toBe(false);
  });

  it("mensajes con la misma hora no se repiten ni se pierden entre páginas", async () => {
    const ctx = await scenario();
    const at = new Date("2030-01-01T00:00:00.000Z");
    for (let i = 0; i < 4; i++) await createMessage({ event: ctx.event._id, author: ctx.participant._id, text: `m${i}`, createdAt: at });

    const first = await getMessages(ctx.event._id, ctx.participant.token, "?limit=2");
    const second = await getMessages(ctx.event._id, ctx.participant.token, `?limit=2&before=${first.body.messages[1]._id}`);

    const texts = [...first.body.messages, ...second.body.messages].map((m: any) => m.text);
    expect(new Set(texts)).toEqual(new Set(["m0", "m1", "m2", "m3"]));
    expect(second.body.hasMore).toBe(false);
  });

  it("en un evento finished el historial se sigue leyendo", async () => {
    const { participant, event } = await scenario("finished");
    await createMessage({ event: event._id, author: participant._id });
    expect((await getMessages(event._id, participant.token)).body.messages).toHaveLength(1);
  });

  it("si el autor borró su cuenta, el mensaje queda con author null", async () => {
    const { participant, groupMember, event } = await withHistory(1);
    await deleteUser(participant._id);

    const res = await getMessages(event._id, groupMember.token);

    expect(res.status).toBe(200);
    expect(res.body.messages[0]).toMatchObject({ text: "m0", author: null });
  });

  it("un participante que salió del grupo sigue leyendo (regla de eventViewer)", async () => {
    const { participant, event } = await withHistory(1);
    await removeGroupMember(event.group, participant._id);
    expect((await getMessages(event._id, participant.token)).status).toBe(200);
  });

  it("alguien de afuera del grupo -> 403", async () => {
    const { outsider, event } = await withHistory(1);
    expect((await getMessages(event._id, outsider.token)).status).toBe(403);
  });

  it("sin token -> 401", async () => {
    const { event } = await scenario();
    expect((await api().get(`/api/messages/getMessages/${event._id}`)).status).toBe(401);
  });

  it("cursor de otro evento -> 400; limit inválido -> 400", async () => {
    const { participant, event } = await withHistory(1);
    const other = await createEvent({ organizer: participant._id });
    const foreign = await createMessage({ event: other._id, author: participant._id });

    const badCursor = await getMessages(event._id, participant.token, `?before=${foreign._id}`);
    expect(badCursor.status).toBe(400);
    expect(badCursor.body).toEqual({ message: "The cursor message does not belong to the event." });
    expect((await getMessages(event._id, participant.token, "?limit=500")).status).toBe(400);
  });

  it("evento inexistente -> 404", async () => {
    const user = await createUser();
    expect((await getMessages(newId(), user.token)).status).toBe(404);
  });
});
