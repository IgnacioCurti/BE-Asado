import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { EventAccessPolicy } from "../../../../src/modules/events/EventAccessPolicy.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

const organizer = id();
const designee = id();
const member = id();
const outsider = id();

const event = { organizer, shoppingDesignee: [designee], members: [organizer, designee, member] };

function setup(found: unknown = event) {
  const events = { findById: vi.fn().mockResolvedValue(found), findByOption: vi.fn().mockResolvedValue(found) };
  const transferReceipts = { findById: vi.fn() };
  return { policy: new EventAccessPolicy(events as any, transferReceipts as any), events, transferReceipts };
}

const s = (oid: mongoose.Types.ObjectId) => String(oid);
const eventId = s(id());

describe("EventAccessPolicy por rol", () => {
  it.each([
    ["assertOrganizer", organizer, [designee, member]],
    ["assertMember", member, [outsider]],
    ["assertShoppingDesignee", designee, [organizer, member]],
    ["assertOrganizerOrDesignee", organizer, [member, outsider]],
  ] as const)("%s permite al rol correcto y rechaza al resto", async (method, allowed, denied) => {
    const { policy } = setup();
    await expect(policy[method](eventId, s(allowed))).resolves.toBeUndefined();
    for (const user of denied) await expect(policy[method](eventId, s(user))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assertOrganizerOrDesignee también permite al designado", async () => {
    const { policy } = setup();
    await expect(policy.assertOrganizerOrDesignee(eventId, s(designee))).resolves.toBeUndefined();
  });

  it("id de evento inválido -> BadRequestError sin consultar la base", async () => {
    const { policy, events } = setup();
    await expect(policy.assertOrganizer("abc", s(organizer))).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
    expect(events.findById).not.toHaveBeenCalled();
  });

  it("evento inexistente -> NotFoundError", async () => {
    const { policy } = setup(null);
    await expect(policy.assertMember(eventId, s(member))).rejects.toEqual(
      new NotFoundError("The event with the given ID does not exist.")
    );
  });
});

describe("EventAccessPolicy.assertViewer", () => {
  it("evento público: cualquier usuario lo ve", async () => {
    const { policy } = setup({ ...event, isPrivate: false });
    await expect(policy.assertViewer(eventId, s(outsider))).resolves.toBeUndefined();
  });

  it("evento privado: pasa un miembro y rechaza a quien no lo es", async () => {
    const { policy } = setup({ ...event, isPrivate: true });
    await expect(policy.assertViewer(eventId, s(member))).resolves.toBeUndefined();
    await expect(policy.assertViewer(eventId, s(outsider))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("id inválido -> BadRequestError; inexistente -> NotFoundError", async () => {
    await expect(setup().policy.assertViewer("abc", s(member))).rejects.toBeInstanceOf(BadRequestError);
    await expect(setup(null).policy.assertViewer(eventId, s(member))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("EventAccessPolicy opciones", () => {
  it("assertOptionManager con :event busca el evento por id", async () => {
    const { policy, events } = setup();
    await policy.assertOptionManager(eventId, "", s(designee));
    expect(events.findById).toHaveBeenCalledWith(eventId);
  });

  it("assertOptionManager sin :event busca el evento de la opción", async () => {
    const { policy, events } = setup();
    const optionId = s(id());
    await policy.assertOptionManager(undefined, optionId, s(organizer));
    expect(events.findByOption).toHaveBeenCalledWith(optionId);
  });

  it("opción inexistente -> NotFoundError 'Option not found'", async () => {
    const { policy } = setup(null);
    await expect(policy.assertOptionVoter(s(id()), s(member))).rejects.toEqual(new NotFoundError("Option not found"));
  });

  it("assertOptionVoter rechaza a quien no es miembro", async () => {
    const { policy } = setup();
    await expect(policy.assertOptionVoter(s(id()), s(outsider))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("EventAccessPolicy.assertTransferReceiptOwner", () => {
  it("id inválido -> 'Invalid ID'", async () => {
    const { policy } = setup();
    await expect(policy.assertTransferReceiptOwner("abc", s(member))).rejects.toEqual(new BadRequestError("Invalid ID"));
  });

  it("dueño pasa, otro usuario -> ForbiddenError", async () => {
    const { policy, transferReceipts } = setup();
    transferReceipts.findById.mockResolvedValue({ user: member });
    await expect(policy.assertTransferReceiptOwner(s(id()), s(member))).resolves.toBeUndefined();
    await expect(policy.assertTransferReceiptOwner(s(id()), s(outsider))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
