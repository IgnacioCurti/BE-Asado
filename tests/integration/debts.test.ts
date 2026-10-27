import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { createEvent, createPurchaseReceipt, createTransferReceipt, createUser } from "../helpers/fixtures.js";

/** Ana compró 300 para Ana, Beto y Caro: Beto y Caro le deben 100 c/u. */
async function scenario(state = "readyforpayment") {
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

describe("GET /api/users/isDebtor/:id", () => {
  it("devuelve los eventos listos para pagar donde el usuario debe y no tiene pago aprobado", async () => {
    const { beto, event } = await scenario();
    const res = await api().get(`/api/users/isDebtor/${beto._id}`).set(auth(beto.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([event._id]);
  });

  it("con comprobante subido pero no aprobado sigue siendo deudor", async () => {
    const { ana, beto, event } = await scenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    const res = await api().get(`/api/users/isDebtor/${beto._id}`).set(auth(beto.token));
    expect(res.body).toEqual([event._id]);
  });

  it("con pago aprobado deja de ser deudor", async () => {
    const { ana, beto, event } = await scenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id, hasPaid: true });
    const res = await api().get(`/api/users/isDebtor/${beto._id}`).set(auth(beto.token));
    expect(res.body).toEqual([]);
  });

  it("el acreedor no es deudor", async () => {
    const { ana } = await scenario();
    const res = await api().get(`/api/users/isDebtor/${ana._id}`).set(auth(ana.token));
    expect(res.body).toEqual([]);
  });

  it.each(["available", "closed", "finished", "cancelled"])("los eventos en estado %s no cuentan", async (state) => {
    const { beto } = await scenario(state);
    const res = await api().get(`/api/users/isDebtor/${beto._id}`).set(auth(beto.token));
    expect(res.body).toEqual([]);
  });

  it("acumula varios eventos", async () => {
    const first = await scenario();
    const ana2 = await createUser();
    const second = await createEvent({ organizer: ana2._id, members: [ana2._id, first.beto._id], state: "readyforpayment" });
    await createPurchaseReceipt({ event: second._id, shoppingDesignee: ana2._id, amount: 50, participants: [ana2._id, first.beto._id] });
    const res = await api().get(`/api/users/isDebtor/${first.beto._id}`).set(auth(first.beto.token));
    expect(res.body.sort()).toEqual([first.event._id, second._id].sort());
  });

  it("consultar a otro usuario -> 403, aunque sea el organizador del evento", async () => {
    const { ana, beto } = await scenario();
    const res = await api().get(`/api/users/isDebtor/${beto._id}`).set(auth(ana.token));
    expect(res.status).toBe(403);
  });

  it("id mal formado -> 400", async () => {
    const user = await createUser();
    expect((await api().get("/api/users/isDebtor/abc").set(auth(user.token))).status).toBe(400);
  });
});

describe("GET /api/users/hasPendingTransfers/:id", () => {
  it("devuelve los eventos donde el comprador tiene transferencias sin aprobar dirigidas a él", async () => {
    const { ana, beto, event } = await scenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    const res = await api().get(`/api/users/hasPendingTransfers/${ana._id}`).set(auth(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([event._id]);
  });

  it("un evento aparece una sola vez aunque haya varias transferencias pendientes", async () => {
    const { ana, beto, caro, event } = await scenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: ana._id });
    const res = await api().get(`/api/users/hasPendingTransfers/${ana._id}`).set(auth(ana.token));
    expect(res.body).toEqual([event._id]);
  });

  it("no cuenta transferencias aprobadas, dirigidas a otro, o sin receptor", async () => {
    const { ana, beto, caro, event } = await scenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id, hasPaid: true });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: beto._id });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: null });
    const res = await api().get(`/api/users/hasPendingTransfers/${ana._id}`).set(auth(ana.token));
    expect(res.body).toEqual([]);
  });

  it("solo considera eventos donde el usuario es shoppingDesignee y en readyforpayment", async () => {
    const { ana, beto, event } = await scenario("closed");
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    expect((await api().get(`/api/users/hasPendingTransfers/${ana._id}`).set(auth(ana.token))).body).toEqual([]);

    const other = await scenario();
    await createTransferReceipt({ event: other.event._id, user: other.ana._id, amount: 100, receiver: other.beto._id });
    // beto recibe la transferencia, pero no es shoppingDesignee
    expect((await api().get(`/api/users/hasPendingTransfers/${other.beto._id}`).set(auth(other.beto.token))).body).toEqual([]);
  });

  it("consultar a otro usuario -> 403", async () => {
    const { ana, beto } = await scenario();
    const res = await api().get(`/api/users/hasPendingTransfers/${ana._id}`).set(auth(beto.token));
    expect(res.status).toBe(403);
  });

  it("id mal formado -> 400", async () => {
    const user = await createUser();
    expect((await api().get("/api/users/hasPendingTransfers/abc").set(auth(user.token))).status).toBe(400);
  });
});
