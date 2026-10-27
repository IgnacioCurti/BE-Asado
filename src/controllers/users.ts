import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/user.js";
import { Image } from "../models/image.js";
import { Event } from "../models/event.js";
import { TransferReceipt } from "../models/transferReceipt.js";
import { assignEventValues, calculateTransfersInfo } from "./events.js";
import { saveImage } from "./images.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import {
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersPurchaseReceiptsPopulated,
  IImage,
  ISafeUser,
  ITransferInfo,
  ITransferReceipt,
  IUser,
} from "../models/interfaces.js";
import mongoose from "mongoose";

const userNotFoundMessage = "The user with the given ID was not found.";

export async function getUsers(req: Request, res: Response): Promise<Response> {
  try {
    const users: ISafeUser[] = await User.find().select(
      "-password -verificationCode"
    );
    return res.status(STATUS_CODES.OK).json(users);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getUserById(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const user: ISafeUser | null = await User.findById(req.params.id).select(
      "-password -verificationCode"
    );
    if (!user) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    } else {
      return res.status(STATUS_CODES.OK).json(user);
    }
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function isDebtor(req: Request, res: Response): Promise<Response> {
  try {
    const userId: string = req.params.id;

    const events: IEventWithMembersPurchaseReceiptsPopulated[] =
      await Event.find({
        members: userId,
        state: "readyforpayment",
      })
        .populate({
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        })
        .populate({ path: "members", model: "User" });
    const debtorEvents: mongoose.Types.ObjectId[] = [];
    for (const event of events) {
      const userBalances = assignEventValues(event.purchaseReceipts);
      const transferInfo = calculateTransfersInfo(userBalances);

      const userTransfer = transferInfo.find(
        (t) => t.userId.equals(userId) && t.receiver
      );

      if (userTransfer) {
        const receipt: ITransferReceipt | null = await TransferReceipt.findOne({
          event: event._id,
          user: userId,
        });

        if (!receipt || !receipt.hasPaid) {
          debtorEvents.push(event._id);
        }
      }
    }
    return res.status(STATUS_CODES.OK).json(debtorEvents);
  } catch (error) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      message: error?.message || "Internal server error.",
    });
  }
}

export async function hasPendingTransfers(req: Request, res: Response) {
  try {
    const shoppingDesigneeId: mongoose.Types.ObjectId = new mongoose.Types.ObjectId(req.params.id);
    const events: IEventAmountCalculationsWithTransfers[] = await Event.find({
      shoppingDesignee: shoppingDesigneeId,
      state: "readyforpayment",
    })
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
        {
          path: "transferReceipts",
          model: "TransferReceipt",
        }
      ]);
    const debtorEvents: mongoose.Types.ObjectId[] = [];
    for (const event of events) {
      for (const receipt of event.transferReceipts) {
        if (!receipt.hasPaid && shoppingDesigneeId.equals(receipt.receiver)) {
          debtorEvents.push(event._id);
          break;
        }
      }
    }
    return res.status(STATUS_CODES.OK).json(debtorEvents);
  } catch (error) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      message: error?.message || "Internal server error.",
    });
  }
}

export async function register(req: Request, res: Response): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const existingUser: IUser = await User.findOne({ email: req.body.email });
    if (existingUser)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "User already registered" });

    const passwordPattern: RegExp = new RegExp(
      "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$"
    );
    if (!passwordPattern.test(req.body.password)) {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Password doesn't match the requirements." });
    }
    let user: IUser = new User(req.body);
    const salt: string = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    user = await user.save();
    return res.status(STATUS_CODES.CREATED).json(user);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function editUser(req: Request, res: Response): Promise<Response> {
  try {
    let user: IUser | null = await User.findById(req.params.id);
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    user.name = req.body.name ? req.body.name : user.name;
    user.lastName = req.body.lastName ? req.body.lastName : user.lastName;
    user.alternativeEmail = req.body.alternativeEmail
      ? req.body.alternativeEmail.toLowerCase()
      : null;
    user.specialDiet = req.body.specialDiet;
    user.alias = req.body.alias;
    user.cbu = req.body.cbu;
    user.notifications = {
      newEvent: req.body.notifications?.newEvent ?? user.notifications.newEvent,
      eventStart:
        req.body.notifications?.eventStart ?? user.notifications.eventStart,
      penalizationStart:
        req.body.notifications?.penalizationStart ??
        user.notifications.penalizationStart,
      penalizationOneWeek:
        req.body.notifications?.penalizationOneWeek ??
        user.notifications.penalizationOneWeek,
    };
    user = await user.save();
    return res.status(STATUS_CODES.OK).json(user);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function editProfilePicture(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    if (!req.file)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No file was uploaded." });
    let user: IUser | null = await User.findById(req.params.id);
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    if (user.profilePicture) {
      const deletedImage: IImage | null = await Image.findOneAndDelete(
        user.profilePicture
      );
    }
    const imageId: mongoose.Types.ObjectId = await saveImage(req.file);
    user.profilePicture = imageId;
    user = await user.save();
    return res.status(STATUS_CODES.OK).json({ imageId: imageId });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function deleteUser(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const user: IUser | null = await User.findByIdAndRemove(req.params.id);
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    return res.status(STATUS_CODES.OK).json(user);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
