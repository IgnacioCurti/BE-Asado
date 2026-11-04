import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import { AuthService, InvalidVerificationCodeError } from "../../../../src/modules/auth/AuthService.js";
import { BadRequestError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const NOW = 1_700_000_000_000;

async function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Ana",
    email: "ana@test.com",
    password: await bcrypt.hash("secret", 4),
    verificationCode: null as string | null,
    verificationCodeExpiresAt: null as Date | null,
    verificationAttempts: 0,
    generateAuthToken: () => "jwt-token",
    ...overrides,
  } as any;
}

function setup(user: any) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(user),
    save: vi.fn(async (doc: any) => doc),
  };
  const sendEmail = vi.fn().mockResolvedValue(undefined);
  const service = new AuthService({
    users,
    sendEmail,
    recoveryTemplate: (code) => `<p>${code}</p>`,
    now: () => NOW,
    generateCode: () => 123456,
  });
  return { service, users, sendEmail };
}

async function userWithCode(code = "123456", overrides: Record<string, unknown> = {}) {
  return makeUser({
    verificationCode: await bcrypt.hash(code, 4),
    verificationCodeExpiresAt: new Date(NOW + 60_000),
    ...overrides,
  });
}

describe("AuthService.login", () => {
  it("devuelve id, nombre y jwt con credenciales válidas (email sin distinguir mayúsculas)", async () => {
    const { service, users } = setup(await makeUser());
    expect(await service.login("ANA@test.com", "secret")).toEqual({ id: "user-1", name: "Ana", jwt: "jwt-token" });
    expect(users.findByEmail).toHaveBeenCalledWith("ana@test.com");
  });

  it("usuario inexistente o contraseña incorrecta -> mismo BadRequestError", async () => {
    const expected = new BadRequestError("Invalid email or password");
    await expect(setup(null).service.login("x@test.com", "secret")).rejects.toEqual(expected);
    await expect(setup(await makeUser()).service.login("ana@test.com", "wrong")).rejects.toEqual(expected);
  });
});

describe("AuthService.requestPasswordReset", () => {
  it("guarda el hash del código con vencimiento y manda el mail", async () => {
    const user = await makeUser({ verificationAttempts: 3 });
    const { service, users, sendEmail } = setup(user);

    expect(await service.requestPasswordReset("ana@test.com")).toBe("ana@test.com");

    expect(await bcrypt.compare("123456", user.verificationCode)).toBe(true);
    expect(user.verificationCodeExpiresAt).toEqual(new Date(NOW + 15 * 60 * 1000));
    expect(user.verificationAttempts).toBe(0);
    expect(users.save).toHaveBeenCalledWith(user);
    expect(sendEmail).toHaveBeenCalledWith("ana@test.com", "FoodSpot | Recuperar contraseña", "Ana", "<p>123456</p>");
  });

  it("usuario inexistente lanza NotFoundError y no manda mail", async () => {
    const { service, sendEmail } = setup(null);
    await expect(service.requestPasswordReset("x@test.com")).rejects.toEqual(new NotFoundError("User does not exist."));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("AuthService.verifyCode", () => {
  it("código correcto no lanza", async () => {
    const { service } = setup(await userWithCode());
    await expect(service.verifyCode("ana@test.com", "123456")).resolves.toBeUndefined();
  });

  it("código incorrecto suma un intento y lanza InvalidVerificationCodeError", async () => {
    const user = await userWithCode();
    const { service } = setup(user);
    await expect(service.verifyCode("ana@test.com", "000000")).rejects.toBeInstanceOf(InvalidVerificationCodeError);
    expect(user.verificationAttempts).toBe(1);
  });

  it("al quinto intento fallido descarta el código", async () => {
    const user = await userWithCode("123456", { verificationAttempts: 4 });
    const { service } = setup(user);
    await expect(service.verifyCode("ana@test.com", "000000")).rejects.toEqual(
      new BadRequestError("Too many failed attempts. Request a new code.")
    );
    expect(user.verificationCode).toBeNull();
  });

  it("código vencido se descarta", async () => {
    const user = await userWithCode("123456", { verificationCodeExpiresAt: new Date(NOW) });
    const { service } = setup(user);
    await expect(service.verifyCode("ana@test.com", "123456")).rejects.toEqual(
      new BadRequestError("Verification code expired. Request a new one.")
    );
    expect(user.verificationCode).toBeNull();
  });

  it("sin código pedido lanza BadRequestError", async () => {
    const { service } = setup(await makeUser());
    await expect(service.verifyCode("ana@test.com", "123456")).rejects.toEqual(
      new BadRequestError("User never requested a password change.")
    );
  });
});

describe("AuthService.resetPassword", () => {
  it("con código válido cambia la contraseña y limpia el código", async () => {
    const user = await userWithCode();
    const { service, users } = setup(user);
    await service.resetPassword("ana@test.com", "123456", "nueva");
    expect(await bcrypt.compare("nueva", user.password)).toBe(true);
    expect(user.verificationCode).toBeNull();
    expect(users.save).toHaveBeenCalledWith(user);
  });

  it("con código incorrecto no cambia la contraseña", async () => {
    const user = await userWithCode();
    const previous = user.password;
    const { service } = setup(user);
    await expect(service.resetPassword("ana@test.com", "000000", "nueva")).rejects.toBeInstanceOf(BadRequestError);
    expect(user.password).toBe(previous);
  });
});
