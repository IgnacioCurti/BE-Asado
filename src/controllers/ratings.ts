import { Rating } from "../models/rating";
import { STATUS_CODES } from "../constants/httpStatusCode";
import { Request, Response } from "express";
import { IRating, IEvent } from "../models/interfaces";
import {
  EventState,
  findByIdAndPopulate as findEventByIdAndPopulate,
} from "../repositories/eventsRepository";
import { createObjectId } from "../repositories/utils/mongoose";

interface IEventWithRatings extends Omit<IEvent, "ratings"> {
  ratings: IRating[];
}

export async function createRating(
  req: Request<{ event: string; user: string }>,
  res: Response
): Promise<Response> {
  try {
    const { event: eventId, user: userId } = req.params;
    const event = await findEventByIdAndPopulate<IEventWithRatings>(eventId, [
      "ratings",
    ]);

    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (!event.members.includes(createObjectId(userId)))
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "The user with the given ID was not found in the event.",
      });

    if (
      event.state == EventState.available ||
      event.state == EventState.cancelled
    )
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "The event is not closed or finished." });

    const rating = event.ratings.find((r) => r.user.equals(userId));
    if (rating) {
      rating.score = req.body.score;
      await rating.save();
      await event.save();
      return res.status(STATUS_CODES.OK).json(rating);
    } else {
      const newRating: IRating = new Rating({
        score: req.body.score,
        user: userId,
      });
      event.ratings.push(newRating);
      await newRating.save();
      await event.save();
      return res.status(STATUS_CODES.OK).json(newRating);
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function getRatingFromUser(
  req: Request<{ event: string; user: string }>,
  res: Response
): Promise<Response> {
  try {
    const event = await findEventByIdAndPopulate<IEventWithRatings>(
      req.params.event,
      ["ratings"]
    );

    if (!event)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "The event with the given ID was not found." });

    if (!event.members.includes(createObjectId(req.params.user)))
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        message: "The user with the given ID was not found in the event.",
      });

    const rating = event.ratings.find((r) => r.user.equals(req.params.user));
    if (rating) {
      return res.status(STATUS_CODES.OK).json(rating);
    } else {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "User does not have a rating for this event." });
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
