import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { runInTransaction } from "../../core/repositories/transaction.js";
import { UserRepository } from "../users/UserRepository.js";
import { Event } from "../../models/event.js";
import { Image } from "../../models/image.js";
import { Option } from "../../models/option.js";
import { PurchaseReceipt } from "../../models/purchaseReceipt.js";
import { Rating } from "../../models/rating.js";
import { Reminder } from "../../models/reminder.js";
import { TransferReceipt } from "../../models/transferReceipt.js";
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
  IEventWithMembersTransferReceipts,
  IRating,
  IUserName,
} from "../../models/interfaces.js";

// Usuarios poblados sin hash de contraseña ni datos del código de recuperación.
const SAFE_USER: string = UserRepository.SAFE_PROJECTION;

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
          { path: "shoppingDesignee", model: "User", select: SAFE_USER },
          { path: "participants", model: "User", select: SAFE_USER },
        ],
      })
      .populate({ path: "members", model: "User", select: SAFE_USER })
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
            { path: "shoppingDesignee", model: "User", select: SAFE_USER },
            { path: "participants", model: "User", select: SAFE_USER },
          ],
        },
        { path: "members", model: "User", select: SAFE_USER },
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
            { path: "shoppingDesignee", model: "User", select: SAFE_USER },
            { path: "participants", model: "User", select: SAFE_USER },
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
      .populate("members", SAFE_USER)
      .populate("transferReceipts")
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
          { path: "shoppingDesignee", model: "User", select: SAFE_USER },
          { path: "participants", model: "User", select: SAFE_USER },
        ],
      })
      .populate({ path: "members", model: "User", select: SAFE_USER })
      .exec() as unknown as Promise<IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts | null>;
  }

  private static readonly SUMMARY_FIELDS: string =
    "datetime description state chef shoppingDesignee memberLimit members title ratings group penalization penalizationStartDate";

  // Más nuevos primero.
  findByGroup(groupId: string): Promise<IEvent[]> {
    return this.model.find({ group: groupId }).sort({ datetime: -1, _id: 1 }).exec();
  }

  // Resumen de los eventos de esos grupos, más nuevos primero.
  findSummariesInGroups(groupIds: mongoose.Types.ObjectId[]): Promise<IPublicEventPreReduction[]> {
    return this.model
      .find({ group: { $in: groupIds } })
      .select(EventRepository.SUMMARY_FIELDS)
      .sort({ datetime: -1, _id: 1 })
      .populate("group", "name")
      .populate("chef", "name")
      .populate("ratings")
      .populate("shoppingDesignee", SAFE_USER)
      .exec() as unknown as Promise<IPublicEventPreReduction[]>;
  }

  findByIdWithDetails(id: string): Promise<IEventPopulatedWithOptions | null> {
    return this.model
      .findById(id)
      .populate("members", SAFE_USER)
      .populate("chef", SAFE_USER)
      .populate("organizer", SAFE_USER)
      .populate("shoppingDesignee", SAFE_USER)
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
            { path: "shoppingDesignee", model: "User", select: SAFE_USER },
            { path: "participants", model: "User", select: SAFE_USER },
          ],
        },
        { path: "members", model: "User", select: SAFE_USER },
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

  // Borra los eventos con todo lo que cuelga de ellos (comprobantes y sus
  // imágenes, calificaciones, opciones y recordatorios) en una transacción:
  // o se borra todo o no se borra nada. Con `session` se suma a una
  // transacción en curso (p. ej. el borrado de un grupo); si no, abre una.
  async deleteCascade(
    eventIds: mongoose.Types.ObjectId[],
    session?: mongoose.ClientSession
  ): Promise<void> {
    if (eventIds.length === 0) return;
    if (!session) return runInTransaction((own) => this.deleteCascade(eventIds, own));

    const events = await this.model
      .find({ _id: { $in: eventIds } })
      .select("transferReceipts purchaseReceipts ratings options")
      .session(session)
      .exec();
    const ids = (field: "transferReceipts" | "purchaseReceipts" | "ratings" | "options") =>
      events.flatMap((event) => event[field] as mongoose.Types.ObjectId[]);
    const transferIds = ids("transferReceipts");
    const purchaseIds = ids("purchaseReceipts");
    const receipts = [
      ...(await TransferReceipt.find({ _id: { $in: transferIds } }).select("image").session(session).exec()),
      ...(await PurchaseReceipt.find({ _id: { $in: purchaseIds } }).select("image").session(session).exec()),
    ];
    const imageIds = receipts.map((receipt) => receipt.image).filter(Boolean);

    await Image.deleteMany({ _id: { $in: imageIds } }).session(session).exec();
    await TransferReceipt.deleteMany({ _id: { $in: transferIds } }).session(session).exec();
    await PurchaseReceipt.deleteMany({ _id: { $in: purchaseIds } }).session(session).exec();
    await Rating.deleteMany({ _id: { $in: ids("ratings") } }).session(session).exec();
    await Option.deleteMany({ _id: { $in: ids("options") } }).session(session).exec();
    await Reminder.deleteMany({ event: { $in: eventIds } }).session(session).exec();
    await this.model.deleteMany({ _id: { $in: eventIds } }).session(session).exec();
  }

  findIdsByGroup(
    groupId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<mongoose.Types.ObjectId[]> {
    return this.model
      .find({ group: groupId })
      .session(session ?? null)
      .distinct("_id")
      .exec() as Promise<mongoose.Types.ObjectId[]>;
  }

  // Eventos closed/readyforpayment del grupo donde el usuario es miembro o
  // tiene un rol: los que pueden impedir que salga del grupo (§4.4).
  findActiveInGroupInvolving(
    groupId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId
  ): Promise<IEvent[]> {
    return this.model
      .find({
        group: groupId,
        state: { $in: ["closed", "readyforpayment"] },
        $or: [{ members: userId }, { chef: userId }, { shoppingDesignee: userId }],
      })
      .select("state members chef shoppingDesignee")
      .exec();
  }

  // Baja del usuario de los eventos available del grupo, como unsubscribe:
  // sale de members, de sus roles, de las opciones y de los comprobantes de
  // compra. Los eventos en otros estados no se tocan (§4.4).
  async removeUserFromAvailableInGroup(
    groupId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<void> {
    const filter: FilterQuery<IEvent> = {
      group: groupId,
      state: "available",
      $or: [{ members: userId }, { chef: userId }, { shoppingDesignee: userId }],
    };
    const events = await this.model
      .find(filter)
      .select("options purchaseReceipts")
      .session(session)
      .exec();
    if (events.length === 0) return;
    const ids = events.map((event) => event._id);
    const optionIds = events.flatMap((event) => event.options);
    const receiptIds = events.flatMap((event) => event.purchaseReceipts);

    await this.model
      .updateMany(
        { _id: { $in: ids }, state: "available", chef: userId },
        { $set: { chef: null } }
      )
      .session(session)
      .exec();
    await this.model
      .updateMany(
        { _id: { $in: ids }, state: "available" },
        { $pull: { members: userId, shoppingDesignee: userId } }
      )
      .session(session)
      .exec();
    await Option.updateMany({ _id: { $in: optionIds } }, { $pull: { participants: userId } })
      .session(session)
      .exec();
    await PurchaseReceipt.updateMany(
      { _id: { $in: receiptIds } },
      { $pull: { participants: userId } }
    )
      .session(session)
      .exec();
  }

  findByIdWithMembers(id: string): Promise<IEventWithMembers | null> {
    return this.model
      .findById(id)
      .populate("members", SAFE_USER)
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
            { path: "shoppingDesignee", model: "User", select: SAFE_USER },
            { path: "participants", model: "User", select: SAFE_USER },
          ],
        },
        { path: "members", model: "User", select: SAFE_USER },
        { path: "transferReceipts", populate: { path: "user", model: "User", select: SAFE_USER } },
      ])
      .exec() as unknown as Promise<IEventAmountCalculationsWithTransfers | null>;
  }

  // Aplica un cambio de roles de un solo usuario si, al escribir, el evento sigue
  // disponible y el chef sigue siendo el esperado (evita que dos tomen el chef).
  updateRolesIfAllowed(
    eventId: mongoose.Types.ObjectId,
    change: {
      chef?: { from: mongoose.Types.ObjectId | null; to: mongoose.Types.ObjectId | null };
      addDesignee?: mongoose.Types.ObjectId;
      removeDesignee?: mongoose.Types.ObjectId;
    }
  ): Promise<IEvent | null> {
    const filter: FilterQuery<IEvent> = { _id: eventId, state: "available" };
    const update: Record<string, unknown> = {};
    if (change.chef) {
      filter.chef = change.chef.from;
      update.$set = { chef: change.chef.to };
    }
    if (change.addDesignee) update.$addToSet = { shoppingDesignee: change.addDesignee };
    if (change.removeDesignee) update.$pull = { shoppingDesignee: change.removeDesignee };
    return this.model.findOneAndUpdate(filter, update, { new: true }).exec();
  }

  findByOption(optionId: string): Promise<IEvent | null> {
    return this.model.findOne({ options: optionId }).exec();
  }
}
