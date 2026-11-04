import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { UserService } from "./UserService.js";

export class UserController {
  constructor(private readonly service: UserService) {}

  list = async (_req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.list());
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getById(req.params.id));
  };

  isDebtor = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getDebtorEvents(req.params.id));
  };

  hasPendingTransfers = async (req: Request, res: Response): Promise<Response> => {
    const events = await this.service.getEventsWithPendingTransfers(req.params.id);
    return res.status(STATUS_CODES.OK).json(events);
  };

  register = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.CREATED).json(await this.service.register(req.body));
  };

  edit = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.edit(req.params.id, req.body));
  };

  editProfilePicture = async (req: Request, res: Response): Promise<Response> => {
    const imageId = await this.service.updateProfilePicture(req.params.id, req.file);
    return res.status(STATUS_CODES.OK).json({ imageId });
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.delete(req.params.id));
  };
}
