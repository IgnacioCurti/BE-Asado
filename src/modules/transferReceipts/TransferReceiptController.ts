import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { TransferReceiptService } from "./TransferReceiptService.js";

export class TransferReceiptController {
  constructor(private readonly service: TransferReceiptService) {}

  listByEvent = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.listByEvent(req.params.event));
  };

  getById = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.getById(req.params.id));
  };

  uploadFile = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const imageId = await this.service.attachFile(req.params.transferReceipt, req.user._id, req.file);
    return res.status(STATUS_CODES.OK).json({ imageId });
  };

  create = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const receipt = await this.service.create(req.params.event, req.user._id, {
      description: req.body.description,
      paymentMethod: req.body.paymentMethod,
    });
    return res.status(STATUS_CODES.CREATED).json(receipt);
  };

  approveWithoutReceipt = async (req: Request, res: Response): Promise<Response> => {
    const receipt = await this.service.approveWithoutReceipt(
      req.params.event,
      req.params.user,
      req.body.receiver
    );
    return res.status(STATUS_CODES.CREATED).json(receipt);
  };

  approve = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.approve(req.params.id));
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    return res.status(STATUS_CODES.OK).json(await this.service.delete(req.params.id));
  };
}
