import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { PurchaseReceiptService } from "./PurchaseReceiptService.js";

export class PurchaseReceiptController {
  constructor(private readonly service: PurchaseReceiptService) {}

  listByEvent = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.listByEvent(req.params.event));
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getById(req.params.id));
  };

  uploadFile = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const imageId = await this.service.attachFile(req.params.purchaseReceipt, req.user._id, req.file);
    return res.status(STATUS_CODES.OK).json({ imageId });
  };

  create = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const receipt = await this.service.create(req.params.event, req.user._id, {
      description: req.body.description,
      amount: req.body.amount,
      participants: req.body.participants,
    });
    return res.status(STATUS_CODES.CREATED).json(receipt);
  };

  assignMembers = async (req: Request, res: Response): Promise<Response> => {
    await this.service.assignParticipants(req.body.receipts);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Participants assigned to receipts successfully" });
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.delete(req.params.id));
  };
}
