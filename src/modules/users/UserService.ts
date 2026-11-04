import bcrypt from "bcrypt";
import { isValidId } from "../../core/validation/isValidId.js";
import mongoose from "mongoose";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError.js";
import {
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersPurchaseReceiptsPopulated,
  ISafeUser,
  IUser,
} from "../../models/interfaces.js";
import { EventRepository } from "../events/EventRepository.js";
import { ImageService } from "../images/ImageService.js";
import { PaymentCalculator } from "../payments/PaymentCalculator.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { UserRepository } from "./UserRepository.js";

const userNotFoundMessage: string = "The user with the given ID was not found.";

// Campos que un cliente puede enviar al registrarse. verificationCode y
// profilePicture solo los modifican sus propios flujos.
const REGISTER_FIELDS: string[] = [
  "name",
  "lastName",
  "email",
  "password",
  "cbu",
  "alias",
  "specialDiet",
  "notifications",
];

const PASSWORD_PATTERN: RegExp = new RegExp(
  "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[\\W_]).{8,}$"
);

export type UserEditInput = Partial<Pick<IUser, "name" | "lastName" | "specialDiet" | "alias" | "cbu">> & {
  notifications?: Partial<IUser["notifications"]>;
};

export interface UserServiceDeps {
  users: Pick<
    UserRepository,
    "findAllSafe" | "findSafeById" | "findByEmail" | "findById" | "create" | "save" | "deleteById"
  >;
  events: Pick<EventRepository, "findReadyForPaymentByMember" | "findReadyForPaymentByDesignee">;
  transferReceipts: Pick<TransferReceiptRepository, "findByEventAndUser">;
  images: Pick<ImageService, "save" | "delete">;
  payments: Pick<PaymentCalculator, "expectedTransfersFor">;
}

export class UserService {
  constructor(private readonly deps: UserServiceDeps) {}

  list(): Promise<ISafeUser[]> {
    return this.deps.users.findAllSafe();
  }

  async getById(id: string): Promise<ISafeUser> {
    const user: ISafeUser | null = await this.deps.users.findSafeById(id);
    if (!user) throw new NotFoundError(userNotFoundMessage);
    return user;
  }

  // Eventos listos para pagar donde el usuario debe transferir y todavía no
  // tiene un comprobante aprobado.
  async getDebtorEvents(userId: string): Promise<mongoose.Types.ObjectId[]> {
    const events: IEventWithMembersPurchaseReceiptsPopulated[] =
      await this.deps.events.findReadyForPaymentByMember(userId);
    const debtorEvents: mongoose.Types.ObjectId[] = [];
    for (const event of events) {
      const owesTransfer: boolean = this.deps.payments
        .expectedTransfersFor(event.purchaseReceipts)
        .some((t) => t.userId.equals(userId));
      if (!owesTransfer) continue;
      const receipt = await this.deps.transferReceipts.findByEventAndUser(event._id, userId);
      if (!receipt || !receipt.hasPaid) debtorEvents.push(event._id);
    }
    return debtorEvents;
  }

  // Eventos donde el usuario es designado de compras y tiene transferencias
  // dirigidas a él sin aprobar.
  async getEventsWithPendingTransfers(designeeId: string): Promise<mongoose.Types.ObjectId[]> {
    if (!isValidId(designeeId)) throw new BadRequestError("Invalid ObjectID");
    const designee = new mongoose.Types.ObjectId(designeeId);
    const events: IEventAmountCalculationsWithTransfers[] =
      await this.deps.events.findReadyForPaymentByDesignee(designee);
    return events
      .filter((event) =>
        event.transferReceipts.some(
          (receipt) => !receipt.hasPaid && designee.equals(receipt.receiver)
        )
      )
      .map((event) => event._id);
  }

  async register(body: Record<string, any>): Promise<IUser> {
    const email: string = body.email.toLowerCase();
    if (await this.deps.users.findByEmail(email))
      throw new BadRequestError("User already registered");
    if (!PASSWORD_PATTERN.test(body.password))
      throw new BadRequestError("Password doesn't match the requirements.");

    const fields: Record<string, unknown> = Object.fromEntries(
      REGISTER_FIELDS.filter((field) => field in body).map((field) => [field, body[field]])
    );
    fields.email = email;
    fields.password = await bcrypt.hash(body.password, await bcrypt.genSalt(10));
    return this.deps.users.create(fields);
  }

  async edit(id: string, input: UserEditInput): Promise<IUser> {
    const user: IUser = await this.getDocument(id);
    user.name = input.name ? input.name : user.name;
    user.lastName = input.lastName ? input.lastName : user.lastName;
    user.specialDiet = input.specialDiet ?? user.specialDiet;
    // Si no se envían se conservan; enviarlos vacíos ("" o null) los borra.
    if (input.alias !== undefined) user.alias = input.alias;
    if (input.cbu !== undefined) user.cbu = input.cbu;
    user.notifications = {
      newEvent: input.notifications?.newEvent ?? user.notifications.newEvent,
      eventStart: input.notifications?.eventStart ?? user.notifications.eventStart,
      penalizationStart:
        input.notifications?.penalizationStart ?? user.notifications.penalizationStart,
      penalizationOneWeek:
        input.notifications?.penalizationOneWeek ?? user.notifications.penalizationOneWeek,
    };
    return this.deps.users.save(user);
  }

  async updateProfilePicture(
    id: string,
    file: Express.Multer.File | undefined
  ): Promise<mongoose.Types.ObjectId> {
    if (!file) throw new BadRequestError("No file was uploaded.");
    const user: IUser = await this.getDocument(id);
    if (user.profilePicture) await this.deps.images.delete(user.profilePicture);
    const imageId: mongoose.Types.ObjectId = await this.deps.images.save(file);
    user.profilePicture = imageId;
    await this.deps.users.save(user);
    return imageId;
  }

  async delete(id: string): Promise<IUser> {
    const user: IUser | null = await this.deps.users.deleteById(id);
    if (!user) throw new NotFoundError(userNotFoundMessage);
    return user;
  }

  private async getDocument(id: string): Promise<IUser> {
    const user: IUser | null = await this.deps.users.findById(id);
    if (!user) throw new NotFoundError(userNotFoundMessage);
    return user;
  }
}
