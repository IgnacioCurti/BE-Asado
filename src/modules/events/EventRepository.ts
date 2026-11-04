import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Event } from "../../models/event.js";
import mongoose from "mongoose";
import {
  IEvent,
  IEventAmountCalculationsWithTransfers,
  IEventWithMembersPurchaseReceiptsPopulated,
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
}
