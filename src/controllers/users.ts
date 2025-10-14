import { Request, Response } from "express";
import { genSalt, hash } from "bcrypt";
import { User } from "../models/user";
import { STATUS_CODES } from "../constants/httpStatusCode";
import {
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersPurchaseReceiptsPopulated,
  ISafeUser,
  IUser,
  ObjectId,
} from "../models/interfaces";
import {
  findOneAndDelete as findOneImageAndDelete,
  saveImage,
} from "../repositories/imageRepository";
import {
  findById as findUserById,
  findOne as findOneUser,
  find as findUser,
  findByIdAndRemove as findUserByIdAndRemove,
} from "../repositories/usersRepository";
import { assignEventValues, calculateTransfersInfo } from "../utils/balance";
import {
  EventState,
  findAndPopulate as findEventsAndPopulate,
} from "../repositories/eventsRepository";
import { findOneTransferReceipt } from "../repositories/receiptsRepository";
import { createObjectId } from "../repositories/utils/mongoose";

const userNotFoundMessage = "The user with the given ID was not found.";

export async function getUsers(req: Request, res: Response): Promise<Response> {
  try {
    const users = await findUser<ISafeUser>(
      undefined,
      "-password -verificationCode"
    );
    return res.status(STATUS_CODES.OK).json(users);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function getUserById(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const user = await findUserById<ISafeUser>(
      req.params.id,
      "-password -verificationCode"
    );
    if (!user) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    } else {
      return res.status(STATUS_CODES.OK).json(user);
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function isDebtor(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const userId = req.params.id;

    const events: IEventWithMembersPurchaseReceiptsPopulated[] =
      await findEventsAndPopulate<IEventWithMembersPurchaseReceiptsPopulated>(
        {
          members: userId,
          state: EventState.readyForPayment,
        },
        [
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
    const debtorEvents: ObjectId[] = [];
    for (const { _id, purchaseReceipts } of events) {
      const userBalances = assignEventValues(purchaseReceipts);
      const transferInfo = calculateTransfersInfo(userBalances);

      const userTransfer = transferInfo.find(
        (t) => t.userId.equals(userId) && t.receiver
      );

      if (userTransfer) {
        const receipt = await findOneTransferReceipt({
          event: _id,
          user: userId,
        });

        if (!receipt || !receipt.hasPaid) {
          debtorEvents.push(_id);
        }
      }
    }
    return res.status(STATUS_CODES.OK).json(debtorEvents);
  } catch (error: any) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      message: error?.message || "Internal server error.",
    });
  }
}

export async function hasPendingTransfers(
  req: Request<{ id: string }>,
  res: Response
) {
  try {
    const shoppingDesigneeId = createObjectId(req.params.id);
    const events =
      await findEventsAndPopulate<IEventAmountCalculationsWithTransfers>(
        {
          shoppingDesignee: shoppingDesigneeId,
          state: EventState.readyForPayment,
        },
        [
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
          },
        ],
        "purchaseReceipts members"
      );
    const debtorEvents: ObjectId[] = [];
    for (const { _id, transferReceipts } of events) {
      for (const { hasPaid, receiver } of transferReceipts) {
        if (!hasPaid && receiver && shoppingDesigneeId.equals(receiver)) {
          debtorEvents.push(_id);
          break;
        }
      }
    }
    return res.status(STATUS_CODES.OK).json(debtorEvents);
  } catch (error: any) {
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      message: error?.message || "Internal server error.",
    });
  }
}

export async function register(
  req: Request<any, any, { email: string; password: string }>,
  res: Response
): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const existingUser = await findOneUser<IUser>({ email: req.body.email });
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
    const salt = await genSalt(10);
    user.password = await hash(user.password, salt);
    user = await user.save();
    return res.status(STATUS_CODES.CREATED).json(user);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function editUser(
  req: Request<
    { id: string },
    any,
    {
      name?: string;
      lastName?: string;
      alternativeEmail?: string;
      specialDiet: string[];
      alias?: string;
      cbu?: string;
      notifications?: {
        newEvent?: boolean;
        eventStart?: boolean;
        penalizationStart?: boolean;
        penalizationOneWeek?: boolean;
      };
    }
  >,
  res: Response
): Promise<Response> {
  try {
    let user = await findUserById<IUser>(req.params.id);
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });

    const {
      name,
      lastName,
      alternativeEmail,
      specialDiet,
      alias,
      cbu,
      notifications,
    } = req.body;
    user.name = name || user.name;
    user.lastName = lastName || user.lastName;
    user.alternativeEmail = alternativeEmail
      ? alternativeEmail.toLowerCase()
      : null;
    user.specialDiet = specialDiet;
    user.alias = alias;
    user.cbu = cbu;
    user.notifications = {
      newEvent: notifications?.newEvent ?? user.notifications.newEvent,
      eventStart: notifications?.eventStart ?? user.notifications.eventStart,
      penalizationStart:
        notifications?.penalizationStart ??
        user.notifications.penalizationStart,
      penalizationOneWeek:
        notifications?.penalizationOneWeek ??
        user.notifications.penalizationOneWeek,
    };
    user = await user.save();
    return res.status(STATUS_CODES.OK).json(user);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function editProfilePicture(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    if (req.file) {
      let user = await findUserById<IUser>(req.params.id);
      if (!user)
        return res
          .status(STATUS_CODES.NOT_FOUND)
          .json({ message: userNotFoundMessage });

      if (user.profilePicture) {
        await findOneImageAndDelete(user.profilePicture);
      }

      const imageId = await saveImage(req.file);
      user.profilePicture = imageId;
      user = await user.save();
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

export async function deleteUser(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const user = await findUserByIdAndRemove(req.params.id);
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: userNotFoundMessage });
    return res.status(STATUS_CODES.OK).json(user);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
