import mongoose from "mongoose";
import { Request, Response } from "express";
import { PurchaseReceipt } from "../models/purchaseReceipt.js";
import { Event } from "../models/event.js";
import { saveImage } from "./images.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import {
  IRequestWithUser,
  IEvent,
  IEventWithPurchaseReceiptsPopulated,
  IPurchaseReceipt,
} from "../models/interfaces.js";

export async function getPurchaseReceiptsByEvent(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.params.event)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No event ID provided" });
    const event: IEventWithPurchaseReceiptsPopulated | null =
      await Event.findById(req.params.event).populate([
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
      ]);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });
    return res.status(STATUS_CODES.OK).json(event.purchaseReceipts);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getPurchaseReceiptById(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const purchaseReceipt: IPurchaseReceipt = await PurchaseReceipt.findById(
      req.params.id
    );
    if (!purchaseReceipt) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The purchase receipt with the given ID was not found.",
      });
    } else {
      return res.status(STATUS_CODES.OK).json(purchaseReceipt);
    }
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function uploadFilePurchaseReceipt(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    if (!req.file)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No file was uploaded." });
    let purchaseReceipt: IPurchaseReceipt | null =
      await PurchaseReceipt.findById(req.params.purchaseReceipt);
    if (!purchaseReceipt) {
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The purchase receipt with the given ID was not found.",
      });
    }
    const event: IEvent | null = await Event.findById(purchaseReceipt.event);
    const isDesignee: boolean = Boolean(
      event?.shoppingDesignee.some((id) => id.toString() === req.user._id)
    );
    if (!isDesignee)
      return res
        .status(STATUS_CODES.FORBIDDEN)
        .json({ message: "Access denied. User is not a shopping designee." });
    const imageId: mongoose.Types.ObjectId = await saveImage(req.file);
    purchaseReceipt.image = imageId;
    await purchaseReceipt.save();
    return res.status(STATUS_CODES.OK).json({ imageId: imageId });
  } catch (error) {
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
    const event: IEvent | null = await Event.findById(req.params.event);
    if (event.state !== "closed")
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          "Purchase receipts can only be uploaded when the event is closed",
      });
    const participants: unknown[] = req.body.participants ?? event.members;
    const allMembers: boolean =
      Array.isArray(participants) &&
      participants.every((participant) =>
        event.members.some((member) => member.equals(String(participant)))
      );
    if (!allMembers)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "All participants must be members of the event.",
      });
    let purchaseReceipt: IPurchaseReceipt = new PurchaseReceipt({
      description: req.body.description,
      amount: req.body.amount,
    });
    purchaseReceipt.event = event._id;
    purchaseReceipt.shoppingDesignee = new mongoose.Types.ObjectId(
      req.user._id
    );
    purchaseReceipt.participants = participants as mongoose.Types.ObjectId[];
    purchaseReceipt = await purchaseReceipt.save();
    event.purchaseReceipts.push(purchaseReceipt._id);
    await event.save();
    return res.status(STATUS_CODES.CREATED).json(purchaseReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function assignMembersToReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    for (const receipt of req.body.receipts) {
      const purchaseReceipt: IPurchaseReceipt = await PurchaseReceipt.findById(
        receipt.id
      );
      if (!purchaseReceipt)
        return res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: "One or more purchase receipts were not found" });
      purchaseReceipt.participants = receipt.participants;
      await purchaseReceipt.save();
    }
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Participants assigned to receipts successfully" });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function deletePurchaseReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const purchaseReceipt: IPurchaseReceipt | null =
      await PurchaseReceipt.findById(req.params.id);
    if (!purchaseReceipt)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The purchase receipt with the given ID was not found.",
      });
    const event = await Event.findById(purchaseReceipt.event);
    if (event.state !== "closed")
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message:
          "Purchase receipts can only be uploaded or deleted when the event is closed",
      });
    const index: number = event.purchaseReceipts.indexOf(purchaseReceipt._id);
    if (index !== -1) {
      event.purchaseReceipts.splice(index, 1);
      await event.save();
    }
    await PurchaseReceipt.findByIdAndDelete(req.params.id);
    return res.status(STATUS_CODES.OK).json(purchaseReceipt);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
