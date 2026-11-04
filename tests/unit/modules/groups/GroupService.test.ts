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
  return { service: new GroupService(groups as any), groups };
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
  it("último miembro: borra el grupo", async () => {
    const { service, groups } = setup();
    const user = oid();
    groups.findById.mockResolvedValue({ _id: oid(), members: [user], admins: [user] });
    groups.deleteIfOnlyMember.mockResolvedValue(true);
    expect(await service.leave(s(oid()), s(user))).toEqual({ groupDeleted: true });
    expect(groups.removeMemberKeepingAnAdmin).not.toHaveBeenCalled();
  });

  it("era el último pero alguien entró en el medio y es el único admin -> ConflictError", async () => {
    const { service, groups } = setup();
    const user = oid();
    groups.findById
      .mockResolvedValueOnce({ _id: oid(), members: [user], admins: [user] })
      .mockResolvedValueOnce({ _id: oid(), members: [user, oid()], admins: [user] });
    groups.deleteIfOnlyMember.mockResolvedValue(false);
    await expect(service.leave(s(oid()), s(user))).rejects.toBeInstanceOf(ConflictError);
  });

  it("el grupo se borró en el medio -> NotFoundError", async () => {
    const { service, groups } = setup();
    const user = oid();
    groups.findById
      .mockResolvedValueOnce({ _id: oid(), members: [user, oid()], admins: [oid()] })
      .mockResolvedValueOnce(null);
    groups.removeMemberKeepingAnAdmin.mockResolvedValue(null);
    await expect(service.leave(s(oid()), s(user))).rejects.toBeInstanceOf(NotFoundError);
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
