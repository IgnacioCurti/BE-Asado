import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IEvent, IEventWithPurchaseReceiptsPopulated, IPurchaseReceipt } from "../../models/interfaces.js";
import { EventRepository } from "../events/EventRepository.js";
import { ImageService } from "../images/ImageService.js";
import { PurchaseReceiptRepository } from "./PurchaseReceiptRepository.js";

const receiptNotFoundMessage: string = "The purchase receipt with the given ID was not found.";

export interface PurchaseReceiptInput {
  description?: string;
  amount?: number;
  participants?: unknown;
}

export interface ReceiptParticipantsInput {
  id: string;
  participants: mongoose.Types.ObjectId[];
}

// La autorización de lectura (miembro) y de creación/borrado (designado de
// compras) la aplican hoy los middlewares eventParticipant y shoppingDesignee.
export class PurchaseReceiptService {
  constructor(
    private readonly receipts: Pick<PurchaseReceiptRepository, "findById" | "create" | "save" | "deleteById">,
    private readonly events: Pick<EventRepository, "findById" | "findByIdWithPurchaseReceipts" | "save">,
    private readonly images: Pick<ImageService, "save">
  ) {}

  async listByEvent(eventId: string): Promise<IEventWithPurchaseReceiptsPopulated["purchaseReceipts"]> {
    const event = await this.events.findByIdWithPurchaseReceipts(eventId);
    if (!event) throw new NotFoundError("The event with the given ID was not found.");
    return event.purchaseReceipts;
  }

  // El recibo tiene que ser del evento de la ruta (el middleware valida la membresía en ese evento).
  getById(id: string, eventId: string): Promise<IPurchaseReceipt> {
    return this.getReceiptOfEvent(id, eventId);
  }

  // Solo un designado de compras del evento del recibo puede adjuntar el archivo.
  async attachFile(
    receiptId: string,
    userId: string,
    file: Express.Multer.File | undefined
  ): Promise<mongoose.Types.ObjectId> {
    if (!file) throw new BadRequestError("No file was uploaded.");
    const receipt: IPurchaseReceipt = await this.getReceipt(receiptId);
    const event: IEvent | null = await this.events.findById(String(receipt.event));
    if (!event?.shoppingDesignee.some((id) => id.toString() === userId))
      throw new ForbiddenError("Access denied. User is not a shopping designee.");
    const imageId: mongoose.Types.ObjectId = await this.images.save(file);
    receipt.image = imageId;
    await this.receipts.save(receipt);
    return imageId;
  }

  // Sin participantes en el body, el gasto se reparte entre todos los miembros.
  async create(eventId: string, designeeId: string, input: PurchaseReceiptInput): Promise<IPurchaseReceipt> {
    const event: IEvent | null = await this.events.findById(eventId);
    if (event.state !== "closed")
      throw new BadRequestError("Purchase receipts can only be uploaded when the event is closed");
    const participants: unknown = input.participants ?? event.members;
    const allMembers: boolean =
      Array.isArray(participants) &&
      participants.every((participant) =>
        event.members.some((member) => member.equals(String(participant)))
      );
    if (!allMembers) throw new BadRequestError("All participants must be members of the event.");

    const receipt: IPurchaseReceipt = await this.receipts.create({
      description: input.description,
      amount: input.amount,
      event: event._id,
      shoppingDesignee: new mongoose.Types.ObjectId(designeeId),
      participants: participants as mongoose.Types.ObjectId[],
    });
    event.purchaseReceipts.push(receipt._id);
    await this.events.save(event);
    return receipt;
  }

  // Solo un designado de compras del evento de cada recibo, y los participantes
  // tienen que ser miembros de ese evento. Se valida todo antes de guardar nada.
  async assignParticipants(requesterId: string, receipts: unknown): Promise<void> {
    if (!Array.isArray(receipts)) throw new BadRequestError("receipts must be an array.");
    const updates: { receipt: IPurchaseReceipt; participants: mongoose.Types.ObjectId[] }[] = [];
    for (const input of receipts as ReceiptParticipantsInput[]) {
      if (!isValidId(String(input?.id))) throw new BadRequestError("Invalid ObjectID");
      const receipt: IPurchaseReceipt | null = await this.receipts.findById(input.id);
      if (!receipt) throw new NotFoundError("One or more purchase receipts were not found");
      const event: IEvent | null = await this.events.findById(String(receipt.event));
      if (!event) throw new NotFoundError("One or more purchase receipts were not found");
      if (!event.shoppingDesignee.some((id) => id.toString() === requesterId))
        throw new ForbiddenError("Access denied. User is not a shopping designee.");
      const participants: unknown = input.participants;
      const allMembers: boolean =
        Array.isArray(participants) &&
        participants.every((participant) =>
          event.members.some((member) => member.equals(String(participant)))
        );
      if (!allMembers) throw new BadRequestError("All participants must be members of the event.");
      updates.push({
        receipt,
        participants: [...new Set((participants as unknown[]).map(String))].map(
          (id) => new mongoose.Types.ObjectId(id)
        ),
      });
    }
    for (const { receipt, participants } of updates) {
      receipt.participants = participants;
      await this.receipts.save(receipt);
    }
  }

  async delete(id: string, eventId: string): Promise<IPurchaseReceipt> {
    const receipt: IPurchaseReceipt = await this.getReceiptOfEvent(id, eventId);
    const event: IEvent | null = await this.events.findById(String(receipt.event));
    if (event.state !== "closed")
      throw new BadRequestError(
        "Purchase receipts can only be uploaded or deleted when the event is closed"
      );
    const index: number = event.purchaseReceipts.indexOf(receipt._id);
    if (index !== -1) {
      event.purchaseReceipts.splice(index, 1);
      await this.events.save(event);
    }
    await this.receipts.deleteById(id);
    return receipt;
  }

  private async getReceiptOfEvent(id: string, eventId: string): Promise<IPurchaseReceipt> {
    if (!isValidId(id)) throw new BadRequestError("Invalid ObjectID");
    const receipt: IPurchaseReceipt = await this.getReceipt(id);
    if (String(receipt.event) !== eventId) throw new NotFoundError(receiptNotFoundMessage);
    return receipt;
  }

  private async getReceipt(id: string): Promise<IPurchaseReceipt> {
    const receipt: IPurchaseReceipt | null = await this.receipts.findById(id);
    if (!receipt) throw new NotFoundError(receiptNotFoundMessage);
    return receipt;
  }
}
