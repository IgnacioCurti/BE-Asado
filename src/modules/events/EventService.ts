import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IEventWithPurchaseReceiptsOptions,
  IEventWithTransferReceiptsPurchaseReceiptsRatings,
  IMemberWhoHasUploaded,
  IPublicEvent,
  ITransferInfo,
} from "../../models/interfaces.js";
import { ImageService } from "../images/ImageService.js";
import { ReminderScheduler } from "../notifications/ReminderScheduler.js";
import { OptionRepository } from "../options/OptionRepository.js";
import { PaymentCalculator } from "../payments/PaymentCalculator.js";
import { PurchaseReceiptRepository } from "../purchaseReceipts/PurchaseReceiptRepository.js";
import { RatingRepository } from "../ratings/RatingRepository.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { TransferReceiptService } from "../transferReceipts/TransferReceiptService.js";
import { UserRepository } from "../users/UserRepository.js";
import { EventMapper } from "./EventMapper.js";
import { EventRepository } from "./EventRepository.js";

export const eventNotFoundMessage: string = "The event with the given ID was not found.";

const STATES_WITH_COSTS: string[] = ["finished", "readyforpayment"];
const STATES_WITHOUT_UNSUBSCRIBE: string[] = ["closed", "readyforpayment"];
const userNotFoundMessage: string = "The user with the given ID was not found.";

// Al crear un evento, si hay más de MAX_PUBLIC_EVENTS públicos se borran los
// terminados o cancelados más viejos (de cualquier privacidad).
const MAX_PUBLIC_EVENTS: number = 6;

// Campos que un cliente puede enviar al crear un evento. El estado y las
// colecciones relacionadas (recibos, ratings, opciones) las maneja el backend.
const CREATE_EVENT_FIELDS: string[] = [
  "title",
  "datetime",
  "description",
  "memberLimit",
  "members",
  "organizer",
  "shoppingDesignee",
  "isPrivate",
  "penalization",
  "penalizationStartDate",
];

// Estados a los que se puede pasar con editEvent. "finished" lo pone el sistema
// cuando se aprueban todos los pagos; cancelled y finished son finales.
const ALLOWED_STATE_TRANSITIONS: Record<string, string[]> = {
  available: ["closed", "cancelled"],
  closed: ["available", "readyforpayment", "cancelled"],
  readyforpayment: ["closed"],
  cancelled: [],
  finished: [],
};

export interface EventEditInput {
  title?: string;
  datetime?: Date;
  description?: string;
  memberLimit?: number;
  penalization?: number;
  penalizationStartDate?: Date | null;
  state?: string;
  isPrivate?: boolean;
}

export interface EventRolesInput {
  chef?: mongoose.Types.ObjectId | null;
  shoppingDesignee: mongoose.Types.ObjectId[];
}

export interface EventServiceDeps {
  events: Pick<
    EventRepository,
    | "findVisibleTo"
    | "findPublicSummaries"
    | "findSummariesVisibleTo"
    | "findByIdWithDetails"
    | "findByIdForAmounts"
    | "findByIdWithPurchaseReceiptIds"
    | "findById"
    | "save"
    | "addMemberIfAllowed"
    | "findByIdWithReceiptsAndOptions"
    | "build"
    | "countPublic"
    | "findEndedOldestFirst"
    | "findByIdWithReceiptsAndRatings"
    | "deleteById"
  >;
  paymentStatus: Pick<TransferReceiptService, "membersWhoHaveUploaded">;
  users: Pick<UserRepository, "findById">;
  purchaseReceipts: Pick<PurchaseReceiptRepository, "addParticipant" | "save" | "deleteById">;
  options: Pick<OptionRepository, "save">;
  transferReceipts: Pick<TransferReceiptRepository, "existsApprovedForEvent" | "deleteById">;
  ratings: Pick<RatingRepository, "deleteById">;
  images: Pick<ImageService, "delete">;
  reminders: Pick<ReminderScheduler, "syncWithEvent" | "cancelForEvent" | "scheduleNewEvent">;
  payments: Pick<PaymentCalculator, "transfersFor" | "memberCost">;
  mapper: EventMapper;
}

export class EventService {
  constructor(private readonly deps: EventServiceDeps) {}

  listVisibleTo(userId: string): Promise<IEvent[]> {
    return this.deps.events.findVisibleTo(userId);
  }

  async listPublic(): Promise<IPublicEvent[]> {
    return this.deps.mapper.toPublicList(await this.deps.events.findPublicSummaries());
  }

  async listPublicVisibleTo(userId: string): Promise<IPublicEvent[]> {
    return this.deps.mapper.toPublicList(await this.deps.events.findSummariesVisibleTo(userId));
  }

  async getDetails(id: string): Promise<IEventPopulatedWithOptions> {
    const event = await this.deps.events.findByIdWithDetails(id);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    return event;
  }

  getMembersPaymentStatus(eventId: string): Promise<IMemberWhoHasUploaded[]> {
    return this.deps.paymentStatus.membersWhoHaveUploaded(eventId);
  }

  // Todas las transferencias para saldar el evento (incluye las de monto 0).
  async getTransfers(eventId: string): Promise<ITransferInfo[]> {
    const event: IEventAmountCalculations | null = await this.deps.events.findByIdForAmounts(eventId);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    if (event.purchaseReceipts.length == 0)
      throw new BadRequestError("The event has no purchase receipts.");
    return this.deps.payments.transfersFor(event.purchaseReceipts);
  }

  // Cada miembro ve su costo; organizador y designados ven el de cualquiera.
  async getMemberCost(eventId: string, memberId: string, requesterId: string): Promise<number> {
    const event: IEventWithPurchaseReceipts | null =
      await this.deps.events.findByIdWithPurchaseReceiptIds(eventId);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    const canSeeOthers: boolean =
      event.organizer.toString() === requesterId ||
      event.shoppingDesignee.some((id) => id.toString() === requesterId);
    if (memberId !== requesterId && !canSeeOthers)
      throw new ForbiddenError(
        "Access denied. Only the event's organizer or shopping designees can see other members' costs."
      );
    // new ObjectId lanza con un id mal formado; se conserva la respuesta 500 actual.
    const member = new mongoose.Types.ObjectId(memberId);
    if (!event.members.some((id) => member.equals(id)))
      throw new ForbiddenError("User is not a member of the event");
    if (!STATES_WITH_COSTS.includes(event.state))
      throw new ForbiddenError("Event state needs to be either finished or ready for payment");
    return this.deps.payments.memberCost(event.purchaseReceipts, member);
  }

  // El usuario se suma al evento y a los recibos de compra ya cargados.
  async subscribe(eventId: string, userId: string): Promise<IEventWithPurchaseReceipts | null> {
    const event: IEvent = await this.getEvent(eventId);
    const user = new mongoose.Types.ObjectId(userId);
    const precheck: string | null = this.cannotJoinMessage(event, user);
    if (precheck) throw new BadRequestError(precheck);
    if (!(await this.deps.users.findById(userId))) throw new BadRequestError(userNotFoundMessage);

    // Las condiciones se vuelven a verificar de forma atómica al escribir.
    const joined: IEvent | null = await this.deps.events.addMemberIfAllowed(event._id, user);
    if (!joined) {
      const current: IEvent | null = await this.deps.events.findById(String(event._id));
      throw new BadRequestError(
        (current && this.cannotJoinMessage(current, user)) || "The event is full."
      );
    }
    await this.deps.purchaseReceipts.addParticipant(event.purchaseReceipts, user);
    return this.deps.events.findByIdWithPurchaseReceiptIds(String(event._id));
  }

  // El usuario sale del evento, de sus recibos de compra y de sus votos.
  async unsubscribe(eventId: string, userId: string): Promise<IEventWithPurchaseReceiptsOptions> {
    const event: IEventWithPurchaseReceiptsOptions | null =
      await this.deps.events.findByIdWithReceiptsAndOptions(eventId);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    const member = new mongoose.Types.ObjectId(userId);
    const index: number = event.members.findIndex((id) => member.equals(id));
    if (index === -1)
      throw new NotFoundError("The member with the given ID is not part of the event.");
    if (!(await this.deps.users.findById(userId))) throw new BadRequestError(userNotFoundMessage);
    if (STATES_WITHOUT_UNSUBSCRIBE.includes(event.state))
      throw new BadRequestError(
        "The user can't unsubscribe from the event if it's closed or ready for payment."
      );

    for (const receipt of event.purchaseReceipts) {
      receipt.participants = receipt.participants.filter((id) => !id.equals(member));
      await this.deps.purchaseReceipts.save(receipt);
    }
    for (const option of event.options) {
      option.participants = option.participants.filter((id) => !id.equals(member));
      await this.deps.options.save(option);
    }
    event.members.splice(index, 1);
    await this.deps.events.save(event);
    return event;
  }

  async editRoles(eventId: string, roles: EventRolesInput): Promise<IEvent> {
    const event: IEvent = await this.getEvent(eventId);
    event.chef = roles.chef ? roles.chef : null;
    event.shoppingDesignee = roles.shoppingDesignee;
    await this.deps.events.save(event);
    return event;
  }

  // Reemplaza los datos editables del evento validando la transición de estado.
  async edit(eventId: string, input: EventEditInput): Promise<IEvent> {
    const event: IEvent = await this.getEvent(eventId);
    const transitionError: string | null = await this.stateTransitionError(
      event,
      String(input.state ?? "").toLowerCase()
    );
    if (transitionError) throw new BadRequestError(transitionError);

    event.title = input.title;
    event.datetime = input.datetime;
    event.description = input.description;
    event.memberLimit = input.memberLimit;
    event.penalization = input.penalization;
    event.penalizationStartDate = input.penalization > 0 ? input.penalizationStartDate : null;
    event.state = input.state;
    event.isPrivate = input.isPrivate;
    if (event.shoppingDesignee.length == 0 && event.state !== "available")
      throw new BadRequestError("The event has no shopping designees.");
    await this.deps.events.save(event);

    if (event.state === "cancelled") await this.deps.reminders.cancelForEvent(event._id);
    else await this.deps.reminders.syncWithEvent(event);
    return event;
  }

  // El organizador, los miembros y los designados vienen del body (ver TOFIX.md).
  async create(body: Record<string, any>): Promise<IEvent> {
    const fields: Record<string, unknown> = Object.fromEntries(
      CREATE_EVENT_FIELDS.filter((field) => field in body).map((field) => [field, body[field]])
    );
    const event: IEvent = this.deps.events.build(fields);
    event.chef = body.isChef ? body.organizer : null;
    if (body.isShoppingDesignee) event.shoppingDesignee.push(body.organizer);
    await this.deps.events.save(event);

    await this.pruneEndedEvents();
    if (!event.isPrivate) await this.deps.reminders.scheduleNewEvent(event._id);
    await this.deps.reminders.syncWithEvent(event);
    return event;
  }

  // Borra el evento y todo lo que cuelga de él (sin transacción: un fallo a
  // mitad puede dejar documentos huérfanos).
  async delete(eventId: string): Promise<IEvent> {
    const event: IEvent = await this.getEvent(eventId);
    await this.deleteRelatedDocuments(event._id);
    await this.deps.reminders.cancelForEvent(event._id);
    await this.deps.events.deleteById(eventId);
    return event;
  }

  private async pruneEndedEvents(): Promise<void> {
    const totalPublic: number = await this.deps.events.countPublic();
    if (totalPublic <= MAX_PUBLIC_EVENTS) return;
    const ended: IEvent[] = await this.deps.events.findEndedOldestFirst();
    const toDelete: IEvent[] = ended.slice(0, Math.min(totalPublic - MAX_PUBLIC_EVENTS, ended.length));
    for (const event of toDelete) {
      await this.deps.reminders.cancelForEvent(event._id);
      await this.deleteRelatedDocuments(event._id);
      await this.deps.events.deleteById(String(event._id));
    }
  }

  // Comprobantes de transferencia y de compra (con sus imágenes) y calificaciones.
  private async deleteRelatedDocuments(eventId: mongoose.Types.ObjectId): Promise<void> {
    const event: IEventWithTransferReceiptsPurchaseReceiptsRatings | null =
      await this.deps.events.findByIdWithReceiptsAndRatings(eventId);

    await Promise.all(
      event!.transferReceipts.map(async (receipt) => {
        if (receipt.image) await this.deps.images.delete(receipt.image);
        await this.deps.transferReceipts.deleteById(String(receipt._id));
      })
    );
    await Promise.all(
      event!.purchaseReceipts.map(async (receipt) => {
        if (receipt.image) await this.deps.images.delete(receipt.image);
        await this.deps.purchaseReceipts.deleteById(String(receipt._id));
      })
    );
    await Promise.all(
      event!.ratings.map((rating) => this.deps.ratings.deleteById(String(rating._id)))
    );
  }

  private async getEvent(id: string): Promise<IEvent> {
    const event: IEvent | null = await this.deps.events.findById(id);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    return event;
  }

  private cannotJoinMessage(event: IEvent, userId: mongoose.Types.ObjectId): string | null {
    if (event.memberLimit <= event.members.length) return "The event is full.";
    if (event.state !== "available") return "The event is not available for users to join";
    if (event.members.some((member) => member.equals(userId)))
      return "The user has already joined the event";
    return null;
  }

  private async stateTransitionError(event: IEvent, nextState: string): Promise<string | null> {
    const currentState: string = event.state;
    if (nextState === currentState) return null;
    if (!ALLOWED_STATE_TRANSITIONS[currentState]?.includes(nextState))
      return `Cannot change the event state from "${currentState}" to "${nextState}".`;
    if (nextState === "readyforpayment" && event.purchaseReceipts.length === 0)
      return "The event needs at least one purchase receipt to be ready for payment.";
    if (
      currentState === "readyforpayment" &&
      (await this.deps.transferReceipts.existsApprovedForEvent(event._id))
    )
      return "The event can't go back to closed because some payments were already approved.";
    return null;
  }
}
