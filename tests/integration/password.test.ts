import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { api } from "../helpers/api.js";
import { createUser, findUser } from "../helpers/fixtures.js";
import { User } from "../../src/models/user.js";
import { sentEmails, setBrevoResponseStatus } from "../helpers/mailer.js";

function codeFromLastEmail(): string {
  const html = sentEmails[sentEmails.length - 1].payload.htmlContent;
  const match = html.match(/<span class="code">(\d+)<\/span>/);
  if (!match) throw new Error("No se encontró el código en el mail");
  return match[1];
}

describe("POST /api/password/forgot", () => {
  it("genera un código de 6 dígitos, guarda su hash y lo manda por mail", async () => {
    const user = await createUser({ name: "Ana" });
    const res = await api().post("/api/password/forgot").send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: `Mail sent succesfully to ${user.email}.` });

    expect(sentEmails).toHaveLength(1);
    const mail = sentEmails[0].payload;
    expect(mail.to).toEqual([{ email: user.email, name: "Ana" }]);
    expect(mail.subject).toBe("FoodSpot | Recuperar contraseña");

    const code = codeFromLastEmail();
    expect(code).toMatch(/^[1-9]\d{5}$/);
    const stored = await findUser(user._id);
    expect(stored?.verificationCode).not.toBe(code);
    expect(await bcrypt.compare(code, stored!.verificationCode!)).toBe(true);
  });

  it("si el usuario tiene email alternativo, el mail se manda ahí", async () => {
    const user = await createUser({ alternativeEmail: "ana@gmail.com" });
    const res = await api().post("/api/password/forgot").send({ email: user.email });
    expect(res.body).toEqual({ message: "Mail sent succesfully to ana@gmail.com." });
    expect(sentEmails[0].payload.to[0].email).toBe("ana@gmail.com");
  });

  it("también encuentra al usuario por su email alternativo", async () => {
    await createUser({ alternativeEmail: "ana@gmail.com" });
    const res = await api().post("/api/password/forgot").send({ email: "ANA@gmail.com" });
    expect(res.status).toBe(200);
    expect(sentEmails[0].payload.to[0].email).toBe("ana@gmail.com");
  });

  it("el email no distingue mayúsculas", async () => {
    const user = await createUser({ email: "ana@endava.com" });
    const res = await api().post("/api/password/forgot").send({ email: "ANA@ENDAVA.COM" });
    expect(res.status).toBe(200);
    expect(sentEmails[0].payload.to[0].email).toBe(user.email);
  });

  it("el código vence a los 15 minutos y el pedido reinicia los intentos", async () => {
    const user = await createUser({ verificationCodePlain: "111111" });
    await User.updateOne({ _id: user._id }, { verificationAttempts: 3 });
    const before = Date.now();
    await api().post("/api/password/forgot").send({ email: user.email }).expect(200);
    const stored = await findUser(user._id);
    const expiresAt = new Date(stored!.verificationCodeExpiresAt!).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    expect(stored!.verificationAttempts).toBe(0);
  });

  it("cada pedido genera un código nuevo que invalida el anterior", async () => {
    const user = await createUser();
    await api().post("/api/password/forgot").send({ email: user.email });
    const first = codeFromLastEmail();
    await api().post("/api/password/forgot").send({ email: user.email });
    const second = codeFromLastEmail();
    const stored = await findUser(user._id);
    expect(await bcrypt.compare(second, stored!.verificationCode!)).toBe(true);
    if (first !== second) {
      expect(await bcrypt.compare(first, stored!.verificationCode!)).toBe(false);
    }
  });

  it("usuario inexistente -> 404 'User does not exist.' y no manda mail", async () => {
    const res = await api().post("/api/password/forgot").send({ email: "nadie@endava.com" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "User does not exist." });
    expect(sentEmails).toHaveLength(0);
  });

  it("si Brevo falla responde 500 con el error, pero el código ya quedó guardado", async () => {
    const user = await createUser();
    setBrevoResponseStatus(500);
    const res = await api().post("/api/password/forgot").send({ email: user.email });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Brevo error: 500" });
    expect((await findUser(user._id))?.verificationCode).not.toBeNull();
  });

  it("[comportamiento actual] sin email responde 500", async () => {
    const res = await api().post("/api/password/forgot").send({});
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/password/verifyCode", () => {
  it("código correcto -> 200 y no consume el código", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "123456" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Verification code is correct." });
    expect((await findUser(user._id))?.verificationCode).not.toBeNull();
  });

  it("el email no distingue mayúsculas", async () => {
    await createUser({ email: "ana@endava.com", verificationCodePlain: "123456" });
    const res = await api().put("/api/password/verifyCode").send({ email: "Ana@Endava.com", verificationCode: "123456" });
    expect(res.status).toBe(200);
  });

  it("código incorrecto -> 400 y el body es un string JSON (no un objeto)", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "654321" });
    expect(res.status).toBe(400);
    expect(res.body).toBe("Invalid verification code.");
  });

  it("usuario inexistente -> 404", async () => {
    const res = await api().put("/api/password/verifyCode").send({ email: "nadie@endava.com", verificationCode: "1" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "User does not exist." });
  });

  it("solo busca por email principal (no por el alternativo)", async () => {
    await createUser({ alternativeEmail: "ana@gmail.com", verificationCodePlain: "123456" });
    const res = await api().put("/api/password/verifyCode").send({ email: "ana@gmail.com", verificationCode: "123456" });
    expect(res.status).toBe(404);
  });

  it("si el usuario nunca pidió un código -> 400", async () => {
    const user = await createUser();
    const res = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "123456" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "User never requested a password change." });
  });

  it("código vencido -> 400 y se descarta", async () => {
    const user = await createUser({ verificationCodePlain: "123456", verificationCodeExpiresAt: new Date(Date.now() - 1000) });
    const res = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "123456" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Verification code expired. Request a new one." });
    expect((await findUser(user._id))?.verificationCode).toBeNull();
  });

  it("al 5º intento fallido descarta el código, aunque después llegue el correcto", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    for (let i = 0; i < 4; i++) {
      const res = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "000000" });
      expect(res.body).toBe("Invalid verification code.");
    }
    const fifth = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "000000" });
    expect(fifth.status).toBe(400);
    expect(fifth.body).toEqual({ message: "Too many failed attempts. Request a new code." });

    const correct = await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: "123456" });
    expect(correct.status).toBe(400);
    expect(correct.body).toEqual({ message: "User never requested a password change." });
  });
});

describe("PUT /api/password/recover", () => {
  it("con el código correcto cambia la contraseña y borra el código", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: "123456", password: "NuevaClave1!" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Password was updated correctly." });

    const stored = await findUser(user._id);
    expect(stored?.verificationCode).toBeNull();
    expect(await bcrypt.compare("NuevaClave1!", stored!.password)).toBe(true);

    const oldLogin = await api().post("/api/login").send({ email: user.email, password: user.plainPassword });
    expect(oldLogin.status).toBe(400);
    const newLogin = await api().post("/api/login").send({ email: user.email, password: "NuevaClave1!" });
    expect(newLogin.status).toBe(200);
  });

  it("el código no se puede reutilizar", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const body = { email: user.email, verificationCode: "123456", password: "NuevaClave1!" };
    await api().put("/api/password/recover").send(body);
    const res = await api().put("/api/password/recover").send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "User never requested a password change." });
  });

  it("sin código pedido -> 400", async () => {
    const user = await createUser();
    const res = await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: "123456", password: "NuevaClave1!" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "User never requested a password change." });
  });

  it("código incorrecto -> 400 y la contraseña no cambia", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: "000000", password: "NuevaClave1!" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid verification code." });
    expect((await findUser(user._id))?.password).toBe(user.password);
  });

  it("los intentos fallidos de verifyCode y recover se suman", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const wrong = { email: user.email, verificationCode: "000000", password: "NuevaClave1!" };
    for (let i = 0; i < 2; i++) await api().put("/api/password/verifyCode").send(wrong);
    for (let i = 0; i < 2; i++) await api().put("/api/password/recover").send(wrong);
    const fifth = await api().put("/api/password/recover").send(wrong);
    expect(fifth.body).toEqual({ message: "Too many failed attempts. Request a new code." });
    expect((await findUser(user._id))?.password).toBe(user.password);
  });

  it("código vencido -> 400 y la contraseña no cambia", async () => {
    const user = await createUser({ verificationCodePlain: "123456", verificationCodeExpiresAt: new Date(Date.now() - 1000) });
    const res = await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: "123456", password: "NuevaClave1!" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Verification code expired. Request a new one." });
    expect((await findUser(user._id))?.password).toBe(user.password);
  });

  it("usuario inexistente -> 404", async () => {
    const res = await api()
      .put("/api/password/recover")
      .send({ email: "nadie@endava.com", verificationCode: "1", password: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "User does not exist." });
  });

  it("[comportamiento actual] NO valida la fortaleza de la nueva contraseña", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: "123456", password: "123" });
    expect(res.status).toBe(200);
  });

  it("[comportamiento actual] sin password responde 500 y no consume el código", async () => {
    const user = await createUser({ verificationCodePlain: "123456" });
    const res = await api().put("/api/password/recover").send({ email: user.email, verificationCode: "123456" });
    expect(res.status).toBe(500);
    expect((await findUser(user._id))?.verificationCode).not.toBeNull();
  });
});

describe("Flujo completo de recuperación de contraseña", () => {
  it("forgot -> mail -> verifyCode -> recover -> login", async () => {
    const user = await createUser();
    await api().post("/api/password/forgot").send({ email: user.email }).expect(200);
    const code = codeFromLastEmail();

    await api().put("/api/password/verifyCode").send({ email: user.email, verificationCode: code }).expect(200);
    await api()
      .put("/api/password/recover")
      .send({ email: user.email, verificationCode: code, password: "OtraClave9?" })
      .expect(200);
    await api().post("/api/login").send({ email: user.email, password: "OtraClave9?" }).expect(200);
  });
});
