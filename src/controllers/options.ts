import { Request, Response } from "express";
import { Option } from "../models/option";
import { STATUS_CODES } from "../constants/httpStatusCode";
import { IEvent, IOption, IUserName, ObjectId } from "../models/interfaces";
import {
  findByIdAndPopulate,
  findByIdAndUpdate as findEventByIdAndUpdate,
  updateOne as updateOneEvent,
} from "../repositories/eventsRepository";
import {
  find as findOption,
  findByIdAndDelete as findOptionByIdAndDelete,
  findByIdAndUpdate as findOptionByIdAndUpdate,
} from "../repositories/optionsRepository";

export async function createOption(
  req: Request<
    { event: string },
    any,
    { title: string; participants: ObjectId[] }
  >,
  res: Response
): Promise<Response> {
  try {
    const { title, participants } = req.body;

    const newOption = new Option({
      title,
      participants,
    });

    await newOption.save();

    await findEventByIdAndUpdate(req.params.event, {
      $push: { options: newOption._id },
    });

    return res.status(STATUS_CODES.CREATED).json(newOption);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function editOptions(
  req: Request<
    { id: string },
    any,
    { title: string; participants: ObjectId[] }
  >,
  res: Response
): Promise<Response> {
  try {
    const { title, participants } = req.body;

    const updatedOption = await findOptionByIdAndUpdate(
      req.params.id,
      { title, participants },
      { new: true }
    );

    if (!updatedOption) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Option not found" });
    }

    return res.status(STATUS_CODES.OK).json(updatedOption);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function deleteOption(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const deletedOption = await findOptionByIdAndDelete(req.params.id);

    if (!deletedOption) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Option not found" });
    }

    await updateOneEvent(
      { options: deletedOption._id },
      { $pull: { options: deletedOption._id } }
    );

    return res.status(STATUS_CODES.OK).json(deletedOption);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getMembersWhoHaventVoted(
  req: Request<{ event: string }>,
  res: Response
) {
  try {
    interface IEventWithMembersName extends Omit<IEvent, "members"> {
      members: IUserName[];
    }
    const event = await findByIdAndPopulate<IEventWithMembersName>(
      req.params.event,
      [
        {
          path: "members",
          select: "_id name lastName",
        },
      ]
    );

    if (!event) {
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "Event not found" });
    }

    const allOptions = await findOption<IOption>({
      _id: { $in: event.options },
    });
    const participantsInOptions = new Set<string>();
    allOptions.forEach((option) => {
      option.participants.forEach((participantId: ObjectId) => {
        participantsInOptions.add(participantId.toString());
      });
    });

    const membersWhoHaventVoted = event.members.filter(
      (member: IUserName) => !participantsInOptions.has(member._id.toString())
    );

    return res.status(STATUS_CODES.OK).json({ membersWhoHaventVoted });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
