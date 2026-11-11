import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import {
  addGroupMembers,
  createEvent,
  createGroup,
  createOption,
  createPurchaseReceipt,
  createRating,
  createTransferReceipt,
  createUser,
  newId,
  removeGroupMember,
} from "../helpers/fixtures.js";

const PUBLIC_EVENT_KEYS = [
  "_id",
  "chef",
  "datetime",
  "description",
  "group",
  "isMember",
  "memberLimit",
  "members",
  "penalization",
  "penalizationStartDate",
  "ratings",
  "shoppingDesignee",
  "state",
  "title",
].sort();

describe("GET /api/events/getGroupEvents/:group", () => {
  it("devuelve solo los eventos del grupo, ordenados por fecha descendente, en el formato resumido de getMyEvents", async () => {
    const me = await createUser();
    const other = await createUser();
    const group = await createGroup({ name: "Amigos", members: [me._id, other._id] });
    const old = await createEvent({ organizer: other._id, group: group._id, members: [me._id], datetime: "2029-01-01T00:00:00Z" });
    const recent = await createEvent({ organizer: other._id, group: group._id, members: [], datetime: "2031-01-01T00:00:00Z" });
    await createEvent({ organizer: me._id, title: "de otro grupo" });

    const res = await api().get(`/api/events/getGroupEvents/${group._id}`).set(auth(me.token));

    expect(res.status).toBe(200);
    expect(res.body.map((e: any) => e._id)).toEqual([recent._id, old._id]);
    expect(Object.keys(res.body[0]).sort()).toEqual(PUBLIC_EVENT_KEYS);
    expect(res.body[0]).toMatchObject({ group: { _id: group._id, name: "Amigos" }, members: 0, isMember: false });
    expect(res.body[1]).toMatchObject({ members: 1, isMember: true });
  });

  it("grupo sin eventos -> []", async () => {
    const me = await createUser();
    const group = await createGroup({ members: [me._id] });
    const res = await api().get(`/api/events/getGroupEvents/${group._id}`).set(auth(me.token));
    expect(res.body).toEqual([]);
  });

  it("quien no es miembro del grupo -> 403", async () => {
    const me = await createUser();
    const other = await createUser();
    const group = await createGroup({ members: [other._id] });
    await createEvent({ organizer: other._id, group: group._id });
    const res = await api().get(`/api/events/getGroupEvents/${group._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
  });

  it("sin token -> 401; id mal formado -> 400; inexistente -> 404", async () => {
    const me = await createUser();
    expect((await api().get(`/api/events/getGroupEvents/${newId()}`)).status).toBe(401);
    expect((await api().get("/api/events/getGroupEvents/abc").set(auth(me.token))).status).toBe(400);
    expect((await api().get(`/api/events/getGroupEvents/${newId()}`).set(auth(me.token))).status).toBe(404);
  });
});

describe("GET /api/events/getMyEvents", () => {
  const getMine = (user: { token: string }) => api().get("/api/events/getMyEvents").set(auth(user.token));

  it("devuelve los eventos de todos mis grupos, con información reducida y el grupo", async () => {
    const organizer = await createUser();
    const chef = await createUser({ name: "Chef" });
    const member = await createUser();
    const group = await createGroup({ name: "Amigos", members: [organizer._id, chef._id, member._id] });
    const event = await createEvent({
      organizer: organizer._id,
      group: group._id,
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

    const res = await getMine(member);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const [summary] = res.body;
    expect(Object.keys(summary).sort()).toEqual(PUBLIC_EVENT_KEYS);
    expect(summary).toMatchObject({
      _id: event._id,
      group: { _id: group._id, name: "Amigos" },
      title: event.title,
      description: event.description,
      datetime: event.datetime,
      state: "finished",
      chef: "Chef",
      memberLimit: 12,
      members: 3,
      isMember: true,
      ratings: { avgScore: 4.5, ratingsAmount: 2 },
      penalization: 100,
      penalizationStartDate: "2030-02-01T00:00:00.000Z",
    });
    expect(summary).not.toHaveProperty("organizer");
    expect(summary.shoppingDesignee).toHaveLength(1);
    expect(summary.shoppingDesignee[0]).toMatchObject({ _id: organizer._id, name: organizer.name });
  });

  it("mezcla mis grupos, excluye los ajenos e incluye eventos de los que no soy miembro", async () => {
    const me = await createUser();
    const other = await createUser();
    const g1 = await createGroup({ members: [me._id, other._id] });
    const g2 = await createGroup({ members: [other._id, me._id] });
    const a = await createEvent({ organizer: other._id, group: g1._id, members: [other._id], datetime: "2030-01-01T00:00:00Z" });
    const b = await createEvent({ organizer: other._id, group: g2._id, members: [other._id], datetime: "2032-01-01T00:00:00Z" });
    await createEvent({ organizer: other._id, title: "ajeno", datetime: "2033-01-01T00:00:00Z" });

    const res = await getMine(me);

    expect(res.body.map((e: any) => e._id)).toEqual([b._id, a._id]);
    expect(res.body.map((e: any) => e.group._id)).toEqual([g2._id, g1._id]);
    expect(res.body.map((e: any) => e.isMember)).toEqual([false, false]);
  });

  it("isMember: true solo en los eventos en los que el usuario está anotado", async () => {
    const me = await createUser();
    const other = await createUser();
    const group = await createGroup({ members: [me._id, other._id] });
    const joined = await createEvent({ organizer: other._id, group: group._id, members: [other._id, me._id], datetime: "2031-01-01T00:00:00Z" });
    const notJoined = await createEvent({ organizer: me._id, group: group._id, members: [other._id], datetime: "2030-01-01T00:00:00Z" });

    const res = await getMine(me);

    expect(res.body.map((e: any) => [e._id, e.isMember])).toEqual([
      [joined._id, true],
      [notJoined._id, false],
    ]);
  });

  it("al salir de un grupo dejan de aparecer sus eventos", async () => {
    const me = await createUser();
    const other = await createUser();
    const event = await createEvent({ organizer: other._id, members: [other._id, me._id] });
    await addGroupMembers(event.group, [me._id]);
    expect((await getMine(me)).body).toHaveLength(1);
    await removeGroupMember(event.group, me._id);
    expect((await getMine(me)).body).toEqual([]);
  });

  it("los shoppingDesignee poblados no incluyen el hash ni los datos del código de recuperación", async () => {
    const organizer = await createUser({ verificationCodePlain: "123456" });
    await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const designee = (await getMine(organizer)).body[0].shoppingDesignee[0];
    expect(designee).toMatchObject({ _id: organizer._id, name: organizer.name });
    for (const field of ["password", "verificationCode", "verificationCodeExpiresAt", "verificationAttempts"])
      expect(designee).not.toHaveProperty(field);
  });

  it("sin chef ni calificaciones: chef null y ratings en 0", async () => {
    const organizer = await createUser();
    await createEvent({ organizer: organizer._id });
    const [event] = (await getMine(organizer)).body;
    expect(event.chef).toBeNull();
    expect(event.ratings).toEqual({ avgScore: 0, ratingsAmount: 0 });
    expect(event.shoppingDesignee).toEqual([]);
    expect(event.penalization).toBeNull();
    expect(event.penalizationStartDate).toBeNull();
  });

  it("ordena por fecha descendente y desempata por _id ascendente", async () => {
    const organizer = await createUser();
    const group = await createGroup({ members: [organizer._id] });
    const e = (datetime: string) => createEvent({ organizer: organizer._id, group: group._id, datetime });
    const a = await e("2030-01-01T00:00:00Z");
    const b = await e("2032-01-01T00:00:00Z");
    const c1 = await e("2031-01-01T00:00:00Z");
    const c2 = await e("2031-01-01T00:00:00Z");
    const res = await getMine(organizer);
    expect(res.body.map((x: any) => x._id)).toEqual([b._id, ...[c1._id, c2._id].sort(), a._id]);
  });

  it("sin grupos -> []", async () => {
    const me = await createUser();
    const res = await getMine(me);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/events/getEventById/:id", () => {
  it("devuelve el evento con relaciones pobladas", async () => {
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

    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(chef.token));

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

  it("los usuarios poblados no incluyen el hash ni los datos del código de recuperación", async () => {
    const organizer = await createUser({ verificationCodePlain: "123456" });
    const event = await createEvent({ organizer: organizer._id, chef: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(organizer.token));
    const users = [res.body.organizer, res.body.chef, res.body.members[0], res.body.shoppingDesignee[0]];
    for (const user of users) {
      expect(user._id).toBe(organizer._id);
      for (const field of ["password", "verificationCode", "verificationCodeExpiresAt", "verificationAttempts"])
        expect(user).not.toHaveProperty(field);
    }
  });

  it("chef null si no hay chef", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(organizer.token));
    expect(res.body.chef).toBeNull();
  });

  it("lo ve un miembro del grupo que no es miembro del evento", async () => {
    const organizer = await createUser();
    const groupMate = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await addGroupMembers(event.group, [groupMate._id]);
    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(groupMate.token));
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(event._id);
  });

  it("lo sigue viendo un miembro del evento que salió del grupo", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, member._id], state: "finished" });
    await removeGroupMember(event.group, member._id);
    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
  });

  it("quien no es del grupo ni del evento -> 403", async () => {
    const organizer = await createUser();
    const stranger = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api().get(`/api/events/getEventById/${event._id}`).set(auth(stranger.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not a member of the event's group." });
  });

  it("sin token -> 401", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    expect((await api().get(`/api/events/getEventById/${event._id}`)).status).toBe(401);
  });

  it("inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().get(`/api/events/getEventById/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID does not exist." });
  });

  it("id mal formado -> 400", async () => {
    const me = await createUser();
    const res = await api().get("/api/events/getEventById/abc").set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid ObjectID" });
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

    const res = await api().get(`/api/events/getMembersAndReceiptsInfo/${event._id}`).set(auth(beto.token));

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

  it("sin token -> 401", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    expect((await api().get(`/api/events/getMembersAndReceiptsInfo/${event._id}`)).status).toBe(401);
  });

  it("quien no es del grupo ni del evento recibe 403", async () => {
    const ana = await createUser();
    const stranger = await createUser();
    const event = await createEvent({ organizer: ana._id });
    const res = await api().get(`/api/events/getMembersAndReceiptsInfo/${event._id}`).set(auth(stranger.token));
    expect(res.status).toBe(403);
  });

  it("evento inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().get(`/api/events/getMembersAndReceiptsInfo/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID does not exist." });
  });

  it("id mal formado -> 400", async () => {
    const me = await createUser();
    expect((await api().get("/api/events/getMembersAndReceiptsInfo/abc").set(auth(me.token))).status).toBe(400);
  });
});

describe("GET /api/events/getMembersAmount/:event", () => {
  it("devuelve quién le transfiere a quién y cuánto", async () => {
    const ana = await createUser({ name: "Ana", cbu: "cbu-ana", alias: "ana.mp" });
    const beto = await createUser({ name: "Beto" });
    const caro = await createUser({ name: "Caro" });
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 300, participants: [ana._id, beto._id, caro._id] });

    const res = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(ana.token));

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

    const res = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(ana.token));
    expect(res.body.map((t: any) => t.userId)).toEqual([beto._id, ana._id]);
  });

  it("un comprobante sin participantes no lo paga nadie (monto 0, no null)", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 50, participants: [] });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 30, participants: [beto._id] });
    const res = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ userId: beto._id, amount: 30 }),
      expect.objectContaining({ userId: ana._id, amount: 0, receiver: null }),
    ]);
  });

  it("sin comprobantes de compra -> 400", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    const res = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event has no purchase receipts." });
  });

  it("sin token -> 401", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    expect((await api().get(`/api/events/getMembersAmount/${event._id}`)).status).toBe(401);
  });

  it("quien no es del grupo ni del evento recibe 403", async () => {
    const ana = await createUser();
    const stranger = await createUser();
    const event = await createEvent({ organizer: ana._id });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 50, participants: [ana._id] });
    const res = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(stranger.token));
    expect(res.status).toBe(403);
  });

  it("evento inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().get(`/api/events/getMembersAmount/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID does not exist." });
  });

  it("id mal formado -> 400", async () => {
    const me = await createUser();
    expect((await api().get("/api/events/getMembersAmount/abc").set(auth(me.token))).status).toBe(400);
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
    const amounts = await api().get(`/api/events/getMembersAmount/${event._id}`).set(auth(ana.token));
    const caroTransfer = amounts.body.find((t: any) => t.userId === caro._id);
    expect(caroTransfer.amount).toBe(cost.body.userAmount);
  });

  it("cada miembro puede consultar su propio costo", async () => {
    const { caro, event } = await scenario("finished");
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(caro.token));
    expect(res.status).toBe(200);
  });

  it("un miembro que no es organizador ni comprador no puede ver el costo de otro -> 403", async () => {
    const { beto, caro, event } = await scenario("finished");
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(beto.token));
    expect(res.status).toBe(403);
  });

  it("un comprador puede ver el costo de otro miembro", async () => {
    const { ana, beto, caro } = await scenario("finished");
    const event = await createEvent({
      organizer: ana._id,
      members: [ana._id, beto._id, caro._id],
      shoppingDesignee: [beto._id],
      state: "finished",
    });
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(beto.token));
    expect(res.status).toBe(200);
  });

  it("un usuario ajeno al evento -> 403", async () => {
    const { caro, event } = await scenario("finished");
    const stranger = await createUser();
    const res = await api().get(`/api/events/getMemberIndividualCost/${caro._id}/${event._id}`).set(auth(stranger.token));
    expect(res.status).toBe(403);
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
