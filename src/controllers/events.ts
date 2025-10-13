import { Request, Response } from "express";
import { Event } from "../models/event";
import { STATUS_CODES } from "../constants/httpStatusCode";
import { notifyNewEvent } from "./notifications";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IEventWithPurchaseReceiptsOptions,
  IPublicEvent,
  IPublicEventPreReduction,
  IPurchaseReceipt,
  IRequestWithUser,
  IUser,
  ObjectId,
} from "../models/interfaces";
import {
  findById as findEventById,
  findByIdAndPopulate as findEventByIdAndPopulate,
  findEvents,
  findPublicAndPrivateEventsAndPopulate,
  findPublicEventsAndPopulate,
  EventState,
  findByIdAndDelete as findEventByIdAndDelete,
  countElements,
  findFinishedAndCanceledEvents,
  membersWhoHaveUploaded,
} from "../repositories/eventsRepository";
import {
  createReminder,
  deleteReminders,
  findById as findReminderById,
  ReminderType,
} from "../repositories/remindersRepository";
import { createObjectId, PopulateOption } from "../repositories/utils/mongoose";
import { findById as findUserById } from "../repositories/usersRepository";
import { deleteReceipts } from "../repositories/receiptsRepository";
import { assignEventValues, calculateTransfersInfo } from "../utils/balance";

const eventNotFoundMessage: string =
  "The event with the given ID was not found.";

export async function getEvents(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const events = await findEvents();
    return res.json(events);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getPublicEvents(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const events = await findPublicEventsAndPopulate();

    const publicEvents = reduceEventsInformation(events);

    return res.status(STATUS_CODES.OK).json(publicEvents);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getPublicAndPrivateEvents(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    const events = await findPublicAndPrivateEventsAndPopulate(req.user?._id);

    const allEvents = reduceEventsInformation(events);

    return res.status(STATUS_CODES.OK).json(allEvents);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getEventById(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const fieldsToPopulate: PopulateOption[] = [
      "members",
      "chef",
      "organizer",
      "shoppingDesignee",
      "transferReceipts",
      "purchaseReceipts",
      {
        path: "options",
        populate: {
          path: "participants",
          model: "User",
          select: "name lastName _id",
        },
      },
    ];
    const event = await findEventByIdAndPopulate<IEventPopulatedWithOptions>(
      req.params.id,
      fieldsToPopulate
    );
    return !event
      ? res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: eventNotFoundMessage })
      : res.json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getMembersAndReceiptsInfo(
  req: Request<{ event: string }>,
  res: Response
): Promise<Response> {
  try {
    const answer = await membersWhoHaveUploaded(req.params.event);
    return res.status(STATUS_CODES.OK).json(answer);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

async function updateReminders(event: IEvent): Promise<void> {
  const reminders = await findReminderById(event._id);
  const eventStartReminder = reminders.find(
    (reminder) => reminder.type === ReminderType.eventStart
  );
  if (eventStartReminder) {
    eventStartReminder.datetime = new Date(
      event.datetime.getTime() - 30 * 60 * 1000
    );
    await eventStartReminder.save();
  } else {
    // Create event start reminder
    await createReminder(
      event._id,
      ReminderType.eventStart,
      new Date(event.datetime.getTime() - 30 * 60 * 1000)
    );
  }

  if (event.penalizationStartDate && (event.penalization ?? 0) > 0) {
    const penalizationReminderDate: Date = new Date(
      event.penalizationStartDate
    );
    penalizationReminderDate.setDate(penalizationReminderDate.getDate() - 1);
    penalizationReminderDate.setHours(20, 0, 0, 0); // 8 PM the day before penalization starts

    const penalizationStartReminder = reminders.find(
      (reminder) => reminder.type === ReminderType.penalizationStart
    );

    if (penalizationStartReminder) {
      penalizationStartReminder.datetime = penalizationReminderDate;
      await penalizationStartReminder.save();
    } else {
      // Create penalization start reminder
      await createReminder(
        event._id,
        ReminderType.penalizationStart,
        penalizationReminderDate
      );
    }

    const penalizationOneWeekReminderDate = new Date(
      penalizationReminderDate.getTime() + 7 * 24 * 60 * 60 * 1000
    );
    const penalizationOneWeekReminder = reminders.find(
      (reminder) => reminder.type === ReminderType.penalizationOneWeek
    );
    if (penalizationOneWeekReminder) {
      penalizationOneWeekReminder.datetime = penalizationOneWeekReminderDate;
      await penalizationOneWeekReminder.save();
    } else {
      // Create penalization one week reminder
      await createReminder(
        event._id,
        ReminderType.penalizationOneWeek,
        penalizationOneWeekReminderDate
      );
    }
  }
}

export async function createEvent(
  req: Request<
    any,
    any,
    {
      isChef: boolean;
      isShoppingDesignee: boolean;
      organizer: ObjectId;
    }
  >,
  res: Response
): Promise<Response> {
  try {
    let event: IEvent = new Event(req.body);
    const { isChef, isShoppingDesignee, organizer } = req.body;
    event.chef = isChef ? organizer : null;
    if (isShoppingDesignee) {
      if (!event.shoppingDesignee) {
        event.shoppingDesignee = [];
      }
      event.shoppingDesignee.push(organizer);
    }

    event = await event.save();
    await deleteEvents();
    if (!event.isPrivate) {
      await notifyNewEvent(event.id);
    }
    await updateReminders(event);
    return res.status(STATUS_CODES.CREATED).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function subscribeToAnEvent(
  req: Request<{ event: string; id: string }>,
  res: Response
): Promise<Response> {
  try {
    const eventId = req.params.event;
    if (!eventId)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided." });
    const fieldsToPopulate: PopulateOption[] = ["purchaseReceipts"];
    const event = await findEventByIdAndPopulate<IEventWithPurchaseReceipts>(
      eventId,
      fieldsToPopulate
    );
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    if (event.memberLimit <= event.members.length)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The event is full." });
    if (event.state !== EventState.available)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The event is not available for users to join" });
    if (event.members.includes(createObjectId(req.params.id))) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user has already joined the event" });
    }
    const user = await findUserById<IUser>(req.params.id);
    if (!user) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user with the given ID was not found." });
    }
    for (const receipt of event.purchaseReceipts) {
      receipt.participants.push(user._id);
      await receipt.save();
    }
    event.members.push(user._id);
    await event.save();
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function unsubscribeFromEvent(
  req: Request<{ event: string; id: string }>,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided." });
    const event =
      await findEventByIdAndPopulate<IEventWithPurchaseReceiptsOptions>(
        req.params.event,
        ["purchaseReceipts", "options"]
      );
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    const index = event.members.indexOf(createObjectId(req.params.id));
    if (index === -1)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The member with the given ID is not part of the event.",
      });
    const user = await findUserById<IUser>(req.params.id);
    if (!user) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user with the given ID was not found." });
    }
    if (
      event.state == EventState.closed ||
      event.state == EventState.readyForPayment
    )
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          "The user can't unsubscribe from the event if it's closed or ready for payment.",
      });
    for (const receipt of event.purchaseReceipts) {
      receipt.participants = receipt.participants.filter(
        (participantId) => !participantId.equals(user._id)
      );
      await receipt.save();
    }
    for (const option of event.options) {
      option.participants = option.participants.filter(
        (participantId) => !participantId.equals(user._id)
      );
      await option.save();
    }
    event.members.splice(index, 1);
    await event.save();
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function editRoles(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    const { chef, shoppingDesignee } = req.body;
    event.chef = chef ?? null;
    event.shoppingDesignee = shoppingDesignee;
    await event.save();
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function editEvent(
  req: Request<
    { id: string },
    any,
    {
      title: string;
      datetime: Date;
      description: string;
      memberLimit: number;
      penalization: number;
      penalizationStartDate: Date;
      state: string;
      isPrivate: boolean;
    }
  >,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    event.title = req.body.title;
    event.datetime = req.body.datetime;
    event.description = req.body.description;
    event.memberLimit = req.body.memberLimit;
    event.penalization = req.body.penalization;
    event.penalizationStartDate =
      req.body.penalization > 0 ? req.body.penalizationStartDate : null;
    event.state = req.body.state;
    event.isPrivate = req.body.isPrivate;
    if (
      event.shoppingDesignee?.length == 0 &&
      event.state !== EventState.available
    )
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "The event has no shopping designees.",
      });
    await event.save();
    await updateReminders(event);
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function deleteEvent(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    await deleteReceipts(event._id);
    await deleteReminders(event._id);
    await findEventByIdAndDelete(req.params.id);
    return res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

async function deleteEvents(): Promise<void> {
  const totalEvents = await countElements({ isPrivate: false });
  if (totalEvents > 6) {
    let matches: IEvent[] = await findFinishedAndCanceledEvents();
    const eventsToDelete: number = Math.min(totalEvents - 6, matches.length);

    for (let i = 0; i < eventsToDelete; i++) {
      const deletedId = matches[0]._id;
      matches = matches.slice(1);
      await deleteReminders(deletedId);
      await deleteReceipts(deletedId);
      await findEventByIdAndDelete(deletedId);
    }
  }
}

function reduceEventsInformation(
  events: IPublicEventPreReduction[]
): IPublicEvent[] {
  let reducedEvents: IPublicEvent[] = [];
  for (let event of events) {
    let eventRating = 0;
    let avgScore = 0;
    let ratingsAmount = 0;

    if (event.ratings) {
      eventRating = event.ratings.reduce(
        (sum, currentRating) => sum + currentRating.score,
        0
      );
      ratingsAmount = event.ratings.length;
      if (event.ratings.length > 0) {
        avgScore = eventRating / event.ratings.length;
      }
    }
    const {
      _id,
      title,
      datetime,
      description,
      state,
      chef,
      shoppingDesignee,
      memberLimit,
      members,
      isPrivate,
      penalization,
      penalizationStartDate,
    } = event;

    reducedEvents.push({
      _id,
      title,
      datetime,
      description,
      state,
      chef: chef ? chef.name : "No chef assigned",
      shoppingDesignee,
      memberLimit,
      members: members.length,
      ratings: { avgScore, ratingsAmount },
      isPrivate: isPrivate || false, // esto es porque eventos viejos no tienen el atributo
      penalization: penalization || null, // y asi hay backwards compatibility, SACAR CUANDO NO HAYA EVENTOS SIN ESTOS ATRIBUTOS
      penalizationStartDate: penalizationStartDate || null,
    });
  }
  return reducedEvents;
}

export async function getMembersAmount(
  req: Request<{ event: string }>,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    const fieldsToPopulate: PopulateOption[] = [
      {
        path: "purchaseReceipts",
        populate: [
          {
            path: "shoppingDesignee",
            model: "User",
          },
          {
            path: "participants",
            model: "User",
          },
        ],
      },
      {
        path: "members",
        model: "User",
      },
    ];
    const event = await findEventByIdAndPopulate<IEventAmountCalculations>(
      req.params.event,
      fieldsToPopulate,
      "purchaseReceipts members"
    );
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    if (event.purchaseReceipts.length == 0)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The event has no purchase receipts." });
    const userBalances = assignEventValues(event.purchaseReceipts);
    const transferInfo = calculateTransfersInfo(userBalances);
    return res.status(STATUS_CODES.OK).json(transferInfo);
  } catch (e: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: e.message });
  }
}

export async function getMemberIndividualCost(
  req: Request<{ event: string; user: string }>,
  res: Response
): Promise<Response> {
  try {
    const { event: eventId, user } = req.params;
    if (!eventId)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    if (!user)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No user ID provided" });

    const event = await findEventByIdAndPopulate<IEventWithPurchaseReceipts>(
      eventId,
      ["purchaseReceipts"]
    );
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    if (!event.members.includes(createObjectId(user)))
      return res
        .status(STATUS_CODES.FORBIDDEN)
        .json({ message: "User is not a member of the event" });
    if (
      event.state !== EventState.finished &&
      event.state !== EventState.readyForPayment
    )
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Event state needs to be either finished or ready for payment",
      });
    const userReceipts: IPurchaseReceipt[] = event.purchaseReceipts.filter(
      ({ participants }) =>
        participants.some((p) => p._id.equals(createObjectId(user)))
    );

    const userAmount = userReceipts.reduce(
      (total, { amount, participants }: IPurchaseReceipt) => {
        total += amount / participants.length;
        return total;
      },
      0
    );

    return res.status(STATUS_CODES.OK).json({ userAmount });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
