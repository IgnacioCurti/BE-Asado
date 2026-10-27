import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { api, auth } from "../helpers/api.js";
import { createUser, JWT_SECRET } from "../helpers/fixtures.js";

describe("POST /api/login", () => {
  it("con credenciales válidas devuelve { id, name, jwt }", async () => {
    const user = await createUser({ name: "Ana" });
    const res = await api().post("/api/login").send({ email: user.email, password: user.plainPassword });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: user._id, name: "Ana", jwt: expect.any(String) });
  });

  it("el jwt contiene _id y email, está firmado con JWTPRIVATEKEY y no vence", async () => {
    const user = await createUser();
    const res = await api().post("/api/login").send({ email: user.email, password: user.plainPassword });

    const payload = jwt.verify(res.body.jwt, JWT_SECRET) as jwt.JwtPayload;
    expect(payload._id).toBe(user._id);
    expect(payload.email).toBe(user.email);
    expect(payload.exp).toBeUndefined();
  });

  it("el jwt obtenido sirve para llamar endpoints protegidos", async () => {
    const user = await createUser();
    const login = await api().post("/api/login").send({ email: user.email, password: user.plainPassword });
    const res = await api().get("/api/users/getUsers").set(auth(login.body.jwt));
    expect(res.status).toBe(200);
  });

  it("el email no distingue mayúsculas", async () => {
    const user = await createUser({ email: "ana.perez@endava.com" });
    const res = await api().post("/api/login").send({ email: "ANA.Perez@Endava.COM", password: user.plainPassword });
    expect(res.status).toBe(200);
  });

  it("la contraseña sí distingue mayúsculas", async () => {
    const user = await createUser({ plainPassword: "Secret123!" });
    const res = await api().post("/api/login").send({ email: user.email, password: "secret123!" });
    expect(res.status).toBe(400);
  });

  it("email inexistente -> 400 'Invalid email or password'", async () => {
    const res = await api().post("/api/login").send({ email: "nadie@endava.com", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid email or password" });
  });

  it("contraseña incorrecta -> 400 con el mismo mensaje (no revela si el usuario existe)", async () => {
    const user = await createUser();
    const res = await api().post("/api/login").send({ email: user.email, password: "Incorrecta1!" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid email or password" });
  });

  it("[comportamiento actual] sin email responde 500 (TypeError en toLowerCase)", async () => {
    const res = await api().post("/api/login").send({ password: "x" });
    expect(res.status).toBe(500);
    expect(res.body.message).toEqual(expect.any(String));
  });

  it("[comportamiento actual] sin password responde 500 (bcrypt sin datos)", async () => {
    const user = await createUser();
    const res = await api().post("/api/login").send({ email: user.email });
    expect(res.status).toBe(500);
  });
});
