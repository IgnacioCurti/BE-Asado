import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { NotificationService } from "./NotificationService.js";

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  reminderCheck = async (_req: Request, res: Response): Promise<Response> => {
    const reminders = await this.service.processDueReminders();
    return res.status(STATUS_CODES.OK).json({ data: reminders });
  };
}
