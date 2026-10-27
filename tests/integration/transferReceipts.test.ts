import { describe, expect, it } from "vitest";
import { api, auth, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import {
  countImages,
  countTransferReceipts,
  createEvent,
  createImage,
  createPurchaseReceipt,
  createTransferReceipt,
  createUser,
  findEvent,
  findImage,
  findTransferReceipt,
  listTransferReceipts,
  newId,
} from "../helpers/fixtures.js";

const THREE_HOURS: number = 3 * 60 * 60 * 1000;

/**
 * Escenario base: Ana (compradora) gastó 300 para Ana, Beto y Caro.
 * Beto y Caro le deben 100 cada uno -> 2 transferencias esperadas.
 */
async function paymentScenario(state = "readyforpayment") {
  const ana = await createUser({ name: "Ana" });
  const beto = await createUser({ name: "Beto" });
  const caro = await createUser({ name: "Caro" });
  const event = await createEvent({
    organizer: ana._id,
    members: [ana._id, beto._id, caro._id],
    shoppingDesignee: [ana._id],
    state,
  });
  await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 300, participants: [ana._id, beto._id, caro._id] });
  return { ana, beto, caro, event };
}

describe("GET /api/transferReceipts/getTransferReceiptsByEvent/:event", () => {
  it("el comprador ve los comprobantes de transferencia del evento", async () => {
    const { ana, beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    const res = await api().get(`/api/transferReceipts/getTransferReceiptsByEvent/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        _id: receipt._id,
        amount: 100,
        user: beto._id,
        receiver: ana._id,
        event: event._id,
        hasPaid: false,
        image: null,
        paymentMethod: null,
      }),
    ]);
  });

  it("un miembro que no es comprador -> 403", async () => {
    const { beto, event } = await paymentScenario();
    const res = await api().get(`/api/transferReceipts/getTransferReceiptsByEvent/${event._id}`).set(auth(beto.token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. User is not a shopping designee." });
  });
});

describe("GET /api/transferReceipts/getTransferReceiptsById/:id", () => {
  it("[comportamiento actual] cualquier usuario autenticado puede ver cualquier comprobante", async () => {
    const { beto, event } = await paymentScenario();
    const stranger = await createUser();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api().get(`/api/transferReceipts/getTransferReceiptsById/${receipt._id}`).set(auth(stranger.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: receipt._id, amount: 100 });
  });

  it("inexistente -> 404; mal formado -> 500", async () => {
    const user = await createUser();
    const notFound = await api().get(`/api/transferReceipts/getTransferReceiptsById/${newId()}`).set(auth(user.token));
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: "The transfer receipt with the given ID was not found." });
    expect((await api().get("/api/transferReceipts/getTransferReceiptsById/abc").set(auth(user.token))).status).toBe(500);
  });
});

describe("POST /api/transferReceipts/createTransferReceipt/:event", () => {
  it("crea el comprobante con fecha = ahora - 3 horas y lo agrega al evento", async () => {
    const { ana, beto, event } = await paymentScenario();
    const before = Date.now();
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 100, receiver: ana._id, description: "transferencia", paymentMethod: "mercadopago" });
    const after = Date.now();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      _id: expect.any(String),
      user: beto._id,
      amount: 100,
      receiver: ana._id,
      description: "transferencia",
      paymentMethod: "mercadopago",
      event: event._id,
      hasPaid: false,
      image: null,
    });
    const datetime = new Date(res.body.datetime).getTime();
    expect(datetime).toBeGreaterThanOrEqual(before - THREE_HOURS - 1000);
    expect(datetime).toBeLessThanOrEqual(after - THREE_HOURS + 1000);
    expect((await findEvent(event._id))!.transferReceipts).toEqual([res.body._id]);
  });

  it("si el usuario ya tenía un comprobante, lo reemplaza", async () => {
    const { ana, beto, event } = await paymentScenario();
    const old = await createTransferReceipt({ event: event._id, user: beto._id, amount: 50 });
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 100, receiver: ana._id });
    expect(res.status).toBe(201);
    expect(await findTransferReceipt(old._id)).toBeNull();
    expect((await findEvent(event._id))!.transferReceipts).toEqual([res.body._id]);
    expect(await countTransferReceipts()).toBe(1);
  });

  it("al reemplazar el comprobante se borra la imagen del anterior", async () => {
    const { ana, beto, event } = await paymentScenario();
    const oldImage = await createImage();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 50, image: oldImage });
    await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 100, receiver: ana._id })
      .expect(201);
    expect(await findImage(oldImage)).toBeNull();
  });

  it("[comportamiento actual] el reemplazo ocurre aunque el comprobante anterior ya estuviera aprobado", async () => {
    const { beto, event } = await paymentScenario();
    const approved = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, hasPaid: true });
    await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 1 })
      .expect(201);
    expect(await findTransferReceipt(approved._id)).toBeNull();
  });

  it("[SEGURIDAD - comportamiento actual] el usuario se toma del body: se puede crear en nombre de otro", async () => {
    const { beto, caro, event } = await paymentScenario();
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: caro._id, amount: 100 });
    expect(res.status).toBe(201);
    expect(res.body.user).toBe(caro._id);
  });

  it("[SEGURIDAD - comportamiento actual] se puede enviar hasPaid: true y quedar auto-aprobado", async () => {
    const { beto, event } = await paymentScenario();
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 100, hasPaid: true });
    expect(res.body.hasPaid).toBe(true);
  });

  it.each(["available", "closed", "finished", "cancelled"])("evento en estado %s -> 400", async (state) => {
    const { beto, event } = await paymentScenario(state);
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id, amount: 100 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "You can only create transfer receipts when the event is ready for payment." });
    expect(await countTransferReceipts()).toBe(0);
  });

  it("evento inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${newId()}`)
      .set(auth(user.token))
      .send({ user: user._id, amount: 1 });
    expect(res.status).toBe(404);
  });

  it("quien no es miembro del evento -> 403 y no crea nada", async () => {
    const { ana, event } = await paymentScenario();
    const outsider = await createUser();
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(outsider.token))
      .send({ user: outsider._id, amount: 100, receiver: ana._id });
    expect(res.status).toBe(403);
    expect(await countTransferReceipts()).toBe(0);
  });

  it("[comportamiento actual] sin amount -> 500, pero el comprobante anterior ya fue borrado", async () => {
    const { beto, event } = await paymentScenario();
    const old = await createTransferReceipt({ event: event._id, user: beto._id, amount: 50 });
    const res = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${event._id}`)
      .set(auth(beto.token))
      .send({ user: beto._id });
    expect(res.status).toBe(500);
    expect(await findTransferReceipt(old._id)).toBeNull();
    expect((await findEvent(event._id))!.transferReceipts).toEqual([]);
  });
});

describe("POST /api/transferReceipts/uploadFile/:transferReceipt", () => {
  it.each([
    ["image/png", "t.png", PNG_BYTES],
    ["application/pdf", "t.pdf", PDF_BYTES],
  ])("acepta %s y lo asocia al comprobante", async (contentType, filename, bytes) => {
    const { beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${receipt._id}`)
      .set(auth(beto.token))
      .attach("file", bytes, { filename, contentType });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imageId: expect.any(String) });
    expect((await findTransferReceipt(receipt._id))!.image).toBe(res.body.imageId);
    expect((await findImage(res.body.imageId))!.mimetype).toBe(contentType);
  });

  it("al reemplazar la imagen se borra la anterior", async () => {
    const { beto, event } = await paymentScenario();
    const oldImage = await createImage();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, image: oldImage });
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${receipt._id}`)
      .set(auth(beto.token))
      .attach("file", PNG_BYTES, { filename: "t.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(await findImage(oldImage)).toBeNull();
    expect(await countImages()).toBe(1);
  });

  it("comprobante inexistente -> 404 y no guarda la imagen", async () => {
    const user = await createUser();
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${newId()}`)
      .set(auth(user.token))
      .attach("file", PNG_BYTES, { filename: "t.png", contentType: "image/png" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The transfer receipt with the given ID was not found." });
    expect(await countImages()).toBe(0);
  });

  it("subir la imagen al comprobante de otro -> 403", async () => {
    const { beto, caro, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${receipt._id}`)
      .set(auth(caro.token))
      .attach("file", PNG_BYTES, { filename: "t.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect((await findTransferReceipt(receipt._id))!.image).toBeNull();
    expect(await countImages()).toBe(0);
  });

  it("comprobante ya aprobado -> 400", async () => {
    const { beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, hasPaid: true });
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${receipt._id}`)
      .set(auth(beto.token))
      .attach("file", PNG_BYTES, { filename: "t.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The transfer receipt is already approved." });
    expect(await countImages()).toBe(0);
  });

  it("[comportamiento actual] tipo no permitido -> 500", async () => {
    const { beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api()
      .post(`/api/transferReceipts/uploadFile/${receipt._id}`)
      .set(auth(beto.token))
      .attach("file", Buffer.from("x"), { filename: "t.txt", contentType: "text/plain" });
    expect(res.status).toBe(500);
  });

  it("sin archivo -> 400", async () => {
    const user = await createUser();
    const res = await api().post(`/api/transferReceipts/uploadFile/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No file was uploaded." });
  });
});

describe("PUT /api/transferReceipts/approveTransferReceipt/:id/:event", () => {
  it("aprueba el comprobante; el evento sigue en readyforpayment mientras falten pagos", async () => {
    const { ana, beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });

    const res = await api().put(`/api/transferReceipts/approveTransferReceipt/${receipt._id}/${event._id}`).set(auth(ana.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: receipt._id, hasPaid: true });
    expect((await findTransferReceipt(receipt._id))!.hasPaid).toBe(true);
    expect((await findEvent(event._id))!.state).toBe("readyforpayment");
  });

  it("al aprobar la última transferencia esperada el evento pasa a finished", async () => {
    const { ana, beto, caro, event } = await paymentScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id, hasPaid: true });
    const last = await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: ana._id });

    await api().put(`/api/transferReceipts/approveTransferReceipt/${last._id}/${event._id}`).set(auth(ana.token)).expect(200);

    expect((await findEvent(event._id))!.state).toBe("finished");
  });

  it("'finished' mira quién pagó: un pago aprobado del acreedor no salda la deuda de otro", async () => {
    const { ana, beto, event } = await paymentScenario();
    // Ana es acreedora (no debe nada) pero tiene un comprobante aprobado
    await createTransferReceipt({ event: event._id, user: ana._id, amount: 0, hasPaid: true });
    const betoReceipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });

    await api().put(`/api/transferReceipts/approveTransferReceipt/${betoReceipt._id}/${event._id}`).set(auth(ana.token)).expect(200);

    // Caro nunca pagó: el evento sigue esperando su pago
    expect((await findEvent(event._id))!.state).toBe("readyforpayment");
  });

  it("ya aprobado -> 400", async () => {
    const { ana, beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, hasPaid: true });
    const res = await api().put(`/api/transferReceipts/approveTransferReceipt/${receipt._id}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The transfer receipt is already approved." });
  });

  it("inexistente -> 404", async () => {
    const { ana, event } = await paymentScenario();
    const res = await api().put(`/api/transferReceipts/approveTransferReceipt/${newId()}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The transfer receipt with the given ID was not found." });
  });

  it("un miembro que no es comprador -> 403", async () => {
    const { beto, event } = await paymentScenario();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api().put(`/api/transferReceipts/approveTransferReceipt/${receipt._id}/${event._id}`).set(auth(beto.token));
    expect(res.status).toBe(403);
    expect((await findTransferReceipt(receipt._id))!.hasPaid).toBe(false);
  });

  it("[SEGURIDAD - comportamiento actual] el comprador de un evento puede aprobar comprobantes de otro evento", async () => {
    const { ana, event } = await paymentScenario();
    const other = await paymentScenario();
    const foreign = await createTransferReceipt({ event: other.event._id, user: other.beto._id, amount: 100 });
    const res = await api().put(`/api/transferReceipts/approveTransferReceipt/${foreign._id}/${event._id}`).set(auth(ana.token));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/transferReceipts/approvePaymentWithoutReceipt/:event/:user", () => {
  it("crea un comprobante aprobado de monto 0 para el usuario, con fecha = ahora - 3 horas", async () => {
    const { ana, beto, event } = await paymentScenario();
    const before = Date.now();
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${beto._id}`)
      .set(auth(ana.token))
      .send({ receiver: ana._id });
    const after = Date.now();

    expect(res.status).toBe(201);
    const datetime = new Date(res.body.datetime).getTime();
    expect(datetime).toBeGreaterThanOrEqual(before - THREE_HOURS - 1000);
    expect(datetime).toBeLessThanOrEqual(after - THREE_HOURS + 1000);
    expect(res.body).toMatchObject({
      user: beto._id,
      event: event._id,
      amount: 0,
      hasPaid: true,
      receiver: ana._id,
      image: null,
    });
    expect((await findEvent(event._id))!.transferReceipts).toEqual([res.body._id]);
    expect((await findEvent(event._id))!.state).toBe("readyforpayment");
  });

  it("sin receiver queda en null", async () => {
    const { ana, beto, event } = await paymentScenario();
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${beto._id}`)
      .set(auth(ana.token))
      .send({});
    expect(res.body.receiver).toBeNull();
  });

  it("si con esto se completan los pagos, el evento pasa a finished", async () => {
    const { ana, beto, caro, event } = await paymentScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, hasPaid: true });
    await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${caro._id}`)
      .set(auth(ana.token))
      .send({ receiver: ana._id })
      .expect(201);
    expect((await findEvent(event._id))!.state).toBe("finished");
  });

  it("si el usuario ya subió un comprobante -> 400", async () => {
    const { ana, beto, event } = await paymentScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${beto._id}`)
      .set(auth(ana.token))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user has uploaded a transfer receipt" });
  });

  it("usuario que no es miembro del evento -> 400 y no crea nada", async () => {
    const { ana, event } = await paymentScenario();
    const outsider = await createUser();
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${outsider._id}`)
      .set(auth(ana.token))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user is not a member of the event." });
    expect(await countTransferReceipts()).toBe(0);
  });

  it(":user mal formado -> 400", async () => {
    const { ana, event } = await paymentScenario();
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/abc`)
      .set(auth(ana.token))
      .send({});
    expect(res.status).toBe(400);
  });

  it("[comportamiento actual] no valida el estado del evento", async () => {
    const { ana, beto, event } = await paymentScenario("closed");
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${beto._id}`)
      .set(auth(ana.token))
      .send({});
    expect(res.status).toBe(201);
  });

  it("un miembro que no es comprador -> 403", async () => {
    const { beto, caro, event } = await paymentScenario();
    const res = await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${event._id}/${caro._id}`)
      .set(auth(beto.token))
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/transferReceipts/deleteTransferReceipt/:id", () => {
  it("borra el comprobante y lo quita del evento", async () => {
    const { beto, caro, event } = await paymentScenario();
    const keep = await createTransferReceipt({ event: event._id, user: caro._id, amount: 100 });
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });

    const res = await api().delete(`/api/transferReceipts/deleteTransferReceipt/${receipt._id}`).set(auth(beto.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: receipt._id });
    expect(await findTransferReceipt(receipt._id)).toBeNull();
    expect((await findEvent(event._id))!.transferReceipts).toEqual([keep._id]);
  });

  it("borra también la imagen del comprobante", async () => {
    const { beto, event } = await paymentScenario();
    const image = await createImage();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, image });
    await api().delete(`/api/transferReceipts/deleteTransferReceipt/${receipt._id}`).set(auth(beto.token)).expect(200);
    expect(await findImage(image)).toBeNull();
  });

  it("si el comprobante no está en la lista del evento, la lista no cambia", async () => {
    const { beto, caro, event } = await paymentScenario();
    const listed = await createTransferReceipt({ event: event._id, user: caro._id, amount: 100 });
    const unlisted = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, attachToEvent: false });

    await api().delete(`/api/transferReceipts/deleteTransferReceipt/${unlisted._id}`).set(auth(beto.token)).expect(200);

    expect(await findTransferReceipt(unlisted._id)).toBeNull();
    expect((await findEvent(event._id))!.transferReceipts).toEqual([listed._id]);
  });

  it("fuera de readyforpayment responde 400 y no borra el comprobante", async () => {
    const { beto, event } = await paymentScenario("finished");
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });

    const res = await api().delete(`/api/transferReceipts/deleteTransferReceipt/${receipt._id}`).set(auth(beto.token));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "You can only create transfer receipts when the event is ready for payment." });
    expect(await findTransferReceipt(receipt._id)).not.toBeNull();
    expect((await findEvent(event._id))!.transferReceipts).toEqual([receipt._id]);
  });

  it("[SEGURIDAD - comportamiento actual] cualquier usuario autenticado puede borrar el comprobante de otro", async () => {
    const { beto, event } = await paymentScenario();
    const stranger = await createUser();
    const receipt = await createTransferReceipt({ event: event._id, user: beto._id, amount: 100 });
    const res = await api().delete(`/api/transferReceipts/deleteTransferReceipt/${receipt._id}`).set(auth(stranger.token));
    expect(res.status).toBe(200);
    expect(await listTransferReceipts()).toEqual([]);
  });

  it("inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api().delete(`/api/transferReceipts/deleteTransferReceipt/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The transfer receipt with the given ID was not found." });
  });
});
