/**
 * Contrato ante errores inesperados: cualquier falla de la base se traduce en
 * 500 con { message: <mensaje del error> } (no se cae el proceso ni cuelga la request).
 */
import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { createUser, newId, simulateDatabaseFailure } from "../helpers/fixtures.js";

const ID = newId();

const routes: [string, string, boolean][] = [
  ["get", "/api/events/getEvents", true],
  ["get", "/api/events/getPublicEvents", false],
  ["get", "/api/events/getPublicAndPrivateEvents", true],
  ["get", `/api/events/getEventById/${ID}`, false],
  ["get", `/api/events/getMembersAndReceiptsInfo/${ID}`, false],
  ["get", `/api/events/getMembersAmount/${ID}`, false],
  ["get", `/api/events/getMemberIndividualCost/${ID}/${ID}`, true],
  ["put", `/api/events/editRoles/${ID}`, true],
  ["put", `/api/events/editEvent/${ID}`, true],
  ["delete", `/api/events/deleteEvent/${ID}`, true],
  ["get", `/api/images/getImage/${ID}`, true],
  ["get", `/api/options/getMembersWhoHaventVoted/${ID}`, true],
  ["put", `/api/options/editOption/${ID}`, true],
  ["delete", `/api/options/deleteOption/${ID}`, true],
  ["get", `/api/purchaseReceipts/getPurchaseReceiptsByEvent/${ID}`, true],
  ["post", `/api/purchaseReceipts/createPurchaseReceipt/${ID}`, true],
  ["get", `/api/ratings/getRatingFromUser/${ID}/${ID}`, true],
  ["post", `/api/ratings/createRating/${ID}/${ID}`, true],
  ["get", `/api/transferReceipts/getTransferReceiptsByEvent/${ID}`, true],
  ["get", `/api/transferReceipts/getTransferReceiptsById/${ID}`, true],
  ["delete", `/api/transferReceipts/deleteTransferReceipt/${ID}`, true],
  ["get", "/api/users/getUsers", true],
  ["get", `/api/users/getUserById/${ID}`, true],
  ["get", `/api/users/isDebtor/${ID}`, true],
  ["get", `/api/users/hasPendingTransfers/${ID}`, true],
  ["get", "/api/cron/reminderCheck", false],
];

describe("Falla de base de datos", () => {
  it.each(routes)("%s %s -> 500 con el mensaje del error", async (method, path, needsAuth) => {
    const user = await createUser();
    simulateDatabaseFailure("DB caída");
    let req = (api() as any)[method](path);
    if (needsAuth) req = req.set(auth(user.token));
    const res = await req.send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "DB caída" });
  });

  it("login, register y password también responden 500", async () => {
    simulateDatabaseFailure("DB caída");
    const body = { email: "a@endava.com", password: "Secret123!", verificationCode: "1", name: "A", specialDiet: [] };
    for (const [method, path] of [
      ["post", "/api/login"],
      ["post", "/api/users/register"],
      ["post", "/api/password/forgot"],
      ["put", "/api/password/verifyCode"],
      ["put", "/api/password/recover"],
    ]) {
      const res = await (api() as any)[method](path).send(body);
      expect(res.status, `${method} ${path}`).toBe(500);
      expect(res.body).toEqual({ message: "DB caída" });
    }
  });
});
