import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import {
  createEvent,
  createOption,
  createPurchaseReceipt,
  createRating,
  createTransferReceipt,
  createUser,
  insertRawEvent,
  newId,
} from "../helpers/fixtures.js";

const PUBLIC_EVENT_KEYS = [
  "_id",
  "chef",
  "datetime",
  "description",
  "isPrivate",
  "memberLimit",
  "members",
  "penalization",
  "penalizationStartDate",
  "ratings",
  "shoppingDesignee",
  "state",
  "title",
].sort();

describe("GET /api/events/getEvents", () => {
  it("devuelve todos los eventos (públicos y privados) ordenados por fecha descendente, sin poblar", async () => {
    const user = await createUser();
    const old = await createEvent({ organizer: user._id, title: "viejo", datetime: "2029-01-01T00:00:00Z" });
    const priv = await createEvent({ organizer: user._id, title: "privado", isPrivate: true, datetime: "2031-01-01T00:00:00Z" });
    const mid = await createEvent({ organizer: user._id, title: "medio", datetime: "2030-01-01T00:00:00Z" });

    const res = await api().get("/api/events/getEvents").set(auth(user.token));

    expect(res.status).toBe(200);
    expect(res.body.map((e: any) => e._id)).toEqual([priv._id, mid._id, old._id]);
    expect(res.body[0]).toMatchObject({
      title: "privado",
      organizer: user._id,
      members: [user._id],
      isPrivate: true,
      state: "available",
    });
  });

  it("a igual fecha desempata por _id ascendente", async () => {
    const user = await createUser();
    const lowerId = newId();
    const higherId = newId();
    await createEvent({ _id: higherId, organizer: user._id, datetime: "2030-01-01T00:00:00Z" });
    await createEvent({ _id: lowerId, organizer: user._id, datetime: "2030-01-01T00:00:00Z" });

    const res = await api().get("/api/events/getEvents").set(auth(user.token));

    expect(res.body.map((e: any) => e._id)).toEqual([lowerId, higherId]);
  });

  it("devuelve [] si no hay eventos", async () => {
    const user = await createUser();
    const res = await api().get("/api/events/getEvents").set(auth(user.token));
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/events/getPublicEvents", () => {
  it("devuelve solo eventos no privados, con información reducida", async () => {
    const organizer = await createUser();
    const chef = await createUser({ name: "Chef" });
    const member = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      chef: chef._id,
      members: [organizer._id, chef._id, member._id],
      shoppingDesignee: [organizer._id],
      memberLimit: 12,
      penalization: 100,
      penalizationStartDate: "2030-02-01T00:00:00.000Z",
      state: "finished",
    });
    await createRating({ event: event._id, user: member._id, score: 4 });
    await createRating({ event: event._id, user: chef._id, score: 5 });
    await createEvent({ organizer: organizer._id, isPrivate: true });

    const res = await api().get("/api/events/getPublicEvents");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const [publicEvent] = res.body;
    expect(Object.keys(publicEvent).sort()).toEqual(PUBLIC_EVENT_KEYS);
    expect(publicEvent).toMatchObject({
      _id: event._id,
      title: event.title,
      description: event.description,
      datetime: event.datetime,
      state: "finished",
      chef: "Chef",
      memberLimit: 12,
      members: 3,
      ratings: { avgScore: 4.5, ratingsAmount: 2 },
      isPrivate: false,
      penalization: 100,
      penalizationStartDate: "2030-02-01T00:00:00.000Z",
    });
    expect(publicEvent).not.toHaveProperty("organizer");
    expect(publicEvent.shoppingDesignee).toHaveLength(1);
    expect(publicEvent.shoppingDesignee[0]).toMatchObject({ _id: organizer._id, name: organizer.name });
  });

  it("[SEGURIDAD - comportamiento actual] endpoint público que expone el hash de contraseña de los shoppingDesignee", async () => {
    const organizer = await createUser({ verificationCodePlain: "123456" });
    await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api().get("/api/events/getPublicEvents");
    expect(res.body[0].shoppingDesignee[0].password).toBe(organizer.password);
    expect(res.body[0].shoppingDesignee[0].verificationCode).toEqual(expect.any(String));
  });

  it("sin chef ni calificaciones: chef null y ratings en 0", async () => {
    const organizer = await createUser();
    await createEvent({ organizer: organizer._id });
    const [event] = (await api().get("/api/events/getPublicEvents")).body;
    expect(event.chef).toBeNull();
    expect(event.ratings).toEqual({ avgScore: 0, ratingsAmount: 0 });
    expect(event.shoppingDesignee).toEqual([]);
    expect(event.penalization).toBeNull();
    expect(event.penalizationStartDate).toBeNull();
  });

  it("[comportamiento actual] una penalización de 0 se devuelve como null", async () => {
    const organizer = await createUser();
    await createEvent({ organizer: organizer._id, penalization: 0 });
    const [event] = (await api().get("/api/events/getPublicEvents")).body;
    expect(event.penalization).toBeNull();
  });

  it("ordena por fecha del evento descendente", async () => {
    const organizer = await createUser();
    const a = await createEvent({ organizer: organizer._id, datetime: "2030-01-01T00:00:00Z" });
    const b = await createEvent({ organizer: organizer._id, datetime: "2032-01-01T00:00:00Z" });
    const c = await createEvent({ organizer: organizer._id, datetime: "2031-01-01T00:00:00Z" });
    const res = await api().get("/api/events/getPublicEvents");
    expect(res.body.map((e: any) => e._id)).toEqual([b._id, c._id, a._id]);
  });

  it("compatibilidad con eventos viejos sin isPrivate/ratings/penalization", async () => {
    const organizer = await createUser();
    const legacyId = await insertRawEvent({
      title: "legado",
      description: "d",
      datetime: new Date("2020-01-01T00:00:00Z"),
      memberLimit: 5,
      state: "finished",
      organizer: organizer._id,
      members: [],
      chef: null,
      shoppingDesignee: [],
    });
    const res = await api().get("/api/events/getPublicEvents");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      _id: legacyId,
      isPrivate: false,
      penalization: null,
      penalizationStartDate: null,
      ratings: { avgScore: 0, ratingsAmount: 0 },
      members: 0,
    });
  });
});

describe("GET /api/events/getPublicAndPrivateEvents", () => {
  it("incluye públicos + privados donde el usuario es miembro, y excluye otros privados", async () => {
    const me = await createUser();
    const other = await createUser();
    const pub = await createEvent({ organizer: other._id, title: "publico", datetime: "2030-01-01T00:00:00Z" });
    const mine = await createEvent({
      organizer: other._id,
      members: [other._id, me._id],
      isPrivate: true,
      title: "privado mío",
      datetime: "2031-01-01T00:00:00Z",
    });
    await createEvent({ organizer: other._id, isPrivate: true, title: "privado ajeno" });

    const res = await api().get("/api/events/getPublicAndPrivateEvents").set(auth(me.token));

    expect(res.status).toBe(200);
    expect(res.body.map((e: any) => e._id)).toEqual([mine._id, pub._id]);
    expect(Object.keys(res.body[0]).sort()).toEqual(PUBLIC_EVENT_KEYS);
    expect(res.body[0]).toMatchObject({ isPrivate: true, members: 2 });
  });

  it("[comportamiento actual] un organizador que no es miembro no ve su propio evento privado", async () => {
    const me = await createUser();
    await createEvent({ organizer: me._id, members: [], isPrivate: true });
    const res = await api().get("/api/events/getPublicAndPrivateEvents").set(auth(me.token));
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/events/getEventById/:id", () => {
  it("devuelve el evento con relaciones pobladas (endpoint público)", async () => {
    const organizer = await createUser({ name: "Orga" });
    const chef = await createUser({ name: "Chef" });
    const event = await createEvent({
      organizer: organizer._id,
      chef: chef._id,
      members: [organizer._id, chef._id],
      shoppingDesignee: [organizer._id],
      state: "readyforpayment",
    });
    const purchase = await createPurchaseReceipt({
      event: event._id,
      shoppingDesignee: organizer._id,
      amount: 100,
      participants: [organizer._id, chef._id],
    });
    const transfer = await createTransferReceipt({ event: event._id, user: chef._id, amount: 50, receiver: organizer._id });
    const option = await createOption({ event: event._id, title: "Vacío", participants: [chef._id] });
    const rating = await createRating({ event: event._id, user: chef._id, score: 5 });

    const res = await api().get(`/api/events/getEventById/${event._id}`);

    expect(res.status).toBe(200);
    const body = res.body;
    expect(body._id).toBe(event._id);
    expect(body.organizer).toMatchObject({ _id: organizer._id, name: "Orga", email: organizer.email });
    expect(body.chef).toMatchObject({ _id: chef._id, name: "Chef" });
    expect(body.members.map((m: any) => m._id)).toEqual([organizer._id, chef._id]);
    expect(body.shoppingDesignee.map((m: any) => m._id)).toEqual([organizer._id]);
    // comprobantes poblados un nivel (sus referencias quedan como ids)
    expect(body.purchaseReceipts).toEqual([
      expect.objectContaining({ _id: purchase._id, amount: 100, shoppingDesignee: organizer._id, participants: [organizer._id, chef._id] }),
    ]);
    expect(body.transferReceipts).toEqual([
      expect.objectContaining({ _id: transfer._id, amount: 50, user: chef._id, receiver: organizer._id, hasPaid: false }),
    ]);
    // opciones con participantes reducidos a { _id, name, lastName }
    expect(body.options).toEqual([
      expect.objectContaining({
        _id: option._id,
        title: "Vacío",
        participants: [{ _id: chef._id, name: "Chef", lastName: chef.lastName }],
      }),
    ]);
    // ratings NO se pueblan
    expect(body.ratings).toEqual([rating._id]);
  });

  it("[SEGURIDAD - comportamiento actual] endpoint público que expone hashes de contraseña de miembros/organizador", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api().get(`/api/events/getEventById/${event._id}`);
    expect(res.body.organizer.password).toBe(organizer.password);
    expect(res.body.members[0].password).toBe(organizer.password);
  });

  it("chef null si no hay chef", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api().get(`/api/events/getEventById/${event._id}`);
    expect(res.body.chef).toBeNull();
  });

  it("inexistente -> 404", async () => {
    const res = await api().get(`/api/events/getEventById/${newId()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID was not found." });
  });

  it("[comportamiento actual] id mal formado -> 500", async () => {
    const res = await api().get("/api/events/getEventById/abc");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/events/getMembersAndReceiptsInfo/:event", () => {
  it("lista cada miembro con el estado de su comprobante de transferencia", async () => {
    const ana = await createUser({ name: "Ana", specialDiet: ["vegan"] });
    const beto = await createUser({ name: "Beto" });
    const caro = await createUser({ name: "Caro" });
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id] });
    const betoReceipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 10, hasPaid: true });
    const caroReceipt = await createTransferReceipt({ event: event._id, user: caro._id, amount: 10 });

    const res = await api().get(`/api/events/getMembersAndReceiptsInfo/${event._id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        userId: ana._id,
        userName: "Ana",
        userLastName: ana.lastName,
        specialDiet: ["vegan"],
        transferReceipt: null,
        hasReceiptApproved: null,
        hasUploaded: false,
      },
      {
        userId: beto._id,
        userName: "Beto",
        userLastName: beto.lastName,
        specialDiet: [],
        transferReceipt: betoReceipt._id,
        hasReceiptApproved: true,
        hasUploaded: true,
      },
      {
        userId: caro._id,
        userName: "Caro",
        userLastName: caro.lastName,
        specialDiet: [],
        transferReceipt: caroReceipt._id,
        hasReceiptApproved: false,
        hasUploaded: true,
      },
    ]);
  });

  it("es público (no requiere token)", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    expect((await api().get(`/api/events/getMembersAndReceiptsInfo/${event._id}`)).status).toBe(200);
  });

  it("[comportamiento actual] evento inexistente -> 500", async () => {
    const res = await api().get(`/api/events/getMembersAndReceiptsInfo/${newId()}`);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/events/getMembersAmount/:event", () => {
  it("devuelve quién le transfiere a quién y cuánto", async () => {
    const ana = await createUser({ name: "Ana", cbu: "cbu-ana", alias: "ana.mp" });
    const beto = await createUser({ name: "Beto" });
    const caro = await createUser({ name: "Caro" });
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 300, participants: [ana._id, beto._id, caro._id] });

    const res = await api().get(`/api/events/getMembersAmount/${event._id}`);

    const toAna = {
      receiverId: ana._id,
      receiverName: "Ana",
      receiverLastName: ana.lastName,
      receiverCbu: "cbu-ana",
      receiverAlias: "ana.mp",
    };
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { userId: beto._id, userName: "Beto", amount: 100, receiver: toAna },
      { userId: caro._id, userName: "Caro", amount: 100, receiver: toAna },
      { userId: ana._id, userName: "Ana", amount: 0, receiver: null },
    ]);
  });

  it("los miembros que no participan de ningún comprobante no aparecen", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const ausente = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, ausente._id] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 50, participants: [beto._id] });

    const res = await api().get(`/api/events/getMembersAmount/${event._id}`);
    expect(res.body.map((t: any) => t.userId)).toEqual([beto._id, ana._id]);
  });

  it("[comportamiento actual] un comprobante sin participantes produce amount null (NaN serializado)", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 50, participants: [] });
    const res = await api().get(`/api/events/getMembersAmount/${event._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ userId: ana._id, amount: null })]);
  });

  it("sin comprobantes de compra -> 400", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    const res = await api().get(`/api/events/getMembersAmount/${event._id}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event has no purchase receipts." });
  });

  it("evento inexistente -> 404", async () => {
    const res = await api().get(`/api/events/getMembersAmount/${newId()}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID was not found." });
  });

  it("[comportamiento actual] id mal formado -> 500", async () => {
    expect((await api().get("/api/events/getMembersAmount/abc")).status).toBe(500);
  });
});

describe("GET /api/events/getMemberIndividualCost/:user/:event", () => {
  async function scenario(state: string) {
    const ana = await createUser();
    const beto = await createUser();
    const caro = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id], state });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 100, participants: [ana._id, beto._id, caro._id] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: beto._id, amount: 50, participants: [beto._id, caro._id] });
    return { ana, beto, caro, event };
  }

  it.each(["readyforpayment", "finished"])("en estado %s devuelve la suma de las partes del usuario redondeadas a centavos", async (state) => {
    const { ana, caro, event } = await scenario(state);
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userAmount: 58.33 });
  });

  it("solo suma los comprobantes en los que participa el usuario", async () => {
    const { ana, event } = await scenario("finished");
    const res = await api().get(`/api/events/getMemberIndividualCost/${ana._id}/${event._id}`).set(auth(ana.token));
    expect(res.body).toEqual({ userAmount: 33.33 });
  });

  it("coincide con el costo que usa getMembersAmount", async () => {
    const { ana, caro, event } = await scenario("readyforpayment");
    const cost = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(ana.token));
    const amounts = await api().get(`/api/events/getMembersAmount/${event._id}`);
    const caroTransfer = amounts.body.find((t: any) => t.userId === caro._id);
    expect(caroTransfer.amount).toBe(cost.body.userAmount);
  });

  it("cualquier usuario autenticado puede consultar el costo de otro", async () => {
    const { caro, event } = await scenario("finished");
    const stranger = await createUser();
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(stranger.token));
    expect(res.status).toBe(200);
  });

  it("sin comprobantes devuelve 0", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id, state: "finished" });
    const res = await api().get(`/api/events/getMemberIndividualCost/${ana._id}/${event._id}`).set(auth(ana.token));
    expect(res.body).toEqual({ userAmount: 0 });
  });

  it.each(["available", "closed", "cancelled"])("en estado %s -> 403", async (state) => {
    const { ana, event } = await scenario(state);
    const res = await api().get(`/api/events/getMemberIndividualCost/${ana._id}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Event state needs to be either finished or ready for payment" });
  });

  it("usuario que no es miembro -> 403", async () => {
    const { ana, event } = await scenario("finished");
    const stranger = await createUser();
    const res = await api().get(`/api/events/getMemberIndividualCost/${stranger._id}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "User is not a member of the event" });
  });

  it("evento inexistente -> 404", async () => {
    const ana = await createUser();
    const res = await api().get(`/api/events/getMemberIndividualCost/${ana._id}/${newId()}`).set(auth(ana.token));
    expect(res.status).toBe(404);
  });

  it("[comportamiento actual] ids mal formados -> 500", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id, state: "finished" });
    expect((await api().get(`/api/events/getMemberIndividualCost/abc/${event._id}`).set(auth(ana.token))).status).toBe(500);
    expect((await api().get(`/api/events/getMemberIndividualCost/${ana._id}/abc`).set(auth(ana.token))).status).toBe(500);
  });
});
