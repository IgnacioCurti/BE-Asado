/**
 * Flujo end-to-end de un asado completo, usando SOLO la API HTTP
 * (sin fixtures). Es el test más resistente a una migración: no depende
 * de la base de datos ni de la estructura interna.
 */
import { describe, expect, it } from "vitest";
import { api, auth, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import { sentEmails } from "../helpers/mailer.js";

async function registerAndLogin(name: string, extra: Record<string, unknown> = {}) {
  const email = `${name.toLowerCase()}@endava.com`;
  const password = "Secret123!";
  const reg = await api()
    .post("/api/users/register")
    .send({ name, lastName: "Test", email, password, specialDiet: [], ...extra })
    .expect(201);
  const login = await api().post("/api/login").send({ email, password }).expect(200);
  return { id: reg.body._id as string, token: login.body.jwt as string, name };
}

describe("Ciclo de vida completo de un evento", () => {
  it("registro -> evento -> votación -> compras -> pagos -> finalizado -> calificación -> borrado", async () => {
    // 1. Usuarios
    const ana = await registerAndLogin("Ana", { cbu: "cbu-ana", alias: "ana.mp" });
    const beto = await registerAndLogin("Beto", { notifications: { newEvent: true } });
    const caro = await registerAndLogin("Caro", { notifications: { eventStart: true } });

    // 2. Ana crea el evento siendo compradora; Beto recibe el aviso de nuevo evento
    const created = await api()
      .post("/api/events/createEvent")
      .set(auth(ana.token))
      .send({
        title: "Asado de fin de año",
        description: "En lo de Ana",
        datetime: "2030-12-20T21:00:00.000Z",
        memberLimit: 3,
        members: [ana.id],
        organizer: ana.id,
        isShoppingDesignee: true,
        penalization: 100,
        penalizationStartDate: "2030-12-27T00:00:00.000Z",
      })
      .expect(201);
    const eventId: string = created.body._id;
    expect(sentEmails).toHaveLength(0);
    await api().get("/api/cron/reminderCheck").expect(200);
    expect(sentEmails.map((m) => m.payload.to[0].email)).toEqual(["beto@endava.com"]);

    // 3. Beto y Caro se suman; el evento queda lleno
    await api().put(`/api/events/subscribeToAnEvent/${beto.id}/${eventId}`).set(auth(beto.token)).expect(200);
    await api().put(`/api/events/subscribeToAnEvent/${caro.id}/${eventId}`).set(auth(caro.token)).expect(200);
    const intruder = await registerAndLogin("Dani");
    const full = await api().put(`/api/events/subscribeToAnEvent/${intruder.id}/${eventId}`).set(auth(intruder.token));
    expect(full.body).toEqual({ message: "The event is full." });

    // 4. Votación de menú
    const vacio = await api().post(`/api/options/createOption/${eventId}`).set(auth(ana.token)).send({ title: "Vacío" }).expect(201);
    await api().put(`/api/options/vote/${vacio.body._id}`).set(auth(ana.token)).expect(200);
    await api().put(`/api/options/vote/${vacio.body._id}`).set(auth(beto.token)).expect(200);
    const pending = await api().get(`/api/options/getMembersWhoHaventVoted/${eventId}`).set(auth(ana.token)).expect(200);
    expect(pending.body.membersWhoHaventVoted.map((m: any) => m._id)).toEqual([caro.id]);

    // 5. Ana cierra el evento
    const editBase = {
      title: "Asado de fin de año",
      description: "En lo de Ana",
      datetime: "2030-12-20T21:00:00.000Z",
      memberLimit: 3,
      penalization: 100,
      penalizationStartDate: "2030-12-27T00:00:00.000Z",
      isPrivate: false,
    };
    await api().put(`/api/events/editEvent/${eventId}`).set(auth(ana.token)).send({ ...editBase, state: "closed" }).expect(200);

    // 6. Carga de compras: carne para todos, bebidas para Ana y Beto
    const carne = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${eventId}`)
      .set(auth(ana.token))
      .send({ description: "Carne", amount: 3000 })
      .expect(201);
    expect(carne.body.participants).toEqual([ana.id, beto.id, caro.id]);
    await api()
      .post(`/api/purchaseReceipts/uploadFile/${carne.body._id}`)
      .set(auth(ana.token))
      .attach("file", PDF_BYTES, { filename: "ticket.pdf", contentType: "application/pdf" })
      .expect(200);
    const bebidas = await api()
      .post(`/api/purchaseReceipts/createPurchaseReceipt/${eventId}`)
      .set(auth(ana.token))
      .send({ description: "Bebidas", amount: 1000 })
      .expect(201);
    await api()
      .put("/api/purchaseReceipts/assignMembersToReceipt")
      .set(auth(ana.token))
      .send({ receipts: [{ id: bebidas.body._id, participants: [ana.id, beto.id] }] })
      .expect(200);
    const receipts = await api().get(`/api/purchaseReceipts/getPurchaseReceiptsByEvent/${eventId}`).set(auth(caro.token)).expect(200);
    expect(receipts.body.map((r: any) => r.amount)).toEqual([3000, 1000]);

    // 7. Pasa a "listo para pagar": Beto debe 1000 + 500, Caro debe 1000
    await api().put(`/api/events/editEvent/${eventId}`).set(auth(ana.token)).send({ ...editBase, state: "readyforpayment" }).expect(200);
    const amounts = await api().get(`/api/events/getMembersAmount/${eventId}`).expect(200);
    const anaReceiver = {
      receiverId: ana.id,
      receiverName: "Ana",
      receiverLastName: "Test",
      receiverCbu: "cbu-ana",
      receiverAlias: "ana.mp",
    };
    expect(amounts.body).toEqual([
      { userId: beto.id, userName: "Beto", amount: 1500, receiver: anaReceiver },
      { userId: caro.id, userName: "Caro", amount: 1000, receiver: anaReceiver },
      { userId: ana.id, userName: "Ana", amount: 0, receiver: null },
    ]);
    const betoCost = await api().get(`/api/events/getMemberIndividualCost/${beto.id}/${eventId}`).set(auth(beto.token)).expect(200);
    expect(betoCost.body).toEqual({ userAmount: 1500 });
    expect((await api().get(`/api/users/isDebtor/${beto.id}`).set(auth(beto.token))).body).toEqual([eventId]);

    // 8. Beto sube su transferencia; Ana tiene pagos pendientes de aprobar
    const transfer = await api()
      .post(`/api/transferReceipts/createTransferReceipt/${eventId}`)
      .set(auth(beto.token))
      .send({ user: beto.id, amount: 1500, receiver: ana.id, paymentMethod: "transferencia" })
      .expect(201);
    await api()
      .post(`/api/transferReceipts/uploadFile/${transfer.body._id}`)
      .set(auth(beto.token))
      .attach("file", PNG_BYTES, { filename: "comprobante.png", contentType: "image/png" })
      .expect(200);
    expect((await api().get(`/api/users/hasPendingTransfers/${ana.id}`).set(auth(ana.token))).body).toEqual([eventId]);
    const info = await api().get(`/api/events/getMembersAndReceiptsInfo/${eventId}`).expect(200);
    expect(info.body.map((m: any) => [m.userName, m.hasUploaded, m.hasReceiptApproved])).toEqual([
      ["Ana", false, null],
      ["Beto", true, false],
      ["Caro", false, null],
    ]);

    // 9. Ana aprueba a Beto; Caro le pagó en efectivo
    await api().put(`/api/transferReceipts/approveTransferReceipt/${transfer.body._id}/${eventId}`).set(auth(ana.token)).expect(200);
    expect((await api().get(`/api/events/getEventById/${eventId}`)).body.state).toBe("readyforpayment");
    await api()
      .post(`/api/transferReceipts/approvePaymentWithoutReceipt/${eventId}/${caro.id}`)
      .set(auth(ana.token))
      .send({ receiver: ana.id })
      .expect(201);

    // 10. Todos pagaron -> finalizado
    const finished = await api().get(`/api/events/getEventById/${eventId}`).expect(200);
    expect(finished.body.state).toBe("finished");
    expect((await api().get(`/api/users/isDebtor/${beto.id}`).set(auth(beto.token))).body).toEqual([]);
    expect((await api().get(`/api/users/hasPendingTransfers/${ana.id}`).set(auth(ana.token))).body).toEqual([]);

    // 11. Calificaciones
    await api().post(`/api/ratings/createRating/${eventId}/${beto.id}`).set(auth(beto.token)).send({ score: 5 }).expect(200);
    await api().post(`/api/ratings/createRating/${eventId}/${caro.id}`).set(auth(caro.token)).send({ score: 4 }).expect(200);
    const publicEvents = await api().get("/api/events/getPublicEvents").expect(200);
    expect(publicEvents.body[0]).toMatchObject({ _id: eventId, state: "finished", members: 3, ratings: { avgScore: 4.5, ratingsAmount: 2 } });

    // 12. Ana borra el evento
    await api().delete(`/api/events/deleteEvent/${eventId}`).set(auth(ana.token)).expect(200);
    expect((await api().get(`/api/events/getEventById/${eventId}`)).status).toBe(404);
    expect((await api().get(`/api/transferReceipts/getTransferReceiptsById/${transfer.body._id}`).set(auth(ana.token))).status).toBe(404);
  });
});
