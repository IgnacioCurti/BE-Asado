import jwt from "jsonwebtoken";
import multer from "multer";
import mongoose from "mongoose";
import { NextFunction } from "express";
import { Event } from "../models/event.js";
import { TransferReceipt } from "../models/transferReceipt.js";
import { isValidId } from "../utils/utils.js";
import { jwtPrivateKey } from "../config.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { Request, Response } from "express";
import { IEvent, ITransferReceipt, IUserPayload, IRequestWithUser } from "../models/interfaces.js";

const invalidObjectIdMessage: string = "Invalid ObjectID";

const MIMETYPES: string[] = ["image/jpeg", "image/png", "application/pdf"];
const MIMETYPES_IMAGE: string[] = ["image/jpeg", "image/png"];
// Files are kept in memory and stored inside a Mongo document (16 MB max).
const MAX_FILE_SIZE: number = 5 * 1024 * 1024;

export function auth(req: IRequestWithUser, res: Response, next: NextFunction) {
  const token: string = req.header("Authorization");
  if (!token)
    return res
      .status(STATUS_CODES.UNAUTHORIZED)
      .json({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, jwtPrivateKey) as IUserPayload;
    req.user = decoded;
    next();
  } catch (error: any) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({ message: "Invalid token." });
  }
}

export async function eventOrganizer(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.params.id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    const event: IEvent = await Event.findById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID does not exist." });
    if (event.organizer.toString() !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Access denied. The user is not the event's organizer.",
      });
    next();
  } catch (error: any) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

export async function eventParticipant(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.params.event))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    const event: IEvent = await Event.findById(req.params.event);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID does not exist." });
    if (!event.members.includes(new mongoose.Types.ObjectId(req.user._id)))
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Access denied. The user is not a participant of the event.",
      });
    next();
  } catch (error: any) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

export const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Only ${MIMETYPES.join(" - ")} mime types are allowed.`));
  },
  limits: { fieldSize: 10000000, fileSize: MAX_FILE_SIZE },
});

export const multerUploadImages = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (MIMETYPES_IMAGE.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new Error(`Only ${MIMETYPES_IMAGE.join(" - ")} mime types are allowed.`)
      );
  },
  limits: {
    fieldSize: 10000000,
    fileSize: MAX_FILE_SIZE,
  },
});

export async function sameUser(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.user._id) || !isValidId(req.params.id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    if (req.params.id !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message:
          "Access denied. User is trying to access other user's information.",
      });
    next();
  } catch (error: any) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

export async function shoppingDesignee(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.user._id) || !isValidId(req.params.event))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    const event: IEvent = await Event.findById(req.params.event);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID does not exist." });
    const designee: mongoose.Types.ObjectId | undefined = event.shoppingDesignee.find(
      (s) => s.toString() == req.user._id
    );
    if (designee) {
      next();
    } else {
      return res
        .status(STATUS_CODES.FORBIDDEN)
        .json({ message: "Access denied. User is not a shopping designee." });
    }
  } catch (error: any) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

export async function transferReceiptOwner(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.params.id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid ID" });
    const transferReceipt: ITransferReceipt | null = await TransferReceipt.findById(req.params.id);
    if (!transferReceipt)
      return res.status(STATUS_CODES.NOT_FOUND).json({
        message: "The transfer receipt with the given ID does not exist.",
      });
    if (transferReceipt.user.toString() !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Access denied. The user is not the owner of the receipt.",
      });
    next();
  } catch (error: any) {
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}

export async function shoppingDesigneeOrEventOrganizer(req: IRequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!isValidId(req.user._id) || !isValidId(req.params.id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: invalidObjectIdMessage });
    const event: IEvent | null = await Event.findById(req.params.id);
    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID does not exist." });
    const isDesignee: boolean = Boolean(
      event.shoppingDesignee.find(
        (id) => id.toString() === req.user._id.toString()
      )
    );
    if (!isDesignee && event.organizer.toString() !== req.user._id)
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message:
          "Access denied. The user is not the event's shopping designee or organizer.",
      });
    next();
  } catch (error: any) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message: error?.message || "Internal server error" });
  }
}
