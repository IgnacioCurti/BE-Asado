import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { OptionService } from "./OptionService.js";

export class OptionController {
  constructor(private readonly service: OptionService) {}

  create = async (req: Request, res: Response): Promise<Response> => {
    const option = await this.service.create(req.params.event, req.body.title);
    return res.status(STATUS_CODES.CREATED).json(option);
  };

  edit = async (req: Request, res: Response): Promise<Response> => {
    const option = await this.service.editTitle(req.params.id, req.body.title);
    return res.status(STATUS_CODES.OK).json(option);
  };

  vote = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const option = await this.service.vote(req.params.id, req.user._id);
    return res.status(STATUS_CODES.OK).json(option);
  };

  unvote = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const option = await this.service.unvote(req.params.id, req.user._id);
    return res.status(STATUS_CODES.OK).json(option);
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    const option = await this.service.delete(req.params.id);
    return res.status(STATUS_CODES.OK).json(option);
  };

  getMembersWhoHaventVoted = async (req: Request, res: Response): Promise<Response> => {
    const membersWhoHaventVoted = await this.service.getMembersWhoHaventVoted(req.params.event);
    return res.status(STATUS_CODES.OK).json({ membersWhoHaventVoted });
  };
}
