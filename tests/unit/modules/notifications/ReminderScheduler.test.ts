import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { ReminderScheduler } from "../../../../src/modules/notifications/ReminderScheduler.js";

const NOW = new Date("2026-03-01T12:00:00Z");

function setup(existing: any[] = []) {
  const reminders = {
    findByEvent: vi.fn().mockResolvedValue(existing),
    create: vi.fn(),
    save: vi.fn(),
    deleteByEvent: vi.fn(),
  };
  return { scheduler: new ReminderScheduler(reminders as any, () => NOW), reminders };
}

const eventId = new mongoose.Types.ObjectId();

describe("ReminderScheduler.syncWithEvent", () => {
  it("crea el aviso 30 minutos antes y los de penalización (20 h del día anterior y una semana después)", async () => {
    const { scheduler, reminders } = setup();
    await scheduler.syncWithEvent({
      _id: eventId,
      datetime: new Date("2026-03-10T21:00:00Z"),
      penalization: 10,
      penalizationStartDate: new Date("2026-03-15T00:00:00Z"),
    } as any);

    expect(reminders.create.mock.calls.map(([r]) => [r.type, r.datetime.toISOString()])).toEqual([
      ["eventStart", "2026-03-10T20:30:00.000Z"],
      ["penalizationStart", "2026-03-14T20:00:00.000Z"],
      ["penalizationOneWeek", "2026-03-21T20:00:00.000Z"],
    ]);
  });

  it("actualiza los existentes y no crea los que ya pasaron", async () => {
    const existing = { type: "eventStart", datetime: new Date(0) };
    const { scheduler, reminders } = setup([existing]);
    await scheduler.syncWithEvent({
      _id: eventId,
      datetime: new Date("2026-03-10T21:00:00Z"),
      penalization: 10,
      penalizationStartDate: new Date("2026-02-01T00:00:00Z"),
    } as any);

    expect(existing.datetime.toISOString()).toBe("2026-03-10T20:30:00.000Z");
    expect(reminders.save).toHaveBeenCalledWith(existing);
    expect(reminders.create).not.toHaveBeenCalled();
  });

  it("sin penalización solo programa el inicio", async () => {
    const { scheduler, reminders } = setup();
    await scheduler.syncWithEvent({ _id: eventId, datetime: new Date("2026-03-10T21:00:00Z"), penalization: 0 } as any);
    expect(reminders.create).toHaveBeenCalledTimes(1);
  });
});

describe("ReminderScheduler", () => {
  it("scheduleNewEvent programa el aviso para ahora", async () => {
    const { scheduler, reminders } = setup();
    await scheduler.scheduleNewEvent(eventId);
    expect(reminders.create).toHaveBeenCalledWith({ event: eventId, type: "newEvent", datetime: NOW });
  });

  it("cancelForEvent no propaga errores", async () => {
    const { scheduler, reminders } = setup();
    reminders.deleteByEvent.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(scheduler.cancelForEvent(eventId)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
