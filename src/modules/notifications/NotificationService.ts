import { IEvent, IEventWithMembers, IGroup, IReminder, IUser } from "../../models/interfaces.js";
import { nowArgentina } from "../../utils/dates.js";
import { EventRepository } from "../events/EventRepository.js";
import { GroupRepository } from "../groups/GroupRepository.js";
import { TransferReceiptService } from "../transferReceipts/TransferReceiptService.js";
import { UserRepository } from "../users/UserRepository.js";
import { ReminderRepository } from "./ReminderRepository.js";

type SendEmail = (email: string, subject: string, name: string, html: string) => Promise<void>;

export interface NotificationTemplates {
  newEvent: (eventId: string, groupName: string) => string;
  eventStart: (eventId: string) => string;
  penalizationStart: (eventId: string, penalization: number) => string;
  penalizationOneWeek: (eventId: string, penalization: number) => string;
}

export interface NotificationServiceDeps {
  events: Pick<EventRepository, "findById" | "findByIdWithMembers">;
  groups: Pick<GroupRepository, "findById">;
  users: Pick<UserRepository, "findByIdsWithNotificationEnabled">;
  reminders: Pick<ReminderRepository, "findDue" | "deleteById">;
  debtors: Pick<TransferReceiptService, "getDebtors">;
  sendEmail: SendEmail;
  templates: NotificationTemplates;
  now?: () => Date;
}

// Envía los mails de los recordatorios vencidos. Lo dispara el cron
// (GET /api/cron/reminderCheck). Cada aviso falla por separado: un error se
// registra en el log y no corta el resto.
export class NotificationService {
  private readonly now: () => Date;

  constructor(private readonly deps: NotificationServiceDeps) {
    this.now = deps.now ?? nowArgentina;
  }

  // Procesa y borra cada recordatorio vencido. Devuelve los procesados.
  async processDueReminders(): Promise<IReminder[]> {
    const reminders: IReminder[] = await this.deps.reminders.findDue(this.now());
    for (const reminder of reminders) {
      const eventId: string = reminder.event.toString();
      switch (reminder.type) {
        case "newEvent":
          await this.notifyNewEvent(eventId);
          console.log(`Notification sent for new event reminder for event ${eventId}`);
          break;
        case "eventStart":
          await this.notifyEventStart(eventId);
          console.log(`Notification sent for event start reminder for event ${eventId}`);
          break;
        case "penalizationStart":
          await this.notifyPenalizationStart(eventId);
          console.log(`Notification sent for penalization start reminder for event ${eventId}`);
          break;
        case "penalizationOneWeek":
          await this.notifyPenalizationOneWeek(eventId);
          console.log(`Notification sent for penalization one week reminder for event ${eventId}`);
          break;
        default:
          break;
      }
      await this.deps.reminders.deleteById(String(reminder._id));
    }
    return reminders;
  }

  // A los miembros del grupo del evento con el aviso activado, salvo el
  // organizador, si el evento sigue activo. La lista de miembros se lee en esta
  // corrida del cron: incluye a quien entró al grupo después de crear el evento.
  async notifyNewEvent(eventId: string): Promise<void> {
    await this.logFailures("Error notifying new event", async () => {
      const event: IEvent = await this.getEvent(eventId);
      // El evento pudo cancelarse entre su creación y esta corrida del cron.
      if (event.state === "cancelled") return;
      const group: IGroup | null = await this.deps.groups.findById(String(event.group));
      if (!group) throw new Error(`Group with ID ${event.group} not found.`);
      const recipients = group.members.filter((member) => !member.equals(event.organizer));
      if (recipients.length === 0) return;
      const users: IUser[] = await this.deps.users.findByIdsWithNotificationEnabled(recipients, "newEvent");
      const message: string = this.deps.templates.newEvent(eventId, group.name);
      for (const user of users)
        await this.notifyUser(user, "FoodSpot | Nuevo evento", message, `new event ${eventId}`);
    });
  }

  async notifyEventStart(eventId: string): Promise<void> {
    await this.logFailures("Error notifying event start", async () => {
      const event: IEventWithMembers | null = await this.deps.events.findByIdWithMembers(eventId);
      if (!event) throw new Error(`Event with ID ${eventId} not found.`);
      if (event.state === "cancelled") return;
      const message: string = this.deps.templates.eventStart(eventId);
      for (const user of event.members) {
        if (!user.notifications.eventStart) continue;
        await this.notifyUser(user, "FoodSpot | Tu evento comienza pronto", message, `event ${eventId} start`);
      }
    });
  }

  async notifyPenalizationStart(eventId: string): Promise<void> {
    await this.logFailures("Error notifying penalization start", async () => {
      const event: IEvent = await this.getEvent(eventId);
      if (event.state === "cancelled") return;
      const debtors: IUser[] = await this.deps.debtors.getDebtors(eventId);
      const message: string = this.deps.templates.penalizationStart(eventId, event.penalization);
      for (const user of debtors) {
        if (!user.notifications.penalizationStart) continue;
        await this.notifyUser(
          user,
          "FoodSpot | La penalización está por empezar",
          message,
          `event ${eventId} penalization start`
        );
      }
    });
  }

  async notifyPenalizationOneWeek(eventId: string): Promise<void> {
    await this.logFailures("Error notifying penalization one week", async () => {
      const event: IEvent = await this.getEvent(eventId);
      if (event.state === "cancelled") return;
      const debtors: IUser[] = await this.deps.debtors.getDebtors(eventId);
      const message: string = this.deps.templates.penalizationOneWeek(eventId, event.penalization);
      for (const user of debtors) {
        if (!user.notifications.penalizationOneWeek) continue;
        await this.notifyUser(
          user,
          "FoodSpot | La penalización ha estado en curso durante una semana",
          message,
          `event ${eventId} penalization one week`
        );
      }
    });
  }

  private async getEvent(eventId: string): Promise<IEvent> {
    const event: IEvent | null = await this.deps.events.findById(eventId);
    if (!event) throw new Error(`Event with ID ${eventId} not found.`);
    return event;
  }

  private async logFailures(fallbackMessage: string, task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error: any) {
      console.log(error?.message || fallbackMessage);
    }
  }

  // Un mail fallido se registra y se saltea para que el resto lo reciba.
  private async notifyUser(user: IUser, subject: string, message: string, context: string): Promise<void> {
    const email: string = user.email;
    try {
      await this.deps.sendEmail(email, subject, user.name, message);
      console.log(`Notification sent to ${user.name} (${email}) for ${context}`);
    } catch (error: any) {
      console.log(`Error notifying ${user.name} (${email}) for ${context}: ${error?.message || "unknown error"}`);
    }
  }
}
