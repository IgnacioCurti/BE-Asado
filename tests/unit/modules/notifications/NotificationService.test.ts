import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NotificationService } from "../../../../src/modules/notifications/NotificationService.js";

const id = () => new mongoose.Types.ObjectId();
const NOW = new Date("2026-03-01T12:00:00Z");

function user(name: string, notifications: Record<string, boolean> = {}) {
  return { name, email: `${name.toLowerCase()}@test.com`, notifications };
}

const organizer = id();
const member = id();
const GROUP = { name: "Amigos", members: [organizer, member] };
const activeEvent = (fields: Record<string, unknown> = {}) => ({
  state: "available",
  group: id(),
  organizer,
  ...fields,
});

function setup() {
  const deps = {
    events: { findById: vi.fn(), findByIdWithMembers: vi.fn() },
    groups: { findById: vi.fn().mockResolvedValue(GROUP) },
    users: { findByIdsWithNotificationEnabled: vi.fn().mockResolvedValue([]) },
    reminders: { findDue: vi.fn().mockResolvedValue([]), deleteById: vi.fn() },
    debtors: { getDebtors: vi.fn().mockResolvedValue([]) },
    sendEmail: vi.fn().mockResolvedValue(undefined),
    templates: {
      newEvent: (e: string, g: string) => `new ${e} ${g}`,
      eventStart: (e: string) => `start ${e}`,
      penalizationStart: (e: string, p: number) => `pen ${e} ${p}`,
      penalizationOneWeek: (e: string, p: number) => `week ${e} ${p}`,
    },
    now: () => NOW,
  };
  vi.spyOn(console, "log").mockImplementation(() => {});
  return { service: new NotificationService(deps as any), ...deps };
}

describe("NotificationService.processDueReminders", () => {
  it("procesa cada recordatorio vencido según su tipo y lo borra", async () => {
    const { service, reminders, events, users, sendEmail } = setup();
    const eventId = id();
    const due = [
      { _id: id(), event: eventId, type: "newEvent" },
      { _id: id(), event: eventId, type: "desconocido" },
    ];
    reminders.findDue.mockResolvedValue(due);
    events.findById.mockResolvedValue(activeEvent());
    users.findByIdsWithNotificationEnabled.mockResolvedValue([user("Ana")]);

    expect(await service.processDueReminders()).toBe(due);

    expect(reminders.findDue).toHaveBeenCalledWith(NOW);
    expect(sendEmail).toHaveBeenCalledWith("ana@test.com", "FoodSpot | Nuevo evento", "Ana", `new ${eventId} Amigos`);
    expect(reminders.deleteById.mock.calls).toEqual([[String(due[0]._id)], [String(due[1]._id)]]);
  });
});

describe("NotificationService.notifyNewEvent", () => {
  it("evento cancelado: no manda mails", async () => {
    const { service, events, sendEmail } = setup();
    events.findById.mockResolvedValue(activeEvent({ state: "cancelled" }));
    await service.notifyNewEvent("e");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("busca a los miembros del grupo del evento, sin el organizador, con el aviso activado", async () => {
    const { service, events, groups, users, sendEmail } = setup();
    const event = activeEvent();
    events.findById.mockResolvedValue(event);
    users.findByIdsWithNotificationEnabled.mockResolvedValue([user("Ana")]);
    await service.notifyNewEvent("e");
    expect(groups.findById).toHaveBeenCalledWith(String(event.group));
    expect(users.findByIdsWithNotificationEnabled).toHaveBeenCalledWith([member], "newEvent");
    expect(sendEmail).toHaveBeenCalledWith("ana@test.com", "FoodSpot | Nuevo evento", "Ana", "new e Amigos");
  });

  it("si el organizador es el único miembro, no busca usuarios", async () => {
    const { service, events, groups, users, sendEmail } = setup();
    events.findById.mockResolvedValue(activeEvent());
    groups.findById.mockResolvedValue({ name: "Solo", members: [organizer] });
    await service.notifyNewEvent("e");
    expect(users.findByIdsWithNotificationEnabled).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("evento inexistente: registra el error sin lanzar", async () => {
    const { service, events } = setup();
    events.findById.mockResolvedValue(null);
    await expect(service.notifyNewEvent("e")).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith("Event with ID e not found.");
  });

  it("grupo inexistente: registra el error sin lanzar", async () => {
    const { service, events, groups, sendEmail } = setup();
    const event = activeEvent();
    events.findById.mockResolvedValue(event);
    groups.findById.mockResolvedValue(null);
    await expect(service.notifyNewEvent("e")).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(`Group with ID ${event.group} not found.`);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("si falla un mail, sigue con el resto", async () => {
    const { service, events, users, sendEmail } = setup();
    events.findById.mockResolvedValue(activeEvent());
    users.findByIdsWithNotificationEnabled.mockResolvedValue([user("Ana"), user("Beto")]);
    sendEmail.mockRejectedValueOnce(new Error("brevo down"));
    await service.notifyNewEvent("e");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe("NotificationService avisos por preferencia", () => {
  it("eventStart: solo a los miembros con el aviso activado", async () => {
    const { service, events, sendEmail } = setup();
    events.findByIdWithMembers.mockResolvedValue({
      state: "closed",
      members: [user("Ana", { eventStart: true }), user("Beto", { eventStart: false })],
    });
    await service.notifyEventStart("e");
    expect(sendEmail.mock.calls.map((c) => c[2])).toEqual(["Ana"]);
  });

  it.each([
    ["notifyPenalizationStart", "penalizationStart", "pen e 10"],
    ["notifyPenalizationOneWeek", "penalizationOneWeek", "week e 10"],
  ] as const)("%s: solo a los deudores con el aviso activado", async (method, key, message) => {
    const { service, events, debtors, sendEmail } = setup();
    events.findById.mockResolvedValue({ state: "readyforpayment", penalization: 10 });
    debtors.getDebtors.mockResolvedValue([user("Ana", { [key]: true }), user("Beto", { [key]: false })]);
    await service[method]("e");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][3]).toBe(message);
  });
});
