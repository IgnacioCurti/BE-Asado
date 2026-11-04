import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventService } from "../../../../src/modules/events/EventService.js";
import { EventMapper } from "../../../../src/modules/events/EventMapper.js";
import { BadRequestError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const deps = {
    events: {
      build: vi.fn((fields: any) => ({ _id: id(), isPrivate: false, ...fields })),
      save: vi.fn(async (doc: any) => doc),
      countPublic: vi.fn().mockResolvedValue(0),
      findPublicEndedOldestFirst: vi.fn().mockResolvedValue([]),
      deleteCascade: vi.fn(),
      findById: vi.fn(),
    },
    reminders: { syncWithEvent: vi.fn(), cancelForEvent: vi.fn(), scheduleNewEvent: vi.fn() },
    purchaseReceipts: {},
    transferReceipts: {},
    users: {},
    options: {},
    paymentStatus: {},
    payments: {},
    mapper: new EventMapper(),
  };
  return { service: new EventService(deps as any), ...deps };
}

describe("EventService.create", () => {
  it("solo toma los campos permitidos; organizador, miembros y roles salen del token", async () => {
    const { service, events } = setup();
    const organizer = String(id());
    const other = String(id());
    await service.create(organizer, {
      title: "Asado",
      organizer: other,
      members: [other, organizer],
      shoppingDesignee: [other],
      state: "finished",
      ratings: [id()],
      isChef: true,
      isShoppingDesignee: true,
    });

    const fields = events.build.mock.calls[0][0];
    expect(Object.keys(fields).sort()).toEqual(["chef", "members", "organizer", "shoppingDesignee", "title"]);
    expect(String(fields.organizer)).toBe(organizer);
    expect(fields.members.map(String)).toEqual([organizer]);
    expect(String(fields.chef)).toBe(organizer);
    expect(fields.shoppingDesignee.map(String)).toEqual([organizer]);
  });

  it("sin isChef, isShoppingDesignee ni su id en members, no se suma a nada", async () => {
    const { service, events } = setup();
    await service.create(String(id()), { title: "Asado", members: [String(id())] });
    expect(events.build.mock.calls[0][0]).toMatchObject({ members: [], chef: null, shoppingDesignee: [] });
  });

  it("un error de validación de Mongoose -> BadRequestError", async () => {
    const { service, events } = setup();
    events.save.mockRejectedValueOnce(new mongoose.Error.ValidationError());
    await expect(service.create(String(id()), {})).rejects.toBeInstanceOf(BadRequestError);
  });

  it("evento público: programa el aviso de evento nuevo y los recordatorios", async () => {
    const { service, reminders } = setup();
    const event = await service.create(String(id()), { title: "Asado" });
    expect(reminders.scheduleNewEvent).toHaveBeenCalledWith(event._id);
    expect(reminders.syncWithEvent).toHaveBeenCalledWith(event);
  });

  it("evento privado: no avisa a los suscriptos", async () => {
    const { service, reminders } = setup();
    await service.create(String(id()), { title: "Asado", isPrivate: true });
    expect(reminders.scheduleNewEvent).not.toHaveBeenCalled();
  });

  it("con más de 6 eventos públicos borra los públicos terminados más viejos que sobran", async () => {
    const { service, events } = setup();
    const ended = [{ _id: id() }, { _id: id() }, { _id: id() }];
    events.countPublic.mockResolvedValue(8);
    events.findPublicEndedOldestFirst.mockResolvedValue(ended);

    await service.create(String(id()), { title: "Asado" });

    expect(events.deleteCascade).toHaveBeenCalledWith([ended[0]._id, ended[1]._id]);
  });

  it("con 6 o menos no borra nada", async () => {
    const { service, events } = setup();
    events.countPublic.mockResolvedValue(6);
    await service.create(String(id()), { title: "Asado" });
    expect(events.findPublicEndedOldestFirst).not.toHaveBeenCalled();
    expect(events.deleteCascade).not.toHaveBeenCalled();
  });
});

describe("EventService.delete", () => {
  it("borra el evento con todo lo relacionado en un solo paso (deleteCascade)", async () => {
    const { service, events } = setup();
    const ev = { _id: id() };
    events.findById.mockResolvedValue(ev);
    expect(await service.delete(String(ev._id))).toBe(ev);
    expect(events.deleteCascade).toHaveBeenCalledWith([ev._id]);
  });

  it("inexistente -> NotFoundError", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(null);
    await expect(service.delete("e")).rejects.toBeInstanceOf(NotFoundError);
    expect(events.deleteCascade).not.toHaveBeenCalled();
  });
});
