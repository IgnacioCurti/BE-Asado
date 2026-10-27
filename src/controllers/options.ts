import { Request, Response } from "express";
import { Option } from "../models/option.js";
import { Event } from "../models/event.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { IEvent, IEventWithMembers, IOption, IRequestWithUser, IUser, IUserName } from "../models/interfaces.js";
import mongoose from "mongoose";

// Votes are only changed through voteOption/unvoteOption, so create and edit
// ignore any participants sent in the body.
export async function createOption(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { title }: { title: string } = req.body;

    const newOption: IOption = new Option({ title });

    await newOption.save();

    await Event.findByIdAndUpdate(req.params.event, {
      $push: { options: newOption._id },
    });

    return res.status(STATUS_CODES.CREATED).json(newOption);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function editOptions(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { title }: { title: string } = req.body;

    const updatedOption: IOption | null = await Option.findByIdAndUpdate(
      req.params.id,
      { title },
      { new: true }
    );

    if (!updatedOption) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Option not found" });
    }

    return res.status(STATUS_CODES.OK).json(updatedOption);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

async function updateOwnVote(
  req: IRequestWithUser,
  res: Response,
  operator: "$addToSet" | "$pull"
): Promise<Response> {
  try {
    const updatedOption: IOption | null = await Option.findByIdAndUpdate(
      req.params.id,
      { [operator]: { participants: req.user._id } },
      { new: true }
    );

    if (!updatedOption) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Option not found" });
    }

    return res.status(STATUS_CODES.OK).json(updatedOption);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function voteOption(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  return updateOwnVote(req, res, "$addToSet");
}

export async function unvoteOption(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  return updateOwnVote(req, res, "$pull");
}

export async function deleteOption(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const deletedOption = await Option.findByIdAndDelete(req.params.id);

    if (!deletedOption) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Option not found" });
    }

    await Event.updateOne(
      { options: deletedOption._id },
      { $pull: { options: deletedOption._id } }
    );

    return res.status(STATUS_CODES.OK).json(deletedOption);
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getMembersWhoHaventVoted(req: Request, res: Response) {
  try {
    interface IEventWithMembersName extends Omit<IEvent, "members"> {
      members: IUserName[];
    }
    const event: IEventWithMembersName | null = await Event.findById(req.params.event).populate({
      path: "members",
      select: "_id name lastName"
    });

    if (!event) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Event not found" });
    }

    const allOptions = await Option.find({ _id: { $in: event.options } });
    const participantsInOptions = new Set<string>();
    allOptions.forEach((option) => {
      option.participants.forEach((participantId: mongoose.Types.ObjectId) => {
        participantsInOptions.add(participantId.toString());
      });
    });

    const membersWhoHaventVoted = event.members.filter(
      (member: IUserName) =>
        !participantsInOptions.has(member._id.toString())
    );

    return res
      .status(STATUS_CODES.OK)
      .json({ membersWhoHaventVoted });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
