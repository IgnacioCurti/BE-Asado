import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventService } from "../../../../src/modules/events/EventService.js";
import { EventMapper } from "../../../../src/modules/events/EventMapper.js";
import { NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const deps = {
    events: {
      build: vi.fn((fields: any) => ({ _id: id(), shoppingDesignee: [], isPrivate: false, ...fields })),
      save: vi.fn(async (doc: any) => doc),
      countPublic: vi.fn().mockResolvedValue(0),
      findEndedOldestFirst: vi.fn().mockResolvedValue([]),
      findByIdWithReceiptsAndRatings: vi.fn().mockResolvedValue({ transferReceipts: [], purchaseReceipts: [], ratings: [] }),
      findById: vi.fn(),
      deleteById: vi.fn(),
    },
    purchaseReceipts: { deleteById: vi.fn() },
    transferReceipts: { deleteById: vi.fn() },
    ratings: { deleteById: vi.fn() },
    images: { delete: vi.fn() },
    reminders: { syncWithEvent: vi.fn(), cancelForEvent: vi.fn(), scheduleNewEvent: vi.fn() },
    users: {},
    options: {},
    paymentStatus: {},
    payments: {},
    mapper: new EventMapper(),
  };
  return { service: new EventService(deps as any), ...deps };
}

describe("EventService.create", () => {
  it("solo toma los campos permitidos y agrega al organizador como chef y designado si se pide", async () => {
    const { service, events } = setup();
    const organizer = String(id());
    const event = await service.create({
      title: "Asado",
      organizer,
      state: "finished",
      ratings: [id()],
      isChef: true,
      isShoppingDesignee: true,
    });

    expect(events.build).toHaveBeenCalledWith({ title: "Asado", organizer });
    expect(event.chef).toBe(organizer);
    expect(event.shoppingDesignee).toEqual([organizer]);
  });

  it("evento público: programa el aviso de evento nuevo y los recordatorios", async () => {
    const { service, reminders } = setup();
    const event = await service.create({ title: "Asado" });
    expect(reminders.scheduleNewEvent).toHaveBeenCalledWith(event._id);
    expect(reminders.syncWithEvent).toHaveBeenCalledWith(event);
  });

  it("evento privado: no avisa a los suscriptos", async () => {
    const { service, reminders } = setup();
    await service.create({ title: "Asado", isPrivate: true });
    expect(reminders.scheduleNewEvent).not.toHaveBeenCalled();
  });

  it("con más de 6 eventos públicos borra los terminados más viejos que sobran", async () => {
    const { service, events, reminders } = setup();
    const ended = [{ _id: id() }, { _id: id() }, { _id: id() }];
    events.countPublic.mockResolvedValue(8);
    events.findEndedOldestFirst.mockResolvedValue(ended);

    await service.create({ title: "Asado" });

    expect(events.deleteById.mock.calls).toEqual([[String(ended[0]._id)], [String(ended[1]._id)]]);
    expect(reminders.cancelForEvent).toHaveBeenCalledTimes(2);
  });

  it("con 6 o menos no borra nada", async () => {
    const { service, events } = setup();
    events.countPublic.mockResolvedValue(6);
    await service.create({ title: "Asado" });
    expect(events.findEndedOldestFirst).not.toHaveBeenCalled();
  });
});

describe("EventService.delete", () => {
  it("borra comprobantes con sus imágenes, ratings, recordatorios y el evento", async () => {
    const { service, events, purchaseReceipts, transferReceipts, ratings, images, reminders } = setup();
    const ev = { _id: id() };
    const transfer = { _id: id(), image: id() };
    const purchase = { _id: id(), image: null };
    const rating = { _id: id() };
    events.findById.mockResolvedValue(ev);
    events.findByIdWithReceiptsAndRatings.mockResolvedValue({
      transferReceipts: [transfer],
      purchaseReceipts: [purchase],
      ratings: [rating],
    });

    expect(await service.delete(String(ev._id))).toBe(ev);

    expect(images.delete).toHaveBeenCalledTimes(1);
    expect(images.delete).toHaveBeenCalledWith(transfer.image);
    expect(transferReceipts.deleteById).toHaveBeenCalledWith(String(transfer._id));
    expect(purchaseReceipts.deleteById).toHaveBeenCalledWith(String(purchase._id));
    expect(ratings.deleteById).toHaveBeenCalledWith(String(rating._id));
    expect(reminders.cancelForEvent).toHaveBeenCalledWith(ev._id);
    expect(events.deleteById).toHaveBeenCalledWith(String(ev._id));
  });

  it("inexistente -> NotFoundError", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(null);
    await expect(service.delete("e")).rejects.toBeInstanceOf(NotFoundError);
  });
});
