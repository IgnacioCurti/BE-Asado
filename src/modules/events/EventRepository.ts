import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Event } from "../../models/event.js";
import mongoose, { FilterQuery } from "mongoose";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IEventWithPurchaseReceiptsOptions,
  IPublicEventPreReduction,
  IEventAmountCalculationsWithTransfers,
  IEventWithMembers,
  IEventWithMembersPurchaseReceiptsPopulated,
  IEventWithPurchaseReceiptsPopulated,
  IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts,
  IEventWithTransferReceipts,
  IEventWithTransferReceiptsPurchaseReceiptsRatings,
  IEventWithMembersTransferReceipts,
  IRating,
  IUserName,
} from "../../models/interfaces.js";

export interface IEventWithRatings extends Omit<IEvent, "ratings"> {
  ratings: IRating[];
}

export interface IEventWithMemberNames extends Omit<IEvent, "members"> {
  members: IUserName[];
}

export class EventRepository extends BaseRepository<IEvent> {
  constructor() {
    super(Event);
  }

  findByIdWithRatings(id: string): Promise<IEventWithRatings | null> {
    return this.model
      .findById(id)
      .populate("ratings")
      .exec() as unknown as Promise<IEventWithRatings | null>;
  }

  findByIdWithMemberNames(id: string): Promise<IEventWithMemberNames | null> {
    return this.model
      .findById(id)
      .populate({ path: "members", select: "_id name lastName" })
      .exec() as unknown as Promise<IEventWithMemberNames | null>;
  }

  async addOption(eventId: string, optionId: mongoose.Types.ObjectId): Promise<void> {
    await this.model.findByIdAndUpdate(eventId, { $push: { options: optionId } }).exec();
  }

  async removeOption(optionId: mongoose.Types.ObjectId): Promise<void> {
    await this.model
      .updateOne({ options: optionId }, { $pull: { options: optionId } })
      .exec();
  }

  // Eventos listos para pagar donde el usuario es miembro, con lo necesario
  // para calcular deudas (recibos con usuarios y miembros populados).
  findReadyForPaymentByMember(
    userId: string
  ): Promise<IEventWithMembersPurchaseReceiptsPopulated[]> {
    return this.model
      .find({ members: userId, state: "readyforpayment" })
      .populate({
        path: "purchaseReceipts",
        populate: [
          { path: "shoppingDesignee", model: "User" },
          { path: "participants", model: "User" },
        ],
      })
      .populate({ path: "members", model: "User" })
      .exec() as unknown as Promise<IEventWithMembersPurchaseReceiptsPopulated[]>;
  }

  findReadyForPaymentByDesignee(
    designeeId: mongoose.Types.ObjectId
  ): Promise<IEventAmountCalculationsWithTransfers[]> {
    return this.model
      .find({ shoppingDesignee: designeeId, state: "readyforpayment" })
      .select("purchaseReceipts members")
      .populate([
        {
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        },
        { path: "members", model: "User" },
        { path: "transferReceipts", model: "TransferReceipt" },
      ])
      .exec() as unknown as Promise<IEventAmountCalculationsWithTransfers[]>;
  }

  findByIdWithPurchaseReceipts(id: string): Promise<IEventWithPurchaseReceiptsPopulated | null> {
    return this.model
      .findById(id)
      .populate([
        {
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        },
      ])
      .exec() as unknown as Promise<IEventWithPurchaseReceiptsPopulated | null>;
  }

  findByIdWithTransferReceipts(id: string | mongoose.Types.ObjectId): Promise<IEventWithTransferReceipts | null> {
    return this.model
      .findById(id)
      .populate("transferReceipts")
      .exec() as unknown as Promise<IEventWithTransferReceipts | null>;
  }

  findByIdWithMembersAndTransferReceipts(id: string): Promise<IEventWithMembersTransferReceipts | null> {
    return this.model
      .findById(id)
      .populate("members transferReceipts")
      .exec() as unknown as Promise<IEventWithMembersTransferReceipts | null>;
  }

  // Todo lo necesario para saber si el evento terminó de pagarse.
  findByIdWithPaymentData(
    id: mongoose.Types.ObjectId
  ): Promise<IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null> {
    return this.model
      .findById(id)
      .populate({ path: "transferReceipts" })
      .populate({
        path: "purchaseReceipts",
        populate: [
          { path: "shoppingDesignee", model: "User" },
          { path: "participants", model: "User" },
        ],
      })
      .populate({ path: "members", model: "User" })
      .exec() as unknown as Promise<IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null>;
  }

  // Públicos + privados donde el usuario es miembro.
  private static visibleTo(userId: string) {
    return { $or: [{ isPrivate: { $ne: true } }, { isPrivate: true, members: userId }] };
  }

  private static readonly SUMMARY_FIELDS: string =
    "datetime description state chef shoppingDesignee memberLimit members title ratings isPrivate penalization penalizationStartDate";

  findVisibleTo(userId: string): Promise<IEvent[]> {
    return this.model
      .find(EventRepository.visibleTo(userId))
      .sort({ datetime: -1, _id: 1 })
      .exec();
  }

  findPublicSummaries(): Promise<IPublicEventPreReduction[]> {
    return this.findSummaries({ isPrivate: { $ne: true } });
  }

  findSummariesVisibleTo(userId: string): Promise<IPublicEventPreReduction[]> {
    return this.findSummaries(EventRepository.visibleTo(userId));
  }

  private findSummaries(filter: FilterQuery<IEvent>): Promise<IPublicEventPreReduction[]> {
    return this.model
      .find(filter)
      .select(EventRepository.SUMMARY_FIELDS)
      .sort({ datetime: -1 })
      .populate("chef", "name")
      .populate("ratings")
      .populate("shoppingDesignee")
      .exec() as unknown as Promise<IPublicEventPreReduction[]>;
  }

  findByIdWithDetails(id: string): Promise<IEventPopulatedWithOptions | null> {
    return this.model
      .findById(id)
      .populate("members")
      .populate("chef")
      .populate("organizer")
      .populate("shoppingDesignee")
      .populate("transferReceipts")
      .populate("purchaseReceipts")
      .populate({
        path: "options",
        populate: { path: "participants", model: "User", select: "name lastName _id" },
      })
      .exec() as unknown as Promise<IEventPopulatedWithOptions | null>;
  }

  // Recibos con usuarios populados y miembros, para calcular quién le debe a quién.
  findByIdForAmounts(id: string): Promise<IEventAmountCalculations | null> {
    return this.model
      .findById(id)
      .select("purchaseReceipts members")
      .populate([
        {
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        },
        { path: "members", model: "User" },
      ])
      .exec() as unknown as Promise<IEventAmountCalculations | null>;
  }

  // Recibos populados sin sus usuarios (participants quedan como ids).
  findByIdWithPurchaseReceiptIds(id: string): Promise<IEventWithPurchaseReceipts | null> {
    return this.model
      .findById(id)
      .populate("purchaseReceipts")
      .exec() as unknown as Promise<IEventWithPurchaseReceipts | null>;
  }

  // Agrega al miembro solo si, en el momento de escribir, el evento sigue
  // disponible, no lo tiene y no está lleno (evita carreras entre inscripciones).
  addMemberIfAllowed(
    eventId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<IEvent | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: eventId,
          state: "available",
          members: { $ne: userId },
          $expr: { $lt: [{ $size: "$members" }, "$memberLimit"] },
        },
        { $push: { members: userId } }
      )
      .exec();
  }

  findByIdWithReceiptsAndOptions(id: string): Promise<IEventWithPurchaseReceiptsOptions | null> {
    return this.model
      .findById(id)
      .populate("purchaseReceipts")
      .populate("options")
      .exec() as unknown as Promise<IEventWithPurchaseReceiptsOptions | null>;
  }

  // Documento sin guardar, para ajustar campos antes del primer save.
  build(fields: Record<string, unknown>): IEvent {
    return new this.model(fields);
  }

  countPublic(): Promise<number> {
    return this.model.countDocuments({ isPrivate: false }).exec();
  }

  findEndedOldestFirst(): Promise<IEvent[]> {
    return this.model
      .find({ state: { $in: ["finished", "cancelled"] } })
      .sort({ datetime: "asc" })
      .exec();
  }

  findByIdWithReceiptsAndRatings(
    id: mongoose.Types.ObjectId
  ): Promise<IEventWithTransferReceiptsPurchaseReceiptsRatings | null> {
    return this.model
      .findById(id)
      .populate(["transferReceipts", "purchaseReceipts", "ratings"])
      .exec() as unknown as Promise<IEventWithTransferReceiptsPurchaseReceiptsRatings | null>;
  }

  findByIdWithMembers(id: string): Promise<IEventWithMembers | null> {
    return this.model
      .findById(id)
      .populate("members")
      .exec() as unknown as Promise<IEventWithMembers | null>;
  }

  // Recibos, miembros y comprobantes con su usuario, para saber quién debe.
  findByIdWithDebtData(
    id: string | mongoose.Types.ObjectId
  ): Promise<IEventAmountCalculationsWithTransfers | null> {
    return this.model
      .findById(id)
      .populate([
        {
          path: "purchaseReceipts",
          populate: [
            { path: "shoppingDesignee", model: "User" },
            { path: "participants", model: "User" },
          ],
        },
        { path: "members", model: "User" },
        { path: "transferReceipts", populate: { path: "user", model: "User" } },
      ])
      .exec() as unknown as Promise<IEventAmountCalculationsWithTransfers | null>;
  }
}
