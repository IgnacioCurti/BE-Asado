import { Request, Response } from "express";
import mongoose from "mongoose";
import { Event } from "../models/event.js";
import { User } from "../models/user.js";
import { TransferReceipt } from "../models/transferReceipt.js";
import { PurchaseReceipt } from "../models/purchaseReceipt.js";
import { Image } from "../models/image.js";
import { Rating } from "../models/rating.js";
import { Reminder } from "../models/reminder.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { nowArgentina } from "../utils/dates.js";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IEventWithPurchaseReceiptsOptions,
  IEventWithTransferReceiptsPurchaseReceiptsRatings,
  IMemberWhoHasUploaded,
  IPublicEvent,
  IPublicEventPreReduction,
  IPurchaseReceipt,
  IPurchaseReceiptWithUsers,
  IReminder,
  IRequestWithUser,
  ITransferInfo,
  IUser,
  IUserBalance,
} from "../models/interfaces.js";

const eventNotFoundMessage: string =
  "The event with the given ID was not found.";

// A missing reminder was either never needed or already sent (reminderCheck
// deletes them), so only create the ones that are still due in the future.
async function upsertReminder(
  reminders: IReminder[],
  event: IEvent,
  type: IReminder["type"],
  datetime: Date
): Promise<void> {
  const existing: IReminder | undefined = reminders.find(
    (reminder) => reminder.type === type
  );
  if (existing) {
    existing.datetime = datetime;
    await existing.save();
    return;
  }
  if (datetime <= nowArgentina()) return;
  await new Reminder({ event: event._id, type, datetime }).save();
}

async function updateReminders(event: IEvent): Promise<void> {
  const reminders: IReminder[] = await Reminder.find({ event: event._id });
  await upsertReminder(
    reminders,
    event,
    "eventStart",
    new Date(event.datetime.getTime() - 30 * 60 * 1000)
  );

  if (event.penalizationStartDate && event.penalization > 0) {
    const penalizationReminderDate: Date = new Date(
      event.penalizationStartDate
    );
    penalizationReminderDate.setUTCDate(
      penalizationReminderDate.getUTCDate() - 1
    );
    penalizationReminderDate.setUTCHours(20, 0, 0, 0); // 8 PM (Argentina) the day before penalization starts
    await upsertReminder(
      reminders,
      event,
      "penalizationStart",
      penalizationReminderDate
    );
    await upsertReminder(
      reminders,
      event,
      "penalizationOneWeek",
      new Date(penalizationReminderDate.getTime() + 7 * 24 * 60 * 60 * 1000)
    );
  }
}

// Fields a client may set when creating an event. State and the related
// collections (receipts, ratings, options) are managed by the backend.
const CREATE_EVENT_FIELDS: string[] = [
  "title",
  "datetime",
  "description",
  "memberLimit",
  "members",
  "organizer",
  "shoppingDesignee",
  "isPrivate",
  "penalization",
  "penalizationStartDate",
];

export async function createEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const fields: Record<string, unknown> = Object.fromEntries(
      CREATE_EVENT_FIELDS.filter((field) => field in req.body).map((field) => [
        field,
        req.body[field],
      ])
    );
    let event: IEvent = new Event(fields);
    event.chef = req.body.isChef ? req.body.organizer : null;
    if (req.body.isShoppingDesignee)
      event.shoppingDesignee.push(req.body.organizer);
    event = await event.save();
    await deleteEvents();
    if (!event.isPrivate) {
      // Sent by the next reminderCheck run, so creating the event doesn't
      // wait for one email per subscribed user.
      await new Reminder({
        event: event._id,
        type: "newEvent",
        datetime: nowArgentina(),
      }).save();
    }
    await updateReminders(event);
    return res.status(STATUS_CODES.CREATED).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

async function deleteReminders(
  eventId: mongoose.Types.ObjectId
): Promise<void> {
  try {
    await Reminder.deleteMany({ event: eventId });
  } catch (error) {
    console.error("Error deleting reminders:", error);
  }
}

export async function deleteEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const event = await Event.findById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    await deleteReceipts(event._id);
    await deleteReminders(event._id);
    await Event.findByIdAndDelete(req.params.id);
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

async function deleteEvents(): Promise<void> {
  const totalEvents: number = await Event.count({ isPrivate: false });
  if (totalEvents > 6) {
    let matches: IEvent[] = await Event.find({
      state: {
        $in: ["finished", "cancelled"],
      },
    }).sort({ datetime: "asc" });
    const eventsToDelete: number = Math.min(totalEvents - 6, matches.length);

    for (let i = 0; i < eventsToDelete; i++) {
      const deletedId: mongoose.Types.ObjectId = matches[0]._id;
      matches = matches.slice(1);
      await deleteReminders(deletedId);
      await deleteReceipts(deletedId);
      const deletedEvent: IEvent | null = await Event.findByIdAndDelete(
        deletedId
      );
    }
  }
}

async function deleteReceipts(eventId: mongoose.Types.ObjectId): Promise<void> {
  const event: IEventWithTransferReceiptsPurchaseReceiptsRatings =
    await Event.findById(eventId).populate([
      "transferReceipts",
      "purchaseReceipts",
      "ratings",
    ]);

  await Promise.all(
    event.transferReceipts.map(async (transferReceipt) => {
      if (transferReceipt.image)
        await Image.findByIdAndDelete(transferReceipt.image);
      await TransferReceipt.findByIdAndDelete(transferReceipt._id);
    })
  );

  await Promise.all(
    event.purchaseReceipts.map(async (purchaseReceipt) => {
      if (purchaseReceipt.image)
        await Image.findByIdAndDelete(purchaseReceipt.image);
      await PurchaseReceipt.findByIdAndDelete(purchaseReceipt._id);
    })
  );

  await Promise.all(
    event.ratings.map(async (rating) => {
      await Rating.findByIdAndDelete(rating);
    })
  );
}

