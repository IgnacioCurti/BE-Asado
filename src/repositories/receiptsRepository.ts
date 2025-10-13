import mongoose, { FilterQuery, Query } from "mongoose";
import {
  IEventWithTransferReceipts,
  IEventWithTransferReceiptsPurchaseReceiptsRatings,
  IHasUploadedInfo,
  IPurchaseReceipt,
  ITransferReceipt,
  ObjectId,
} from "../models/interfaces";
import { findByIdAndPopulate } from "./eventsRepository";
import { findByIdAndDelete as findImageByIdAndDelete } from "./imageRepository";
import { TransferReceipt } from "../models/transferReceipt";
import { PurchaseReceipt } from "../models/purchaseReceipt";
import { findByIdAndDelete as findRatingByIdAndDelete } from "./ratingsRepository";
import { createObjectId } from "./utils/mongoose";

export async function findOneTransferReceipt(
  filter: FilterQuery<ITransferReceipt>
) {
  return await TransferReceipt.findOne(filter);
}

export async function findTransferReceiptById(
  id: string
): Promise<ITransferReceipt | null> {
  return await TransferReceipt.findById(id);
}

export async function findTransferReceiptByIdAndDelete(
  id: string | ObjectId
): Promise<
  Query<ITransferReceipt | null, ITransferReceipt, {}, ITransferReceipt>
> {
  return await TransferReceipt.findByIdAndDelete(id);
}

export async function findTransferReceiptByIdAndRemove(id: string | ObjectId) {
  return await TransferReceipt.findByIdAndRemove(id);
}

export async function deleteReceipts(eventId: ObjectId): Promise<void> {
  const event =
    await findByIdAndPopulate<IEventWithTransferReceiptsPurchaseReceiptsRatings>(
      eventId,
      ["transferReceipts", "purchaseReceipts", "ratings"]
    );

  if (!event) {
    console.error("Event not found when trying to delete receipts and ratings");
  } else {
    await Promise.all(
      event.transferReceipts.map(async (transferReceipt) => {
        if (transferReceipt.image)
          await findImageByIdAndDelete(transferReceipt.image);
        await findTransferReceiptByIdAndDelete(transferReceipt._id);
      })
    );

    await Promise.all(
      event.purchaseReceipts.map(async (purchaseReceipt) => {
        if (purchaseReceipt.image)
          await findImageByIdAndDelete(purchaseReceipt.image);
        await findPurchaseReceiptByIdAndDelete(purchaseReceipt._id);
      })
    );

    await Promise.all(
      event.ratings.map(async (rating) => {
        await findRatingByIdAndDelete(rating);
      })
    );
  }
}

export async function findPurchaseReceiptById(
  id: string
): Promise<IPurchaseReceipt | null> {
  return await PurchaseReceipt.findById(id);
}

export async function findPurchaseReceiptByIdAndDelete(
  id: string | ObjectId
): Promise<
  Query<IPurchaseReceipt | null, IPurchaseReceipt, {}, IPurchaseReceipt>
> {
  return await PurchaseReceipt.findByIdAndDelete(id);
}

export async function hasUploaded(
  userId: string,
  eventId: string
): Promise<IHasUploadedInfo> {
  const event = await findByIdAndPopulate<IEventWithTransferReceipts>(
    createObjectId(eventId),
    ["transferReceipts"]
  );

  if (!event) {
    throw new Error("Event not found");
  }

  for (const { _id, user, hasPaid } of event.transferReceipts) {
    if (user.equals(createObjectId(userId))) {
      return {
        hasUploaded: true,
        hasReceiptApproved: hasPaid,
        transferReceipt: _id,
      };
    }
  }

  return {
    hasUploaded: false,
    hasReceiptApproved: false,
    transferReceipt: null,
  };
}
