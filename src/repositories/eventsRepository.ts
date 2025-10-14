import {
  FilterQuery,
  ProjectionType,
  Query,
  UpdateQuery,
  UpdateWithAggregationPipeline,
} from "mongoose";
import {
  IEvent,
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersTransferReceipts,
  IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts,
  IMemberWhoHasUploaded,
  IPublicEventPreReduction,
  IReceiptInfo,
  ITransferInfo,
  IUser,
  IUserBalance,
  ObjectId,
} from "../models/interfaces";
import { Event } from "../models/event";
import {
  createObjectId,
  populateFields,
  PopulateOption,
} from "./utils/mongoose";
import { assignEventValues, calculateTransfersInfo } from "../utils/balance";

export enum EventState {
  available = "available",
  readyForPayment = "readyforpayment",
  cancelled = "cancelled",
  finished = "finished",
  closed = "closed",
}

export async function findEvents(): Promise<IEvent[]> {
  return await Event.find().sort({ datetime: -1, ":id": 1 });
}

export async function findAndPopulate<T>(
  filter: FilterQuery<T>,
  fieldsToPopulate: PopulateOption[],
  projection?: ProjectionType<T> | null | undefined
): Promise<T[]> {
  let query = Event.find<T>(filter);
  query = projection ? query.select(projection) : query;
  query = populateFields<T[]>(query, fieldsToPopulate);

  return await query.exec();
}

export async function findById(id: string | ObjectId): Promise<IEvent | null> {
  return await Event.findById(id);
}

export async function findByIdAndPopulate<T>(
  id: string | ObjectId,
  fieldsToPopulate: PopulateOption[],
  fieldsToSelect?: string
): Promise<T | null> {
  const query = Event.findById<T>(id);

  const queryWithSelect = fieldsToSelect ? query.select(fieldsToSelect) : query;

  const populatedQuery = populateFields<T | null>(
    queryWithSelect,
    fieldsToPopulate
  );

  return await populatedQuery.exec();
}

export async function findByIdAndUpdate(
  id: string | ObjectId,
  update: UpdateQuery<IEvent>
): Promise<IEvent | null> {
  return await Event.findByIdAndUpdate(id, update);
}

export async function findByIdAndDelete(
  id: string | ObjectId
): Promise<Query<IEvent | null, IEvent, {}, IEvent>> {
  return await Event.findByIdAndDelete(id);
}

export async function countElements(filter: FilterQuery<IEvent>) {
  return await Event.count(filter);
}

export async function findPublicEventsAndPopulate(): Promise<
  IPublicEventPreReduction[]
> {
  return await Event.find({
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
}

export async function findPublicAndPrivateEventsAndPopulate(
  userId?: string
): Promise<IPublicEventPreReduction[]> {
  return await Event.find({
    $or: [{ isPrivate: { $ne: true } }, { isPrivate: true, members: userId }],
  })
    .select(
      "datetime description state chef shoppingDesignee memberLimit members title ratings isPrivate penalization penalizationStartDate"
    )
    .sort({ datetime: -1 })
    .populate("chef", "name")
    .populate("ratings")
    .populate("shoppingDesignee");
}

export async function updateOne(
  filter: FilterQuery<IEvent>,
  update: UpdateWithAggregationPipeline | UpdateQuery<IEvent>
): Promise<void> {
  await Event.updateOne(filter, update);
}

export async function findFinishedAndCanceledEvents(): Promise<IEvent[]> {
  return await Event.find({
    state: {
      $in: [EventState.finished, EventState.cancelled],
    },
  }).sort({ datetime: "asc" });
}

export async function getEventsDebtors(eventId: string): Promise<IUser[]> {
  const event =
    await findByIdAndPopulate<IEventAmountCalculationsWithTransfers>(eventId, [
      {
        path: "purchaseReceipts",
        populate: [
          { path: "shoppingDesignee", model: "User" },
          { path: "participants", model: "User" },
        ],
      },
      { path: "members", model: "User" },
      {
        path: "transferReceipts",
        populate: {
          path: "user",
          model: "User",
        },
      },
    ]);

  if (!event) {
    throw new Error(`Event with ID ${eventId} not found.`);
  }

  const userBalances: IUserBalance[] = assignEventValues(
    event.purchaseReceipts
  );
  const transferInfo: ITransferInfo[] = calculateTransfersInfo(userBalances);
  const expectedTransfers: ITransferInfo[] = transferInfo.filter(
    (t) => t.receiver !== null
  );

  const debtorUsers: (IUser | null)[] = await Promise.all(
    expectedTransfers.map(async (transfer) => {
      const receipt = event.transferReceipts.find((r) =>
        r.user._id.equals(transfer.userId)
      );

      return receipt ? receipt.user : null;
    })
  );

  const debtors: IUser[] = debtorUsers.filter(
    (user): user is IUser => user !== null
  );
  return debtors;
}

export async function isEventFinished(id: string): Promise<boolean> {
  const event =
    await findByIdAndPopulate<IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts>(
      createObjectId(id),
      [
        { path: "transferReceipts" },
        {
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        },
        { path: "members", model: "User" },
      ]
    );

  if (!event) {
    throw new Error(`Event with ID ${id} not found.`);
  }

  const userBalances = assignEventValues(event.purchaseReceipts);
  const transferInfo = calculateTransfersInfo(userBalances);

  const expectedTransfers = transferInfo.filter((t) => t.receiver !== null);

  const approvedTransfers = event.transferReceipts.filter((r) => r.hasPaid);

  return expectedTransfers.length === approvedTransfers.length;
}

export async function membersWhoHaveUploaded(
  eventId: string
): Promise<IMemberWhoHasUploaded[]> {
  const event = await findByIdAndPopulate<IEventWithMembersTransferReceipts>(
    eventId,
    ["members transferReceipts"]
  );
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found.`);
  }

  const membersWithReceipts: string[] = [];
  const receiptInfo: IReceiptInfo[] = [];
  for (const { _id, user, hasPaid } of event.transferReceipts) {
    membersWithReceipts.push(String(user));
    receiptInfo.push({ hasReceiptApproved: hasPaid, transferReceipt: _id });
  }

  const members: IMemberWhoHasUploaded[] = [];
  for (const { _id, name, lastName, specialDiet } of event.members) {
    let transferReceipt = null;
    let hasReceiptApproved = null;
    let hasUploaded = false;

    if (membersWithReceipts.includes(String(_id))) {
      const index = membersWithReceipts.indexOf(String(_id));
      transferReceipt = receiptInfo[index].transferReceipt;
      hasReceiptApproved = receiptInfo[index].hasReceiptApproved;
      hasUploaded = true;
    }

    members.push({
      userId: _id,
      userName: name,
      userLastName: lastName ?? "",
      specialDiet: specialDiet,
      transferReceipt,
      hasReceiptApproved,
      hasUploaded,
    });
  }

  return members;
}
