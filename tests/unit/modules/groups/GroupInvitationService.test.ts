import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import {
  GroupInvitationService,
  hashInvitationToken,
} from "../../../../src/modules/groups/GroupInvitationService.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../../src/core/errors/AppError.js";

const oid = () => new mongoose.Types.ObjectId();
const NOW = new Date("2026-11-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const member = { _id: oid(), email: "miembro@test.com" };
  const group = { _id: oid(), name: "Amigos", code: "K7PX2MQA", members: [member._id] };
  let tokens = 0;
  const deps = {
    groups: {
      findById: vi.fn().mockResolvedValue(group),
      findByIdWithMembers: vi.fn(async (id: string) => ({ _id: id })),
      countByMember: vi.fn().mockResolvedValue(0),
      addMemberById: vi.fn(async () => group),
    },
    users: {
      findById: vi.fn().mockResolvedValue({ name: "Ana", lastName: "Pérez" }),
      findByEmails: vi.fn().mockResolvedValue([]),
    },
    invitations: {
      findByTokenHash: vi.fn(),
      findPendingByGroup: vi.fn().mockResolvedValue([]),
      findPendingEmails: vi.fn().mockResolvedValue([]),
      upsertPending: vi.fn(async (data: any) => ({ _id: oid(), ...data })),
      claim: vi.fn(async () => ({})),
      markAccepted: vi.fn(),
      revoke: vi.fn(),
      deleteById: vi.fn(),
    },
    transaction: vi.fn(async (work: (session: unknown) => unknown) => work({ fake: "session" })),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    template: vi.fn((g: string, i: string, t: string) => `${g}|${i}|${t}`),
    now: () => NOW,
    newToken: () => `token-${++tokens}`,
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  return { service: new GroupInvitationService(deps as any), group, member, ...deps };
}

describe("GroupInvitationService.invite", () => {
  it("crea una invitación por mail (hash del token, vence en 7 días) y manda el link con el token", async () => {
    const { service, group, invitations, sendEmail, users, template } = setup();
    const inviter = oid();
    const result = await service.invite(String(group._id), String(inviter), [" A@Test.com", "a@test.com", "b@test.com"]);

    expect(users.findByEmails).toHaveBeenCalledWith(["a@test.com", "b@test.com"]);
    expect(invitations.upsertPending.mock.calls.map((c: any[]) => c[0])).toEqual([
      { group: group._id, email: "a@test.com", invitedBy: inviter, tokenHash: hashInvitationToken("token-1"), expiresAt: new Date(NOW.getTime() + 7 * DAY) },
      { group: group._id, email: "b@test.com", invitedBy: inviter, tokenHash: hashInvitationToken("token-2"), expiresAt: new Date(NOW.getTime() + 7 * DAY) },
    ]);
    expect(template).toHaveBeenCalledWith("Amigos", "Ana Pérez", "token-1");
    expect(sendEmail.mock.calls.map((c: any[]) => [c[0], c[3]])).toEqual([
      ["a@test.com", "Amigos|Ana Pérez|token-1"],
      ["b@test.com", "Amigos|Ana Pérez|token-2"],
    ]);
    expect(result).toEqual({ sent: ["a@test.com", "b@test.com"], failed: [], alreadyMembers: [] });
  });

  it("no invita a quien ya es miembro", async () => {
    const { service, group, member, users, invitations } = setup();
    users.findByEmails.mockResolvedValue([member, { _id: oid(), email: "otro@test.com" }]);
    const result = await service.invite(String(group._id), String(oid()), ["miembro@test.com", "otro@test.com"]);
    expect(invitations.upsertPending).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: ["otro@test.com"], failed: [], alreadyMembers: ["miembro@test.com"] });
  });

  it("si falla un mail, borra esa invitación, sigue con el resto y lo informa", async () => {
    const { service, group, sendEmail, invitations } = setup();
    sendEmail.mockRejectedValueOnce(new Error("brevo down"));
    const result = await service.invite(String(group._id), String(oid()), ["a@test.com", "b@test.com"]);
    const failedId = (await invitations.upsertPending.mock.results[0].value)._id;
    expect(invitations.deleteById).toHaveBeenCalledWith(String(failedId));
    expect(result).toEqual({ sent: ["b@test.com"], failed: ["a@test.com"], alreadyMembers: [] });
  });

  it("más de 50 pendientes -> ConflictError; reinvitar a un pendiente no suma", async () => {
    const { service, group, invitations, sendEmail } = setup();
    const pending = Array.from({ length: 49 }, (_, i) => `p${i}@test.com`);
    invitations.findPendingEmails.mockResolvedValue(pending);

    await expect(service.invite(String(group._id), String(oid()), ["n1@test.com", "n2@test.com"])).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(sendEmail).not.toHaveBeenCalled();

    const ok = await service.invite(String(group._id), String(oid()), ["p0@test.com", "n1@test.com"]);
    expect(ok.sent).toEqual(["p0@test.com", "n1@test.com"]);
  });

  it.each([
    ["sin array", undefined],
    ["array vacío", []],
    ["un mail inválido", ["a@test.com", "no-es-mail"]],
    ["un valor que no es string", [42]],
    ["más de 20", Array.from({ length: 21 }, (_, i) => `u${i}@test.com`)],
  ])("%s -> BadRequestError sin mandar nada", async (_label, emails) => {
    const { service, group, sendEmail } = setup();
    await expect(service.invite(String(group._id), String(oid()), emails)).rejects.toBeInstanceOf(BadRequestError);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("grupo inexistente -> NotFoundError", async () => {
    const { service, groups } = setup();
    groups.findById.mockResolvedValue(null);
    await expect(service.invite(String(oid()), String(oid()), ["a@test.com"])).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("GroupInvitationService.accept", () => {
  function pendingInvitation(group: { _id: mongoose.Types.ObjectId }, fields: Record<string, unknown> = {}) {
    return { _id: oid(), group: group._id, email: "nuevo@test.com", status: "pending", expiresAt: new Date(NOW.getTime() + DAY), ...fields };
  }
  const newUser = { _id: oid(), email: "nuevo@test.com" };

  it("con el mail correcto: reclama el token y suma al usuario en una transacción", async () => {
    const { service, group, invitations, users, groups, transaction } = setup();
    const invitation = pendingInvitation(group);
    invitations.findByTokenHash.mockResolvedValue(invitation);
    users.findById.mockResolvedValue(newUser);

    expect(await service.accept(String(newUser._id), " token-x ")).toEqual({ _id: String(group._id) });

    expect(invitations.findByTokenHash).toHaveBeenCalledWith(hashInvitationToken("token-x"));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(invitations.claim).toHaveBeenCalledWith(invitation._id, newUser._id, NOW, { fake: "session" });
    expect(groups.addMemberById).toHaveBeenCalledWith(group._id, newUser._id, { fake: "session" });
  });

  it("sin token -> BadRequestError", async () => {
    const { service } = setup();
    await expect(service.accept(String(oid()), undefined)).rejects.toBeInstanceOf(BadRequestError);
    await expect(service.accept(String(oid()), "  ")).rejects.toBeInstanceOf(BadRequestError);
  });

  it.each([
    ["inexistente", null],
    ["ya aceptada", { status: "accepted" }],
    ["revocada", { status: "revoked" }],
  ])("token %s -> NotFoundError", async (_label, fields) => {
    const { service, group, invitations } = setup();
    invitations.findByTokenHash.mockResolvedValue(fields === null ? null : pendingInvitation(group, fields));
    await expect(service.accept(String(oid()), "t")).rejects.toEqual(new NotFoundError("The invitation is not valid."));
  });

  it("vencida -> ConflictError", async () => {
    const { service, group, invitations } = setup();
    invitations.findByTokenHash.mockResolvedValue(pendingInvitation(group, { expiresAt: NOW }));
    await expect(service.accept(String(oid()), "t")).rejects.toBeInstanceOf(ConflictError);
  });

  it("el usuario tiene otro mail -> ForbiddenError sin tocar el grupo", async () => {
    const { service, group, invitations, users, groups } = setup();
    invitations.findByTokenHash.mockResolvedValue(pendingInvitation(group));
    users.findById.mockResolvedValue({ _id: oid(), email: "otro@test.com" });
    await expect(service.accept(String(oid()), "t")).rejects.toBeInstanceOf(ForbiddenError);
    expect(groups.addMemberById).not.toHaveBeenCalled();
  });

  it("ya es miembro -> marca la invitación como aceptada y ConflictError", async () => {
    const { service, group, invitations, users } = setup();
    const invitation = pendingInvitation(group);
    invitations.findByTokenHash.mockResolvedValue(invitation);
    users.findById.mockResolvedValue(newUser);
    group.members.push(newUser._id);
    await expect(service.accept(String(newUser._id), "t")).rejects.toEqual(
      new ConflictError("The user is already a member of the group.")
    );
    expect(invitations.markAccepted).toHaveBeenCalledWith(invitation._id, newUser._id, NOW);
  });

  it("con 100 grupos -> ConflictError", async () => {
    const { service, group, invitations, users, groups } = setup();
    invitations.findByTokenHash.mockResolvedValue(pendingInvitation(group));
    users.findById.mockResolvedValue(newUser);
    groups.countByMember.mockResolvedValue(100);
    await expect(service.accept(String(newUser._id), "t")).rejects.toBeInstanceOf(ConflictError);
    expect(invitations.claim).not.toHaveBeenCalled();
  });

  it("si otro pedido reclamó el token en el medio -> NotFoundError", async () => {
    const { service, group, invitations, users, groups } = setup();
    invitations.findByTokenHash.mockResolvedValue(pendingInvitation(group));
    users.findById.mockResolvedValue(newUser);
    invitations.claim.mockResolvedValue(null);
    await expect(service.accept(String(newUser._id), "t")).rejects.toBeInstanceOf(NotFoundError);
    expect(groups.addMemberById).not.toHaveBeenCalled();
  });

  it("grupo lleno -> ConflictError (la transacción se revierte)", async () => {
    const { service, group, invitations, users, groups } = setup();
    invitations.findByTokenHash.mockResolvedValue(pendingInvitation(group));
    users.findById.mockResolvedValue(newUser);
    groups.addMemberById.mockResolvedValue(null);
    await expect(service.accept(String(newUser._id), "t")).rejects.toEqual(
      new ConflictError("The group already has 200 members.")
    );
  });
});

describe("GroupInvitationService.revoke", () => {
  it("id inválido -> BadRequestError", async () => {
    const { service } = setup();
    await expect(service.revoke(String(oid()), "abc")).rejects.toBeInstanceOf(BadRequestError);
  });

  it("no es una pendiente del grupo -> NotFoundError", async () => {
    const { service, invitations } = setup();
    invitations.revoke.mockResolvedValue(null);
    await expect(service.revoke(String(oid()), String(oid()))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("revoca y devuelve la invitación", async () => {
    const { service, invitations } = setup();
    const revoked = { status: "revoked" };
    invitations.revoke.mockResolvedValue(revoked);
    const groupId = String(oid());
    const invitationId = String(oid());
    expect(await service.revoke(groupId, invitationId)).toBe(revoked);
    expect(invitations.revoke).toHaveBeenCalledWith(groupId, invitationId);
  });
});
