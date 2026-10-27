import { Request, Response } from "express";
import mongoose from "mongoose";
import { Event } from "../models/event.js";
import { User } from "../models/user.js";
import { TransferReceipt } from "../models/transferReceipt.js";
import { PurchaseReceipt } from "../models/purchaseReceipt.js";
import { Image } from "../models/image.js";
import { Rating } from "../models/rating.js";
import { Reminder } from "../models/reminder.js";
import { membersWhoHaveUploaded } from "./transferReceipts.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { notifyNewEvent } from "./notifications.js";
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

export async function getEvents(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    const events: IEvent[] = await Event.find({
      $or: [
        { isPrivate: { $ne: true } },
        { isPrivate: true, members: req.user._id },
      ],
    }).sort({
      datetime: -1,
      _id: 1,
    });
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
    const events: IPublicEventPreReduction[] = await Event.find({
      isPrivate: {
        $ne: true,
      },
    })
      .select(
        "datetime description state chef shoppingDesignee memberLimit members title ratings isPrivate penalization penalizationStartDate"
      )
      .sort({ datetime: -1 })
      .populate("chef", "name")
      .populate("ratings")
      .populate("shoppingDesignee");

    const publicEvents: IPublicEvent[] = reduceEventsInformation(events);

    return res.status(STATUS_CODES.OK).json(publicEvents);
  } catch (error) {
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
    const events: IPublicEventPreReduction[] = await Event.find({
      $or: [
        {
          isPrivate: {
            $ne: true,
          },
        },
        { isPrivate: true, members: req.user._id },
      ],
    })
      .select(
        "datetime description state chef shoppingDesignee memberLimit members title ratings isPrivate penalization penalizationStartDate"
      )
      .sort({ datetime: -1 })
      .populate("chef", "name")
      .populate("ratings")
      .populate("shoppingDesignee");

    const allEvents: IPublicEvent[] = reduceEventsInformation(events);

    return res.status(STATUS_CODES.OK).json(allEvents);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getEventById(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const event: IEventPopulatedWithOptions = await Event.findById(req.params.id)
      .populate("members")
      .populate("chef")
      .populate("organizer")
      .populate("shoppingDesignee")
      .populate("transferReceipts")
      .populate("purchaseReceipts")
      .populate({
      path: "options",
      populate: {
        path: "participants",
        model: "User",
        select: "name lastName _id"
      },
      });
    if (!event) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    } else {
      return res.json(event);
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getMembersAndReceiptsInfo(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const answer: IMemberWhoHasUploaded[] = await membersWhoHaveUploaded(
      req.params.event
    );
    return res.status(STATUS_CODES.OK).json(answer);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

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
  const now: Date = new Date();
  now.setHours(now.getHours() - 3);
  if (datetime <= now) return;
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
    penalizationReminderDate.setDate(penalizationReminderDate.getDate() - 1);
    penalizationReminderDate.setHours(20, 0, 0, 0); // 8 PM the day before penalization starts
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

function cannotJoinMessage(
  event: IEvent,
  userId: mongoose.Types.ObjectId
): string | null {
  if (event.memberLimit <= event.members.length) return "The event is full.";
  if (event.state !== "available")
    return "The event is not available for users to join";
  if (event.members.some((member) => member.equals(userId)))
    return "The user has already joined the event";
  return null;
}

export async function subscribeToAnEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided." });
    const event: IEvent | null = await Event.findById(req.params.event);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    const userId: mongoose.Types.ObjectId = new mongoose.Types.ObjectId(
      req.params.id
    );
    const precheckMessage: string | null = cannotJoinMessage(event, userId);
    if (precheckMessage)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: precheckMessage });
    const user: IUser | null = await User.findById(userId);
    if (!user) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user with the given ID was not found." });
    }
    // The conditions are re-checked atomically so concurrent joins can't
    // exceed memberLimit or add the same member twice.
    const joined: IEvent | null = await Event.findOneAndUpdate(
      {
        _id: event._id,
        state: "available",
        members: { $ne: user._id },
        $expr: { $lt: [{ $size: "$members" }, "$memberLimit"] },
      },
      { $push: { members: user._id } }
    );
    if (!joined) {
      const current: IEvent | null = await Event.findById(event._id);
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          (current && cannotJoinMessage(current, user._id)) ||
          "The event is full.",
      });
    }
    await PurchaseReceipt.updateMany(
      { _id: { $in: event.purchaseReceipts } },
      { $addToSet: { participants: user._id } }
    );
    const updatedEvent: IEventWithPurchaseReceipts | null =
      await Event.findById(event._id).populate("purchaseReceipts");
    return res.status(STATUS_CODES.OK).json(updatedEvent);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function unsubscribeFromEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided." });
    const event: IEventWithPurchaseReceiptsOptions | null =
      await Event.findById(req.params.event)
        .populate("purchaseReceipts")
        .populate("options");
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    const index: number = event.members.indexOf(
      new mongoose.Types.ObjectId(req.params.id)
    );
    if (index === -1)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The member with the given ID is not part of the event.",
      });
    const user: IUser | null = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user with the given ID was not found." });
    }
    if (event.state == "closed" || event.state == "readyforpayment")
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
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const event: IEvent | null = await Event.findById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    event.chef = req.body.chef ? req.body.chef : null;
    event.shoppingDesignee = req.body.shoppingDesignee;
    await event.save();
    res.status(STATUS_CODES.OK).json(event);
  } catch (error: any) {
    res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function editEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const event: IEvent | null = await Event.findById(req.params.id);
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
    if (event.shoppingDesignee.length == 0 && event.state !== "available")
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "The event has no shopping designees.",
      });
    await event.save();
    if (event.state === "cancelled") {
      await deleteReminders(event._id);
    } else {
      await updateReminders(event);
    }
    return res.status(STATUS_CODES.OK).json(event);
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

function reduceEventsInformation(
  events: IPublicEventPreReduction[]
): IPublicEvent[] {
  let reducedEvents: IPublicEvent[] = [];
  for (let event of events) {
    let eventRating: number = event.ratings
      ? event.ratings.reduce(
          (sum, currentRating) => sum + currentRating.score,
          0
        )
      : 0; // esto es porque eventos viejos no tienen el atributo
    reducedEvents.push({
      _id: event._id,
      title: event.title,
      datetime: event.datetime,
      description: event.description,
      state: event.state,
      chef: event.chef ? event.chef.name : null,
      shoppingDesignee: event.shoppingDesignee,
      memberLimit: event.memberLimit,
      members: event.members.length,
      ratings: {
        avgScore: event.ratings
          ? event.ratings.length > 0
            ? eventRating / event.ratings.length
            : 0
          : 0, // esto es porque eventos viejos no tienen el atributo
        ratingsAmount: event.ratings ? event.ratings.length : 0, // esto es porque eventos viejos no tienen el atributo
      },
      isPrivate: event.isPrivate ? event.isPrivate : false, // esto es porque eventos viejos no tienen el atributo
      penalization: event.penalization ? event.penalization : null, // y asi hay backwards compatibility, SACAR CUANDO NO HAYA EVENTOS SIN ESTOS ATRIBUTOS
      penalizationStartDate: event.penalizationStartDate
        ? event.penalizationStartDate
        : null,
    });
  }
  return reducedEvents;
}

export function calculateTransfersInfo(
  amounts: IUserBalance[]
): ITransferInfo[] {
  const transferInfo: ITransferInfo[] = [];

  while (amounts.length > 0) {
    amounts.sort((a, b) => a.totalCost - b.totalCost);
    let payer: IUserBalance = amounts[0];
    if (payer.totalCost == 0) {
      transferInfo.push({
        userId: payer.userId,
        userName: payer.userName,
        amount: payer.totalCost,
        receiver: null,
      });
      amounts.splice(0, 1);
      continue;
    }
    let receiver: IUserBalance = amounts[amounts.length - 1];
    transferInfo.push({
      userId: payer.userId,
      userName: payer.userName,
      amount: payer.totalCost * -1,
      receiver: {
        receiverId: receiver.userId,
        receiverName: receiver.userName,
        receiverLastName: receiver.userLastName,
        receiverCbu: receiver.userCbu,
        receiverAlias: receiver.userAlias,
      },
    });
    const updatedAmount: number = Number(
      (amounts[amounts.length - 1].totalCost + payer.totalCost).toFixed(2)
    );
    amounts[amounts.length - 1].totalCost = updatedAmount;
    amounts.splice(0, 1);
  }
  return transferInfo;
}

export function assignEventValues(
  receipts: IPurchaseReceiptWithUsers[]
): IUserBalance[] {
  const userBalances: IUserBalance[] = [];
  for (const receipt of receipts) {
    const receiptCostPerUser: number = Number(
      (receipt.amount / receipt.participants.length).toFixed(2)
    );
    for (const participant of receipt.participants) {
      let participantEntry: IUserBalance | undefined = userBalances.find((a) =>
        participant._id.equals(a.userId)
      );
      if (participantEntry) {
        participantEntry.totalCost = Number(
          (participantEntry.totalCost - receiptCostPerUser).toFixed(2)
        );
      } else {
        userBalances.push({
          userId: participant._id,
          userName: participant.name,
          userLastName: participant.lastName,
          userCbu: participant.cbu,
          userAlias: participant.alias,
          totalCost: -receiptCostPerUser,
        });
      }
    }
    const cleanReceiptAmount: number = Number(
      (receiptCostPerUser * receipt.participants.length).toFixed(2)
    );
    const designeeEntry: IUserBalance | undefined = userBalances.find((a) =>
      receipt.shoppingDesignee._id.equals(a.userId)
    );
    if (designeeEntry) {
      designeeEntry.totalCost = Number(
        (designeeEntry.totalCost + cleanReceiptAmount).toFixed(2)
      );
    } else {
      userBalances.push({
        userId: receipt.shoppingDesignee._id,
        userName: receipt.shoppingDesignee.name,
        userLastName: receipt.shoppingDesignee.lastName,
        userCbu: receipt.shoppingDesignee.cbu,
        userAlias: receipt.shoppingDesignee.alias,
        totalCost: cleanReceiptAmount,
      });
    }
  }
  return userBalances;
}

export async function getMembersAmount(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    const event: IEventAmountCalculations = await Event.findById(
      req.params.event
    )
      .select("purchaseReceipts members")
      .populate([
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
      ]);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    if (event.purchaseReceipts.length == 0)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The event has no purchase receipts." });
    const userBalances: IUserBalance[] = assignEventValues(
      event.purchaseReceipts
    );
    const transferInfo: ITransferInfo[] = calculateTransfersInfo(userBalances);
    return res.status(STATUS_CODES.OK).json(transferInfo);
  } catch (e) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: e.message });
  }
}

export async function getMemberIndividualCost(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    if (!req.params.user)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No user ID provided" });
    const event: IEventWithPurchaseReceipts = await Event.findById(
      req.params.event
    ).populate("purchaseReceipts");
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: eventNotFoundMessage });
    if (!event.members.includes(new mongoose.Types.ObjectId(req.params.user)))
      return res
        .status(STATUS_CODES.FORBIDDEN)
        .json({ message: "User is not a member of the event" });
    if (event.state !== "finished" && event.state !== "readyforpayment")
      return res
        .status(STATUS_CODES.FORBIDDEN)
        .json({
          message:
            "Event state needs to be either finished or ready for payment",
        });
    const userReceipts: IPurchaseReceipt[] = event.purchaseReceipts.filter(
      (receipt) =>
        receipt.participants.some((p) =>
          p._id.equals(new mongoose.Types.ObjectId(req.params.user))
        )
    );

    // Same per-receipt rounding as assignEventValues, so this matches the
    // amounts shown by getMembersAmount.
    const userAmount: number = userReceipts.reduce(
      (total: number, receipt: IPurchaseReceipt) =>
        Number(
          (
            total +
            Number((receipt.amount / receipt.participants.length).toFixed(2))
          ).toFixed(2)
        ),
      0
    );

    return res.status(STATUS_CODES.OK).json({ userAmount: userAmount });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
