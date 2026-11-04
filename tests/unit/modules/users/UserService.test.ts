import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { UserService } from "../../../../src/modules/users/UserService.js";
import { BadRequestError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const deps = {
    users: {
      findAllSafe: vi.fn(),
      findSafeById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      findById: vi.fn(),
      create: vi.fn(async (data: any) => ({ _id: id(), ...data })),
      save: vi.fn(async (doc: any) => doc),
      deleteById: vi.fn(),
    },
    events: { findReadyForPaymentByMember: vi.fn(), findReadyForPaymentByDesignee: vi.fn() },
    transferReceipts: { findByEventAndUser: vi.fn() },
    images: { save: vi.fn(), delete: vi.fn() },
    payments: { expectedTransfersFor: vi.fn() },
  };
  return { service: new UserService(deps as any), ...deps };
}

const VALID_PASSWORD = "Abcdef1!";

describe("UserService.register", () => {
  it("guarda solo los campos permitidos, con email en minúsculas y contraseña hasheada", async () => {
    const { service, users } = setup();
    await service.register({
      name: "Ana",
      email: "ANA@Test.com",
      password: VALID_PASSWORD,
      profilePicture: id(),
      verificationCode: "x",
      _id: id(),
    });
    const saved = users.create.mock.calls[0][0];
    expect(Object.keys(saved).sort()).toEqual(["email", "name", "password"]);
    expect(saved.email).toBe("ana@test.com");
    expect(await bcrypt.compare(VALID_PASSWORD, saved.password)).toBe(true);
  });

  it("email ya registrado -> BadRequestError", async () => {
    const { service, users } = setup();
    users.findByEmail.mockResolvedValue({});
    await expect(service.register({ email: "a@b.com", password: VALID_PASSWORD })).rejects.toEqual(
      new BadRequestError("User already registered")
    );
  });

  it.each(["corta1!", "sinmayuscula1!", "SinNumero!", "SinSimbolo1"])("contraseña %s -> BadRequestError", async (password) => {
    const { service, users } = setup();
    await expect(service.register({ email: "a@b.com", password })).rejects.toEqual(
      new BadRequestError("Password doesn't match the requirements.")
    );
    expect(users.create).not.toHaveBeenCalled();
  });
});

describe("UserService.edit", () => {
  const notifications = { newEvent: true, eventStart: true, penalizationStart: false, penalizationOneWeek: false };

  it("conserva nombre, alias, cbu y notificaciones no enviados", async () => {
    const { service, users } = setup();
    const user = { name: "Ana", lastName: "Paz", specialDiet: [], alias: "ana.mp", cbu: "123", notifications: { ...notifications } };
    users.findById.mockResolvedValue(user);

    await service.edit("u1", { lastName: "Gil", notifications: { eventStart: false } });

    expect(user).toMatchObject({
      name: "Ana",
      lastName: "Gil",
      alias: "ana.mp",
      cbu: "123",
      notifications: { ...notifications, eventStart: false },
    });
    expect(users.save).toHaveBeenCalledWith(user);
  });

  it("usuario inexistente -> NotFoundError", async () => {
    const { service, users } = setup();
    users.findById.mockResolvedValue(null);
    await expect(service.edit("u1", {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UserService.updateProfilePicture", () => {
  const file = { originalname: "a.png" } as any;

  it("sin archivo -> BadRequestError antes de buscar al usuario", async () => {
    const { service, users } = setup();
    await expect(service.updateProfilePicture("u1", undefined)).rejects.toEqual(new BadRequestError("No file was uploaded."));
    expect(users.findById).not.toHaveBeenCalled();
  });

  it("borra la foto anterior y guarda la nueva", async () => {
    const { service, users, images } = setup();
    const previous = id();
    const next = id();
    const user = { profilePicture: previous };
    users.findById.mockResolvedValue(user);
    images.save.mockResolvedValue(next);

    expect(await service.updateProfilePicture("u1", file)).toBe(next);
    expect(images.delete).toHaveBeenCalledWith(previous);
    expect(user.profilePicture).toBe(next);
    expect(users.save).toHaveBeenCalledWith(user);
  });
});

describe("UserService.getDebtorEvents", () => {
  it("incluye eventos con transferencia esperada sin comprobante pagado", async () => {
    const { service, events, payments, transferReceipts } = setup();
    const user = id();
    const [noReceipt, unpaid, paid, nothingOwed] = [id(), id(), id(), id()].map((_id) => ({ _id, purchaseReceipts: [] }));
    events.findReadyForPaymentByMember.mockResolvedValue([noReceipt, unpaid, paid, nothingOwed]);
    payments.expectedTransfersFor
      .mockReturnValueOnce([{ userId: user }])
      .mockReturnValueOnce([{ userId: user }])
      .mockReturnValueOnce([{ userId: user }])
      .mockReturnValueOnce([{ userId: id() }]);
    transferReceipts.findByEventAndUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ hasPaid: false })
      .mockResolvedValueOnce({ hasPaid: true });

    expect(await service.getDebtorEvents(String(user))).toEqual([noReceipt._id, unpaid._id]);
    expect(transferReceipts.findByEventAndUser).toHaveBeenCalledTimes(3);
  });
});

describe("UserService.getEventsWithPendingTransfers", () => {
  it("devuelve eventos con transferencias al designado sin aprobar", async () => {
    const { service, events } = setup();
    const designee = id();
    const pending = { _id: id(), transferReceipts: [{ hasPaid: false, receiver: designee }] };
    const approved = { _id: id(), transferReceipts: [{ hasPaid: true, receiver: designee }] };
    const otherReceiver = { _id: id(), transferReceipts: [{ hasPaid: false, receiver: id() }] };
    events.findReadyForPaymentByDesignee.mockResolvedValue([pending, approved, otherReceiver]);

    expect(await service.getEventsWithPendingTransfers(String(designee))).toEqual([pending._id]);
  });

  it("id mal formado -> BadRequestError", async () => {
    const { service } = setup();
    await expect(service.getEventsWithPendingTransfers("abc")).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
  });
});

describe("UserService.getById / delete", () => {
  it("getById inexistente -> NotFoundError", async () => {
    const { service, users } = setup();
    users.findSafeById.mockResolvedValue(null);
    await expect(service.getById("u1")).rejects.toEqual(new NotFoundError("The user with the given ID was not found."));
  });

  it("delete inexistente -> NotFoundError", async () => {
    const { service, users } = setup();
    users.deleteById.mockResolvedValue(null);
    await expect(service.delete("u1")).rejects.toBeInstanceOf(NotFoundError);
  });
});
