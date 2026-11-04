import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import {
  IEvent,
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersTransferReceipts,
  IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts,
  IEventWithTransferReceipts,
  IHasUploadedInfo,
  IMemberWhoHasUploaded,
  ITransferInfo,
  ITransferReceipt,
  IUser,
} from "../../models/interfaces.js";
import { nowArgentina } from "../../utils/dates.js";
import { EventRepository } from "../events/EventRepository.js";
import { ImageService } from "../images/ImageService.js";
import { PaymentCalculator } from "../payments/PaymentCalculator.js";
import { TransferReceiptRepository } from "./TransferReceiptRepository.js";

const receiptNotFoundMessage: string = "The transfer receipt with the given ID was not found.";
const notReadyForPaymentMessage: string =
  "You can only create transfer receipts when the event is ready for payment.";

export interface TransferReceiptInput {
  description?: string;
  paymentMethod?: string;
}

export interface TransferReceiptServiceDeps {
  receipts: Pick<TransferReceiptRepository, "findById" | "create" | "save" | "deleteById">;
  events: Pick<
    EventRepository,
    | "findById"
    | "save"
    | "findByIdWithPurchaseReceipts"
    | "findByIdWithTransferReceipts"
    | "findByIdWithMembersAndTransferReceipts"
    | "findByIdWithPaymentData"
    | "findByIdWithDebtData"
  >;
  images: Pick<ImageService, "save" | "delete">;
  payments: Pick<PaymentCalculator, "expectedTransfersFor">;
  now?: () => Date;
}

// Un TransferReceipt es el pago de un miembro al designado de compras.
// La autorización por evento la aplican hoy los middlewares de la ruta.
export class TransferReceiptService {
  private readonly receipts: TransferReceiptServiceDeps["receipts"];
  private readonly events: TransferReceiptServiceDeps["events"];
  private readonly images: TransferReceiptServiceDeps["images"];
  private readonly payments: TransferReceiptServiceDeps["payments"];
  private readonly now: () => Date;

  constructor(deps: TransferReceiptServiceDeps) {
    this.receipts = deps.receipts;
    this.events = deps.events;
    this.images = deps.images;
    this.payments = deps.payments;
    this.now = deps.now ?? nowArgentina;
  }

  async listByEvent(eventId: string): Promise<ITransferReceipt[]> {
    const event: IEventWithTransferReceipts | null =
      await this.events.findByIdWithTransferReceipts(eventId);
    return event!.transferReceipts;
  }

  // Lo ven los miembros del evento del comprobante (los designados lo necesitan
  // para aprobarlo), igual que su imagen.
  async getById(id: string, requesterId: string): Promise<ITransferReceipt> {
    if (!isValidId(id)) throw new BadRequestError("Invalid ObjectID");
    const receipt: ITransferReceipt = await this.getReceipt(id);
    const event: IEvent | null = await this.events.findById(String(receipt.event));
    if (!event?.members.some((member) => member.toString() === requesterId))
      throw new ForbiddenError("Access denied. The user is not a participant of the event.");
    return receipt;
  }

  // Solo el dueño puede adjuntar o reemplazar el archivo, y solo si no está aprobado.
  async attachFile(
    receiptId: string,
    userId: string,
    file: Express.Multer.File | undefined
  ): Promise<mongoose.Types.ObjectId> {
    if (!file) throw new BadRequestError("No file was uploaded.");
    const receipt: ITransferReceipt = await this.getReceipt(receiptId);
    if (receipt.user.toString() !== userId)
      throw new ForbiddenError("Access denied. The user is not the owner of the receipt.");
    if (receipt.hasPaid) throw new BadRequestError("The transfer receipt is already approved.");
    const imageId: mongoose.Types.ObjectId = await this.images.save(file);
    const previousImage = receipt.image;
    receipt.image = imageId;
    await this.receipts.save(receipt);
    if (previousImage) await this.images.delete(previousImage);
    return imageId;
  }

  // Quién paga, cuánto y a quién lo calcula el servidor; el body solo describe
  // el pago. Si el usuario ya había subido un comprobante, se reemplaza.
  async create(eventId: string, userId: string, input: TransferReceiptInput): Promise<ITransferReceipt> {
    const event: IEvent | null = await this.events.findById(eventId);
    if (event!.state !== "readyforpayment") throw new BadRequestError(notReadyForPaymentMessage);
    const expectedTransfer: ITransferInfo | undefined = await this.expectedTransferOf(eventId, userId);
    if (!expectedTransfer)
      throw new BadRequestError("The user has no transfer to make in this event.");

    const uploaded: IHasUploadedInfo = await this.hasUploaded(userId, eventId);
    if (uploaded.hasUploaded) {
      const previous: ITransferReceipt | null = await this.receipts.deleteById(
        String(uploaded.transferReceipt)
      );
      if (previous?.image) await this.images.delete(previous.image);
      event!.transferReceipts = event!.transferReceipts.filter(
        (id) => !id.equals(uploaded.transferReceipt)
      );
      await this.events.save(event!);
    }

    const receipt: ITransferReceipt = await this.receipts.create({
      description: input.description,
      paymentMethod: input.paymentMethod,
      user: new mongoose.Types.ObjectId(userId),
      amount: expectedTransfer.amount,
      receiver: expectedTransfer.receiver!.receiverId,
      event: new mongoose.Types.ObjectId(eventId),
      datetime: this.now(),
    });
    event!.transferReceipts.push(receipt._id);
    await this.events.save(event!);
    return receipt;
  }

  // El designado registra como pagado a un miembro que no subió comprobante.
  async approveWithoutReceipt(
    eventId: string,
    userId: string,
    receiverId: string | undefined
  ): Promise<ITransferReceipt> {
    if (!isValidId(userId)) throw new BadRequestError("Invalid ObjectID");
    const eventToApprove: IEvent | null = await this.events.findById(eventId);
    if (!eventToApprove?.members.some((member) => member.equals(userId)))
      throw new BadRequestError("The user is not a member of the event.");
    if ((await this.hasUploaded(userId, eventId)).hasUploaded)
      throw new BadRequestError("The user has uploaded a transfer receipt");

    const receipt: ITransferReceipt = await this.receipts.create({
      datetime: this.now(),
      amount: 0,
      receiver: receiverId ? new mongoose.Types.ObjectId(receiverId) : null,
      event: new mongoose.Types.ObjectId(eventId),
      user: new mongoose.Types.ObjectId(userId),
      hasPaid: true,
    });
    const event: IEvent | null = await this.events.findById(eventId);
    event!.transferReceipts.push(receipt._id);
    await this.events.save(event!);
    if (await this.isFinished(eventId)) {
      event!.state = "finished";
      await this.events.save(event!);
    }
    return receipt;
  }

  // Al aprobar el último pago pendiente, el evento pasa a "finished".
  // El comprobante tiene que ser del evento de la ruta (el middleware valida que
  // el usuario sea designado de ese evento).
  async approve(receiptId: string, eventId: string): Promise<ITransferReceipt> {
    if (!isValidId(receiptId)) throw new BadRequestError("Invalid ObjectID");
    const receipt: ITransferReceipt = await this.getReceipt(receiptId);
    if (String(receipt.event) !== eventId) throw new NotFoundError(receiptNotFoundMessage);
    if (receipt.hasPaid) throw new BadRequestError("The transfer receipt is already approved.");
    receipt.hasPaid = true;
    await this.receipts.save(receipt);
    if (await this.isFinished(receipt.event.toString())) {
      const event: IEvent | null = await this.events.findById(String(receipt.event));
      event!.state = "finished";
      await this.events.save(event!);
    }
    return receipt;
  }

  async delete(receiptId: string): Promise<ITransferReceipt> {
    const receipt: ITransferReceipt = await this.getReceipt(receiptId);
    const event: IEvent | null = await this.events.findById(String(receipt.event));
    if (event!.state !== "readyforpayment") throw new BadRequestError(notReadyForPaymentMessage);
    await this.receipts.deleteById(String(receipt._id));
    if (receipt.image) await this.images.delete(receipt.image);
    event!.transferReceipts = event!.transferReceipts.filter((id) => !id.equals(receipt._id));
    await this.events.save(event!);
    return receipt;
  }

  // true si cada transferencia esperada tiene un comprobante aprobado.
  async isFinished(eventId: string): Promise<boolean> {
    const event: IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null =
      await this.events.findByIdWithPaymentData(new mongoose.Types.ObjectId(eventId));
    return this.payments
      .expectedTransfersFor(event!.purchaseReceipts)
      .every((transfer) =>
        event!.transferReceipts.some((r) => r.hasPaid === true && r.user.equals(transfer.userId))
      );
  }

  // Miembros que deben transferir y no tienen un comprobante aprobado.
  async getDebtors(eventId: string | mongoose.Types.ObjectId): Promise<IUser[]> {
    const event: IEventAmountCalculationsWithTransfers | null =
      await this.events.findByIdWithDebtData(eventId);
    if (!event) throw new Error(`Event with ID ${eventId} not found.`);
    return this.payments
      .expectedTransfersFor(event.purchaseReceipts)
      .filter((transfer) => {
        const receipt = event.transferReceipts.find((r) => r.user._id.equals(transfer.userId));
        return !receipt || !receipt.hasPaid;
      })
      .map((transfer) => event.members.find((member) => member._id.equals(transfer.userId)))
      .filter((user): user is IUser => user !== undefined);
  }

  // Estado de pago de cada miembro del evento (usado por events).
  async membersWhoHaveUploaded(eventId: string): Promise<IMemberWhoHasUploaded[]> {
    const event: IEventWithMembersTransferReceipts | null =
      await this.events.findByIdWithMembersAndTransferReceipts(eventId);
    return event!.members.map((member) => {
      const receipt = event!.transferReceipts.find(
        (r) => String(r.user) === String(member._id)
      );
      return {
        userId: member._id,
        userName: member.name,
        userLastName: member.lastName,
        specialDiet: member.specialDiet,
        transferReceipt: receipt ? receipt._id : null,
        hasReceiptApproved: receipt ? receipt.hasPaid : null,
        hasUploaded: Boolean(receipt),
      };
    });
  }

  async hasUploaded(userId: string, eventId: string): Promise<IHasUploadedInfo> {
    const event: IEventWithTransferReceipts | null = await this.events.findByIdWithTransferReceipts(
      new mongoose.Types.ObjectId(eventId)
    );
    const user = new mongoose.Types.ObjectId(userId);
    const receipt = event!.transferReceipts.find((r) => r.user.equals(user));
    return receipt
      ? { hasUploaded: true, hasReceiptApproved: receipt.hasPaid, transferReceipt: receipt._id }
      : { hasUploaded: false, hasReceiptApproved: false, transferReceipt: null };
  }

  // La transferencia que le toca hacer al miembro, o undefined si no debe nada.
  private async expectedTransferOf(eventId: string, userId: string): Promise<ITransferInfo | undefined> {
    const event = await this.events.findByIdWithPurchaseReceipts(eventId);
    if (!event) return undefined;
    return this.payments
      .expectedTransfersFor(event.purchaseReceipts)
      .find((t) => t.userId.equals(userId));
  }

  private async getReceipt(id: string): Promise<ITransferReceipt> {
    const receipt: ITransferReceipt | null = await this.receipts.findById(id);
    if (!receipt) throw new NotFoundError(receiptNotFoundMessage);
    return receipt;
  }
}
