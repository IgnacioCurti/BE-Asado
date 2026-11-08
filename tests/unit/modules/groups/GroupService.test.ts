import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GroupService } from "../../../../src/modules/groups/GroupService.js";
import { GroupAccessPolicy } from "../../../../src/modules/groups/GroupAccessPolicy.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../../src/core/errors/AppError.js";

const oid = () => new mongoose.Types.ObjectId();
const s = (id: mongoose.Types.ObjectId) => String(id);

function setup() {
  const groups = {
    createWithUniqueCode: vi.fn(async (data: any) => ({ _id: oid(), code: "K7PX2MQA", ...data })),
    regenerateCode: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    findByMember: vi.fn().mockResolvedValue([]),
    countByMember: vi.fn().mockResolvedValue(0),
    findByIdWithMembers: vi.fn(async (id: string) => ({ _id: id })),
    addMemberByCode: vi.fn(),
    addAdmin: vi.fn(),
    rename: vi.fn(),
    removeMemberKeepingAnAdmin: vi.fn(),
    deleteIfOnlyMember: vi.fn(),
  };
  const session = { fake: "session" };
  const events = {
    findActiveInGroupInvolving: vi.fn().mockResolvedValue([]),
    removeUserFromAvailableInGroup: vi.fn(),
    findIdsByGroup: vi.fn().mockResolvedValue([]),
    deleteCascade: vi.fn(),
  };
  const debtors = { getDebtors: vi.fn().mockResolvedValue([]) };
  const transaction = vi.fn(async (work: (session: unknown) => unknown) => work(session));
  const service = new GroupService(groups as any, { events, debtors, transaction } as any);
  return { service, groups, events, debtors, transaction, session };
}

describe("GroupService.create", () => {
  it("el usuario queda como único admin y miembro; el nombre se recorta", async () => {
    const { service, groups } = setup();
    const user = oid();
    await service.create(s(user), "  Asado ");
    const data = groups.createWithUniqueCode.mock.calls[0][0];
    expect(data.name).toBe("Asado");
    expect(data.admins.map(String)).toEqual([s(user)]);
    expect(data.members.map(String)).toEqual([s(user)]);
  });

  it("con 100 grupos -> ConflictError sin crear", async () => {
    const { service, groups } = setup();
    groups.countByMember.mockResolvedValue(100);
    await expect(service.create(s(oid()), "Asado")).rejects.toBeInstanceOf(ConflictError);
    expect(groups.createWithUniqueCode).not.toHaveBeenCalled();
  });
});

describe("GroupService.join", () => {
  it("si el update atómico falla porque se llenó en el medio -> ConflictError 'full'", async () => {
    const { service, groups } = setup();
    const group = { _id: oid(), members: [oid()] };
    groups.findByCode.mockResolvedValue(group);
    groups.addMemberByCode.mockResolvedValue(null);
    await expect(service.join(s(oid()), "K7PX2MQA")).rejects.toEqual(
      new ConflictError("The group already has 200 members.")
    );
  });

  it("si se unió en el medio (pedido duplicado) -> ConflictError 'already a member'", async () => {
    const { service, groups } = setup();
    const user = oid();
    groups.findByCode
      .mockResolvedValueOnce({ _id: oid(), members: [] })
      .mockResolvedValueOnce({ _id: oid(), members: [user] });
    groups.addMemberByCode.mockResolvedValue(null);
    await expect(service.join(s(user), "K7PX2MQA")).rejects.toEqual(
      new ConflictError("The user is already a member of the group.")
    );
  });

  it("normaliza el código antes de buscarlo", async () => {
    const { service, groups } = setup();
    groups.findByCode.mockResolvedValue(null);
    await expect(service.join(s(oid()), " k7px2mqa ")).rejects.toBeInstanceOf(NotFoundError);
    expect(groups.findByCode).toHaveBeenCalledWith("K7PX2MQA");
  });
});

describe("GroupService.leave", () => {
  const ConflictWith = (text: string) => expect.objectContaining({ status: 409, message: expect.stringContaining(text) });

  it("último miembro: en una transacción borra el grupo y sus eventos", async () => {
    const { service, groups, events, session } = setup();
    const user = oid();
    const group = { _id: oid(), members: [user], admins: [user] };
    const eventIds = [oid(), oid()];
    groups.findById.mockResolvedValue(group);
    groups.deleteIfOnlyMember.mockResolvedValue(true);
    events.findIdsByGroup.mockResolvedValue(eventIds);

    expect(await service.leave(s(group._id), s(user))).toEqual({ groupDeleted: true });
    expect(groups.deleteIfOnlyMember).toHaveBeenCalledWith(group._id, user, session);
    expect(events.findIdsByGroup).toHaveBeenCalledWith(group._id, session);
    expect(events.deleteCascade).toHaveBeenCalledWith(eventIds, session);
    expect(groups.removeMemberKeepingAnAdmin).not.toHaveBeenCalled();
  });

  it("si el grupo no se borró, no borra sus eventos", async () => {
    const { service, groups, events } = setup();
    const user = oid();
    groups.findById
      .mockResolvedValueOnce({ _id: oid(), members: [user], admins: [user] })
      .mockResolvedValueOnce({ _id: oid(), members: [user, oid()], admins: [user] });
    groups.deleteIfOnlyMember.mockResolvedValue(false);
    await expect(service.leave(s(oid()), s(user))).rejects.toBeInstanceOf(ConflictError);
    expect(events.deleteCascade).not.toHaveBeenCalled();
  });

  it("un miembro sale: en la misma transacción se lo da de baja de los eventos available", async () => {
    const { service, groups, events, session } = setup();
    const user = oid();
    const group = { _id: oid(), members: [oid(), user], admins: [oid()] };
    groups.findById.mockResolvedValue(group);
    groups.removeMemberKeepingAnAdmin.mockResolvedValue({});

    expect(await service.leave(s(group._id), s(user))).toEqual({ groupDeleted: false });
    expect(groups.removeMemberKeepingAnAdmin).toHaveBeenCalledWith(group._id, user, session);
    expect(events.removeUserFromAvailableInGroup).toHaveBeenCalledWith(group._id, user, session);
  });

  it("si no pudo salir del grupo, no lo da de baja de los eventos", async () => {
    const { service, groups, events } = setup();
    const user = oid();
    const group = { _id: oid(), members: [oid(), user], admins: [oid()] };
    groups.findById.mockResolvedValueOnce(group).mockResolvedValueOnce(null);
    groups.removeMemberKeepingAnAdmin.mockResolvedValue(null);
    await expect(service.leave(s(group._id), s(user))).rejects.toBeInstanceOf(NotFoundError);
    expect(events.removeUserFromAvailableInGroup).not.toHaveBeenCalled();
  });

  it("único admin con otros miembros -> ConflictError antes de mirar los eventos", async () => {
    const { service, groups, events, transaction } = setup();
    const user = oid();
    groups.findById.mockResolvedValue({ _id: oid(), members: [user, oid()], admins: [user] });
    await expect(service.leave(s(oid()), s(user))).rejects.toEqual(ConflictWith("only admin"));
    expect(events.findActiveInGroupInvolving).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("con deuda en un evento readyforpayment del grupo -> ConflictError y no sale", async () => {
    const { service, groups, events, debtors, transaction } = setup();
    const user = oid();
    const event = { _id: oid(), state: "readyforpayment", members: [user], chef: null, shoppingDesignee: [oid()] };
    groups.findById.mockResolvedValue({ _id: oid(), members: [oid(), user], admins: [oid()] });
    events.findActiveInGroupInvolving.mockResolvedValue([event]);
    debtors.getDebtors.mockResolvedValue([{ _id: user }]);

    await expect(service.leave(s(oid()), s(user))).rejects.toEqual(ConflictWith("pending payments"));
    expect(debtors.getDebtors).toHaveBeenCalledWith(event._id);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("sin deuda propia (deben otros) puede salir", async () => {
    const { service, groups, events, debtors } = setup();
    const user = oid();
    groups.findById.mockResolvedValue({ _id: oid(), members: [oid(), user], admins: [oid()] });
    events.findActiveInGroupInvolving.mockResolvedValue([
      { _id: oid(), state: "readyforpayment", members: [user], chef: null, shoppingDesignee: [oid()] },
    ]);
    debtors.getDebtors.mockResolvedValue([{ _id: oid() }]);
    groups.removeMemberKeepingAnAdmin.mockResolvedValue({});
    await expect(service.leave(s(oid()), s(user))).resolves.toEqual({ groupDeleted: false });
  });

  it("en un evento closed no hay deudas: no las consulta", async () => {
    const { service, groups, events, debtors } = setup();
    const user = oid();
    groups.findById.mockResolvedValue({ _id: oid(), members: [oid(), user], admins: [oid()] });
    events.findActiveInGroupInvolving.mockResolvedValue([
      { _id: oid(), state: "closed", members: [user], chef: null, shoppingDesignee: [oid()] },
    ]);
    groups.removeMemberKeepingAnAdmin.mockResolvedValue({});
    await service.leave(s(oid()), s(user));
    expect(debtors.getDebtors).not.toHaveBeenCalled();
  });

  it.each([
    ["chef", "closed", { chef: "me" }],
    ["designado", "closed", { shoppingDesignee: ["me"] }],
    ["chef", "readyforpayment", { chef: "me" }],
    ["designado", "readyforpayment", { shoppingDesignee: ["me"] }],
  ])("siendo %s de un evento %s del grupo -> ConflictError y no sale", async (_role, state, role) => {
    const { service, groups, events, transaction } = setup();
    const user = oid();
    const resolve = (v: unknown) => (v === "me" ? user : v);
    groups.findById.mockResolvedValue({ _id: oid(), members: [oid(), user], admins: [oid()] });
    events.findActiveInGroupInvolving.mockResolvedValue([
      {
        _id: oid(),
        state,
        members: [user],
        chef: resolve((role as any).chef ?? null),
        shoppingDesignee: ((role as any).shoppingDesignee ?? []).map(resolve),
      },
    ]);
    await expect(service.leave(s(oid()), s(user))).rejects.toEqual(ConflictWith("chef or a shopping designee"));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("no es miembro -> ForbiddenError", async () => {
    const { service, groups } = setup();
    groups.findById.mockResolvedValue({ _id: oid(), members: [oid()], admins: [] });
    await expect(service.leave(s(oid()), s(oid()))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("GroupService.makeAdmin", () => {
  it("destino que no es miembro -> BadRequestError; id inválido -> BadRequestError", async () => {
    const { service, groups } = setup();
    groups.addAdmin.mockResolvedValue(null);
    await expect(service.makeAdmin(s(oid()), s(oid()))).rejects.toEqual(
      new BadRequestError("The user is not a member of the group.")
    );
    await expect(service.makeAdmin(s(oid()), "abc")).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
  });
});

describe("GroupAccessPolicy", () => {
  const admin = oid();
  const member = oid();
  const group = { admins: [admin], members: [admin, member] };

  function policy(found: unknown = group) {
    const groups = { findById: vi.fn().mockResolvedValue(found) };
    return { policy: new GroupAccessPolicy(groups), groups };
  }

  it("assertMember deja pasar a miembros y rechaza al resto", async () => {
    await expect(policy().policy.assertMember(s(oid()), s(member))).resolves.toBeUndefined();
    await expect(policy().policy.assertMember(s(oid()), s(oid()))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assertAdmin deja pasar solo a admins", async () => {
    await expect(policy().policy.assertAdmin(s(oid()), s(admin))).resolves.toBeUndefined();
    await expect(policy().policy.assertAdmin(s(oid()), s(member))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("id inválido -> BadRequestError sin consultar; inexistente -> NotFoundError", async () => {
    const { policy: p, groups } = policy();
    await expect(p.assertMember("abc", s(member))).rejects.toBeInstanceOf(BadRequestError);
    expect(groups.findById).not.toHaveBeenCalled();
    await expect(policy(null).policy.assertAdmin(s(oid()), s(admin))).rejects.toBeInstanceOf(NotFoundError);
  });
});
