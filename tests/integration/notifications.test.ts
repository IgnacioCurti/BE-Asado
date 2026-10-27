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
  updateEvent,
} from "../helpers/fixtures.js";
import { sentEmails, setBrevoResponseStatus } from "../helpers/mailer.js";
import { getEventsDebtors } from "../../src/utils/utils.js";
import { User } from "../../src/models/user.js";
import mongoose from "mongoose";

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
    it("notifica a los miembros con notifications.eventStart (siempre al email principal)", async () => {
      const a = await createUser({ name: "A", notifications: ALL_ON });
      const b = await createUser({ name: "B", notifications: ALL_OFF });
      const c = await createUser({ name: "C", notifications: ALL_ON });
      // un alternativeEmail que haya quedado en la base de antes ya no se usa
      await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(c._id) }, { $set: { alternativeEmail: "c@gmail.com" } });
      const notMember = await createUser({ notifications: ALL_ON });
      const event = await createEvent({ organizer: a._id, members: [a._id, b._id, c._id] });
      await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails.map((m) => m.payload.to[0])).toEqual([
        { email: a.email, name: "A" },
        { email: c.email, name: "C" },
      ]);
      expect(sentEmails.map((m) => m.payload.to[0].email)).not.toContain(notMember.email);
      for (const mail of sentEmails) {
        expect(mail.payload.subject).toBe("FoodSpot | Tu evento comienza pronto");
        expect(mail.payload.htmlContent).toContain(`https://food-spot.vercel.app/event/${event._id}`);
      }
    });

    it("si Brevo falla con un destinatario, igual intenta con el resto y borra el recordatorio", async () => {
      const a = await createUser({ notifications: ALL_ON });
      const b = await createUser({ notifications: ALL_ON });
      const event = await createEvent({ organizer: a._id, members: [a._id, b._id] });
      await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });
      setBrevoResponseStatus(500);

      const res = await api().get("/api/cron/reminderCheck");

      expect(res.status).toBe(200);
      expect(sentEmails.map((m) => m.payload.to[0].email)).toEqual([a.email, b.email]);
      expect(await countReminders()).toBe(0);
    });

    it("no notifica si el evento está cancelado, y borra el recordatorio", async () => {
      const a = await createUser({ notifications: ALL_ON });
      const event = await createEvent({ organizer: a._id, members: [a._id], state: "cancelled" });
      await createReminder({ event: event._id, type: "eventStart", datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
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

  const PENALIZATION_SUBJECTS = {
    penalizationStart: "FoodSpot | La penalización está por empezar",
    penalizationOneWeek: "FoodSpot | La penalización ha estado en curso durante una semana",
  };

  describe.each(["penalizationStart", "penalizationOneWeek"] as const)("%s", (type) => {
    async function debtScenario(betoOverrides: Parameters<typeof createUser>[0] = {}) {
      const ana = await createUser({ name: "Ana", notifications: ALL_ON });
      const beto = await createUser({ name: "Beto", notifications: ALL_ON, ...betoOverrides });
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

    it("un deudor SIN comprobante recibe el mail (y el acreedor no)", async () => {
      const { beto, event } = await debtScenario();
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      const res = await api().get("/api/cron/reminderCheck");

      expect(res.status).toBe(200);
      expect(sentEmails.map((m) => m.payload.to[0])).toEqual([{ email: beto.email, name: "Beto" }]);
      expect(sentEmails[0].payload.subject).toBe(PENALIZATION_SUBJECTS[type]);
      expect(sentEmails[0].payload.htmlContent).toContain(`https://food-spot.vercel.app/event/${event._id}`);
      expect(await countReminders()).toBe(0);
    });

    it("un deudor CON comprobante sin aprobar también recibe el mail", async () => {
      const { ana, beto, event } = await debtScenario();
      await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails.map((m) => m.payload.to[0].email)).toEqual([beto.email]);
    });

    it("un deudor con el pago aprobado no recibe el mail", async () => {
      const { ana, beto, event } = await debtScenario();
      await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id, hasPaid: true });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
    });

    it("ignora un alternativeEmail heredado en la base: manda al email principal", async () => {
      const { beto, event } = await debtScenario();
      await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(beto._id) }, { $set: { alternativeEmail: "beto@gmail.com" } });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails.map((m) => m.payload.to[0])).toEqual([{ email: beto.email, name: "Beto" }]);
    });

    it("no notifica si el evento está cancelado", async () => {
      const { event } = await debtScenario();
      await updateEvent(event._id, { state: "cancelled" });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
    });

    it(`respeta notifications.${type} = false`, async () => {
      const { event } = await debtScenario({ notifications: { ...ALL_ON, [type]: false } });
      await createReminder({ event: event._id, type, datetime: hoursAgo(4) });

      await api().get("/api/cron/reminderCheck").expect(200);

      expect(sentEmails).toHaveLength(0);
      expect(await countReminders()).toBe(0);
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

  const ids = (users: { _id: unknown }[]) => users.map((u) => String(u._id)).sort();

  it("devuelve a los deudores que no subieron comprobante", async () => {
    const { beto, caro, event } = await debtScenario();
    const debtors = await getEventsDebtors(event._id);
    expect(ids(debtors)).toEqual(ids([beto, caro]));
  });

  it("cuenta como deudor a quien tiene el comprobante sin aprobar, no a quien ya fue aprobado", async () => {
    const { ana, beto, caro, event } = await debtScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: ana._id, hasPaid: true });
    const debtors = await getEventsDebtors(event._id);
    expect(ids(debtors)).toEqual(ids([beto]));
  });

  it("si todos tienen el pago aprobado devuelve []", async () => {
    const { ana, beto, caro, event } = await debtScenario();
    await createTransferReceipt({ event: event._id, user: beto._id, amount: 100, receiver: ana._id, hasPaid: true });
    await createTransferReceipt({ event: event._id, user: caro._id, amount: 100, receiver: ana._id, hasPaid: true });
    await expect(getEventsDebtors(event._id)).resolves.toEqual([]);
  });
});
