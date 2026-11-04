import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { RatingService } from "./RatingService.js";

export class RatingController {
  constructor(private readonly service: RatingService) {}

  // Arrow functions: conservan `this` al pasarse como handlers de Express.
  create = async (req: Request, res: Response): Promise<Response> => {
    const rating = await this.service.createOrUpdate(
      req.params.event,
      req.params.user,
      req.body.score
    );
    return res.status(STATUS_CODES.OK).json(rating);
  };

  getFromUser = async (req: Request, res: Response): Promise<Response> => {
    const rating = await this.service.getFromUser(req.params.event, req.params.user);
    if (!rating)
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "User does not have a rating for this event." });
    return res.status(STATUS_CODES.OK).json(rating);
  };
}
