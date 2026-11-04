import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { TransferReceiptService } from "../../../../src/modules/transferReceipts/TransferReceiptService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();
const NOW = new Date("2026-01-01T12:00:00Z");

function setup() {
  const receipts = {
    findById: vi.fn(),
    create: vi.fn(async (data: any) => ({ _id: id(), ...data })),
    save: vi.fn(async (doc: any) => doc),
    deleteById: vi.fn(),
  };
  const events = {
    findById: vi.fn(),
    save: vi.fn(async (doc: any) => doc),
    findByIdWithPurchaseReceipts: vi.fn().mockResolvedValue({ purchaseReceipts: [] }),
    findByIdWithTransferReceipts: vi.fn().mockResolvedValue({ transferReceipts: [] }),
    findByIdWithMembersAndTransferReceipts: vi.fn(),
    findByIdWithPaymentData: vi.fn().mockResolvedValue({ purchaseReceipts: [], transferReceipts: [] }),
  };
  const images = { save: vi.fn(), delete: vi.fn() };
  const payments = { expectedTransfersFor: vi.fn().mockReturnValue([]) };
  const service = new TransferReceiptService({ receipts, events, images, payments, now: () => NOW } as any);
  return { service, receipts, events, images, payments };
}

function event(state: string, extra: Record<string, unknown> = {}) {
  return { _id: id(), state, members: [] as mongoose.Types.ObjectId[], transferReceipts: [] as mongoose.Types.ObjectId[], ...extra };
}

describe("TransferReceiptService.create", () => {
  const user = id();
  const designee = id();
  const expected = { userId: user, amount: 150, receiver: { receiverId: designee } };

  it("monto y destinatario salen del cálculo del servidor, no del body", async () => {
    const { service, receipts, events, payments } = setup();
    const ev = event("readyforpayment");
    events.findById.mockResolvedValue(ev);
    payments.expectedTransfersFor.mockReturnValue([expected]);

    const receipt = await service.create(String(ev._id), String(user), { description: "MP", paymentMethod: "transfer" });

    expect(receipts.create).toHaveBeenCalledWith({
      description: "MP",
      paymentMethod: "transfer",
      user,
      amount: 150,
      receiver: designee,
      event: ev._id,
      datetime: NOW,
    });
    expect(ev.transferReceipts).toEqual([receipt._id]);
  });

  it("si ya había subido uno, lo reemplaza y borra su imagen", async () => {
    const { service, receipts, events, payments, images } = setup();
    const previousId = id();
    const previousImage = id();
    const ev = event("readyforpayment", { transferReceipts: [previousId] });
    events.findById.mockResolvedValue(ev);
    events.findByIdWithTransferReceipts.mockResolvedValue({ transferReceipts: [{ _id: previousId, user, hasPaid: false }] });
    payments.expectedTransfersFor.mockReturnValue([expected]);
    receipts.deleteById.mockResolvedValue({ _id: previousId, image: previousImage });

    const receipt = await service.create(String(ev._id), String(user), {});

    expect(receipts.deleteById).toHaveBeenCalledWith(String(previousId));
    expect(images.delete).toHaveBeenCalledWith(previousImage);
    expect(ev.transferReceipts).toEqual([receipt._id]);
  });

  it("evento que no está listo para pagar -> BadRequestError", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event("closed"));
    await expect(service.create("e", String(user), {})).rejects.toEqual(
      new BadRequestError("You can only create transfer receipts when the event is ready for payment.")
    );
  });

  it("usuario sin transferencia esperada -> BadRequestError", async () => {
    const { service, events, receipts } = setup();
    events.findById.mockResolvedValue(event("readyforpayment"));
    await expect(service.create(String(id()), String(user), {})).rejects.toEqual(
      new BadRequestError("The user has no transfer to make in this event.")
    );
    expect(receipts.create).not.toHaveBeenCalled();
  });
});

describe("TransferReceiptService.approve", () => {
  const eventId = id();
  const rid = String(id());

  it("marca como pagado y, si era el último, finaliza el evento", async () => {
    const { service, receipts, events, payments } = setup();
    const user = id();
    const receipt = { _id: id(), user, event: eventId, hasPaid: false };
    const ev = event("readyforpayment");
    receipts.findById.mockResolvedValue(receipt);
    events.findById.mockResolvedValue(ev);
    payments.expectedTransfersFor.mockReturnValue([{ userId: user }]);
    events.findByIdWithPaymentData.mockResolvedValue({ purchaseReceipts: [], transferReceipts: [receipt] });

    await service.approve(rid, String(eventId));

    expect(receipt.hasPaid).toBe(true);
    expect(ev.state).toBe("finished");
  });

  it("si quedan pagos pendientes no cambia el estado", async () => {
    const { service, receipts, events, payments } = setup();
    receipts.findById.mockResolvedValue({ _id: id(), user: id(), event: eventId, hasPaid: false });
    payments.expectedTransfersFor.mockReturnValue([{ userId: id() }]);
    await service.approve(rid, String(eventId));
    expect(events.findById).not.toHaveBeenCalled();
  });

  it("ya aprobado -> BadRequestError", async () => {
    const { service, receipts } = setup();
    receipts.findById.mockResolvedValue({ hasPaid: true, event: eventId });
    await expect(service.approve(rid, String(eventId))).rejects.toEqual(new BadRequestError("The transfer receipt is already approved."));
  });

  it("comprobante de otro evento -> NotFoundError y no lo aprueba", async () => {
    const { service, receipts } = setup();
    const receipt = { _id: id(), user: id(), event: id(), hasPaid: false };
    receipts.findById.mockResolvedValue(receipt);
    await expect(service.approve(rid, String(eventId))).rejects.toBeInstanceOf(NotFoundError);
    expect(receipt.hasPaid).toBe(false);
    expect(receipts.save).not.toHaveBeenCalled();
  });

  it("inexistente -> NotFoundError; id mal formado -> BadRequestError", async () => {
    const { service, receipts } = setup();
    receipts.findById.mockResolvedValue(null);
    await expect(service.approve(rid, String(eventId))).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.approve("r", String(eventId))).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("TransferReceiptService.approveWithoutReceipt", () => {
  it("id de usuario inválido -> BadRequestError", async () => {
    const { service } = setup();
    await expect(service.approveWithoutReceipt("e", "abc", undefined)).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
  });

  it("no miembro -> BadRequestError", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event("readyforpayment", { members: [id()] }));
    await expect(service.approveWithoutReceipt(String(id()), String(id()), undefined)).rejects.toEqual(
      new BadRequestError("The user is not a member of the event.")
    );
  });

  it("crea un comprobante pagado de monto 0", async () => {
    const { service, events, receipts } = setup();
    const user = id();
    const ev = event("readyforpayment", { members: [user] });
    events.findById.mockResolvedValue(ev);

    await service.approveWithoutReceipt(String(ev._id), String(user), undefined);

    expect(receipts.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0, hasPaid: true, receiver: null, user, datetime: NOW })
    );
    expect(ev.transferReceipts).toHaveLength(1);
  });
});

describe("TransferReceiptService.attachFile", () => {
  const file = { originalname: "t.png" } as any;

  it("no dueño -> ForbiddenError", async () => {
    const { service, receipts } = setup();
    receipts.findById.mockResolvedValue({ user: id(), hasPaid: false });
    await expect(service.attachFile("r", String(id()), file)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reemplaza el archivo y borra el anterior después de guardar", async () => {
    const { service, receipts, images } = setup();
    const user = id();
    const previous = id();
    const next = id();
    const receipt = { user, hasPaid: false, image: previous };
    receipts.findById.mockResolvedValue(receipt);
    images.save.mockResolvedValue(next);

    expect(await service.attachFile("r", String(user), file)).toBe(next);
    expect(receipt.image).toBe(next);
    expect(images.delete).toHaveBeenCalledWith(previous);
  });
});

describe("TransferReceiptService.delete", () => {
  it("evento que no está listo para pagar -> BadRequestError", async () => {
    const { service, receipts, events } = setup();
    receipts.findById.mockResolvedValue({ _id: id(), event: id() });
    events.findById.mockResolvedValue(event("finished"));
    await expect(service.delete("r")).rejects.toBeInstanceOf(BadRequestError);
    expect(receipts.deleteById).not.toHaveBeenCalled();
  });

  it("borra el comprobante, su imagen y lo quita del evento", async () => {
    const { service, receipts, events, images } = setup();
    const receipt = { _id: id(), event: id(), image: id() };
    const ev = event("readyforpayment", { transferReceipts: [receipt._id, id()] });
    receipts.findById.mockResolvedValue(receipt);
    events.findById.mockResolvedValue(ev);

    await service.delete("r");

    expect(images.delete).toHaveBeenCalledWith(receipt.image);
    expect(ev.transferReceipts).toHaveLength(1);
  });
});

describe("TransferReceiptService.membersWhoHaveUploaded", () => {
  it("devuelve el estado de pago de cada miembro", async () => {
    const { service, events } = setup();
    const ana = { _id: id(), name: "Ana", lastName: "A", specialDiet: [] };
    const beto = { _id: id(), name: "Beto", lastName: "B", specialDiet: ["vegan"] };
    const receipt = { _id: id(), user: ana._id, hasPaid: true };
    events.findByIdWithMembersAndTransferReceipts.mockResolvedValue({ members: [ana, beto], transferReceipts: [receipt] });

    expect(await service.membersWhoHaveUploaded("e")).toEqual([
      { userId: ana._id, userName: "Ana", userLastName: "A", specialDiet: [], transferReceipt: receipt._id, hasReceiptApproved: true, hasUploaded: true },
      { userId: beto._id, userName: "Beto", userLastName: "B", specialDiet: ["vegan"], transferReceipt: null, hasReceiptApproved: null, hasUploaded: false },
    ]);
  });
});
