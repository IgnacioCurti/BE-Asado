import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import {
  IEvent,
  IEventAmountCalculations,
  IEventPopulatedWithOptions,
  IEventWithPurchaseReceipts,
  IMemberWhoHasUploaded,
  IPublicEvent,
  ITransferInfo,
} from "../../models/interfaces.js";
import { PaymentCalculator } from "../payments/PaymentCalculator.js";
import { TransferReceiptService } from "../transferReceipts/TransferReceiptService.js";
import { EventMapper } from "./EventMapper.js";
import { EventRepository } from "./EventRepository.js";

export const eventNotFoundMessage: string = "The event with the given ID was not found.";

const STATES_WITH_COSTS: string[] = ["finished", "readyforpayment"];

export interface EventServiceDeps {
  events: Pick<
    EventRepository,
    | "findVisibleTo"
    | "findPublicSummaries"
    | "findSummariesVisibleTo"
    | "findByIdWithDetails"
    | "findByIdForAmounts"
    | "findByIdWithPurchaseReceiptIds"
  >;
  transferReceipts: Pick<TransferReceiptService, "membersWhoHaveUploaded">;
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
    return this.deps.transferReceipts.membersWhoHaveUploaded(eventId);
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
}
