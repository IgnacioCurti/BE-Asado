import { Request, Response } from "express";
import { TransferReceipt } from "../models/transferReceipt";
import { STATUS_CODES } from "../constants/httpStatusCode";
import {
  IEvent,
  IEventWithTransferReceipts,
  IHasUploadedInfo,
  ITransferReceipt,
  ObjectId,
} from "../models/interfaces";
import {
  EventState,
  findById as findEventById,
  findByIdAndPopulate as findEventByIdAndPopulate,
  isEventFinished,
} from "../repositories/eventsRepository";
import {
  findTransferReceiptById,
  findTransferReceiptByIdAndDelete,
  findTransferReceiptByIdAndRemove,
  hasUploaded,
} from "../repositories/receiptsRepository";
import { saveImage } from "../repositories/imageRepository";
import { createObjectId } from "../repositories/utils/mongoose";

const transferReceiptNotFoundMessage: string =
  "The transfer receipt with the given ID was not found.";

const cannotCreateTransferReceiptMessage: string =
  "You can only create transfer receipts when the event is ready for payment.";

export async function getTransferReceiptsByEvent(
  req: Request<{ event: string }>,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventByIdAndPopulate<IEventWithTransferReceipts>(
      req.params.event,
      ["transferReceipts"]
    );
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });
    return res.status(STATUS_CODES.OK).json(event.transferReceipts);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getTransferReceiptsById(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt = await findTransferReceiptById(req.params.id);

    if (!transferReceipt) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: transferReceiptNotFoundMessage });
    } else {
      return res.status(STATUS_CODES.OK).json(transferReceipt);
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function uploadFileTransferReceipt(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (req.file) {
      const imageId = await saveImage(req.file);
      const transferReceipt = await findTransferReceiptById(
        req.params.transferReceipt
      );
      if (!transferReceipt) {
        return res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: transferReceiptNotFoundMessage });
      }
      transferReceipt.image = imageId;
      await transferReceipt.save();
      return res.status(STATUS_CODES.OK).json({ imageId });
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

export async function createTransferReceipt(
  req: Request<
    { event: string },
    any,
    { user: string; event: string; amount: number; receiver?: string }
  >,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventById(req.params.event);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (event.state !== EventState.readyForPayment)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: cannotCreateTransferReceiptMessage,
      });

    const hasUploadedValue: IHasUploadedInfo = await hasUploaded(
      req.body.user,
      req.params.event
    );

    if (hasUploadedValue.hasUploaded) {
      const oldTransferReceipt = await findTransferReceiptByIdAndRemove(
        hasUploadedValue.transferReceipt as ObjectId
      );
      if (oldTransferReceipt) {
        const index = event.transferReceipts.indexOf(oldTransferReceipt._id);
        event.transferReceipts.splice(index, 1);
        await event.save();
      }
    }

    let transferReceipt = new TransferReceipt(req.body);
    transferReceipt.event = createObjectId(req.params.event);
    let date = new Date();
    date.setHours(date.getHours() - 3);
    transferReceipt.datetime = date;
    transferReceipt = await transferReceipt.save();
    event.transferReceipts.push(transferReceipt._id);
    await event.save();
    return res.status(STATUS_CODES.CREATED).json(transferReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function approvePaymentWithoutReceipt(
  req: Request<{ event: string; user: string }, any, { receiver?: string }>,
  res: Response
): Promise<Response> {
  try {
    const { user: userId, event: eventId } = req.params;
    const hasUploadedValue = await hasUploaded(userId, eventId);
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
    transferReceipt.receiver = req.body.receiver
      ? createObjectId(req.body.receiver)
      : null;
    transferReceipt.event = createObjectId(eventId);
    transferReceipt.user = createObjectId(userId);
    transferReceipt.hasPaid = true;
    transferReceipt = await transferReceipt.save();
    const event = await findEventById(eventId);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    event.transferReceipts.push(transferReceipt._id);
    await event.save();
    if (await isEventFinished(eventId)) {
      event.state = EventState.finished;
      await event.save();
    }
    return res.status(STATUS_CODES.CREATED).json(transferReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}

export async function approveTransferReceipt(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt = await findTransferReceiptById(req.params.id);
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
    if (await isEventFinished(transferReceipt.event.toString())) {
      const event = await findEventById(transferReceipt.event);
      if (!event)
        return res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: "The event with the given ID was not found." });

      event.state = EventState.finished;
      await event.save();
    }
    return res.status(STATUS_CODES.OK).json(transferReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}

export async function deleteTransferReceipt(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const transferReceipt = await findTransferReceiptByIdAndDelete(
      req.params.id
    );
    if (!transferReceipt)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: transferReceiptNotFoundMessage,
      });

    const eventId = transferReceipt.event;
    const event: IEvent | null = await findEventById(eventId);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (event.state !== EventState.readyForPayment)
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: cannotCreateTransferReceiptMessage,
      });

    const index = event.transferReceipts.indexOf(transferReceipt._id);
    event.transferReceipts.splice(index, 1);
    await event.save();
    return res.status(STATUS_CODES.OK).json(transferReceipt);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error.message || "Internal server error." });
  }
}
