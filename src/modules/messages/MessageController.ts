import { Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { MessageService } from "./MessageService.js";

export class MessageController {
  constructor(private readonly service: MessageService) {}

  // Arrow functions: conservan `this` al pasarse como handlers de Express.
  list = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const page = await this.service.list(req.params.event, req.query);
    return res.status(STATUS_CODES.OK).json(page);
  };

  send = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const message = await this.service.send(req.params.event, req.user._id, req.body?.text);
    return res.status(STATUS_CODES.CREATED).json(message);
  };
}
