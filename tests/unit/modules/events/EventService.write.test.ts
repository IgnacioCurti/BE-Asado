import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventService } from "../../../../src/modules/events/EventService.js";
import { EventMapper } from "../../../../src/modules/events/EventMapper.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const deps = {
    events: {
      findById: vi.fn(),
      save: vi.fn(async (doc: any) => doc),
      addMemberIfAllowed: vi.fn(),
      findByIdWithReceiptsAndOptions: vi.fn(),
      findByIdWithPurchaseReceiptIds: vi.fn(),
    },
    users: { findById: vi.fn().mockResolvedValue({}) },
    purchaseReceipts: { addParticipant: vi.fn(), save: vi.fn() },
    options: { save: vi.fn() },
    transferReceipts: { existsApprovedForEvent: vi.fn().mockResolvedValue(false) },
    reminders: { syncWithEvent: vi.fn(), cancelForEvent: vi.fn() },
    paymentStatus: {},
    payments: {},
    mapper: new EventMapper(),
  };
  return { service: new EventService(deps as any), ...deps };
}

function event(extra: Record<string, unknown> = {}) {
  return {
    _id: id(),
    state: "available",
    memberLimit: 5,
    members: [] as mongoose.Types.ObjectId[],
    purchaseReceipts: [] as unknown[],
    shoppingDesignee: [id()],
    ...extra,
  } as any;
}

describe("EventService.subscribe", () => {
  it.each([
    ["lleno", { memberLimit: 1, members: [id()] }, "The event is full."],
    ["no disponible", { state: "closed" }, "The event is not available for users to join"],
  ])("evento %s -> BadRequestError", async (_label, extra, message) => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event(extra));
    await expect(service.subscribe("e", String(id()))).rejects.toEqual(new BadRequestError(message));
  });

  it("ya inscripto -> BadRequestError", async () => {
    const { service, events } = setup();
    const user = id();
    events.findById.mockResolvedValue(event({ members: [user] }));
    await expect(service.subscribe("e", String(user))).rejects.toEqual(
      new BadRequestError("The user has already joined the event")
    );
  });

  it("si la escritura atómica falla, informa el motivo actual", async () => {
    const { service, events } = setup();
    const ev = event();
    events.findById.mockResolvedValueOnce(ev).mockResolvedValueOnce(event({ state: "closed" }));
    events.addMemberIfAllowed.mockResolvedValue(null);
    await expect(service.subscribe("e", String(id()))).rejects.toEqual(
      new BadRequestError("The event is not available for users to join")
    );
  });

  it("suma al usuario a los recibos existentes", async () => {
    const { service, events, purchaseReceipts } = setup();
    const receipts = [id()];
    const ev = event({ purchaseReceipts: receipts });
    const user = id();
    events.findById.mockResolvedValue(ev);
    events.addMemberIfAllowed.mockResolvedValue(ev);

    await service.subscribe(String(ev._id), String(user));

    expect(events.addMemberIfAllowed).toHaveBeenCalledWith(ev._id, user);
    expect(purchaseReceipts.addParticipant).toHaveBeenCalledWith(receipts, user);
  });
});

describe("EventService.unsubscribe", () => {
  it("lo quita de miembros, recibos y opciones", async () => {
    const { service, events, purchaseReceipts, options } = setup();
    const user = id();
    const other = id();
    const receipt = { participants: [user, other] };
    const option = { participants: [user] };
    const ev = event({ members: [other, user], purchaseReceipts: [receipt], options: [option] });
    events.findByIdWithReceiptsAndOptions.mockResolvedValue(ev);

    await service.unsubscribe("e", String(user));

    expect(ev.members).toEqual([other]);
    expect(receipt.participants).toEqual([other]);
    expect(option.participants).toEqual([]);
    expect(purchaseReceipts.save).toHaveBeenCalledWith(receipt);
    expect(options.save).toHaveBeenCalledWith(option);
  });

  it("no miembro -> NotFoundError", async () => {
    const { service, events } = setup();
    events.findByIdWithReceiptsAndOptions.mockResolvedValue(event({ options: [] }));
    await expect(service.unsubscribe("e", String(id()))).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(["closed", "readyforpayment"])("en estado %s -> BadRequestError", async (state) => {
    const { service, events } = setup();
    const user = id();
    events.findByIdWithReceiptsAndOptions.mockResolvedValue(event({ state, members: [user], options: [] }));
    await expect(service.unsubscribe("e", String(user))).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("EventService.edit", () => {
  const body = { title: "t", datetime: new Date(), memberLimit: 5, penalization: 0, isPrivate: false };

  it.each([
    ["available", "readyforpayment"],
    ["cancelled", "available"],
    ["finished", "closed"],
  ])("transición %s -> %s no permitida", async (from, to) => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event({ state: from }));
    await expect(service.edit("e", { ...body, state: to })).rejects.toEqual(
      new BadRequestError(`Cannot change the event state from "${from}" to "${to}".`)
    );
  });

  it("readyforpayment sin recibos -> BadRequestError", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event({ state: "closed" }));
    await expect(service.edit("e", { ...body, state: "readyforpayment" })).rejects.toEqual(
      new BadRequestError("The event needs at least one purchase receipt to be ready for payment.")
    );
  });

  it("no vuelve a closed si ya hay pagos aprobados", async () => {
    const { service, events, transferReceipts } = setup();
    events.findById.mockResolvedValue(event({ state: "readyforpayment" }));
    transferReceipts.existsApprovedForEvent.mockResolvedValue(true);
    await expect(service.edit("e", { ...body, state: "closed" })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("sin designados solo puede quedar available", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(event({ shoppingDesignee: [] }));
    await expect(service.edit("e", { ...body, state: "closed" })).rejects.toEqual(
      new BadRequestError("The event has no shopping designees.")
    );
  });

  it("cancelar borra los recordatorios", async () => {
    const { service, events, reminders } = setup();
    const ev = event();
    events.findById.mockResolvedValue(ev);
    await service.edit("e", { ...body, state: "cancelled" });
    expect(reminders.cancelForEvent).toHaveBeenCalledWith(ev._id);
    expect(reminders.syncWithEvent).not.toHaveBeenCalled();
  });

  it("sin penalización limpia penalizationStartDate y sincroniza recordatorios", async () => {
    const { service, events, reminders } = setup();
    const ev = event();
    events.findById.mockResolvedValue(ev);
    await service.edit("e", { ...body, state: "available", penalizationStartDate: new Date() });
    expect(ev.penalizationStartDate).toBeNull();
    expect(reminders.syncWithEvent).toHaveBeenCalledWith(ev);
  });
});

describe("EventService.editRoles", () => {
  const s = (oid: mongoose.Types.ObjectId) => String(oid);

  function rolesSetup(extra: Record<string, unknown> = {}) {
    const ctx = setup();
    const me = id();
    const other = id();
    const ev = event({ members: [me, other], shoppingDesignee: [], chef: null, ...extra });
    ctx.events.findById.mockResolvedValue(ev);
    (ctx.events as any).updateRolesIfAllowed = vi.fn().mockResolvedValue(ev);
    return { ...ctx, me, other, ev };
  }

  it("tomar chef y comprador: un solo update atómico con el cambio del usuario", async () => {
    const { service, events, me, ev } = rolesSetup();
    await service.editRoles(s(ev._id), s(me), { chef: s(me), shoppingDesignee: [s(me)] });
    const [, change] = (events as any).updateRolesIfAllowed.mock.calls[0];
    expect(change.chef).toEqual({ from: null, to: me });
    expect(change.addDesignee).toEqual(me);
    expect(change.removeDesignee).toBeUndefined();
  });

  it("soltar el chef propio: from = yo, to = null", async () => {
    const { service, events, me, ev } = rolesSetup();
    ev.chef = me;
    await service.editRoles(s(ev._id), s(me), { chef: "", shoppingDesignee: [] });
    const [, change] = (events as any).updateRolesIfAllowed.mock.calls[0];
    expect(change.chef).toEqual({ from: me, to: null });
  });

  it("cambiar roles de otro -> ForbiddenError", async () => {
    const { service, me, other, ev } = rolesSetup();
    await expect(service.editRoles(s(ev._id), s(me), { chef: s(other), shoppingDesignee: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.editRoles(s(ev._id), s(me), { shoppingDesignee: [s(other)] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("chef ocupado -> ConflictError", async () => {
    const { service, me, other, ev } = rolesSetup();
    ev.chef = other;
    await expect(service.editRoles(s(ev._id), s(me), { chef: s(me), shoppingDesignee: [] })).rejects.toBeInstanceOf(ConflictError);
  });

  it("evento que no está disponible -> ConflictError; sin cambios no escribe", async () => {
    const { service, events, me, ev } = rolesSetup({ state: "closed" });
    await expect(service.editRoles(s(ev._id), s(me), { shoppingDesignee: [s(me)] })).rejects.toBeInstanceOf(ConflictError);
    await service.editRoles(s(ev._id), s(me), { chef: null, shoppingDesignee: [] });
    expect((events as any).updateRolesIfAllowed).not.toHaveBeenCalled();
  });

  it("si el update atómico no encuentra el evento como se esperaba -> ConflictError", async () => {
    const { service, events, me, ev } = rolesSetup();
    (events as any).updateRolesIfAllowed.mockResolvedValue(null);
    await expect(service.editRoles(s(ev._id), s(me), { chef: s(me) })).rejects.toBeInstanceOf(ConflictError);
  });

  it("no miembro -> ForbiddenError; id mal formado -> BadRequestError", async () => {
    const { service, ev } = rolesSetup();
    await expect(service.editRoles(s(ev._id), s(id()), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.editRoles("abc", s(id()), {})).rejects.toBeInstanceOf(BadRequestError);
  });
});
