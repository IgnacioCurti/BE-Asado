import { Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { IRequestWithUser } from "../../models/interfaces.js";
import { ImageService } from "./ImageService.js";

export class ImageController {
  constructor(private readonly service: ImageService) {}

  get = async (req: IRequestWithUser, res: Response): Promise<Response> => {
    const image = await this.service.getForUser(req.params.id, req.user._id);
    res.contentType(image.mimetype);
    return res.status(STATUS_CODES.OK).send(image.image);
  };
}
