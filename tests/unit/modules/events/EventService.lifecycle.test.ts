import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventService } from "../../../../src/modules/events/EventService.js";
import { EventMapper } from "../../../../src/modules/events/EventMapper.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

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
    groups: { findById: vi.fn(async (groupId: string) => ({ _id: groupId, members: [] as unknown[] })) },
  };
  return { service: new EventService(deps as any), ...deps };
}

// El organizador es miembro del grupo que manda en el body.
function inGroup(ctx: ReturnType<typeof setup>, organizer: string) {
  const group = id();
  ctx.groups.findById.mockResolvedValue({ _id: group, members: [new mongoose.Types.ObjectId(organizer)] });
  return group;
}

describe("EventService.create", () => {
  it("solo toma los campos permitidos; organizador, miembros y roles salen del token", async () => {
    const ctx = setup();
    const { service, events } = ctx;
    const organizer = String(id());
    const other = String(id());
    const group = inGroup(ctx, organizer);
    await service.create(organizer, {
      group: String(group),
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
    expect(Object.keys(fields).sort()).toEqual(["chef", "group", "members", "organizer", "shoppingDesignee", "title"]);
    expect(fields.group).toBe(group);
    expect(String(fields.organizer)).toBe(organizer);
    expect(fields.members.map(String)).toEqual([organizer]);
    expect(String(fields.chef)).toBe(organizer);
    expect(fields.shoppingDesignee.map(String)).toEqual([organizer]);
  });

  it("sin isChef, isShoppingDesignee ni su id en members, no se suma a nada", async () => {
    const ctx = setup();
    const organizer = String(id());
    const group = String(inGroup(ctx, organizer));
    await ctx.service.create(organizer, { group, title: "Asado", members: [String(id())] });
    const { events } = ctx;
    expect(events.build.mock.calls[0][0]).toMatchObject({ members: [], chef: null, shoppingDesignee: [] });
  });

  it("un error de validación de Mongoose -> BadRequestError", async () => {
    const ctx = setup();
    const organizer = String(id());
    const group = String(inGroup(ctx, organizer));
    ctx.events.save.mockRejectedValueOnce(new mongoose.Error.ValidationError());
    await expect(ctx.service.create(organizer, { group })).rejects.toBeInstanceOf(BadRequestError);
  });

  it.each([
    ["sin grupo", undefined, new BadRequestError("The event's group is required.")],
    ["grupo vacío", "", new BadRequestError("The event's group is required.")],
    ["grupo mal formado", "abc", new BadRequestError("Invalid ObjectID")],
    ["grupo que no es string", { $ne: null }, new BadRequestError("Invalid ObjectID")],
  ])("%s -> BadRequestError y no crea nada", async (_label, group, error) => {
    const { service, events, groups } = setup();
    await expect(service.create(String(id()), { title: "Asado", group })).rejects.toEqual(error);
    expect(groups.findById).not.toHaveBeenCalled();
    expect(events.save).not.toHaveBeenCalled();
  });

  it("grupo inexistente -> NotFoundError", async () => {
    const { service, events, groups } = setup();
    groups.findById.mockResolvedValue(null);
    await expect(service.create(String(id()), { title: "Asado", group: String(id()) })).rejects.toEqual(
      new NotFoundError("The group with the given ID does not exist.")
    );
    expect(events.save).not.toHaveBeenCalled();
  });

  it("quien no es miembro del grupo -> ForbiddenError", async () => {
    const { service, events } = setup();
    await expect(service.create(String(id()), { title: "Asado", group: String(id()) })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(events.save).not.toHaveBeenCalled();
  });

  it("evento público: programa el aviso de evento nuevo y los recordatorios", async () => {
    const ctx = setup();
    const organizer = String(id());
    const group = String(inGroup(ctx, organizer));
    const { service, reminders } = ctx;
    const event = await service.create(organizer, { group, title: "Asado" });
    expect(reminders.scheduleNewEvent).toHaveBeenCalledWith(event._id);
    expect(reminders.syncWithEvent).toHaveBeenCalledWith(event);
  });

  it("evento privado: no avisa a los suscriptos", async () => {
    const ctx = setup();
    const organizer = String(id());
    const group = String(inGroup(ctx, organizer));
    const { service, reminders } = ctx;
    await service.create(organizer, { group, title: "Asado", isPrivate: true });
    expect(reminders.scheduleNewEvent).not.toHaveBeenCalled();
  });

  it("con más de 6 eventos públicos borra los públicos terminados más viejos que sobran", async () => {
    const ctx = setup();
    const { service, events } = ctx;
    const ended = [{ _id: id() }, { _id: id() }, { _id: id() }];
    events.countPublic.mockResolvedValue(8);
    events.findPublicEndedOldestFirst.mockResolvedValue(ended);

    const organizer = String(id());
    await service.create(organizer, { group: String(inGroup(ctx, organizer)), title: "Asado" });

    expect(events.deleteCascade).toHaveBeenCalledWith([ended[0]._id, ended[1]._id]);
  });

  it("con 6 o menos no borra nada", async () => {
    const ctx = setup();
    const { service, events } = ctx;
    events.countPublic.mockResolvedValue(6);
    const organizer = String(id());
    await service.create(organizer, { group: String(inGroup(ctx, organizer)), title: "Asado" });
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
