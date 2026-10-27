import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { Image } from "../models/image.js";
import { User } from "../models/user.js";
import { Event } from "../models/event.js";
import { PurchaseReceipt } from "../models/purchaseReceipt.js";
import { TransferReceipt } from "../models/transferReceipt.js";
import { extname } from "path";
import { isValidId } from "../utils/utils.js";
import { Request, Response } from "express";
import { IEvent, IImage, IRequestWithUser } from "../models/interfaces.js";
import mongoose from "mongoose";

type ImageAccess = "allowed" | "forbidden" | "unreferenced";

// Profile pictures are visible to any logged-in user; receipt images only to
// members of the receipt's event. Images nothing points to are not served.
async function imageAccess(
  imageId: string,
  userId: string
): Promise<ImageAccess> {
  if (await User.exists({ profilePicture: imageId })) return "allowed";
  const receipt: { event: mongoose.Types.ObjectId } | null =
    (await PurchaseReceipt.findOne({ image: imageId })) ??
    (await TransferReceipt.findOne({ image: imageId }));
  if (!receipt) return "unreferenced";
  const event: IEvent | null = await Event.findById(receipt.event);
  return event?.members.some((member) => member.toString() === userId)
    ? "allowed"
    : "forbidden";
}

export async function getImage(
  req: IRequestWithUser,
  res: Response
): Promise<Response> {
  try {
    const id: string = req.params.id;
    if (!isValidId(id))
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "No valid id was provided." });
    const image: IImage | null = await Image.findById(id);
    const access: ImageAccess | null = image
      ? await imageAccess(id, req.user._id)
      : null;
    if (!image || access === "unreferenced")
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: "No image was found." });
    if (access === "forbidden")
      return res.status(STATUS_CODES.FORBIDDEN).json({
        message: "Access denied. The user is not a participant of the event.",
      });
    res.contentType(image.mimetype);
    return res.status(STATUS_CODES.OK).send(image.image);
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}

export async function saveImage(
  file: Express.Multer.File
): Promise<mongoose.Types.ObjectId> {
  if (!file) {
    throw new Error("No file provided");
  }
  const image: IImage = new Image();
  image.name = createImageName(file);
  image.mimetype = file.mimetype;
  image.image = file.buffer;
  await image.save();
  return image._id;
}

function createImageName({ originalname }: { originalname: string }): string {
  const fileExtension: string = extname(originalname);
  const fileName: string = originalname.split(fileExtension)[0];
  return `${fileName}_${Date.now()}${fileExtension}`;
}
