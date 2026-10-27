import { Request, Response } from "express";
import { sendEmail } from "../utils/utils.js";
import { Event } from "../models/event.js";
import { User } from "../models/user.js";
import { Reminder } from "../models/reminder.js";
import { getEventsDebtors } from "../utils/utils.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import {
  eventStartTemplate,
  newEventTemplate,
  penalizationStartTemplate,
  penalizationOneWeekTemplate,
} from "../utils/templates.js";
import {
  IUser,
  IEventWithMembers,
  IEvent,
  IReminder,
} from "../models/interfaces.js";

export async function notifyNewEvent(eventId: string): Promise<void> {
  try {
    const users: IUser[] = await User.find({ "notifications.newEvent": true });
    const message: string = newEventTemplate(eventId);

    for (const user of users) {
      const email: string = user.alternativeEmail
        ? user.alternativeEmail
        : user.email;
      await sendEmail(email, "FoodSpot | Nuevo evento", user.name, message);
      console.log(
        `Notification sent to ${user.name} (${email}) for new event ${eventId}`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying new event");
  }
}

export async function notifyEventStart(eventId: string): Promise<void> {
  try {
    const event: IEventWithMembers | null = await Event.findById(
      eventId
    ).populate("members");

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    if (event.state === "cancelled") {
      return;
    }
    const message: string = eventStartTemplate(eventId);
    for (const user of event.members) {
      if (!user.notifications.eventStart) continue;
      const email: string = user.alternativeEmail
        ? user.alternativeEmail
        : user.email;
      await sendEmail(
        email,
        "FoodSpot | Tu evento comienza pronto",
        user.name,
        message
      );
      console.log(
        `Notification sent to ${user.name} (${email}) for event ${eventId} start`
      );
    }
  } catch (error: any) {
    console.log(error?.message || "Error notifying event start");
  }
}

export async function notifyPenalizationStart(eventId: string): Promise<void> {
  try {
    const event: IEvent | null = await Event.findById(eventId);

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    if (event.state === "cancelled") {
      return;
    }

    const debtors = await getEventsDebtors(eventId);
    const message = penalizationStartTemplate(eventId, event.penalization);
    for (const user of debtors) {
      if (!user.notifications.penalizationStart) continue;
      const email = user.alternativeEmail ? user.alternativeEmail : user.email;
      await sendEmail(
        email,
        "FoodSpot | La penalización está por empezar",
        user.name,
        message
      );
      console.log(
        `Notification sent to ${user.name} (${email}) for event ${eventId} penalization start`
      );
    }
  } catch (error) {
    console.log(error?.message || "Error notifying penalization start");
  }
}

export async function notifyPenalizationOneWeek(
  eventId: string
): Promise<void> {
  try {
    const event: IEvent | null = await Event.findById(eventId);

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    if (event.state === "cancelled") {
      return;
    }

    const debtors: IUser[] = await getEventsDebtors(eventId);
    const message: string = penalizationOneWeekTemplate(
      eventId,
      event.penalization
    );

    for (const user of debtors) {
      if (!user.notifications.penalizationOneWeek) continue;
      const email: string = user.alternativeEmail
        ? user.alternativeEmail
        : user.email;
      await sendEmail(
        email,
        "FoodSpot | La penalización ha estado en curso durante una semana",
        user.name,
        message
      );
      console.log(
        `Notification sent to ${user.name} (${email}) for event ${eventId} penalization one week`
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
    const date: Date = new Date();
    date.setHours(date.getHours() - 3);
    const reminders: IReminder[] = await Reminder.find({
      datetime: { $lte: date },
    });
    for (const reminder of reminders) {
      const eventId: string = reminder.event.toString();
      switch (reminder.type) {
        case "eventStart":
          await notifyEventStart(eventId);
          console.log(
            `Notification sent for event start reminder for event ${eventId}`
          );
          break;
        case "penalizationStart":
          await notifyPenalizationStart(eventId);
          console.log(
            `Notification sent for penalization start reminder for event ${eventId}`
          );
          break;
        case "penalizationOneWeek":
          await notifyPenalizationOneWeek(eventId);
          console.log(
            `Notification sent for penalization one week reminder for event ${eventId}`
          );
          break;
        default:
          break;
      }
      await Reminder.findByIdAndDelete(reminder._id);
    }
    return res.status(STATUS_CODES.OK).json({ data: reminders });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
