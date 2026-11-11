import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventService } from "../../../../src/modules/events/EventService.js";
import { EventMapper } from "../../../../src/modules/events/EventMapper.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const events = {
    findSummariesInGroups: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findByIdForAmounts: vi.fn(),
    findByIdWithPurchaseReceiptIds: vi.fn(),
  };
  const transferReceipts = { membersWhoHaveUploaded: vi.fn() };
  const payments = { transfersFor: vi.fn(), memberCost: vi.fn() };
  const groups = { hasMember: vi.fn().mockResolvedValue(true), findByMember: vi.fn().mockResolvedValue([]) };
  const service = new EventService({ events, transferReceipts, payments, groups, mapper: new EventMapper() } as any);
  return { service, events, transferReceipts, payments, groups };
}

describe("EventMapper.toPublic", () => {
  const mapper = new EventMapper();
  const groupId = id();
  const base = {
    _id: id(),
    title: "Asado",
    datetime: new Date("2026-01-01"),
    description: "d",
    state: "available",
    memberLimit: 10,
    shoppingDesignee: [],
  };

  it("resume miembros, chef y calificaciones", () => {
    const viewer = id();
    const result = mapper.toPublic({
      ...base,
      chef: { name: "Ana" },
      members: [id(), viewer, id()],
      ratings: [{ score: 5 }, { score: 2 }],
      group: { _id: groupId, name: "Amigos", code: "K7PX2MQA" },
      penalization: 10,
      penalizationStartDate: new Date("2026-02-01"),
    } as any, String(viewer));
    expect(result).toMatchObject({
      chef: "Ana",
      members: 3,
      isMember: true,
      ratings: { avgScore: 3.5, ratingsAmount: 2 },
      group: { _id: groupId, name: "Amigos" },
      penalization: 10,
    });
    expect(result.group).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("organizer");
  });

  it("sin chef, calificaciones ni penalización: chef null, ratings en 0 y penalización null", () => {
    const result = mapper.toPublic({ ...base, group: { _id: groupId, name: "g" }, chef: null, members: [], ratings: [], penalization: null } as any, String(id()));
    expect(result).toMatchObject({
      isMember: false,
      chef: null,
      ratings: { avgScore: 0, ratingsAmount: 0 },
      penalization: null,
      penalizationStartDate: null,
    });
  });
});

describe("EventService.listForUser", () => {
  it("busca los eventos de los grupos del usuario y los resume", async () => {
    const { service, events, groups } = setup();
    const g1 = id();
    const g2 = id();
    groups.findByMember.mockResolvedValue([{ _id: g1 }, { _id: g2 }]);
    events.findSummariesInGroups.mockResolvedValue([
      { _id: id(), group: { _id: g1, name: "A" }, chef: null, members: [], ratings: [], shoppingDesignee: [] },
    ]);
    const result = await service.listForUser("u");
    expect(groups.findByMember).toHaveBeenCalledWith("u");
    expect(events.findSummariesInGroups).toHaveBeenCalledWith([g1, g2]);
    expect(result).toHaveLength(1);
    expect(result[0].group).toEqual({ _id: g1, name: "A" });
  });
});

describe("EventService.listByGroup", () => {
  it("resume los eventos del grupo con el mismo formato que listForUser", async () => {
    const { service, events } = setup();
    const groupId = id();
    const viewer = id();
    events.findSummariesInGroups.mockResolvedValue([
      { _id: id(), group: { _id: groupId, name: "A" }, chef: null, members: [viewer], ratings: [], shoppingDesignee: [] },
    ]);
    const result = await service.listByGroup(String(groupId), String(viewer));
    expect(events.findSummariesInGroups).toHaveBeenCalledWith([groupId]);
    expect(result[0]).toMatchObject({ group: { _id: groupId, name: "A" }, members: 1, isMember: true });
  });
});

describe("EventService lecturas", () => {
  it("getDetails inexistente -> NotFoundError", async () => {
    const { service, events } = setup();
    events.findByIdWithDetails.mockResolvedValue(null);
    await expect(service.getDetails(String(id()))).rejects.toEqual(new NotFoundError("The event with the given ID was not found."));
  });

  it("getDetails con id mal formado -> BadRequestError sin consultar la base", async () => {
    const { service, events } = setup();
    await expect(service.getDetails("abc")).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
    expect(events.findByIdWithDetails).not.toHaveBeenCalled();
  });

  it("getTransfers sin recibos -> BadRequestError", async () => {
    const { service, events } = setup();
    events.findByIdForAmounts.mockResolvedValue({ purchaseReceipts: [] });
    await expect(service.getTransfers("e")).rejects.toEqual(new BadRequestError("The event has no purchase receipts."));
  });

  it("getTransfers delega en PaymentCalculator", async () => {
    const { service, events, payments } = setup();
    const receipts = [{}];
    const transfers = [{ amount: 10 }];
    events.findByIdForAmounts.mockResolvedValue({ purchaseReceipts: receipts });
    payments.transfersFor.mockReturnValue(transfers);
    expect(await service.getTransfers("e")).toBe(transfers);
    expect(payments.transfersFor).toHaveBeenCalledWith(receipts);
  });
});

describe("EventService.getMemberCost", () => {
  const organizer = id();
  const designee = id();
  const member = id();
  const other = id();

  function eventWith(state = "readyforpayment") {
    return { organizer, shoppingDesignee: [designee], members: [organizer, designee, member, other], state, purchaseReceipts: [] };
  }

  it("un miembro ve su propio costo", async () => {
    const { service, events, payments } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith());
    payments.memberCost.mockReturnValue(42);
    expect(await service.getMemberCost("e", String(member), String(member))).toBe(42);
    expect(payments.memberCost).toHaveBeenCalledWith([], member);
  });

  it.each([
    ["organizador", organizer],
    ["designado", designee],
  ])("el %s ve el costo de otro miembro", async (_label, requester) => {
    const { service, events, payments } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith());
    payments.memberCost.mockReturnValue(1);
    await expect(service.getMemberCost("e", String(member), String(requester))).resolves.toBe(1);
  });

  it("el organizador que salió del grupo ya no ve el costo de otros; el suyo sí", async () => {
    const { service, events, groups, payments } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith());
    groups.hasMember.mockResolvedValue(false);
    payments.memberCost.mockReturnValue(3);
    await expect(service.getMemberCost("e", String(member), String(organizer))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getMemberCost("e", String(organizer), String(organizer))).resolves.toBe(3);
  });

  it("un miembro no ve el costo de otro -> ForbiddenError", async () => {
    const { service, events } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith());
    await expect(service.getMemberCost("e", String(member), String(other))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no miembro -> ForbiddenError", async () => {
    const { service, events } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith());
    const outsider = String(id());
    await expect(service.getMemberCost("e", outsider, outsider)).rejects.toEqual(
      new ForbiddenError("User is not a member of the event")
    );
  });

  it("estado sin costos -> ForbiddenError", async () => {
    const { service, events } = setup();
    events.findByIdWithPurchaseReceiptIds.mockResolvedValue(eventWith("closed"));
    await expect(service.getMemberCost("e", String(member), String(member))).rejects.toEqual(
      new ForbiddenError("Event state needs to be either finished or ready for payment")
    );
  });
});
