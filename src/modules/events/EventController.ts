import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { EventService } from "./EventService.js";

export class EventController {
  constructor(private readonly service: EventService) {}

  list = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.json(await this.service.listVisibleTo(req.user._id));
  };

  listPublic = async (_req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.listPublic());
  };

  listPublicAndPrivate = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.listPublicVisibleTo(req.user._id));
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    return res.json(await this.service.getDetails(req.params.id));
  };

  getMembersAndReceiptsInfo = async (req: Request, res: Response): Promise<Response> => {
    return res
      .status(STATUS_CODES.OK)
      .json(await this.service.getMembersPaymentStatus(req.params.event));
  };

  getMembersAmount = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getTransfers(req.params.event));
  };

  getMemberIndividualCost = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const userAmount = await this.service.getMemberCost(
      req.params.event,
      req.params.user,
      req.user._id
    );
    return res.status(STATUS_CODES.OK).json({ userAmount });
  };
}
