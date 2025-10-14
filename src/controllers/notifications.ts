import { Request, Response } from "express";
import { sendEmail } from "../utils/utils";
import { STATUS_CODES } from "../constants/httpStatusCode";
import {
  eventStartTemplate,
  newEventTemplate,
  penalizationStartTemplate,
  penalizationOneWeekTemplate,
} from "../utils/templates";
import { IUser, IEventWithMembers, IReminder } from "../models/interfaces";
import { find as findUsers } from "../repositories/usersRepository";
import {
  findById,
  findByIdAndPopulate,
  getEventsDebtors,
} from "../repositories/eventsRepository";
import {
  findByIdAndDelete as findReminderByIdAndDelete,
  find as findReminders,
  ReminderType,
} from "../repositories/remindersRepository";

export async function notifyNewEvent(eventId: string): Promise<void> {
  try {
    const users = await findUsers<IUser>({ "notifications.newEvent": true });
    const message = newEventTemplate(eventId);

    for (const user of users) {
      const { alternativeEmail, email, name } = user;
      const destinationEmail = alternativeEmail || email;
      await sendEmail(
        destinationEmail,
        "FoodSpot | Nuevo evento",
        name,
        message
      );
      console.log(
        `Notification sent to ${name} (${destinationEmail}) for new event ${eventId}`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying new event");
  }
}

export async function notifyEventStart(eventId: string): Promise<void> {
  try {
    const event = await findByIdAndPopulate<IEventWithMembers>(eventId, [
      "members",
    ]);

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    const message = eventStartTemplate(eventId);
    for (const {
      alternativeEmail,
      email,
      name,
      notifications: { eventStart },
    } of event.members) {
      if (!eventStart) continue;
      const destinationEmail = alternativeEmail || email;
      await sendEmail(
        email,
        "FoodSpot | Tu evento comienza pronto",
        name,
        message
      );
      console.log(
        `Notification sent to ${name} (${destinationEmail}) for event ${eventId} start`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying event start");
  }
}

export async function notifyPenalizationStart(eventId: string): Promise<void> {
  try {
    const event = await findById(eventId);

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    const debtors = await getEventsDebtors(eventId);
    const message = penalizationStartTemplate(eventId, event.penalization ?? 0);
    for (const {
      alternativeEmail,
      email,
      name,
      notifications: { penalizationStart },
    } of debtors) {
      if (!penalizationStart) continue;

      const destinationEmail = alternativeEmail || email;
      await sendEmail(
        destinationEmail,
        "FoodSpot | La penalización está por empezar",
        name,
        message
      );
      console.log(
        `Notification sent to ${name} (${destinationEmail}) for event ${eventId} penalization start`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying penalization start");
  }
}

export async function notifyPenalizationOneWeek(
  eventId: string
): Promise<void> {
  try {
    const event = await findById(eventId);

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    const debtors = await getEventsDebtors(eventId);
    const message = penalizationOneWeekTemplate(
      eventId,
      event.penalization ?? 0
    );

    for (const {
      alternativeEmail,
      email,
      name,
      notifications: { penalizationOneWeek },
    } of debtors) {
      if (!penalizationOneWeek) continue;
      const destinationEmail = alternativeEmail || email;
      await sendEmail(
        destinationEmail,
        "FoodSpot | La penalización ha estado en curso durante una semana",
        name,
        message
      );
      console.log(
        `Notification sent to ${name} (${destinationEmail}) for event ${eventId} penalization one week`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying penalization one week");
  }
}

export async function reminderCheck(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const date = new Date();
    date.setHours(date.getHours() - 3);
    const reminders = await findReminders<IReminder>({
      datetime: { $lte: date },
    });
    for (const { _id, event, type } of reminders) {
      const eventId = event.toString();
      switch (type) {
        case ReminderType.eventStart:
          await notifyEventStart(eventId);
          console.log(
            `Notification sent for event start reminder for event ${eventId}`
          );
          break;
        case ReminderType.penalizationStart:
          await notifyPenalizationStart(eventId);
          console.log(
            `Notification sent for penalization start reminder for event ${eventId}`
          );
          break;
        case ReminderType.penalizationOneWeek:
          await notifyPenalizationOneWeek(eventId);
          console.log(
            `Notification sent for penalization one week reminder for event ${eventId}`
          );
          break;
        default:
          break;
      }
      await findReminderByIdAndDelete(_id);
    }
    return res.status(STATUS_CODES.OK).json({ data: reminders });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
