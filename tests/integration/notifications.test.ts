import { describe, expect, it } from "vitest";
import { api } from "../helpers/api.js";
import {
  countReminders,
  createEvent,
  createPurchaseReceipt,
  createReminder,
  createTransferReceipt,
  createUser,
  findReminders,
  newId,
} from "../helpers/fixtures.js";
import { sentEmails, setBrevoResponseStatus } from "../helpers/mailer.js";
import { getEventsDebtors } from "../../src/utils/utils.js";

const HOUR: number = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);

const ALL_ON = { newEvent: true, eventStart: true, penalizationStart: true, penalizationOneWeek: true };
const ALL_OFF = { newEvent: false, eventStart: false, penalizationStart: false, penalizationOneWeek: false };

describe("GET /api/cron/reminderCheck", () => {
  it("es público y sin recordatorios responde { data: [] }", async () => {
    const res = await api().get("/api/cron/reminderCheck");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it("solo procesa recordatorios con fecha <= ahora - 3 horas, y los borra", async () => {
    const organizer = await createUser();
    const event = await createEvent({ organizer: organizer._id });
    const due = await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });
    await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(2) });
    await createReminder({ event: event._id, type: "eventStart", datetime: new Date(Date.now() + 24 * HOUR) });

    const res = await api().get("/api/cron/reminderCheck");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ _id: due._id, type: "eventStart", event: event._id, datetime: due.datetime }),
    ]);
    const remaining = await findReminders(event._id);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r._id)).not.toContain(due._id);
  });

  it("una segunda ejecución no reprocesa lo ya enviado", async () => {
    const organizer = await createUser({ notifications: ALL_ON });
    const event = await createEvent({ organizer: organizer._id, members: [organizer._id] });
    await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(5) });
    await api().get("/api/cron/reminderCheck").expect(200);
    const second = await api().get("/api/cron/reminderCheck");
    expect(second.body).toEqual({ data: [] });
    expect(sentEmails).toHaveLength(1);
  });

  describe("eventStart", () => {
    it("notifica a los miembros con notifications.eventStart (al email alternativo si tienen)", async () => {
      const a = await createUser({ name: "A", notifications: ALL_ON });
      const b = await createUser({ name: "B", notifications: ALL_OFF });
      const c = await createUser({ name: "C", alternativeEmail: "c@gmail.com", notifications: ALL_ON });
      const notMember = await createUser({ notifications: ALL_ON });
      const event = await createEvent({ organizer: a._id, members: [a._id, b._id, c._id] });
      await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails.map((m) => m.payload.to[0])).toEqual([
        { email: a.email, name: "A" },
        { email: "c@gmail.com", name: "C" },
      ]);
      expect(sentEmails.map((m) => m.payload.to[0].email)).not.toContain(notMember.email);
      for (const mail of sentEmails) {
        expect(mail.payload.subject).toBe("FoodSpot | Tu evento comienza pronto");
        expect(mail.payload.htmlContent).toContain(`https://food-spot.vercel.app/event/${event._id}`);
      }
    });

    it("si Brevo falla, el recordatorio se borra igual y deja de notificar al resto", async () => {
      const a = await createUser({ notifications: ALL_ON });
      const b = await createUser({ notifications: ALL_ON });
      const event = await createEvent({ organizer: a._id, members: [a._id, b._id] });
      await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });
      setBrevoResponseStatus(500);

      const res = await api().get("/api/cron/reminderCheck");

      expect(res.status).toBe(200);
      expect(sentEmails).toHaveLength(1);
      expect(await countReminders()).toBe(0);
    });

    it("si el evento ya no existe, borra el recordatorio sin fallar", async () => {
      await createReminder({ event: newId(), type: "eventStart", datetime: hoursAgo(4) });
      const res = await api().get("/api/cron/reminderCheck");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(await countReminders()).toBe(0);
      expect(sentEmails).toHaveLength(0);
    });
  });

  describe.each(["penalizationStart", "penalizationOneWeek"] as const)("%s", (type) => {
    async function debtScenario() {
      const ana = await createUser({ name: "Ana", notifications: ALL_ON });
      const beto = await createUser({ name: "Beto", notifications: ALL_ON });
      const event = await createEvent({
        organizer: ana._id,
        members: [ana._id, beto._id],
        shoppingDesignee: [ana._id],
        state: "readyforpayment",
        penalization: 150,
      });
      await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 200, participants: [ana._id, beto._id] });
      return { ana, beto, event };
    }

    it("[BUG - comportamiento actual] un deudor SIN comprobante no recibe el mail (getEventsDebtors lanza TypeError)", async () => {
      const { event } = await debtScenario();
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      const res = await api().get("/api/cron/reminderCheck");

      expect(res.status).toBe(200);
      expect(sentEmails).toHaveLength(0);
      expect(await countReminders()).toBe(0);
    });

    it("[BUG - comportamiento actual] un deudor CON comprobante sin aprobar tampoco recibe el mail", async () => {
      const { ana, beto, event } = await debtScenario();
      await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
    });

    it("si el evento no existe, borra el recordatorio sin fallar", async () => {
      await createReminder({ event: newId(), type, datetime: hoursAgo(4) });
      expect((await api().get("/api/cron/reminderCheck")).status).toBe(200);
      expect(await countReminders()).toBe(0);
    });
  });
});

describe("getEventsDebtors (utils)", () => {
  async function debtScenario() {
    const ana = await createUser();
    const beto = await createUser();
    const caro = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id], state: "readyforpayment" });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: ana._id, amount: 300, participants: [ana._id, beto._id, caro._id] });
    return { ana, beto, caro, event };
  }

  it("lanza si el evento no existe", async () => {
    const id = newId();
    await expect(getEventsDebtors(id)).rejects.toThrow(`Event with ID ${id} not found.`);
  });

  it("sin comprobantes de compra devuelve []", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id });
    await expect(getEventsDebtors(event._id)).resolves.toEqual([]);
  });

  it("[BUG - comportamiento actual] lanza TypeError cuando algún deudor no subió comprobante", async () => {
    const { event } = await debtScenario();
    await expect(getEventsDebtors(event._id)).rejects.toThrow(TypeError);
  });

  it("[BUG - comportamiento actual] si todos los deudores subieron comprobante devuelve [] (nunca devuelve deudores)", async () => {
    const { ana, beto, caro, event } = await debtScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: ana._id, hasPaid: true });
    await expect(getEventsDebtors(event._id)).resolves.toEqual([]);
  });
});
