import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { PurchaseReceiptService } from "../../../../src/modules/purchaseReceipts/PurchaseReceiptService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const receipts = {
    findById: vi.fn(),
    create: vi.fn(async (data: any) => ({ _id: id(), ...data })),
    save: vi.fn(async (doc: any) => doc),
    deleteById: vi.fn(),
  };
  const events = { findById: vi.fn(), findByIdWithPurchaseReceipts: vi.fn(), save: vi.fn(async (doc: any) => doc) };
  const images = { save: vi.fn() };
  return { service: new PurchaseReceiptService(receipts as any, events as any, images as any), receipts, events, images };
}

function event(state: string, members: mongoose.Types.ObjectId[], extra: Record<string, unknown> = {}) {
  return { _id: id(), state, members, purchaseReceipts: [] as mongoose.Types.ObjectId[], shoppingDesignee: [], ...extra };
}

describe("PurchaseReceiptService.create", () => {
  it("sin participantes reparte entre todos los miembros y agrega el recibo al evento", async () => {
    const { service, receipts, events } = setup();
    const members = [id(), id()];
    const ev = event("closed", members);
    events.findById.mockResolvedValue(ev);
    const designee = String(members[0]);

    const receipt = await service.create(String(ev._id), designee, { description: "Carne", amount: 100 });

    expect(receipts.create).toHaveBeenCalledWith({
      description: "Carne",
      amount: 100,
      event: ev._id,
      shoppingDesignee: new mongoose.Types.ObjectId(designee),
      participants: members,
    });
    expect(ev.purchaseReceipts).toEqual([receipt._id]);
    expect(events.save).toHaveBeenCalledWith(ev);
  });

  it("evento que no está cerrado -> BadRequestError", async () => {
    const { service, events, receipts } = setup();
    events.findById.mockResolvedValue(event("available", []));
    await expect(service.create("e", String(id()), { amount: 1 })).rejects.toEqual(
      new BadRequestError("Purchase receipts can only be uploaded when the event is closed")
    );
    expect(receipts.create).not.toHaveBeenCalled();
  });

  it.each([
    ["un no miembro", () => [String(id())]],
    ["algo que no es un array", () => "x"],
  ])("participantes con %s -> BadRequestError", async (_label, participants) => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event("closed", [id()]));
    await expect(service.create("e", String(id()), { amount: 1, participants: participants() })).rejects.toEqual(
      new BadRequestError("All participants must be members of the event.")
    );
  });
});

describe("PurchaseReceiptService.attachFile", () => {
  const file = { originalname: "t.pdf" } as any;

  it("sin archivo -> BadRequestError", async () => {
    const { service } = setup();
    await expect(service.attachFile("r", "u", undefined)).rejects.toEqual(new BadRequestError("No file was uploaded."));
  });

  it("recibo inexistente -> NotFoundError", async () => {
    const { service, receipts } = setup();
    receipts.findById.mockResolvedValue(null);
    await expect(service.attachFile("r", "u", file)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("usuario que no es designado del evento del recibo -> ForbiddenError", async () => {
    const { service, receipts, events, images } = setup();
    receipts.findById.mockResolvedValue({ event: id() });
    events.findById.mockResolvedValue(event("closed", [], { shoppingDesignee: [id()] }));
    await expect(service.attachFile("r", String(id()), file)).rejects.toBeInstanceOf(ForbiddenError);
    expect(images.save).not.toHaveBeenCalled();
  });

  it("designado: guarda la imagen y la asocia al recibo", async () => {
    const { service, receipts, events, images } = setup();
    const designee = id();
    const imageId = id();
    const receipt = { event: id(), image: null as any };
    receipts.findById.mockResolvedValue(receipt);
    events.findById.mockResolvedValue(event("closed", [], { shoppingDesignee: [designee] }));
    images.save.mockResolvedValue(imageId);

    expect(await service.attachFile("r", String(designee), file)).toBe(imageId);
    expect(receipt.image).toBe(imageId);
    expect(receipts.save).toHaveBeenCalledWith(receipt);
  });
});

describe("PurchaseReceiptService.assignParticipants", () => {
  it("si un recibo no existe corta ahí, con los anteriores ya guardados", async () => {
    const { service, receipts } = setup();
    const first = { participants: [] as any[] };
    receipts.findById.mockResolvedValueOnce(first).mockResolvedValueOnce(null);
    const participants = [id()];

    await expect(
      service.assignParticipants([
        { id: "a", participants },
        { id: "b", participants: [] },
      ])
    ).rejects.toEqual(new NotFoundError("One or more purchase receipts were not found"));
    expect(first.participants).toBe(participants);
    expect(receipts.save).toHaveBeenCalledTimes(1);
  });
});

describe("PurchaseReceiptService.delete", () => {
  it("lo quita del evento y lo borra", async () => {
    const { service, receipts, events } = setup();
    const receipt = { _id: id(), event: id() };
    const ev = event("closed", [], { purchaseReceipts: [id(), receipt._id] });
    receipts.findById.mockResolvedValue(receipt);
    events.findById.mockResolvedValue(ev);

    expect(await service.delete("r")).toBe(receipt);
    expect(ev.purchaseReceipts).toHaveLength(1);
    expect(events.save).toHaveBeenCalledWith(ev);
    expect(receipts.deleteById).toHaveBeenCalledWith("r");
  });

  it("evento que no está cerrado -> BadRequestError y no borra", async () => {
    const { service, receipts, events } = setup();
    receipts.findById.mockResolvedValue({ _id: id(), event: id() });
    events.findById.mockResolvedValue(event("readyforpayment", []));
    await expect(service.delete("r")).rejects.toBeInstanceOf(BadRequestError);
    expect(receipts.deleteById).not.toHaveBeenCalled();
  });
});
