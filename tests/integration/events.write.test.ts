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
  createEvent,
  createImage,
  createOption,
  createPurchaseReceipt,
  createRating,
  createReminder,
  createTransferReceipt,
  createUser,
  findEvent,
  findEventByTitle,
  findOption,
  findPurchaseReceipt,
  findReminders,
  newId,
  remindersByType,
  UserFixture,
} from "../helpers/fixtures.js";
import { sentEmails, setBrevoResponseStatus } from "../helpers/mailer.js";

// Los cálculos de recordatorios usan hora local; los tests corren con TZ=UTC (vitest.config.ts).

function eventBody(organizer: UserFixture, overrides: Record<string, unknown> = {}) {
  return {
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
    const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer));

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
      isPrivate: false,
      penalization: null,
    });
    expect(await findEvent(res.body._id)).not.toBeNull();
  });

  it("isChef pone al organizador como chef; isShoppingDesignee lo agrega como comprador", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { isChef: true, isShoppingDesignee: true }));
    expect(res.body.chef).toBe(organizer._id);
    expect(res.body.shoppingDesignee).toEqual([organizer._id]);
  });

  it("[comportamiento actual] chef enviado en el body se ignora si isChef es falso", async () => {
    const organizer = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { chef: other._id }));
    expect(res.body.chef).toBeNull();
  });

  it("[comportamiento actual] shoppingDesignee del body se respeta y se le suma el organizador si isShoppingDesignee", async () => {
    const organizer = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { shoppingDesignee: [other._id], isShoppingDesignee: true }));
    expect(res.body.shoppingDesignee).toEqual([other._id, organizer._id]);
  });

  it("[comportamiento actual] el organizador se toma del body, no del token", async () => {
    const caller = await createUser();
    const someoneElse = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(caller.token))
      .send(eventBody(someoneElse));
    expect(res.status).toBe(201);
    expect(res.body.organizer).toBe(someoneElse._id);
  });

  it("[comportamiento actual] el organizador no se agrega automáticamente como miembro", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { members: undefined }));
    expect(res.body.members).toEqual([]);
  });

  it("acepta isPrivate, penalization y penalizationStartDate", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { isPrivate: true, penalization: 200, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    expect(res.body).toMatchObject({ isPrivate: true, penalization: 200, penalizationStartDate: "2030-01-15T12:00:00.000Z" });
  });

  it.each(["title", "description", "datetime", "memberLimit", "organizer"])(
    "[comportamiento actual] sin %s -> 500 y no crea nada",
    async (field) => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(eventBody(organizer, { [field]: undefined }));
      expect(res.status).toBe(500);
      expect(res.body.message).toContain(field);
      expect(await countEvents()).toBe(0);
    }
  );

  it("[comportamiento actual] estado inválido -> 500", async () => {
    const organizer = await createUser();
    const res = await api()
      .post("/api/events/createEvent")
      .set(auth(organizer.token))
      .send(eventBody(organizer, { state: "abierto" }));
    expect(res.status).toBe(500);
  });

  describe("recordatorios", () => {
    it("crea un recordatorio eventStart 30 minutos antes del evento", async () => {
      const organizer = await createUser();
      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer));
      const reminders = await findReminders(res.body._id);
      expect(reminders).toEqual([
        expect.objectContaining({ type: "eventStart", datetime: "2030-01-10T20:30:00.000Z", event: res.body._id }),
      ]);
    });

    it("con penalización crea además penalizationStart (20:00 del día anterior) y penalizationOneWeek (+7 días)", async () => {
      const organizer = await createUser();
      const res = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
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
        .send(eventBody(organizer, { penalization: 0, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
      const b = await api()
        .post("/api/events/createEvent")
        .set(auth(organizer.token))
        .send(eventBody(organizer, { penalization: 100 }));
      expect(Object.keys(await remindersByType(a.body._id))).toEqual(["eventStart"]);
      expect(Object.keys(await remindersByType(b.body._id))).toEqual(["eventStart"]);
    });
  });

  describe("notificación de nuevo evento", () => {
    it("un evento público notifica por mail a los usuarios con notifications.newEvent", async () => {
      const organizer = await createUser();
      const wantsIt = await createUser({ name: "Quiere", notifications: { newEvent: true } as any });
      const alt = await createUser({ name: "Alt", alternativeEmail: "alt@gmail.com", notifications: { newEvent: true } as any });
      await createUser({ notifications: { newEvent: false } as any });

      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer));

      expect(res.status).toBe(201);
      expect(sentEmails.map((m) => m.payload.to[0])).toEqual([
        { email: wantsIt.email, name: "Quiere" },
        { email: "alt@gmail.com", name: "Alt" },
      ]);
      for (const mail of sentEmails) {
        expect(mail.payload.subject).toBe("FoodSpot | Nuevo evento");
        expect(mail.payload.htmlContent).toContain(`https://food-spot.vercel.app/event/${res.body._id}`);
      }
    });

    it("un evento privado no notifica a nadie", async () => {
      const organizer = await createUser();
      await createUser({ notifications: { newEvent: true } as any });
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer, { isPrivate: true }));
      expect(sentEmails).toHaveLength(0);
    });

    it("si el envío de mails falla, el evento se crea igual (201) y se intenta notificar a todos", async () => {
      const organizer = await createUser();
      await createUser({ notifications: { newEvent: true } as any });
      await createUser({ notifications: { newEvent: true } as any });
      setBrevoResponseStatus(500);

      const res = await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer));

      expect(res.status).toBe(201);
      expect(sentEmails).toHaveLength(2);
      expect(await findReminders(res.body._id)).toHaveLength(1);
    });
  });

  describe("limpieza automática de eventos viejos", () => {
    async function seedFinished(organizer: UserFixture, count: number, opts: { state?: string; isPrivate?: boolean; year?: number } = {}) {
      const events = [];
      for (let i = 0; i < count; i++) {
        events.push(
          await createEvent({
            organizer: organizer._id,
            title: `${opts.state ?? "finished"}-${opts.isPrivate ? "priv" : "pub"}-${i}`,
            state: opts.state ?? "finished",
            isPrivate: opts.isPrivate ?? false,
            datetime: `${(opts.year ?? 2020) + i}-01-01T00:00:00.000Z`,
          })
        );
      }
      return events;
    }

    it("con más de 6 eventos públicos borra los finalizados/cancelados más viejos hasta volver a 6", async () => {
      const organizer = await createUser();
      const [f2020, f2021] = await seedFinished(organizer, 2, { year: 2020 });
      const [c2022] = await seedFinished(organizer, 1, { state: "cancelled", year: 2022 });
      await seedFinished(organizer, 3, { state: "available", year: 2025 });
      // 6 públicos + el nuevo = 7 -> se borra 1 (el más viejo finalizado/cancelado)

      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);

      expect(await findEvent(f2020._id)).toBeNull();
      expect(await findEvent(f2021._id)).not.toBeNull();
      expect(await findEvent(c2022._id)).not.toBeNull();
      expect(await countEvents()).toBe(6);
    });

    it("borra varios si sobran varios", async () => {
      const organizer = await createUser();
      await seedFinished(organizer, 5, { year: 2015 });
      await seedFinished(organizer, 3, { state: "available", year: 2025 });
      // 8 + 1 = 9 públicos -> borra 3
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);
      expect(await countEvents()).toBe(6);
      expect(await findEventByTitle("finished-pub-0")).toBeNull();
      expect(await findEventByTitle("finished-pub-1")).toBeNull();
      expect(await findEventByTitle("finished-pub-2")).toBeNull();
      expect(await findEventByTitle("finished-pub-3")).not.toBeNull();
    });

    it("nunca borra eventos que no estén finalizados o cancelados", async () => {
      const organizer = await createUser();
      await seedFinished(organizer, 7, { state: "available" });
      await seedFinished(organizer, 1, { state: "closed" });
      await seedFinished(organizer, 1, { state: "readyforpayment" });
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);
      expect(await countEvents()).toBe(10);
    });

    it("con 6 o menos eventos públicos no borra nada", async () => {
      const organizer = await createUser();
      await seedFinished(organizer, 5);
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);
      expect(await countEvents()).toBe(6);
    });

    it("[comportamiento actual] los privados no cuentan para el límite, pero sí pueden ser borrados", async () => {
      const organizer = await createUser();
      const [privOld] = await seedFinished(organizer, 1, { isPrivate: true, year: 2000 });
      const pubs = await seedFinished(organizer, 6, { year: 2020 });
      // 6 públicos + 1 nuevo = 7 -> borra 1, el finalizado más viejo (que es privado)
      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);
      expect(await findEvent(privOld._id)).toBeNull();
      expect(await findEvent(pubs[0]._id)).not.toBeNull();
    });

    it("al borrar un evento viejo borra también sus comprobantes, imágenes, ratings y recordatorios", async () => {
      const organizer = await createUser();
      const [old] = await seedFinished(organizer, 1, { year: 2000 });
      await seedFinished(organizer, 6, { state: "available", year: 2025 });
      const img1 = await createImage();
      const img2 = await createImage();
      await createPurchaseReceipt({ event: old._id, shoppingDesignee: organizer._id, amount: 10, participants: [organizer._id], image: img1 });
      await createTransferReceipt({ event: old._id, user: organizer._id, amount: 10, image: img2 });
      await createRating({ event: old._id, user: organizer._id, score: 5 });
      await createReminder({ event: old._id, type: "eventStart", datetime: new Date("2000-01-01") });

      await api().post("/api/events/createEvent").set(auth(organizer.token)).send(eventBody(organizer)).expect(201);

      expect(await findEvent(old._id)).toBeNull();
      expect(await countPurchaseReceipts()).toBe(0);
      expect(await countTransferReceipts()).toBe(0);
      expect(await countImages()).toBe(0);
      expect(await countRatings()).toBe(0);
      expect(await findReminders(old._id)).toEqual([]);
    });
  });
});

describe("PUT /api/events/subscribeToAnEvent/:id/:event", () => {
  it("agrega al usuario como miembro y como participante de todos los comprobantes existentes", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
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

  it("[comportamiento actual] cualquiera puede unirse a un evento privado", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, isPrivate: true });
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(200);
  });

  it("evento lleno -> 400", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id], memberLimit: 1 });
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event is full." });
  });

  it("dos altas simultáneas con un solo lugar libre: entra una y la otra recibe 400", async () => {
    const organizer = await createUser();
    const a = await createUser();
    const b = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id], memberLimit: 2 });

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
    const res = await api().put(`/api/events/subscribeToAnEvent/${me._id}/${event._id}`).set(auth(me.token));
    expect(res.body).toEqual({ message: "The event is full." });
  });

  it.each(["closed", "readyforpayment", "cancelled", "finished"])("evento en estado %s -> 400", async (state) => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({ organizer: organizer._id, state });
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

  it("[comportamiento actual] no lo quita de chef ni de shoppingDesignee", async () => {
    const organizer = await createUser();
    const me = await createUser();
    const event = await createEvent({
      organizer: organizer._id,
      members: [organizer._id, me._id],
      chef: me._id,
      shoppingDesignee: [me._id],
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
  it("asigna chef y compradores", async () => {
    const organizer = await createUser();
    const a = await createUser();
    const b = await createUser();
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id, a._id, b._id] });
    const res = await api()
      .put(`/api/events/editRoles/${event._id}`)
      .set(auth(organizer.token))
      .send({ chef: a._id, shoppingDesignee: [a._id, b._id] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chef: a._id, shoppingDesignee: [a._id, b._id] });
    expect(await findEvent(event._id)).toMatchObject({ chef: a._id, shoppingDesignee: [a._id, b._id] });
  });

  it("chef vacío o ausente lo deja en null", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, chef: organizer._id });
    const res = await api()
      .put(`/api/events/editRoles/${event._id}`)
      .set(auth(organizer.token))
      .send({ chef: "", shoppingDesignee: [] });
    expect(res.body.chef).toBeNull();
    expect(res.body.shoppingDesignee).toEqual([]);
  });

  it("[SEGURIDAD - comportamiento actual] cualquier usuario autenticado puede cambiar los roles", async () => {
    const organizer = await createUser();
    const intruder = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api()
      .put(`/api/events/editRoles/${event._id}`)
      .set(auth(intruder.token))
      .send({ chef: intruder._id, shoppingDesignee: [intruder._id] });
    expect(res.status).toBe(200);
    expect((await findEvent(event._id))!.shoppingDesignee).toEqual([intruder._id]);
  });

  it("[comportamiento actual] permite asignar roles a no-miembros", async () => {
    const organizer = await createUser();
    const outsider = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const res = await api()
      .put(`/api/events/editRoles/${event._id}`)
      .set(auth(organizer.token))
      .send({ chef: outsider._id, shoppingDesignee: [outsider._id] });
    expect(res.status).toBe(200);
  });

  it("evento inexistente -> 404", async () => {
    const organizer = await createUser();
    const res = await api().put(`/api/events/editRoles/${newId()}`).set(auth(organizer.token)).send({});
    expect(res.status).toBe(404);
  });

  it("[comportamiento actual] id mal formado -> 500", async () => {
    const organizer = await createUser();
    const res = await api().put("/api/events/editRoles/abc").set(auth(organizer.token)).send({});
    expect(res.status).toBe(500);
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
      isPrivate: false,
      ...overrides,
    };
  }

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
      isPrivate: true,
      penalization: 50,
      penalizationStartDate: "2030-03-10T00:00:00.000Z",
    });
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

  it.each(["closed", "readyforpayment", "finished", "cancelled"])(
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

  it("[comportamiento actual] estado inválido -> 500", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id, shoppingDesignee: [organizer._id] });
    const res = await api().put(`/api/events/editEvent/${event._id}`).set(auth(organizer.token)).send(editBody({ state: "x" }));
    expect(res.status).toBe(500);
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
      .send(eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
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
      .send(eventBody(organizer, { isShoppingDesignee: true, penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
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
      .send(eventBody(organizer, { penalization: 100, penalizationStartDate: "2030-01-15T12:00:00.000Z" }));
    await api()
      .put(`/api/events/editEvent/${created.body._id}`)
      .set(auth(organizer.token))
      .send(editBody({ penalization: 0 }))
      .expect(200);
    expect(Object.keys(await remindersByType(created.body._id)).sort()).toEqual([
      "eventStart",
      "penalizationOneWeek",
      "penalizationStart",
    ]);
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

  it("[comportamiento actual] no borra las opciones de votación del evento", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    await createOption({ event: event._id, title: "Vacío" });
    await api().delete(`/api/events/deleteEvent/${event._id}`).set(auth(organizer.token)).expect(200);
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
