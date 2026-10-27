import { describe, expect, it } from "vitest";
import { api, auth, JPEG_BYTES, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import {
  countImages,
  countPurchaseReceipts,
  createEvent,
  createImage,
  createPurchaseReceipt,
  createUser,
  findEvent,
  findImage,
  findPurchaseReceipt,
  newId,
} from "../helpers/fixtures.js";

async function closedEventWithDesignee(state = "closed") {
  const designee = await createUser({ name: "Compradora" });
  const member = await createUser({ name: "Miembro" });
  const outsider = await createUser({ name: "Afuera" });
  const event = await createEvent({
    organizer: designee._id,
    members: [designee._id, member._id],
    shoppingDesignee: [designee._id],
    state,
  });
  return { designee, member, outsider, event };
}

describe("GET /api/purchaseReceipts/getPurchaseReceiptsByEvent/:event", () => {
  it("un miembro obtiene los comprobantes con comprador y participantes poblados", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({
      event: event._id,
      shoppingDesignee: designee._id,
      amount: 1500,
      description: "Carne",
      participants: [designee._id, member._id],
    });

    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptsByEvent/${event._id}`).set(auth(member.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      _id: receipt._id,
      description: "Carne",
      amount: 1500,
      event: event._id,
      image: null,
      shoppingDesignee: { _id: designee._id, name: "Compradora" },
    });
    expect(res.body[0].participants.map((p: any) => p._id)).toEqual([designee._id, member._id]);
  });

  it("no miembro -> 403", async () => {
    const { outsider, event } = await closedEventWithDesignee();
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptsByEvent/${event._id}`).set(auth(outsider.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not a participant of the event." });
  });

  it("evento inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    const notFound = await api().get(`/api/purchaseReceipts/getPurchaseReceiptsByEvent/${newId()}`).set(auth(user.token));
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: "The event with the given ID does not exist." });
    const bad = await api().get("/api/purchaseReceipts/getPurchaseReceiptsByEvent/abc").set(auth(user.token));
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ message: "Invalid ObjectID" });
  });
});

describe("GET /api/purchaseReceipts/getPurchaseReceiptById/:id/:event", () => {
  it("un miembro obtiene el comprobante (sin poblar)", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [member._id] });
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptById/${receipt._id}/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: receipt._id, shoppingDesignee: designee._id, participants: [member._id] });
  });

  it("[comportamiento actual] devuelve comprobantes de OTRO evento si se pasa un evento del que se es miembro", async () => {
    const { member, event } = await closedEventWithDesignee();
    const stranger = await createUser();
    const otherEvent = await createEvent({ organizer: stranger._id });
    const foreign = await createPurchaseReceipt({ event: otherEvent._id, shoppingDesignee: stranger._id, amount: 99, participants: [] });
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptById/${foreign._id}/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(99);
  });

  it("comprobante inexistente -> 404", async () => {
    const { member, event } = await closedEventWithDesignee();
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptById/${newId()}/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The purchase receipt with the given ID was not found." });
  });

  it("[comportamiento actual] id de comprobante mal formado -> 500", async () => {
    const { member, event } = await closedEventWithDesignee();
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptById/abc/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(500);
  });

  it("no miembro -> 403", async () => {
    const { designee, outsider, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });
    const res = await api().get(`/api/purchaseReceipts/getPurchaseReceiptById/${receipt._id}/${event._id}`).set(auth(outsider.token));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/purchaseReceipts/createPurchaseReceipt/:event", () => {
  it("el comprador crea un comprobante; por defecto participan todos los miembros", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(designee.token))
      .send({ description: "Carne", amount: 3000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      _id: expect.any(String),
      description: "Carne",
      amount: 3000,
      event: event._id,
      shoppingDesignee: designee._id,
      participants: [designee._id, member._id],
      image: null,
    });
    expect((await findEvent(event._id))!.purchaseReceipts).toEqual([res.body._id]);
  });

  it("acepta una lista explícita de participantes", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(designee.token))
      .send({ description: "Bebidas", amount: 500, participants: [member._id] });
    expect(res.body.participants).toEqual([member._id]);
  });

  it("[comportamiento actual] una lista vacía de participantes se respeta (no usa los miembros)", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(designee.token))
      .send({ description: "x", amount: 1, participants: [] });
    expect(res.body.participants).toEqual([]);
  });

  it("ignora event y shoppingDesignee del body (usa el de la URL y el del token)", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(designee.token))
      .send({ description: "x", amount: 1, event: newId(), shoppingDesignee: member._id });
    expect(res.body.event).toBe(event._id);
    expect(res.body.shoppingDesignee).toBe(designee._id);
  });

  it.each(["available", "readyforpayment", "finished", "cancelled"])("evento en estado %s -> 400", async (state) => {
    const { designee, event } = await closedEventWithDesignee(state);
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(designee.token))
      .send({ description: "x", amount: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Purchase receipts can only be uploaded when the event is closed" });
    expect(await countPurchaseReceipts()).toBe(0);
  });

  it("un miembro que no es comprador -> 403", async () => {
    const { member, event } = await closedEventWithDesignee();
    const res = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`)
      .set(auth(member.token))
      .send({ description: "x", amount: 1 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. User is not a shopping designee." });
  });

  it("evento inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    const notFound = await api().post(`/api/purchaseReceipts/createPurchaseReceipt/${newId()}`).set(auth(user.token)).send({});
    expect(notFound.status).toBe(404);
    const bad = await api().post("/api/purchaseReceipts/createPurchaseReceipt/abc").set(auth(user.token)).send({});
    expect(bad.status).toBe(400);
  });

  it.each(["description", "amount"])("[comportamiento actual] sin %s -> 500", async (field) => {
    const { designee, event } = await closedEventWithDesignee();
    const body: Record<string, unknown> = { description: "x", amount: 1 };
    delete body[field];
    const res = await api().post(`/api/purchaseReceipts/createPurchaseReceipt/${event._id}`).set(auth(designee.token)).send(body);
    expect(res.status).toBe(500);
    expect(await countPurchaseReceipts()).toBe(0);
  });
});

describe("PUT /api/purchaseReceipts/assignMembersToReceipt", () => {
  it("reemplaza los participantes de cada comprobante", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const r1 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [designee._id] });
    const r2 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 20, participants: [designee._id] });

    const res = await api()
      .put("/api/purchaseReceipts/assignMembersToReceipt")
      .set(auth(designee.token))
      .send({
        receipts: [
          { id: r1._id, participants: [member._id] },
          { id: r2._id, participants: [designee._id, member._id] },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Participants assigned to receipts successfully" });
    expect((await findPurchaseReceipt(r1._id))!.participants).toEqual([member._id]);
    expect((await findPurchaseReceipt(r2._id))!.participants).toEqual([designee._id, member._id]);
  });

  it("[comportamiento actual] si uno no existe responde 404, pero los anteriores ya quedaron modificados", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const r1 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [designee._id] });
    const res = await api()
      .put("/api/purchaseReceipts/assignMembersToReceipt")
      .set(auth(designee.token))
      .send({ receipts: [{ id: r1._id, participants: [member._id] }, { id: newId(), participants: [] }] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "One or more purchase receipts were not found" });
    expect((await findPurchaseReceipt(r1._id))!.participants).toEqual([member._id]);
  });

  it("[SEGURIDAD - comportamiento actual] cualquier usuario autenticado puede reasignar participantes de cualquier evento", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const intruder = await createUser();
    const r1 = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [designee._id] });
    const res = await api()
      .put("/api/purchaseReceipts/assignMembersToReceipt")
      .set(auth(intruder.token))
      .send({ receipts: [{ id: r1._id, participants: [] }] });
    expect(res.status).toBe(200);
  });

  it("lista vacía -> 200 sin cambios", async () => {
    const user = await createUser();
    const res = await api().put("/api/purchaseReceipts/assignMembersToReceipt").set(auth(user.token)).send({ receipts: [] });
    expect(res.status).toBe(200);
  });

  it("[comportamiento actual] sin 'receipts' -> 500", async () => {
    const user = await createUser();
    const res = await api().put("/api/purchaseReceipts/assignMembersToReceipt").set(auth(user.token)).send({});
    expect(res.status).toBe(500);
  });
});

describe("POST /api/purchaseReceipts/uploadFile/:purchaseReceipt", () => {
  it.each([
    ["image/png", "ticket.png", PNG_BYTES],
    ["image/jpeg", "ticket.jpg", JPEG_BYTES],
    ["application/pdf", "ticket.pdf", PDF_BYTES],
  ])("acepta %s y lo asocia al comprobante", async (contentType, filename, bytes) => {
    const { designee, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });

    const res = await api()
      .post(`/api/purchaseReceipts/uploadFile/${receipt._id}`)
      .set(auth(designee.token))
      .attach("file", bytes, { filename, contentType });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imageId: expect.any(String) });
    expect((await findPurchaseReceipt(receipt._id))!.image).toBe(res.body.imageId);
    const image = await findImage(res.body.imageId);
    expect(image!.mimetype).toBe(contentType);
    expect(image!.image.equals(bytes)).toBe(true);
  });

  it("[comportamiento actual] reemplazar el archivo deja la imagen anterior huérfana", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const oldImage = await createImage();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [], image: oldImage });
    await api()
      .post(`/api/purchaseReceipts/uploadFile/${receipt._id}`)
      .set(auth(designee.token))
      .attach("file", PNG_BYTES, { filename: "n.png", contentType: "image/png" })
      .expect(200);
    expect(await findImage(oldImage)).not.toBeNull();
    expect(await countImages()).toBe(2);
  });

  it("[comportamiento actual] comprobante inexistente -> 404, pero la imagen queda guardada", async () => {
    const user = await createUser();
    const res = await api()
      .post(`/api/purchaseReceipts/uploadFile/${newId()}`)
      .set(auth(user.token))
      .attach("file", PNG_BYTES, { filename: "n.png", contentType: "image/png" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The purchase receipt with the given ID was not found." });
    expect(await countImages()).toBe(1);
  });

  it("[comportamiento actual] tipo de archivo no permitido -> 500", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });
    const res = await api()
      .post(`/api/purchaseReceipts/uploadFile/${receipt._id}`)
      .set(auth(designee.token))
      .attach("file", Buffer.from("GIF89a"), { filename: "a.gif", contentType: "image/gif" });
    expect(res.status).toBe(500);
    expect(await countImages()).toBe(0);
  });

  it("sin archivo -> 400", async () => {
    const user = await createUser();
    const res = await api().post(`/api/purchaseReceipts/uploadFile/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No file was uploaded." });
    expect(await countImages()).toBe(0);
  });
});

describe("DELETE /api/purchaseReceipts/deletePurchaseReceipt/:id/:event", () => {
  it("el comprador lo borra con el evento cerrado y se quita del evento", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const keep = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 1, participants: [] });
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });

    const res = await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${receipt._id}/${event._id}`).set(auth(designee.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: receipt._id, amount: 10 });
    expect(await findPurchaseReceipt(receipt._id)).toBeNull();
    expect((await findEvent(event._id))!.purchaseReceipts).toEqual([keep._id]);
  });

  it("[comportamiento actual] no borra la imagen asociada", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const image = await createImage();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [], image });
    await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${receipt._id}/${event._id}`).set(auth(designee.token)).expect(200);
    expect(await findImage(image)).not.toBeNull();
  });

  it.each(["available", "readyforpayment", "finished", "cancelled"])("evento en estado %s -> 400 y no borra", async (state) => {
    const { designee, event } = await closedEventWithDesignee(state);
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });
    const res = await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${receipt._id}/${event._id}`).set(auth(designee.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Purchase receipts can only be uploaded or deleted when the event is closed" });
    expect(await findPurchaseReceipt(receipt._id)).not.toBeNull();
  });

  it("comprobante inexistente -> 404", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const res = await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${newId()}/${event._id}`).set(auth(designee.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The purchase receipt with the given ID was not found." });
  });

  it("no comprador -> 403", async () => {
    const { designee, member, event } = await closedEventWithDesignee();
    const receipt = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 10, participants: [] });
    const res = await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${receipt._id}/${event._id}`).set(auth(member.token));
    expect(res.status).toBe(403);
  });

  it("[SEGURIDAD - comportamiento actual] el comprador de un evento puede borrar comprobantes de otro evento", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const stranger = await createUser();
    const otherEvent = await createEvent({ organizer: stranger._id, shoppingDesignee: [stranger._id], state: "closed" });
    const foreign = await createPurchaseReceipt({ event: otherEvent._id, shoppingDesignee: stranger._id, amount: 10, participants: [] });
    const res = await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${foreign._id}/${event._id}`).set(auth(designee.token));
    expect(res.status).toBe(200);
    expect(await findPurchaseReceipt(foreign._id)).toBeNull();
  });

  it("[BUG - comportamiento actual] si el comprobante no está en la lista del evento, se quita el ÚLTIMO de la lista", async () => {
    const { designee, event } = await closedEventWithDesignee();
    const listed = await createPurchaseReceipt({ event: event._id, shoppingDesignee: designee._id, amount: 1, participants: [] });
    const unlisted = await createPurchaseReceipt({
      event: event._id,
      shoppingDesignee: designee._id,
      amount: 2,
      participants: [],
      attachToEvent: false,
    });
    await api().delete(`/api/purchaseReceipts/deletePurchaseReceipt/${unlisted._id}/${event._id}`).set(auth(designee.token)).expect(200);
    expect((await findEvent(event._id))!.purchaseReceipts).toEqual([]);
    expect(await findPurchaseReceipt(listed._id)).not.toBeNull();
  });
});
