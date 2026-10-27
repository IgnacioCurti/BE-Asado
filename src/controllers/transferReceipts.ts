import { Request, Response } from "express";
import { TransferReceipt } from "../models/transferReceipt.js";
import { Event } from "../models/event.js";
import { Image } from "../models/image.js";
import { saveImage } from "./images.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import {
  assignEventValues,
  calculateTransfersInfo,
} from "../controllers/events.js";
import {
  IEvent,
  IEventWithMembersTransferReceipts,
  IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts,
  IEventWithTransferReceipts,
  IHasUploadedInfo,
  IMemberWhoHasUploaded,
  IReceiptInfo,
  IRequestWithUser,
  ITransferInfo,
  ITransferReceipt,
  IUserBalance,
} from "../models/interfaces.js";
import mongoose from "mongoose";
import { isValidId } from "../utils/utils.js";

const transferReceiptNotFoundMessage: string =
  "The transfer receipt with the given ID was not found.";

const cannotCreateTransferReceiptMessage: string =
  "You can only create transfer receipts when the event is ready for payment.";

export async function getTransferReceiptsByEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const event: IEventWithTransferReceipts = await Event.findById(
      req.params.event
    ).populate("transferReceipts");
    return res.status(STATUS_CODES.OK).json(event.transferReceipts);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getTransferReceiptsById(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt: ITransferReceipt = await TransferReceipt.findById(
      req.params.id
    );
    if (!transferReceipt) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: transferReceiptNotFoundMessage });
    } else {
      return res.status(STATUS_CODES.OK).json(transferReceipt);
    }
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function uploadFileTransferReceipt(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    if (!req.file)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No file was uploaded." });
    const transferReceipt: ITransferReceipt | null =
      await TransferReceipt.findById(req.params.transferReceipt);
    if (!transferReceipt)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: transferReceiptNotFoundMessage });
    if (transferReceipt.user.toString() !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Access denied. The user is not the owner of the receipt.",
      });
    if (transferReceipt.hasPaid)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The transfer receipt is already approved." });
    const imageId = await saveImage(req.file);
    const previousImage: mongoose.Types.ObjectId | null | undefined =
      transferReceipt.image;
    transferReceipt.image = imageId;
    await transferReceipt.save();
    if (previousImage) await Image.findByIdAndDelete(previousImage);
    return res.status(STATUS_CODES.OK).json({ imageId: imageId });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

// The transfer a member owes, as computed from the event's purchase receipts,
// or undefined if they don't have to transfer anything.
async function expectedTransferOf(
  eventId: string,
  userId: string
): Promise<ITransferInfo | undefined> {
  const event: IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null =
    await Event.findById(eventId).populate({
      path: "purchaseReceipts",
      populate: [
        { path: "shoppingDesignee", model: "User" },
        { path: "participants", model: "User" },
      ],
    });
  if (!event) return undefined;
  const transferInfo: ITransferInfo[] = calculateTransfersInfo(
    assignEventValues(event.purchaseReceipts)
  );
  return transferInfo.find(
    (t) => t.receiver !== null && t.userId.equals(userId)
  );
}

export async function createTransferReceipt(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    const userId: string = req.user._id;
    const event: IEvent = await Event.findById(req.params.event);
    if (event.state !== "readyforpayment")
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: cannotCreateTransferReceiptMessage,
      });
    const expectedTransfer: ITransferInfo | undefined =
      await expectedTransferOf(req.params.event, userId);
    if (!expectedTransfer)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "The user has no transfer to make in this event.",
      });
    const hasUploadedValue: IHasUploadedInfo = await hasUploaded(
      userId,
      req.params.event
    );
    if (hasUploadedValue.hasUploaded) {
      const oldTransferReceipt: ITransferReceipt | null =
        await TransferReceipt.findByIdAndRemove(
          hasUploadedValue.transferReceipt
        );
      if (oldTransferReceipt?.image)
        await Image.findByIdAndDelete(oldTransferReceipt.image);
      event.transferReceipts = event.transferReceipts.filter(
        (id) => !id.equals(hasUploadedValue.transferReceipt)
      );
      await event.save();
    }
    // Who pays, how much and to whom come from the server; the body only
    // describes the payment.
    let transferReceipt = new TransferReceipt({
      description: req.body.description,
      paymentMethod: req.body.paymentMethod,
      user: new mongoose.Types.ObjectId(userId),
      amount: expectedTransfer.amount,
      receiver: expectedTransfer.receiver.receiverId,
    });
    transferReceipt.event = new mongoose.Types.ObjectId(req.params.event);
    let date = new Date();
    date.setHours(date.getHours() - 3);
    transferReceipt.datetime = date;
    transferReceipt = await transferReceipt.save();
    event.transferReceipts.push(transferReceipt._id);
    await event.save();
    return res.status(STATUS_CODES.CREATED).json(transferReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function approvePaymentWithoutReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!isValidId(req.params.user))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid ObjectID" });
    const eventToApprove: IEvent | null = await Event.findById(
      req.params.event
    );
    if (
      !eventToApprove?.members.some((member) =>
        member.equals(req.params.user)
      )
    )
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user is not a member of the event." });
    const hasUploadedValue = await hasUploaded(
      req.params.user,
      req.params.event
    );
    if (hasUploadedValue.hasUploaded) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The user has uploaded a transfer receipt" });
    }
    let transferReceipt: ITransferReceipt = new TransferReceipt();
    const date: Date = new Date();
    date.setHours(date.getHours() - 3);
    transferReceipt.datetime = date;
    transferReceipt.amount = 0;
    transferReceipt.receiver = req.body.receiver ? new mongoose.Types.ObjectId(req.body.receiver) : null;
    transferReceipt.event = new mongoose.Types.ObjectId(req.params.event);
    transferReceipt.user = new mongoose.Types.ObjectId(req.params.user);
    transferReceipt.hasPaid = true;
    transferReceipt = await transferReceipt.save();
    const event = await Event.findById(req.params.event);
    event.transferReceipts.push(transferReceipt._id);
    await event.save();
    if (await isFinished(req.params.event)) {
      event.state = "finished";
      await event.save();
    }
    return res.status(STATUS_CODES.CREATED).json(transferReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}

export async function approveTransferReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt: ITransferReceipt | null =
      await TransferReceipt.findById(req.params.id);
    if (!transferReceipt)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: transferReceiptNotFoundMessage });
    if (transferReceipt.hasPaid)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The transfer receipt is already approved." });
    transferReceipt.hasPaid = true;
    await transferReceipt.save();
    if (await isFinished(transferReceipt.event.toString())) {
      const event: IEvent = await Event.findById(transferReceipt.event);
      event.state = "finished";
      await event.save();
    }
    return res.status(STATUS_CODES.OK).json(transferReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}

export async function deleteTransferReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt: ITransferReceipt | null =
      await TransferReceipt.findById(req.params.id);
    if (!transferReceipt)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: transferReceiptNotFoundMessage,
      });
    const eventId: mongoose.Types.ObjectId = transferReceipt.event;
    const event: IEvent | null = await Event.findById(eventId);
    if (event.state !== "readyforpayment")
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: cannotCreateTransferReceiptMessage,
      });
    await TransferReceipt.findByIdAndDelete(transferReceipt._id);
    if (transferReceipt.image)
      await Image.findByIdAndDelete(transferReceipt.image);
    event.transferReceipts = event.transferReceipts.filter(
      (id) => !id.equals(transferReceipt._id)
    );
    await event.save();
    return res.status(STATUS_CODES.OK).json(transferReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}

export async function isFinished(eventId: string): Promise<boolean> {
  const event: IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null =
    await Event.findById(new mongoose.Types.ObjectId(eventId))
      .populate({
        path: "transferReceipts",
      })
      .populate({
        path: "purchaseReceipts",
        populate: [
          { path: "shoppingDesignee", model: "User" },
          { path: "participants", model: "User" },
        ],
      })
      .populate({ path: "members", model: "User" });

  const userBalances: IUserBalance[] = assignEventValues(
    event.purchaseReceipts
  );
  const transferInfo: ITransferInfo[] = calculateTransfersInfo(userBalances);

  const expectedTransfers: ITransferInfo[] = transferInfo.filter(
    (t) => t.receiver !== null
  );

  return expectedTransfers.every((transfer) =>
    event.transferReceipts.some(
      (r) => r.hasPaid === true && r.user.equals(transfer.userId)
    )
  );
}

export async function membersWhoHaveUploaded(
  eventId: string
): Promise<IMemberWhoHasUploaded[]> {
  const event: IEventWithMembersTransferReceipts = await Event.findById(
    eventId
  ).populate("members transferReceipts");
  const membersWithReceipts: string[] = [];
  const receiptInfo: IReceiptInfo[] = [];
  for (let receipt of event.transferReceipts) {
    membersWithReceipts.push(String(receipt.user));
    receiptInfo.push({
      hasReceiptApproved: receipt.hasPaid,
      transferReceipt: receipt._id,
    });
  }
  const members: IMemberWhoHasUploaded[] = [];
  for (let member of event.members) {
    if (membersWithReceipts.includes(String(member._id))) {
      const index = membersWithReceipts.indexOf(String(member._id));
      members.push({
        userId: member._id,
        userName: member.name,
        userLastName: member.lastName,
        specialDiet: member.specialDiet,
        transferReceipt: receiptInfo[index].transferReceipt,
        hasReceiptApproved: receiptInfo[index].hasReceiptApproved,
        hasUploaded: true,
      });
    } else {
      members.push({
        userId: member._id,
        userName: member.name,
        userLastName: member.lastName,
        specialDiet: member.specialDiet,
        transferReceipt: null,
        hasReceiptApproved: null,
        hasUploaded: false,
      });
    }
  }
  return members;
}

export async function hasUploaded(
  userId: string,
  eventId: string
): Promise<IHasUploadedInfo> {
  const event: IEventWithTransferReceipts = await Event.findById(
    new mongoose.Types.ObjectId(eventId)
  ).populate("transferReceipts");
  for (const receipt of event.transferReceipts) {
    if (receipt.user.equals(new mongoose.Types.ObjectId(userId))) {
      return {
        hasUploaded: true,
        hasReceiptApproved: receipt.hasPaid,
        transferReceipt: receipt._id,
      };
    }
  }
  return {
    hasUploaded: false,
    hasReceiptApproved: false,
    transferReceipt: null,
  };
}
