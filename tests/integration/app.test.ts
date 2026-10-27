import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { createUser, newId, tokenFor } from "../helpers/fixtures.js";

describe("App: raíz, CORS y parsing", () => {
  it("GET / responde el mensaje de bienvenida", async () => {
    const res = await api().get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "This is the FoodSpot API" });
  });

  it("una ruta inexistente responde 404", async () => {
    expect((await api().get("/api/no-existe")).status).toBe(404);
    expect((await api().get("/no-existe")).status).toBe(404);
  });

  it("las rutas no llevan barra final obligatoria ni distinguen mayúsculas (default de Express)", async () => {
    expect((await api().get("/api/events/getPublicEvents/")).status).toBe(200);
    expect((await api().get("/api/events/getpublicevents")).status).toBe(200);
  });

  it("preflight CORS: refleja el origin y anuncia métodos y headers permitidos", async () => {
    const res = await api()
      .options("/api/events/getPublicEvents")
      .set("Origin", "https://food-spot.vercel.app")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://food-spot.vercel.app");
    expect(res.headers["access-control-allow-methods"]).toBe("GET,HEAD,PUT,PATCH,POST,DELETE");
    expect(res.headers["access-control-allow-headers"]).toBe("authorization,Content-Type");
  });

  it("CORS: cualquier origin es aceptado y se expone el header authorization", async () => {
    const res = await api().get("/").set("Origin", "http://cualquier-origen.test");
    expect(res.headers["access-control-allow-origin"]).toBe("http://cualquier-origen.test");
    expect(res.headers["access-control-expose-headers"]).toBe("authorization");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("JSON malformado responde 400", async () => {
    const res = await api()
      .post("/api/login")
      .set("Content-Type", "application/json")
      .send('{"email": ');
    expect(res.status).toBe(400);
  });

  it("JSON de más de 100kb responde 413", async () => {
    const res = await api()
      .post("/api/login")
      .send({ email: "a@endava.com", password: "x".repeat(110 * 1024) });
    expect(res.status).toBe(413);
  });

  it("acepta cuerpos application/x-www-form-urlencoded", async () => {
    const user = await createUser();
    const res = await api()
      .post("/api/login")
      .type("form")
      .send({ email: user.email, password: user.plainPassword });
    expect(res.status).toBe(200);
    expect(res.body.jwt).toEqual(expect.any(String));
  });
});

/**
 * Matriz de autenticación de TODAS las rutas. Si una ruta cambia de pública a
 * privada (o viceversa) durante la migración, este test lo detecta.
 */
const ID = "507f1f77bcf86cd799439011";
const ID2 = "507f1f77bcf86cd799439012";

const protectedRoutes: [string, string][] = [
  ["get", "/api/events/getEvents"],
  ["get", "/api/events/getPublicAndPrivateEvents"],
  ["get", `/api/events/getMemberIndividualCost/${ID}/${ID2}`],
  ["post", "/api/events/createEvent"],
  ["put", `/api/events/subscribeToAnEvent/${ID}/${ID2}`],
  ["put", `/api/events/unsubscribeFromEvent/${ID}/${ID2}`],
  ["put", `/api/events/editRoles/${ID}`],
  ["put", `/api/events/editEvent/${ID}`],
  ["delete", `/api/events/deleteEvent/${ID}`],
  ["get", `/api/images/getImage/${ID}`],
  ["get", `/api/options/getMembersWhoHaventVoted/${ID}`],
  ["post", `/api/options/createOption/${ID}`],
  ["put", `/api/options/editOption/${ID}`],
  ["delete", `/api/options/deleteOption/${ID}`],
  ["put", `/api/options/vote/${ID}`],
  ["delete", `/api/options/vote/${ID}`],
  ["get", `/api/purchaseReceipts/getPurchaseReceiptsByEvent/${ID}`],
  ["get", `/api/purchaseReceipts/getPurchaseReceiptById/${ID}/${ID2}`],
  ["put", "/api/purchaseReceipts/assignMembersToReceipt"],
  ["post", `/api/purchaseReceipts/uploadFile/${ID}`],
  ["post", `/api/purchaseReceipts/createPurchaseReceipt/${ID}`],
  ["delete", `/api/purchaseReceipts/deletePurchaseReceipt/${ID}/${ID2}`],
  ["post", `/api/ratings/createRating/${ID}/${ID2}`],
  ["get", `/api/ratings/getRatingFromUser/${ID}/${ID2}`],
  ["get", `/api/transferReceipts/getTransferReceiptsByEvent/${ID}`],
  ["get", `/api/transferReceipts/getTransferReceiptsById/${ID}`],
  ["post", `/api/transferReceipts/uploadFile/${ID}`],
  ["post", `/api/transferReceipts/createTransferReceipt/${ID}`],
  ["post", `/api/transferReceipts/approvePaymentWithoutReceipt/${ID}/${ID2}`],
  ["put", `/api/transferReceipts/approveTransferReceipt/${ID}/${ID2}`],
  ["delete", `/api/transferReceipts/deleteTransferReceipt/${ID}`],
  ["get", "/api/users/getUsers"],
  ["get", `/api/users/getUserById/${ID}`],
  ["get", `/api/users/isDebtor/${ID}`],
  ["get", `/api/users/hasPendingTransfers/${ID}`],
  ["put", `/api/users/editUser/${ID}`],
  ["put", `/api/users/editProfilePicture/${ID}`],
  ["delete", `/api/users/deleteUser/${ID}`],
];

// Rutas que NO exigen token (algunas probablemente deberían; ver tests de cada recurso).
const publicRoutes: [string, string, number][] = [
  ["get", "/api/events/getPublicEvents", 200],
  ["get", `/api/events/getEventById/${ID}`, 404],
  ["get", `/api/events/getMembersAndReceiptsInfo/${ID}`, 500],
  ["get", `/api/events/getMembersAmount/${ID}`, 404],
  ["get", "/api/cron/reminderCheck", 200],
];

describe("Matriz de autenticación", () => {
  it.each(protectedRoutes)("%s %s exige token (401 sin Authorization)", async (method, path) => {
    const res = await (api() as any)[method](path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Access denied. No token provided." });
  });

  it.each(protectedRoutes)("%s %s responde 400 con un token inválido", async (method, path) => {
    const res = await (api() as any)[method](path).set(auth("token-invalido"));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid token." });
  });

  it.each(publicRoutes)("%s %s es pública (responde %i sin token)", async (method, path, status) => {
    const res = await (api() as any)[method](path);
    expect(res.status).toBe(status);
  });

  it("login, register y password/* son públicas (no responden 401 sin token)", async () => {
    const calls = [
      api().post("/api/login").send({ email: "nadie@endava.com", password: "x" }),
      api().post("/api/users/register").send({}),
      api().post("/api/password/forgot").send({ email: "nadie@endava.com" }),
      api().put("/api/password/verifyCode").send({ email: "nadie@endava.com", verificationCode: "1" }),
      api().put("/api/password/recover").send({ email: "nadie@endava.com" }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).not.toBe(401);
    }
  });

  it("un token válido de un usuario que ya no existe sigue siendo aceptado", async () => {
    const res = await api()
      .get("/api/users/getUsers")
      .set(auth(tokenFor({ _id: newId(), email: "x@endava.com" })));
    expect(res.status).toBe(200);
  });
});
