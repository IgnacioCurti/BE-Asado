import mongoose from "mongoose";
import { extname } from "path";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IEvent, IImage } from "../../models/interfaces.js";
import { EventRepository } from "../events/EventRepository.js";
import { UserRepository } from "../users/UserRepository.js";
import { PurchaseReceiptRepository } from "../purchaseReceipts/PurchaseReceiptRepository.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { ImageRepository } from "./ImageRepository.js";

type ImageAccess = "allowed" | "forbidden" | "unreferenced";

export class ImageService {
  constructor(
    private readonly images: Pick<ImageRepository, "findById" | "create" | "deleteById">,
    private readonly users: Pick<UserRepository, "hasProfilePicture">,
    private readonly purchaseReceipts: Pick<PurchaseReceiptRepository, "findByImage">,
    private readonly transferReceipts: Pick<TransferReceiptRepository, "findByImage">,
    private readonly events: Pick<EventRepository, "findById">,
    private readonly now: () => number = Date.now
  ) {}

  // Las fotos de perfil las ve cualquier usuario logueado; las de recibos,
  // solo los miembros del evento. Las imágenes sin referencias no se sirven.
  async getForUser(imageId: string, userId: string): Promise<IImage> {
    if (!isValidId(imageId)) throw new BadRequestError("No valid id was provided.");
    const image: IImage | null = await this.images.findById(imageId);
    const access: ImageAccess | null = image ? await this.access(imageId, userId) : null;
    if (!image || access === "unreferenced") throw new NotFoundError("No image was found.");
    if (access === "forbidden")
      throw new ForbiddenError("Access denied. The user is not a participant of the event.");
    return image;
  }

  async save(file: Express.Multer.File): Promise<mongoose.Types.ObjectId> {
    // Error genérico a propósito: los llamadores lo responden como 500.
    if (!file) throw new Error("No file provided");
    const image: IImage = await this.images.create({
      name: this.createImageName(file.originalname),
      mimetype: file.mimetype,
      image: file.buffer,
    });
    return image._id;
  }

  async delete(imageId: mongoose.Types.ObjectId | string): Promise<void> {
    await this.images.deleteById(String(imageId));
  }

  private async access(imageId: string, userId: string): Promise<ImageAccess> {
    if (await this.users.hasProfilePicture(imageId)) return "allowed";
    const receipt: { event: mongoose.Types.ObjectId } | null =
      (await this.purchaseReceipts.findByImage(imageId)) ??
      (await this.transferReceipts.findByImage(imageId));
    if (!receipt) return "unreferenced";
    const event: IEvent | null = await this.events.findById(String(receipt.event));
    return event?.members.some((member) => member.toString() === userId)
      ? "allowed"
      : "forbidden";
  }

  private createImageName(originalname: string): string {
    const fileExtension: string = extname(originalname);
    const fileName: string = originalname.split(fileExtension)[0];
    return `${fileName}_${this.now()}${fileExtension}`;
  }
}
