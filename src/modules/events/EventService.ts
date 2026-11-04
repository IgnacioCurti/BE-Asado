import mongoose from "mongoose";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IEventWithPurchaseReceiptsOptions,
  IMemberWhoHasUploaded,
  IPublicEvent,
  ITransferInfo,
} from "../../models/interfaces.js";
import { ReminderScheduler } from "../notifications/ReminderScheduler.js";
import { OptionRepository } from "../options/OptionRepository.js";
import { PaymentCalculator } from "../payments/PaymentCalculator.js";
import { PurchaseReceiptRepository } from "../purchaseReceipts/PurchaseReceiptRepository.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { TransferReceiptService } from "../transferReceipts/TransferReceiptService.js";
import { UserRepository } from "../users/UserRepository.js";
import { EventMapper } from "./EventMapper.js";
import { EventRepository } from "./EventRepository.js";

export const eventNotFoundMessage: string = "The event with the given ID was not found.";
const invalidObjectIdMessage: string = "Invalid ObjectID";

const STATES_WITH_COSTS: string[] = ["finished", "readyforpayment"];
const STATES_WITHOUT_UNSUBSCRIBE: string[] = ["closed", "readyforpayment"];
const userNotFoundMessage: string = "The user with the given ID was not found.";
const rolesFrozenMessage: string = "Roles can only change while the event is available.";
const chefTakenMessage: string = "The event already has a chef.";

// Al crear un evento, si hay más de MAX_PUBLIC_EVENTS públicos se borran los
// públicos terminados o cancelados más viejos.
const MAX_PUBLIC_EVENTS: number = 6;

// Campos que un cliente puede enviar al crear un evento. El estado, los roles y
// las colecciones relacionadas (recibos, ratings, opciones) las maneja el
// backend; el organizador sale del token.
const CREATE_EVENT_FIELDS: string[] = [
  "title",
  "datetime",
  "description",
  "memberLimit",
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

// Estado completo de los roles que manda el front. Solo se aceptan los cambios
// que afectan al usuario del token (GROUPS_FEATURE.md §4.4.2).
export interface EventRolesInput {
  chef?: unknown;
  shoppingDesignee?: unknown;
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
    | "findPublicEndedOldestFirst"
    | "deleteCascade"
    | "updateRolesIfAllowed"
  >;
  paymentStatus: Pick<TransferReceiptService, "membersWhoHaveUploaded">;
  users: Pick<UserRepository, "findById">;
  purchaseReceipts: Pick<PurchaseReceiptRepository, "addParticipant" | "save">;
  options: Pick<OptionRepository, "save">;
  transferReceipts: Pick<TransferReceiptRepository, "existsApprovedForEvent">;
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
    if (!isValidId(id)) throw new BadRequestError(invalidObjectIdMessage);
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

  // Cada miembro toma o suelta solo sus propios roles, y solo con el evento
  // disponible. El chef es uno solo: si está ocupado hay que esperar a que se libere.
  async editRoles(eventId: string, requesterId: string, roles: EventRolesInput): Promise<IEvent> {
    if (!isValidId(eventId)) throw new BadRequestError(invalidObjectIdMessage);
    const event: IEvent = await this.getEvent(eventId);
    const nextChef: string | null = roles.chef ? String(roles.chef) : null;
    const nextDesignees: string[] = this.parseIdList(roles.shoppingDesignee);
    if ((nextChef && !isValidId(nextChef)) || !nextDesignees.every((id) => isValidId(id)))
      throw new BadRequestError(invalidObjectIdMessage);
    if (!event.members.some((member) => member.toString() === requesterId))
      throw new ForbiddenError("Access denied. Only event members can take a role.");

    const currentChef: string | null = event.chef ? String(event.chef) : null;
    const currentDesignees: string[] = event.shoppingDesignee.map(String);
    const added: string[] = nextDesignees.filter((id) => !currentDesignees.includes(id));
    const removed: string[] = currentDesignees.filter((id) => !nextDesignees.includes(id));
    const chefChanged: boolean = nextChef !== currentChef;
    const touchesOthers: boolean =
      [...added, ...removed].some((id) => id !== requesterId) ||
      (chefChanged && nextChef !== requesterId && currentChef !== requesterId);
    if (touchesOthers)
      throw new ForbiddenError("Access denied. Users can only take or release their own roles.");
    if (!chefChanged && added.length === 0 && removed.length === 0) return event;
    if (event.state !== "available") throw new ConflictError(rolesFrozenMessage);
    if (chefChanged && nextChef === requesterId && currentChef !== null)
      throw new ConflictError(chefTakenMessage);

    const me = new mongoose.Types.ObjectId(requesterId);
    const updated: IEvent | null = await this.deps.events.updateRolesIfAllowed(event._id, {
      chef: chefChanged ? { from: currentChef ? me : null, to: nextChef ? me : null } : undefined,
      addDesignee: added.length > 0 ? me : undefined,
      removeDesignee: removed.length > 0 ? me : undefined,
    });
    if (!updated) {
      // Otro pedido cambió el evento en el medio (estado o chef).
      const current: IEvent = await this.getEvent(eventId);
      throw new ConflictError(current.state !== "available" ? rolesFrozenMessage : chefTakenMessage);
    }
    return updated;
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

  // El organizador es el usuario del token. Solo puede sumarse a sí mismo como
  // miembro (members incluye su id), chef (isChef) o comprador (isShoppingDesignee).
  async create(organizerId: string, body: Record<string, any>): Promise<IEvent> {
    const fields: Record<string, unknown> = Object.fromEntries(
      CREATE_EVENT_FIELDS.filter((field) => field in body).map((field) => [field, body[field]])
    );
    const organizer = new mongoose.Types.ObjectId(organizerId);
    const joins: boolean =
      Array.isArray(body.members) && body.members.some((id: unknown) => String(id) === organizerId);
    const event: IEvent = this.deps.events.build({
      ...fields,
      organizer,
      members: joins ? [organizer] : [],
      chef: body.isChef ? organizer : null,
      shoppingDesignee: body.isShoppingDesignee ? [organizer] : [],
    });
    try {
      await this.deps.events.save(event);
    } catch (error) {
      if (error instanceof mongoose.Error.ValidationError) throw new BadRequestError(error.message);
      throw error;
    }

    await this.pruneEndedEvents();
    if (!event.isPrivate) await this.deps.reminders.scheduleNewEvent(event._id);
    await this.deps.reminders.syncWithEvent(event);
    return event;
  }

  // Borra el evento y todo lo que cuelga de él, en una sola transacción.
  async delete(eventId: string): Promise<IEvent> {
    const event: IEvent = await this.getEvent(eventId);
    await this.deps.events.deleteCascade([event._id]);
    return event;
  }

  private async pruneEndedEvents(): Promise<void> {
    const totalPublic: number = await this.deps.events.countPublic();
    if (totalPublic <= MAX_PUBLIC_EVENTS) return;
    const ended: IEvent[] = await this.deps.events.findPublicEndedOldestFirst();
    const toDelete: IEvent[] = ended.slice(0, totalPublic - MAX_PUBLIC_EVENTS);
    await this.deps.events.deleteCascade(toDelete.map((event) => event._id));
  }

  private async getEvent(id: string): Promise<IEvent> {
    const event: IEvent | null = await this.deps.events.findById(id);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    return event;
  }

  private parseIdList(value: unknown): string[] {
    if (value === undefined || value === null || value === "") return [];
    if (!Array.isArray(value)) throw new BadRequestError("shoppingDesignee must be an array.");
    return [...new Set(value.map(String))];
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
