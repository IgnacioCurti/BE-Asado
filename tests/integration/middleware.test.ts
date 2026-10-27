/**
 * Middlewares de autorización que consultan la base. La mayoría también se
 * ejercita vía HTTP en los tests de cada recurso; acá se cubren todas sus ramas,
 * incluido transferReceiptOwner, que hoy no está montado en ninguna ruta.
 */
import { describe, expect, it, vi } from "vitest";
import {
  eventOrganizer,
  eventParticipant,
  shoppingDesignee,
  shoppingDesigneeOrEventOrganizer,
  transferReceiptOwner,
} from "../../src/middleware/middleware.js";
import { createEvent, createTransferReceipt, createUser, newId } from "../helpers/fixtures.js";

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

async function run(middleware: Function, userId: string, params: Record<string, string>) {
  const res = mockRes();
  const next = vi.fn();
  await middleware({ user: { _id: userId, email: "x@endava.com" }, params }, res, next);
  return {
    next,
    status: res.status.mock.calls[0]?.[0] as number | undefined,
    body: res.json.mock.calls[0]?.[0],
  };
}

async function base() {
  const organizer = await createUser();
  const designee = await createUser();
  const member = await createUser();
  const outsider = await createUser();
  const event = await createEvent({
    organizer: organizer._id,
    members: [organizer._id, designee._id, member._id],
    shoppingDesignee: [designee._id],
  });
  return { organizer, designee, member, outsider, event };
}

const INVALID = { message: "Invalid ObjectID" };
const EVENT_NOT_FOUND = { message: "The event with the given ID does not exist." };

describe("eventOrganizer (usa :id)", () => {
  it("next() para el organizador", async () => {
    const { organizer, event } = await base();
    const r = await run(eventOrganizer, organizer._id, { id: event._id });
    expect(r.next).toHaveBeenCalledOnce();
  });

  it("403 para cualquier otro", async () => {
    const { designee, event } = await base();
    const r = await run(eventOrganizer, designee._id, { id: event._id });
    expect(r).toMatchObject({ status: 403, body: { message: "Access denied. The user is not the event's organizer." } });
    expect(r.next).not.toHaveBeenCalled();
  });

  it("404 / 400", async () => {
    const { organizer } = await base();
    expect(await run(eventOrganizer, organizer._id, { id: newId() })).toMatchObject({ status: 404, body: EVENT_NOT_FOUND });
    expect(await run(eventOrganizer, organizer._id, { id: "abc" })).toMatchObject({ status: 400, body: INVALID });
  });
});

describe("eventParticipant (usa :event)", () => {
  it("next() para un miembro", async () => {
    const { member, event } = await base();
    expect((await run(eventParticipant, member._id, { event: event._id })).next).toHaveBeenCalledOnce();
  });

  it("403 para un no miembro", async () => {
    const { outsider, event } = await base();
    expect(await run(eventParticipant, outsider._id, { event: event._id })).toMatchObject({
      status: 403,
      body: { message: "Access denied. The user is not a participant of the event." },
    });
  });

  it("404 / 400", async () => {
    const { member } = await base();
    expect(await run(eventParticipant, member._id, { event: newId() })).toMatchObject({ status: 404, body: EVENT_NOT_FOUND });
    expect(await run(eventParticipant, member._id, { event: "abc" })).toMatchObject({ status: 400, body: INVALID });
  });

  it("[comportamiento actual] _id del token mal formado -> 500", async () => {
    const { event } = await base();
    expect((await run(eventParticipant, "abc", { event: event._id })).status).toBe(500);
  });
});

describe("shoppingDesignee (usa :event)", () => {
  it("next() para un comprador", async () => {
    const { designee, event } = await base();
    expect((await run(shoppingDesignee, designee._id, { event: event._id })).next).toHaveBeenCalledOnce();
  });

  it("403 para el organizador si no es comprador", async () => {
    const { organizer, event } = await base();
    expect(await run(shoppingDesignee, organizer._id, { event: event._id })).toMatchObject({
      status: 403,
      body: { message: "Access denied. User is not a shopping designee." },
    });
  });

  it("404 / 400 (evento o _id del token inválidos)", async () => {
    const { designee, event } = await base();
    expect(await run(shoppingDesignee, designee._id, { event: newId() })).toMatchObject({ status: 404, body: EVENT_NOT_FOUND });
    expect(await run(shoppingDesignee, designee._id, { event: "abc" })).toMatchObject({ status: 400, body: INVALID });
    expect(await run(shoppingDesignee, "abc", { event: event._id })).toMatchObject({ status: 400, body: INVALID });
  });
});

describe("shoppingDesigneeOrEventOrganizer (usa :id)", () => {
  it("next() para organizador y para comprador", async () => {
    const { organizer, designee, event } = await base();
    expect((await run(shoppingDesigneeOrEventOrganizer, organizer._id, { id: event._id })).next).toHaveBeenCalledOnce();
    expect((await run(shoppingDesigneeOrEventOrganizer, designee._id, { id: event._id })).next).toHaveBeenCalledOnce();
  });

  it("403 para un miembro común", async () => {
    const { member, event } = await base();
    expect(await run(shoppingDesigneeOrEventOrganizer, member._id, { id: event._id })).toMatchObject({
      status: 403,
      body: { message: "Access denied. The user is not the event's shopping designee or organizer." },
    });
  });

  it("404 / 400", async () => {
    const { organizer, event } = await base();
    expect(await run(shoppingDesigneeOrEventOrganizer, organizer._id, { id: newId() })).toMatchObject({ status: 404 });
    expect(await run(shoppingDesigneeOrEventOrganizer, organizer._id, { id: "abc" })).toMatchObject({ status: 400, body: INVALID });
    expect(await run(shoppingDesigneeOrEventOrganizer, "abc", { id: event._id })).toMatchObject({ status: 400, body: INVALID });
  });
});

describe("transferReceiptOwner (usa :id) — no se usa en ninguna ruta", () => {
  it("next() para el dueño del comprobante", async () => {
    const { member, event } = await base();
    const receipt = await createTransferReceipt({ event: event._id, user: member._id, amount: 10 });
    expect((await run(transferReceiptOwner, member._id, { id: receipt._id })).next).toHaveBeenCalledOnce();
  });

  it("403 para otro usuario", async () => {
    const { member, organizer, event } = await base();
    const receipt = await createTransferReceipt({ event: event._id, user: member._id, amount: 10 });
    expect(await run(transferReceiptOwner, organizer._id, { id: receipt._id })).toMatchObject({
      status: 403,
      body: { message: "Access denied. The user is not the owner of the receipt." },
    });
  });

  it("404 y 400 (con mensaje 'Invalid ID', distinto al resto)", async () => {
    const { member } = await base();
    expect(await run(transferReceiptOwner, member._id, { id: newId() })).toMatchObject({
      status: 404,
      body: { message: "The transfer receipt with the given ID does not exist." },
    });
    expect(await run(transferReceiptOwner, member._id, { id: "abc" })).toMatchObject({ status: 400, body: { message: "Invalid ID" } });
  });
});
