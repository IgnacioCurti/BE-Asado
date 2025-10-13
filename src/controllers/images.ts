import { STATUS_CODES } from "../constants/httpStatusCode";
import { Request, Response } from "express";
import { isValidId } from "../utils/utils";
import { findById } from "../repositories/imageRepository";

const defaultMimetype = "image/jpeg";

export async function getImage(
  req: Request<{ id: string }>,
  res: Response
): Promise<Response> {
  try {
    const id = req.params.id;
    if (!isValidId(id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No valid id was provided." });
    const image = await findById(id);
    if (!image)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No image was found." });
    res.contentType(image.mimetype || defaultMimetype);
    return res.status(STATUS_CODES.OK).send(image.image);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
