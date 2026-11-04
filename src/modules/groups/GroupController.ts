import { Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { GroupService } from "./GroupService.js";

export class GroupController {
  constructor(private readonly service: GroupService) {}

  create = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res
      .status(STATUS_CODES.CREATED)
      .json(await this.service.create(req.user._id, req.body?.name));
  };

  listMine = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.listForUser(req.user._id));
  };

  getById = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getDetails(req.params.group));
  };

  join = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.join(req.user._id, req.body?.code));
  };

  leave = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const result = await this.service.leave(req.params.group, req.user._id);
    return res.status(STATUS_CODES.OK).json({
      message: result.groupDeleted
        ? "Left the group. It had no other members, so it was deleted."
        : "Left the group.",
      ...result,
    });
  };

  edit = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.rename(req.params.group, req.body?.name));
  };

  makeAdmin = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res
      .status(STATUS_CODES.OK)
      .json(await this.service.makeAdmin(req.params.group, req.params.user));
  };

  regenerateCode = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json({ code: await this.service.regenerateCode(req.params.group) });
  };
}
