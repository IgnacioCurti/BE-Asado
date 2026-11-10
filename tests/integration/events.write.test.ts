import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import {
  countEvents,
  countImages,
  countOptions,
  countPurchaseReceipts,
  countRatings,
  countReminders,
  countTransferReceipts,
  addGroupMembers,
  createEvent,
  createGroup,
  createImage,
  createOption,
  createPurchaseReceipt,
  createRating,
  createReminder,
  createTransferReceipt,
  createUser,
  findEvent,
  findOption,
  findPurchaseReceipt,
  findReminders,
  newId,
  removeGroupMember,
  remindersByType,
  simulateDeleteFailure,
  updateEvent,
  UserFixture,
} from "../helpers/fixtures.js";
import { sentEmails, setBrevoResponseStatus } from "../helpers/mailer.js";

// Fechas: hora de Argentina guardada como UTC (ver README, "Date convention"); los tests corren con TZ=UTC.

// Sin group en overrides, crea un grupo con el organizador como único miembro.
async function eventBody(organizer: UserFixture, overrides: Record<string, unknown> = {}) {
  const group = "group" in overrides ? undefined : (await createGroup({ members: [organizer._id] }))._id;
  return {
    group,
    title: "Asado",
    description: "Asado de fin de año",
    datetime: "2030-01-10T21:00:00.000Z",
    memberLimit: 10,
    members: [organizer._id],
    organizer: organizer._id,
    ...overrides,
  };
}

describe("POST /api/events/createEvent", () => {
  it("crea el evento con defaults y responde 201", async () => {
    const organizer = await createUser();
    const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await eventBody(organizer));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      _id: expect.any(String),
      title: "Asado",
      description: "Asado de fin de año",
      datetime: "2030-01-10T21:00:00.000Z",
      memberLimit: 10,
      members: [organizer._id],
      organizer: organizer._id,
      state: "available",
      chef: null,
      shoppingDesignee: [],
      transferReceipts: [],
      purchaseReceipts: [],
      ratings: [],
      options: [],
      penalization: null,
    });
    expect(res.body).not.toHaveProperty("isPrivate");
    expect(await findEvent(res.body._id)).not.toBeNull();
  });

  it("isChef pone al organizador como chef; isShoppingDesignee lo agrega como comprador", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { isChef: true, isShoppingDesignee: true }));
    expect(res.body.chef).toBe(organizer._id);
    expect(res.body.shoppingDesignee).toEqual([organizer._id]);
  });

  it("[comportamiento actual] chef enviado en el body se ignora si isChef es falso", async () => {
    const organizer = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { chef: other._id }));
    expect(res.body.chef).toBeNull();
  });

  it("shoppingDesignee del body se ignora: solo isShoppingDesignee suma al organizador", async () => {
    const organizer = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { shoppingDesignee: [other._id], isShoppingDesignee: true }));
    expect(res.body.shoppingDesignee).toEqual([organizer._id]);
  });

  describe("grupo del evento", () => {
    it("el evento queda en el grupo del body", async () => {
      const organizer = await createUser();
      const group = await createGroup({ members: [organizer._id] });
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { group: group._id }));
      expect(res.status).toBe(201);
      expect(res.body.group).toBe(group._id);
      expect((await findEvent(res.body._id))!.group).toBe(group._id);
    });

    it.each([
      ["sin grupo", undefined, "The event's group is required."],
      ["grupo mal formado", "abc", "Invalid ObjectID"],
    ])("%s -> 400 y no crea nada", async (_case, group, message) => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { group }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message });
      expect(await countEvents()).toBe(0);
    });

    it("grupo inexistente -> 404", async () => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { group: newId() }));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "The group with the given ID does not exist." });
      expect(await countEvents()).toBe(0);
    });

    it("en un grupo del que no es miembro -> 403", async () => {
      const organizer = await createUser();
      const other = await createUser();
      const group = await createGroup({ members: [other._id] });
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { group: group._id }));
      expect(res.status).toBe(403);
      expect(await countEvents()).toBe(0);
    });
  });

  it("el organizador se toma del token, no del body", async () => {
    const caller = await createUser();
    const someoneElse = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(caller.token))
      .send(
        await eventBody(someoneElse, {
          group: (await createGroup({ members: [caller._id, someoneElse._id] }))._id,
          members: [caller._id],
          isChef: true,
          isShoppingDesignee: true,
        })
      );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organizer: caller._id,
      members: [caller._id],
      chef: caller._id,
      shoppingDesignee: [caller._id],
    });
  });

  it("members del body solo puede sumar al organizador: los demás ids se ignoran", async () => {
    const organizer = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { members: [other._id, organizer._id] }));
    expect(res.body.members).toEqual([organizer._id]);

    const withoutMe = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { members: [other._id] }));
    expect(withoutMe.body.members).toEqual([]);
  });

  it("[comportamiento actual] el organizador no se agrega automáticamente como miembro", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { members: undefined }));
    expect(res.body.members).toEqual([]);
  });

  it("acepta penalization y penalizationStartDate; ignora isPrivate", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { isPrivate: true, penalization: 200, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    expect(res.body).toMatchObject({ penalization: 200, penalizationStartDate: "2030-01-15T12:00:00.000Z" });
    expect(res.body).not.toHaveProperty("isPrivate");
    expect(await findEvent(res.body._id)).not.toHaveProperty("isPrivate");
  });

  it.each(["title", "description", "datetime", "memberLimit"])(
    "sin %s -> 400 y no crea nada",
    async (field) => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { [field]: undefined }));
      expect(res.status).toBe(400);
      expect(res.body.message).toContain(field);
      expect(await countEvents()).toBe(0);
    }
  );

  it("ignora los campos que administra el backend (state, comprobantes, ratings, opciones)", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(
        await eventBody(organizer, {
          state: "finished",
          purchaseReceipts: [newId()],
          transferReceipts: [newId()],
          ratings: [newId()],
          options: [newId()],
        })
      );
    expect(res.status).toBe(201);
    const saved = await findEvent(res.body._id);
    expect(saved).toMatchObject({
      state: "available",
      purchaseReceipts: [],
      transferReceipts: [],
      ratings: [],
      options: [],
    });
  });

  describe("recordatorios", () => {
    it("crea un recordatorio eventStart 30 minutos antes del evento", async () => {
      const organizer = await createUser();
      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await eventBody(organizer));
      expect((await remindersByType(res.body._id)).eventStart).toEqual([
        expect.objectContaining({ type: "eventStart", datetime: "2030-01-10T20:30:00.000Z", event: res.body._id }),
      ]);
    });

    it("crea un recordatorio newEvent con fecha = ahora - 3 horas", async () => {
      const organizer = await createUser();
      const before = Date.now();
      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await eventBody(organizer));
      const after = Date.now();
      const newEvent = (await remindersByType(res.body._id)).newEvent;
      expect(newEvent).toHaveLength(1);
      const datetime = new Date(newEvent![0].datetime).getTime();
      expect(datetime).toBeGreaterThanOrEqual(before - 3 * 60 * 60 * 1000 - 1000);
      expect(datetime).toBeLessThanOrEqual(after - 3 * 60 * 60 * 1000 + 1000);
    });

    it("con penalización crea además penalizationStart (20:00 del día anterior) y penalizationOneWeek (+7 días)", async () => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
      const byType = await remindersByType(res.body._id);
      expect(byType.eventStart?.map((r) => r.datetime)).toEqual(["2030-01-10T20:30:00.000Z"]);
      expect(byType.penalizationStart?.map((r) => r.datetime)).toEqual(["2030-01-14T20:00:00.000Z"]);
      expect(byType.penalizationOneWeek?.map((r) => r.datetime)).toEqual(["2030-01-21T20:00:00.000Z"]);
    });

    it("penalización 0 o sin fecha de inicio: solo eventStart", async () => {
      const organizer = await createUser();
      const a = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { penalization: 0, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
      const b = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await eventBody(organizer, { penalization: 100 }));
      expect(Object.keys(await remindersByType(a.body._id)).sort()).toEqual(["eventStart", "newEvent"]);
      expect(Object.keys(await remindersByType(b.body._id)).sort()).toEqual(["eventStart", "newEvent"]);
    });
  });

  describe("notificación de nuevo evento", () => {
    // Grupo con el organizador y los usuarios dados; devuelve el body del evento.
    async function groupEventBody(organizer: UserFixture, others: UserFixture[], overrides: Record<string, unknown> = {}) {
      const group = await createGroup({ name: "Amigos", members: [organizer._id, ...others.map((u) => u._id)] });
      return eventBody(organizer, { group: group._id, ...overrides });
    }

    it("crear el evento no manda mails: los manda el siguiente reminderCheck", async () => {
      const organizer = await createUser();
      const member = await createUser({ notifications: { newEvent: true } as any });
      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await groupEventBody(organizer, [member]));
      expect(res.status).toBe(201);
      expect(sentEmails).toHaveLength(0);
    });

    it("notifica solo a los miembros del grupo con notifications.newEvent, sin el organizador", async () => {
      const organizer = await createUser({ notifications: { newEvent: true } as any });
      const wantsIt = await createUser({ name: "Quiere", notifications: { newEvent: true } as any });
      const other = await createUser({ name: "Otro", notifications: { newEvent: true } as any });
      const muted = await createUser({ notifications: { newEvent: false } as any });
      await createUser({ name: "Ajeno", notifications: { newEvent: true } as any });

      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(await groupEventBody(organizer, [wantsIt, other, muted]));
      await api().get("/api/cron/reminderCheck").expect(200);

      expect(res.status).toBe(201);
      expect(sentEmails.map((m) => m.payload.to[0]).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { email: other.email, name: "Otro" },
        { email: wantsIt.email, name: "Quiere" },
      ]);
      for (const mail of sentEmails) {
        expect(mail.payload.subject).toBe("FoodSpot | Nuevo evento");
        expect(mail.payload.htmlContent).toContain(`https://food-spot.vercel.app/event/${res.body._id}`);
        expect(mail.payload.htmlContent).toContain("<strong>Amigos</strong>");
      }
    });

    it("usa los miembros del grupo al momento del cron: incluye a quien entró y excluye a quien salió", async () => {
      const organizer = await createUser();
      const leaver = await createUser({ notifications: { newEvent: true } as any });
      const joiner = await createUser({ notifications: { newEvent: true } as any });
      const group = await createGroup({ members: [organizer._id, leaver._id] });
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await eventBody(organizer, { group: group._id })).expect(201);
      await removeGroupMember(group._id, leaver._id);
      await addGroupMembers(group._id, [joiner._id]);

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails.map((m) => m.payload.to[0].email)).toEqual([joiner.email]);
    });

    it("si el evento se cancela antes del cron, no notifica", async () => {
      const organizer = await createUser();
      const member = await createUser({ notifications: { newEvent: true } as any });
      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await groupEventBody(organizer, [member]));
      await updateEvent(res.body._id, { state: "cancelled" });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
    });

    it("si el envío de mails falla, se intenta notificar a todos y el recordatorio se consume", async () => {
      const organizer = await createUser();
      const a = await createUser({ notifications: { newEvent: true } as any });
      const b = await createUser({ notifications: { newEvent: true } as any });
      setBrevoResponseStatus(500);

      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await groupEventBody(organizer, [a, b]));
      await api().get("/api/cron/reminderCheck").expect(200);

      expect(res.status).toBe(201);
      expect(sentEmails).toHaveLength(2);
      expect(Object.keys(await remindersByType(res.body._id))).toEqual(["eventStart"]);
    });
  });

  it("crear un evento no borra eventos terminados ni cancelados (se eliminó la limpieza automática)", async () => {
    const organizer = await createUser();
    for (let i = 0; i < 8; i++)
      await createEvent({ organizer: organizer._id, state: i % 2 ? "finished" : "cancelled", datetime: `${2010 + i}-01-01T00:00:00.000Z` });
    await api().post("/api/events/createEvent").set(auth(organizer.token)).send(await eventBody(organizer)).expect(201);
    expect(await countEvents()).toBe(9);
  });
});

describe("PUT /api/events/subscribeToAnEvent/:id/:event", () => {
  it("agrega al usuario como miembro y como participante de todos los comprobantes existentes", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    await addGroupMembers(event.group, [me._id]);
    const r1 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: organizer._id, amount: 10, participants: [organizer._id] });
    const r2 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: organizer._id, amount: 20, participants: [] });

    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([organizer._id, me._id]);
    // la respuesta trae los comprobantes de compra poblados
    expect(res.body.purchaseReceipts.map((r: any) => r._id)).toEqual([r1._id, r2._id]);
    expect((await findEvent(event._id))!.members).toEqual([organizer._id, me._id]);
    expect((await findPurchaseReceipt(r1._id))!.participants).toEqual([organizer._id, me._id]);
    expect((await findPurchaseReceipt(r2._id))!.participants).toEqual([me._id]);
  });

  it("quien no es miembro del grupo del evento -> 403 y no se suma", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not a member of the event's group." });
    expect((await findEvent(event._id))!.members).toEqual([organizer._id]);
  });

  it("ser miembro de otro grupo no alcanza", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await createGroup({ members: [organizer._id, me._id] });
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
  });


  it("evento lleno -> 400", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id], memberLimit: 1 });
    await addGroupMembers(event.group, [me._id]);
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event is full." });
  });

  it("dos altas simultáneas con un solo lugar libre: entra una y la otra recibe 400", async () => {
    const organizer = await createUser();
    const a = await createUser();
    const b = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id], memberLimit: 2 });
    await addGroupMembers(event.group, [a._id, b._id]);

    const results = await Promise.all([
      api().put(`/api/events/subscribeToAnEvent/${a._id}/${event._id}`).set(auth(a.token)),
      api().put(`/api/events/subscribeToAnEvent/${b._id}/${event._id}`).set(auth(b.token)),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await findEvent(event._id))!.members).toHaveLength(2);
  });

  it("el mismo usuario dos veces en simultáneo queda una sola vez", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    await addGroupMembers(event.group, [me._id]);
    const r1 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: organizer._id, amount: 10, participants: [organizer._id] });

    await Promise.all([
      api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token)),
      api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token)),
    ]);

    expect((await findEvent(event._id))!.members).toEqual([organizer._id, me._id]);
    expect((await findPurchaseReceipt(r1._id))!.participants).toEqual([organizer._id, me._id]);
  });

  it("'lleno' se evalúa antes que el estado", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id], memberLimit: 1, state: "closed" });
    await addGroupMembers(event.group, [me._id]);
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.body).toEqual({ message: "The event is full." });
  });

  it.each(["closed", "readyforpayment", "cancelled", "finished"])("evento en estado %s -> 400", async (state) => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, state });
    await addGroupMembers(event.group, [me._id]);
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event is not available for users to join" });
  });

  it("ya es miembro -> 400", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    const res = await api().put(`/api/events/subscribeToAnEvent/${organizer._id}/${event._id}`).set(auth(organizer.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user has already joined the event" });
  });

  it("evento inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID was not found." });
  });

  it("usuario borrado con token válido -> 400", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await addGroupMembers(event.group, [me._id]);
    await api().delete(`/api/users/deleteUser/${me._id}`).set(auth(me.token)).expect(200);
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user with the given ID was not found." });
  });

  it("suscribir a otro usuario -> 403", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const other = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await addGroupMembers(event.group, [me._id]);
    const res = await api().put(`/api/events/subscribeToAnEvent/${other._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
  });

  it("[comportamiento actual] id de evento mal formado -> 500", async () => {
    const me = await createUser();
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/abc`).set(auth(me.token));
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/events/unsubscribeFromEvent/:id/:event", () => {
  it("quita al usuario de miembros, de los comprobantes y de las opciones votadas", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, me._id] });
    const receipt = await createPurchaseReceipt({
      event: event._id,
      shoppingDesignee: organizer._id,
      amount: 10,
      participants: [organizer._id, me._id],
    });
    const option = await createOption({ event: event._id, title: "Chori", participants: [me._id, organizer._id] });

    const res = await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token));

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([organizer._id]);
    expect((await findEvent(event._id))!.members).toEqual([organizer._id]);
    expect((await findPurchaseReceipt(receipt._id))!.participants).toEqual([organizer._id]);
    expect((await findOption(option._id))!.participants).toEqual([organizer._id]);
  });

  it("con el evento available suelta sus roles de chef y comprador; los de otros quedan", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      members: [organizer._id, me._id],
      chef: me._id,
      shoppingDesignee: [organizer._id, me._id],
    });
    await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token)).expect(200);
    const stored = await findEvent(event._id);
    expect(stored!.chef).toBeNull();
    expect(stored!.shoppingDesignee).toEqual([organizer._id]);
  });

  it("en un evento finished los roles quedan congelados (historial)", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      members: [organizer._id, me._id],
      chef: me._id,
      shoppingDesignee: [me._id],
      state: "finished",
    });
    await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token)).expect(200);
    const stored = await findEvent(event._id);
    expect(stored!.chef).toBe(me._id);
    expect(stored!.shoppingDesignee).toEqual([me._id]);
  });

  it.each(["available", "cancelled", "finished"])("se permite en estado %s", async (state) => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, me._id], state });
    const res = await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(200);
  });

  it.each(["closed", "readyforpayment"])("en estado %s -> 400", async (state) => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, me._id], state });
    const res = await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "The user can't unsubscribe from the event if it's closed or ready for payment.",
    });
    expect((await findEvent(event._id))!.members).toContain(me._id);
  });

  it("no es miembro -> 404", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    const res = await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The member with the given ID is not part of the event." });
  });

  it("evento inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().put(`/api/events/unsubscribeFromEvent/${me._id}/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID was not found." });
  });

  it("desuscribir a otro usuario -> 403", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, me._id] });
    const res = await api().put(`/api/events/unsubscribeFromEvent/${organizer._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/events/editRoles/:id", () => {
  // El body es el estado completo de los roles; solo se aceptan cambios que
  // afecten al usuario del token (GROUPS_FEATURE.md §4.4.2).
  async function setup(state = "available", extra: Record<string, unknown> = {}) {
    const organizer = await createUser();
    const member = await createUser();
    const other = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      members: [organizer._id, member._id, other._id],
      state,
      ...extra,
    });
    return { organizer, member, other, event };
  }

  const editRoles = (eventId: string, token: string, body: Record<string, unknown>) =>
    api().put(`/api/events/editRoles/${eventId}`).set(auth(token)).send(body);

  it("un miembro se asigna como chef y como comprador", async () => {
    const { member, event } = await setup();
    const res = await editRoles(event._id, member.token, { chef: member._id, shoppingDesignee: [member._id] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chef: member._id, shoppingDesignee: [member._id] });
    expect(await findEvent(event._id)).toMatchObject({ chef: member._id, shoppingDesignee: [member._id] });
  });

  it("se suma como comprador sin tocar a los demás compradores", async () => {
    const { member, other, event } = await setup("available", { shoppingDesignee: [] });
    await editRoles(event._id, other.token, { chef: null, shoppingDesignee: [other._id] }).expect(200);
    const res = await editRoles(event._id, member.token, { chef: null, shoppingDesignee: [other._id, member._id] });
    expect(res.status).toBe(200);
    expect(res.body.shoppingDesignee).toEqual([other._id, member._id]);
  });

  it("cada uno suelta su propio rol (chef vacío o ausente lo libera)", async () => {
    const { member, event } = await setup("available");
    await updateEvent(event._id, { chef: member._id, shoppingDesignee: [member._id] });
    const res = await editRoles(event._id, member.token, { chef: "", shoppingDesignee: [] });
    expect(res.status).toBe(200);
    expect(res.body.chef).toBeNull();
    expect(res.body.shoppingDesignee).toEqual([]);
  });

  it("asignarle un rol a otro miembro -> 403", async () => {
    const { organizer, member, event } = await setup();
    expect((await editRoles(event._id, organizer.token, { chef: member._id, shoppingDesignee: [] })).status).toBe(403);
    expect((await editRoles(event._id, organizer.token, { chef: null, shoppingDesignee: [member._id] })).status).toBe(403);
    expect(await findEvent(event._id)).toMatchObject({ chef: null, shoppingDesignee: [] });
  });

  it("quitarle el rol a otro -> 403", async () => {
    const { organizer, member, event } = await setup();
    await updateEvent(event._id, { chef: member._id, shoppingDesignee: [member._id] });
    const res = await editRoles(event._id, organizer.token, { chef: null, shoppingDesignee: [] });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. Users can only take or release their own roles." });
    expect(await findEvent(event._id)).toMatchObject({ chef: member._id, shoppingDesignee: [member._id] });
  });

  it("chef ocupado por otro -> 409", async () => {
    const { member, other, event } = await setup();
    await updateEvent(event._id, { chef: other._id });
    const res = await editRoles(event._id, member.token, { chef: member._id, shoppingDesignee: [] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "The event already has a chef." });
    expect((await findEvent(event._id))!.chef).toBe(other._id);
  });

  it("dos miembros toman el chef a la vez: queda uno solo y el otro recibe 409", async () => {
    const { member, other, event } = await setup();
    const results = await Promise.all([
      editRoles(event._id, member.token, { chef: member._id, shoppingDesignee: [] }),
      editRoles(event._id, other.token, { chef: other._id, shoppingDesignee: [] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!.body.chef;
    expect((await findEvent(event._id))!.chef).toBe(winner);
  });

  it("quien no es miembro del evento -> 403", async () => {
    const { event } = await setup();
    const outsider = await createUser();
    const res = await editRoles(event._id, outsider.token, { chef: outsider._id, shoppingDesignee: [outsider._id] });
    expect(res.status).toBe(403);
  });

  it.each(["closed", "readyforpayment", "finished", "cancelled"])(
    "con el evento en %s los roles están congelados -> 409",
    async (state) => {
      const { member, event } = await setup(state, { shoppingDesignee: [] });
      const res = await editRoles(event._id, member.token, { chef: null, shoppingDesignee: [member._id] });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: "Roles can only change while the event is available." });
    }
  );

  it("sin cambios responde 200 en cualquier estado", async () => {
    const { member, event } = await setup("closed", { shoppingDesignee: [] });
    await updateEvent(event._id, { shoppingDesignee: [member._id] });
    const res = await editRoles(event._id, member.token, { chef: null, shoppingDesignee: [member._id] });
    expect(res.status).toBe(200);
  });

  it("shoppingDesignee que no es un array o con ids mal formados -> 400", async () => {
    const { member, event } = await setup();
    expect((await editRoles(event._id, member.token, { shoppingDesignee: member._id })).status).toBe(400);
    expect((await editRoles(event._id, member.token, { shoppingDesignee: ["abc"] })).status).toBe(400);
  });

  it("evento inexistente -> 404", async () => {
    const organizer = await createUser();
    const res = await api().put(`/api/events/editRoles/${newId()}`).set(auth(organizer.token)).send({});
    expect(res.status).toBe(404);
  });

  it("id mal formado -> 400", async () => {
    const organizer = await createUser();
    const res = await api().put("/api/events/editRoles/abc").set(auth(organizer.token)).send({});
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/events/editEvent/:id", () => {
  function editBody(overrides: Record<string, unknown> = {}) {
    return {
      title: "Asado editado",
      datetime: "2030-03-01T22:00:00.000Z",
      description: "nueva descripción",
      memberLimit: 20,
      penalization: 0,
      penalizationStartDate: null,
      state: "available",
      ...overrides,
    };
  }

  it("ignora group: el evento no cambia de grupo", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const otherGroup = await createGroup({ members: [organizer._id] });
    const res = await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ group: otherGroup._id }));
    expect(res.status).toBe(200);
    expect((await findEvent(event._id))!.group).toBe(event.group);
  });

  it("el organizador puede editar todos los campos", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ state: "closed", isPrivate: true, penalization: 50, penalizationStartDate: "2030-03-10T00:00:00.000Z" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Asado editado",
      datetime: "2030-03-01T22:00:00.000Z",
      description: "nueva descripción",
      memberLimit: 20,
      state: "closed",
      penalization: 50,
      penalizationStartDate: "2030-03-10T00:00:00.000Z",
    });
    expect(res.body).not.toHaveProperty("isPrivate");
    expect(await findEvent(event._id)).toMatchObject({ title: "Asado editado", state: "closed" });
  });

  it("el estado se guarda en minúsculas y el evento sigue operativo", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ state: "Closed" }));
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("closed");

    const receipt = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(organizer.token))
      .send({ description: "carne", amount: 100 });
    expect(receipt.status).toBe(201);
  });

  it("un shoppingDesignee (no organizador) también puede editar", async () => {
    const organizer = await createUser();
    const designee = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [designee._id] });
    const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(designee.token)).send(editBody());
    expect(res.status).toBe(200);
  });

  it("otro miembro -> 403", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, member._id] });
    const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(member.token)).send(editBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: "Access denied. The user is not the event's shopping designee or organizer.",
    });
  });

  it("evento inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    const notFound = await api().put(`/api/events/editEvent/${newId()}`).set(auth(user.token)).send(editBody());
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: "The event with the given ID does not exist." });
    const bad = await api().put("/api/events/editEvent/abc").set(auth(user.token)).send(editBody());
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: "Invalid ObjectID" });
  });

  it("si la penalización es 0 o menor, penalizationStartDate queda en null", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, penalization: 10, penalizationStartDate: "2030-01-01T00:00:00Z" });
    const res = await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ penalization: 0, penalizationStartDate: "2030-05-05T00:00:00.000Z" }));
    expect(res.body.penalizationStartDate).toBeNull();
  });

  it.each(["closed", "cancelled"])(
    "pasar a %s sin compradores asignados -> 400 y no guarda cambios",
    async (state) => {
      const organizer = await createUser();
      const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [] });
      const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "The event has no shopping designees." });
      expect(await findEvent(event._id)).toMatchObject({ state: "available", title: event.title });
    }
  );

  it("estado inválido -> 400", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: "x" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Cannot change the event state from "available" to "x".' });
  });

  describe("transiciones de estado", () => {
    async function eventIn(state: string, opts: { purchaseReceipt?: boolean } = {}) {
      const organizer = await createUser();
      const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id], state });
      if (opts.purchaseReceipt) {
        await createPurchaseReceipt({ event: event._id, shoppingDesignee: organizer._id, amount: 10, participants: [organizer._id] });
      }
      return { organizer, event };
    }

    it.each([
      ["available", "closed"],
      ["available", "cancelled"],
      ["closed", "available"],
      ["closed", "cancelled"],
      ["readyforpayment", "closed"],
      ["closed", "closed"],
      ["finished", "finished"],
    ])("%s -> %s está permitido", async (from, to) => {
      const { organizer, event } = await eventIn(from);
      const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: to }));
      expect(res.status).toBe(200);
      expect((await findEvent(event._id))!.state).toBe(to);
    });

    it("closed -> readyforpayment está permitido si hay comprobantes de compra", async () => {
      const { organizer, event } = await eventIn("closed", { purchaseReceipt: true });
      const res = await api()
        .put(`/api/events/editEvent/${event._id}`)
        .set(auth(organizer.token))
        .send(editBody({ state: "readyforpayment" }));
      expect(res.status).toBe(200);
    });

    it.each([
      ["available", "readyforpayment"],
      ["available", "finished"],
      ["closed", "finished"],
      ["readyforpayment", "available"],
      ["readyforpayment", "cancelled"],
      ["readyforpayment", "finished"],
      ["cancelled", "available"],
      ["cancelled", "closed"],
      ["finished", "available"],
      ["finished", "readyforpayment"],
    ])("%s -> %s -> 400 y no guarda cambios", async (from, to) => {
      const { organizer, event } = await eventIn(from, { purchaseReceipt: true });
      const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: to }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: `Cannot change the event state from "${from}" to "${to}".` });
      expect(await findEvent(event._id)).toMatchObject({ state: from, title: event.title });
    });

    it("closed -> readyforpayment sin comprobantes de compra -> 400", async () => {
      const { organizer, event } = await eventIn("closed");
      const res = await api()
        .put(`/api/events/editEvent/${event._id}`)
        .set(auth(organizer.token))
        .send(editBody({ state: "readyforpayment" }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: "The event needs at least one purchase receipt to be ready for payment." });
    });

    it("readyforpayment -> closed con transferencias aprobadas -> 400", async () => {
      const { organizer, event } = await eventIn("readyforpayment", { purchaseReceipt: true });
      await createTransferReceipt({ event: event._id, user: organizer._id, amount: 10, hasPaid: true });
      const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: "closed" }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        message: "The event can't go back to closed because some payments were already approved.",
      });
    });

    it("el estado del body no distingue mayúsculas", async () => {
      const { organizer, event } = await eventIn("available");
      const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: "CLOSED" }));
      expect(res.status).toBe(200);
    });
  });

  it("[comportamiento actual] campos obligatorios ausentes -> 500", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send({ state: "available" });
    expect(res.status).toBe(500);
    expect((await findEvent(event._id))!.title).toBe(event.title);
  });

  it("actualiza los recordatorios existentes en lugar de duplicarlos", async () => {
    const organizer = await createUser();
    const created = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    const id = created.body._id;

    await api()
      .put(`/api/events/editEvent/${id}`)
      .set(auth(organizer.token))
      .send(editBody({ datetime: "2030-02-01T18:00:00.000Z", penalization: 100, penalizationStartDate: "2030-02-10T09:00:00.000Z" }))
      .expect(200);

    const byType = await remindersByType(id);
    expect(byType.eventStart?.map((r) => r.datetime)).toEqual(["2030-02-01T17:30:00.000Z"]);
    expect(byType.penalizationStart?.map((r) => r.datetime)).toEqual(["2030-02-09T20:00:00.000Z"]);
    expect(byType.penalizationOneWeek?.map((r) => r.datetime)).toEqual(["2030-02-16T20:00:00.000Z"]);
  });

  it("el recordatorio de penalización es a las 20:00 (convención) sin importar la zona horaria del servidor", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      await api()
        .put(`/api/events/editEvent/${event._id}`)
        .set(auth(organizer.token))
        .send(editBody({ penalization: 10, penalizationStartDate: "2030-04-01T00:00:00.000Z" }))
        .expect(200);
    } finally {
      process.env.TZ = original;
    }
    const byType = await remindersByType(event._id);
    expect(byType.penalizationStart?.map((r) => r.datetime)).toEqual(["2030-03-31T20:00:00.000Z"]);
  });

  it("crea los recordatorios de penalización si se agrega una penalización", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ penalization: 10, penalizationStartDate: "2030-04-01T00:00:00.000Z" }))
      .expect(200);
    const byType = await remindersByType(event._id);
    expect(byType.eventStart).toHaveLength(1);
    expect(byType.penalizationStart?.map((r) => r.datetime)).toEqual(["2030-03-31T20:00:00.000Z"]);
    expect(byType.penalizationOneWeek?.map((r) => r.datetime)).toEqual(["2030-04-07T20:00:00.000Z"]);
  });

  it("editar un evento que ya pasó no vuelve a crear los recordatorios ya enviados", async () => {
    const organizer = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      shoppingDesignee: [organizer._id],
      datetime: new Date("2020-01-10T21:00:00.000Z"),
      penalization: 10,
      penalizationStartDate: new Date("2020-01-15T00:00:00.000Z"),
    });
    await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(
        editBody({
          datetime: "2020-01-10T21:00:00.000Z",
          state: "closed",
          penalization: 10,
          penalizationStartDate: "2020-01-15T00:00:00.000Z",
        })
      )
      .expect(200);
    expect(await findReminders(event._id)).toEqual([]);
  });

  it("reprogramar a futuro un evento cuyo recordatorio ya se envió lo vuelve a crear", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, datetime: new Date("2020-01-10T21:00:00.000Z") });
    await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ datetime: "2030-03-01T22:00:00.000Z" }))
      .expect(200);
    const byType = await remindersByType(event._id);
    expect(byType.eventStart?.map((r) => r.datetime)).toEqual(["2030-03-01T21:30:00.000Z"]);
  });

  it("un recordatorio pendiente se actualiza aunque la nueva fecha ya haya pasado", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await createReminder({ event: event._id, type: "eventStart", datetime: new Date("2030-01-10T20:30:00.000Z") });
    await api()
      .put(`/api/events/editEvent/${event._id}`)
      .set(auth(organizer.token))
      .send(editBody({ datetime: "2020-01-10T21:00:00.000Z" }))
      .expect(200);
    const byType = await remindersByType(event._id);
    expect(byType.eventStart?.map((r) => r.datetime)).toEqual(["2020-01-10T20:30:00.000Z"]);
  });

  it("cancelar el evento borra todos sus recordatorios", async () => {
    const organizer = await createUser();
    const created = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { isShoppingDesignee: true, penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    await api()
      .put(`/api/events/editEvent/${created.body._id}`)
      .set(auth(organizer.token))
      .send(editBody({ state: "cancelled", penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }))
      .expect(200);
    expect(await findReminders(created.body._id)).toEqual([]);
  });

  it("[comportamiento actual] quitar la penalización NO borra sus recordatorios", async () => {
    const organizer = await createUser();
    const created = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(await eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    await api()
      .put(`/api/events/editEvent/${created.body._id}`)
      .set(auth(organizer.token))
      .send(editBody({ penalization: 0 }))
      .expect(200);
    expect(Object.keys(await remindersByType(created.body._id)).sort()).toEqual([
      "eventStart",
      "newEvent",
      "penalizationOneWeek",
      "penalizationStart",
    ]);
  });
});

describe("organizador que salió del grupo (GROUPS_FEATURE §4.4.1)", () => {
  async function setup() {
    const organizer = await createUser();
    const designee = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      members: [organizer._id, designee._id],
      shoppingDesignee: [designee._id],
      state: "finished",
    });
    await removeGroupMember(event.group, organizer._id);
    return { organizer, designee, event };
  }

  it("no puede borrar el evento", async () => {
    const { organizer, event } = await setup();
    const res = await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(organizer.token));
    expect(res.status).toBe(403);
    expect(await findEvent(event._id)).not.toBeNull();
  });

  it("no puede editarlo; el designado sí", async () => {
    const { organizer, designee, event } = await setup();
    const body = { title: "x", datetime: event.datetime, description: "d", memberLimit: 5, state: "finished" };
    expect((await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(body)).status).toBe(403);
    expect((await api().put(`/api/events/editEvent/${event._id}`).set(auth(designee.token)).send(body)).status).toBe(200);
  });

  it("no puede gestionar opciones", async () => {
    const { organizer, event } = await setup();
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(organizer.token)).send({ title: "Vacío" });
    expect(res.status).toBe(403);
  });

  it("sigue viendo el evento porque es miembro del evento", async () => {
    const { organizer, event } = await setup();
    expect((await api().get(`/api/events/getEventById/${event._id}`).set(auth(organizer.token))).status).toBe(200);
  });
});

describe("DELETE /api/events/deleteEvent/:id", () => {
  it("el organizador borra el evento y en cascada comprobantes, imágenes, ratings y recordatorios", async () => {
    const organizer = await createUser();
    const member = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, member._id] });
    const otherEvent = await createEvent({ organizer: organizer._id });
    const img1 = await createImage();
    const img2 = await createImage();
    const keptImage = await createImage();
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: organizer._id, amount: 10, participants: [member._id], image: img1 });
    await createTransferReceipt({ event: event._id, user: member._id, amount: 10, image: img2 });
    await createTransferReceipt({ event: event._id, user: organizer._id, amount: 0 });
    await createRating({ event: event._id, user: member._id, score: 3 });
    await createReminder({ event: event._id, type: "eventStart", datetime: new Date() });
    await createReminder({ event: otherEvent._id, type: "eventStart", datetime: new Date() });
    await createPurchaseReceipt({ event: otherEvent._id, shoppingDesignee: organizer._id, amount: 5, participants: [organizer._id], image: keptImage });

    const res = await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(organizer.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: event._id, title: event.title });
    expect(await findEvent(event._id)).toBeNull();
    expect(await countTransferReceipts()).toBe(0);
    expect(await countPurchaseReceipts()).toBe(1);
    expect(await countImages()).toBe(1);
    expect(await countRatings()).toBe(0);
    expect(await countReminders()).toBe(1);
  });

  it("borra también las opciones de votación del evento (y no las de otros)", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const other = await createEvent({ organizer: organizer._id });
    await createOption({ event: event._id, title: "Vacío" });
    const kept = await createOption({ event: other._id, title: "Chori" });
    await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(organizer.token)).expect(200);
    expect(await countOptions()).toBe(1);
    expect(await findOption(kept._id)).not.toBeNull();
  });

  it("si una parte del borrado falla, no borra nada (transacción)", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await createRating({ event: event._id, user: organizer._id, score: 5 });
    await createOption({ event: event._id, title: "Vacío" });
    simulateDeleteFailure("Option", "falla a mitad del borrado");
    const res = await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(organizer.token));
    expect(res.status).toBe(500);
    expect(await findEvent(event._id)).not.toBeNull();
    expect(await countRatings()).toBe(1);
    expect(await countOptions()).toBe(1);
  });

  it("alguien que no es el organizador -> 403", async () => {
    const organizer = await createUser();
    const designee = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [designee._id] });
    const res = await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(designee.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not the event's organizer." });
    expect(await findEvent(event._id)).not.toBeNull();
  });

  it("inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    const notFound = await api().delete(`/api/events/deleteEvent/${newId()}`).set(auth(user.token));
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: "The event with the given ID does not exist." });
    const bad = await api().delete("/api/events/deleteEvent/abc").set(auth(user.token));
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: "Invalid ObjectID" });
  });
});
