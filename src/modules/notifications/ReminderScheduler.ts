import mongoose from "mongoose";
import { IEvent, IReminder } from "../../models/interfaces.js";
import { nowArgentina } from "../../utils/dates.js";
import { ReminderRepository } from "./ReminderRepository.js";

const EVENT_START_NOTICE_MS: number = 30 * 60 * 1000;
const ONE_WEEK_MS: number = 7 * 24 * 60 * 60 * 1000;

// Programa los recordatorios por mail de un evento. Los envía reminderCheck
// (cron), que borra cada recordatorio al enviarlo.
export class ReminderScheduler {
  constructor(
    private readonly reminders: Pick<ReminderRepository, "findByEvent" | "create" | "save" | "deleteByEvent">,
    private readonly now: () => Date = nowArgentina
  ) {}

  // Aviso de evento nuevo: lo manda el próximo reminderCheck, así crear el
  // evento no espera un mail por cada usuario suscripto.
  async scheduleNewEvent(eventId: mongoose.Types.ObjectId): Promise<void> {
    await this.reminders.create({ event: eventId, type: "newEvent", datetime: this.now() });
  }

  // Recordatorio 30 minutos antes del evento y, si hay penalización, a las
  // 20 h (Argentina) del día anterior a que empiece y una semana después.
  async syncWithEvent(event: IEvent): Promise<void> {
    const reminders: IReminder[] = await this.reminders.findByEvent(event._id);
    await this.upsert(reminders, event, "eventStart", new Date(event.datetime.getTime() - EVENT_START_NOTICE_MS));

    if (event.penalizationStartDate && event.penalization > 0) {
      const penalizationReminderDate: Date = new Date(event.penalizationStartDate);
      penalizationReminderDate.setUTCDate(penalizationReminderDate.getUTCDate() - 1);
      penalizationReminderDate.setUTCHours(20, 0, 0, 0);
      await this.upsert(reminders, event, "penalizationStart", penalizationReminderDate);
      await this.upsert(
        reminders,
        event,
        "penalizationOneWeek",
        new Date(penalizationReminderDate.getTime() + ONE_WEEK_MS)
      );
    }
  }

  // Un error al borrar recordatorios no debe hacer fallar la operación del evento.
  async cancelForEvent(eventId: mongoose.Types.ObjectId): Promise<void> {
    try {
      await this.reminders.deleteByEvent(eventId);
    } catch (error) {
      console.error("Error deleting reminders:", error);
    }
  }

  // Un recordatorio que falta nunca se necesitó o ya se envió, así que solo
  // se crean los que todavía están en el futuro.
  private async upsert(
    reminders: IReminder[],
    event: IEvent,
    type: IReminder["type"],
    datetime: Date
  ): Promise<void> {
    const existing: IReminder | undefined = reminders.find((reminder) => reminder.type === type);
    if (existing) {
      existing.datetime = datetime;
      await this.reminders.save(existing);
      return;
    }
    if (datetime <= this.now()) return;
    await this.reminders.create({ event: event._id, type, datetime });
  }
}
