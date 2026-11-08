import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IEvent, ITransferReceipt } from "../../models/interfaces.js";
import { GroupRepository } from "../groups/GroupRepository.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { EventRepository } from "./EventRepository.js";

const invalidObjectIdMessage: string = "Invalid ObjectID";
const eventNotFoundMessage: string = "The event with the given ID does not exist.";
const notOrganizerOrDesigneeMessage: string =
  "Access denied. The user is not the event's shopping designee or organizer.";

// Reglas de acceso por rol dentro de un evento. Cada método valida los ids,
// carga el recurso y lanza AppError (400 / 404 / 403) si el usuario no puede.
// Las usan los middlewares de autorización de las rutas.
// Los permisos de organizador exigen además ser miembro actual del grupo del
// evento (GROUPS_FEATURE.md §4.4.1): el organizador que salió del grupo ya no
// edita ni borra. Los designados no lo necesitan: no pueden salir del grupo
// con un rol activo, y en los eventos available la baja les quita el rol.
export class EventAccessPolicy {
  constructor(
    private readonly events: Pick<EventRepository, "findById" | "findByOption">,
    private readonly transferReceipts: Pick<TransferReceiptRepository, "findById">,
    private readonly groups: Pick<GroupRepository, "hasMember">
  ) {}

  async assertOrganizer(eventId: string, userId: string): Promise<void> {
    this.assertValidIds(eventId);
    const event: IEvent = await this.getEvent(eventId);
    if (!(await this.isActiveOrganizer(event, userId)))
      throw new ForbiddenError("Access denied. The user is not the event's organizer.");
  }

  async assertMember(eventId: string, userId: string): Promise<void> {
    this.assertValidIds(eventId);
    const event: IEvent = await this.getEvent(eventId);
    const user = new mongoose.Types.ObjectId(userId);
    if (!event.members.some((member) => user.equals(member)))
      throw new ForbiddenError("Access denied. The user is not a participant of the event.");
  }

  // Ver un evento (detalle, pagos, montos): miembro del grupo del evento o
  // miembro del evento (GROUPS_FEATURE.md §5.1). Lo segundo deja ver el
  // historial a quien salió del grupo pero sigue en un evento cerrado.
  async assertViewer(eventId: string, userId: string): Promise<void> {
    this.assertValidIds(eventId);
    const event: IEvent = await this.getEvent(eventId);
    if (event.members.some((member) => member.toString() === userId)) return;
    if (!(await this.groups.hasMember(event.group, userId)))
      throw new ForbiddenError("Access denied. The user is not a member of the event's group.");
  }

  async assertShoppingDesignee(eventId: string, userId: string): Promise<void> {
    this.assertValidIds(userId, eventId);
    const event: IEvent = await this.getEvent(eventId);
    if (!this.isDesignee(event, userId))
      throw new ForbiddenError("Access denied. User is not a shopping designee.");
  }

  async assertOrganizerOrDesignee(eventId: string, userId: string): Promise<void> {
    this.assertValidIds(userId, eventId);
    const event: IEvent = await this.getEvent(eventId);
    if (!(await this.isOrganizerOrDesignee(event, userId)))
      throw new ForbiddenError(notOrganizerOrDesigneeMessage);
  }

  // Gestionar opciones: el evento sale de eventId (crear) o de la opción (editar/borrar).
  async assertOptionManager(eventId: string | undefined, optionId: string, userId: string): Promise<void> {
    this.assertValidIds(eventId ?? optionId);
    const event: IEvent | null = eventId
      ? await this.events.findById(eventId)
      : await this.events.findByOption(optionId);
    if (!event) throw new NotFoundError(eventId ? eventNotFoundMessage : "Option not found");
    if (!(await this.isOrganizerOrDesignee(event, userId)))
      throw new ForbiddenError(notOrganizerOrDesigneeMessage);
  }

  // Votar: el usuario tiene que ser miembro del evento de la opción.
  async assertOptionVoter(optionId: string, userId: string): Promise<void> {
    this.assertValidIds(optionId);
    const event: IEvent | null = await this.events.findByOption(optionId);
    if (!event) throw new NotFoundError("Option not found");
    if (!event.members.some((member) => member.toString() === userId))
      throw new ForbiddenError("Access denied. The user is not a participant of the event.");
  }

  async assertTransferReceiptOwner(receiptId: string, userId: string): Promise<void> {
    if (!isValidId(receiptId)) throw new BadRequestError("Invalid ID");
    const receipt: ITransferReceipt | null = await this.transferReceipts.findById(receiptId);
    if (!receipt)
      throw new NotFoundError("The transfer receipt with the given ID does not exist.");
    if (receipt.user.toString() !== userId)
      throw new ForbiddenError("Access denied. The user is not the owner of the receipt.");
  }

  private assertValidIds(...ids: string[]): void {
    if (!ids.every((id) => isValidId(id))) throw new BadRequestError(invalidObjectIdMessage);
  }

  private async getEvent(eventId: string): Promise<IEvent> {
    const event: IEvent | null = await this.events.findById(eventId);
    if (!event) throw new NotFoundError(eventNotFoundMessage);
    return event;
  }

  private isDesignee(event: IEvent, userId: string): boolean {
    return event.shoppingDesignee.some((id) => id.toString() === userId);
  }

  private async isActiveOrganizer(event: IEvent, userId: string): Promise<boolean> {
    return event.organizer.toString() === userId && this.groups.hasMember(event.group, userId);
  }

  private async isOrganizerOrDesignee(event: IEvent, userId: string): Promise<boolean> {
    return this.isDesignee(event, userId) || this.isActiveOrganizer(event, userId);
  }
}
