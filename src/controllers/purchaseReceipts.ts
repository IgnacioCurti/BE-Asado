import { Request, Response } from "express";
import { PurchaseReceipt } from "../models/purchaseReceipt";
import { STATUS_CODES } from "../constants/httpStatusCode";
import {
  IRequestWithUser,
  IEventWithPurchaseReceiptsPopulated,
  IPurchaseReceipt,
  ObjectId,
} from "../models/interfaces";
import { saveImage } from "../repositories/imageRepository";
import {
  EventState,
  findById as findEventById,
  findByIdAndPopulate as findEventByIdAndPopulate,
} from "../repositories/eventsRepository";
import {
  findPurchaseReceiptById,
  findPurchaseReceiptByIdAndDelete,
} from "../repositories/receiptsRepository";
import { createObjectId } from "../repositories/utils/mongoose";

export async function getPurchaseReceiptsByEvent(
  req: Request<{ event: string }>,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    const event =
      await findEventByIdAndPopulate<IEventWithPurchaseReceiptsPopulated>(
        req.params.event,
        [
          {
            path: "purchaseReceipts",
            populate: [
              { path: "shoppingDesignee", model: "User" },
              { path: "participants", model: "User" },
            ],
          },
        ]
      );

    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });
    return res.status(STATUS_CODES.OK).json(event.purchaseReceipts);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getPurchaseReceiptById(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const purchaseReceipt = await findPurchaseReceiptById(req.params.id);
    if (!purchaseReceipt) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The purchase receipt with the given ID was not found.",
      });
    } else {
      return res.status(STATUS_CODES.OK).json(purchaseReceipt);
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function uploadFilePurchaseReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (req.file) {
      const imageId = await saveImage(req.file);
      let purchaseReceipt = await findPurchaseReceiptById(
        req.params.purchaseReceipt
      );
      if (!purchaseReceipt) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          message: "The purchase receipt with the given ID was not found.",
        });
      }
      purchaseReceipt.image = imageId;
      await purchaseReceipt.save();
      return res.status(STATUS_CODES.OK).json({ imageId: imageId });
    } else {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "No file provided",
      });
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function createPurchaseReceipt(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventById(req.params.event);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (event.state !== EventState.closed)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          "Purchase receipts can only be uploaded when the event is closed",
      });

    let purchaseReceipt: IPurchaseReceipt = new PurchaseReceipt(req.body);
    purchaseReceipt.event = event._id;
    purchaseReceipt.shoppingDesignee = createObjectId(req.user?._id as string);
    purchaseReceipt.participants = req.body.participants || event.members;
    purchaseReceipt = await purchaseReceipt.save();
    event.purchaseReceipts.push(purchaseReceipt._id);
    await event.save();
    return res.status(STATUS_CODES.CREATED).json(purchaseReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function assignMembersToReceipt(
  req: Request<
    any,
    any,
    { receipts: { id: string; participants: ObjectId[] }[] }
  >,
  res: Response
): Promise<Response> {
  try {
    for (const { id, participants } of req.body.receipts) {
      const purchaseReceipt = await findPurchaseReceiptById(id);
      if (!purchaseReceipt)
        return res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: "One or more purchase receipts were not found" });

      purchaseReceipt.participants = participants;
      await purchaseReceipt.save();
    }

    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Participants assigned to receipts successfully" });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function deletePurchaseReceipt(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const purchaseReceipt = await findPurchaseReceiptById(req.params.id);
    if (!purchaseReceipt)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The purchase receipt with the given ID was not found.",
      });

    const event = await findEventById(purchaseReceipt.event);

    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (event.state !== EventState.closed)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          "Purchase receipts can only be uploaded or deleted when the event is closed",
      });
    const index: number = event.purchaseReceipts.indexOf(purchaseReceipt._id);
    event.purchaseReceipts.splice(index, 1);
    await event.save();
    await findPurchaseReceiptByIdAndDelete(req.params.id);
    return res.status(STATUS_CODES.OK).json(purchaseReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
