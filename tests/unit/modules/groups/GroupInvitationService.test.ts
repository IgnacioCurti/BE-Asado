import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GroupInvitationService } from "../../../../src/modules/groups/GroupInvitationService.js";
import { BadRequestError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const oid = () => new mongoose.Types.ObjectId();

function setup() {
  const member = { _id: oid(), email: "miembro@test.com" };
  const group = { _id: oid(), name: "Amigos", code: "K7PX2MQA", members: [member._id] };
  const deps = {
    groups: { findById: vi.fn().mockResolvedValue(group) },
    users: {
      findById: vi.fn().mockResolvedValue({ name: "Ana", lastName: "Pérez" }),
      findByEmails: vi.fn().mockResolvedValue([]),
    },
    sendEmail: vi.fn().mockResolvedValue(undefined),
    template: vi.fn((g: string, i: string, c: string) => `${g}|${i}|${c}`),
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  return { service: new GroupInvitationService(deps as any), group, member, ...deps };
}

describe("GroupInvitationService.invite", () => {
  it("normaliza, quita repetidos y manda un mail por dirección con el código del grupo", async () => {
    const { service, group, sendEmail, users, template } = setup();
    const result = await service.invite(String(group._id), String(oid()), [" A@Test.com", "a@test.com", "b@test.com"]);

    expect(users.findByEmails).toHaveBeenCalledWith(["a@test.com", "b@test.com"]);
    expect(template).toHaveBeenCalledWith("Amigos", "Ana Pérez", "K7PX2MQA");
    expect(sendEmail.mock.calls).toEqual([
      ["a@test.com", "FoodSpot | Te invitaron a un grupo", "a@test.com", "Amigos|Ana Pérez|K7PX2MQA"],
      ["b@test.com", "FoodSpot | Te invitaron a un grupo", "b@test.com", "Amigos|Ana Pérez|K7PX2MQA"],
    ]);
    expect(result).toEqual({ sent: ["a@test.com", "b@test.com"], failed: [], alreadyMembers: [] });
  });

  it("no le manda a quien ya es miembro", async () => {
    const { service, group, member, users, sendEmail } = setup();
    users.findByEmails.mockResolvedValue([member, { _id: oid(), email: "otro@test.com" }]);
    const result = await service.invite(String(group._id), String(oid()), ["miembro@test.com", "otro@test.com"]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: ["otro@test.com"], failed: [], alreadyMembers: ["miembro@test.com"] });
  });

  it("si falla un mail, sigue con el resto y lo informa", async () => {
    const { service, group, sendEmail } = setup();
    sendEmail.mockRejectedValueOnce(new Error("brevo down"));
    const result = await service.invite(String(group._id), String(oid()), ["a@test.com", "b@test.com"]);
    expect(result).toEqual({ sent: ["b@test.com"], failed: ["a@test.com"], alreadyMembers: [] });
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
