import mongoose from "mongoose";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IRating } from "../../models/interfaces.js";
import { EventRepository, IEventWithRatings } from "../events/EventRepository.js";
import { RatingRepository } from "./RatingRepository.js";

const STATES_WITHOUT_RATING: string[] = ["available", "cancelled"];
const VALID_SCORES: number[] = [1, 2, 3, 4, 5];

export class RatingService {
  constructor(
    private readonly events: Pick<EventRepository, "findByIdWithRatings" | "save">,
    private readonly ratings: Pick<RatingRepository, "create" | "save">
  ) {}

  // Crea la calificación del usuario o actualiza la existente. Cada uno califica
  // solo por sí mismo.
  async createOrUpdate(
    eventId: string,
    userId: string,
    requesterId: string,
    score: unknown
  ): Promise<IRating> {
    this.assertValidIds(eventId, userId);
    if (userId !== requesterId)
      throw new ForbiddenError("Access denied. Users can only rate events for themselves.");
    // Mongoose aceptaba el número como string ("4"); se mantiene.
    const value: number = typeof score === "string" && score.trim() !== "" ? Number(score) : (score as number);
    if (typeof value !== "number" || !VALID_SCORES.includes(value))
      throw new BadRequestError("The score must be an integer between 1 and 5.");
    const event: IEventWithRatings = await this.getEventWithMember(eventId, userId);
    if (STATES_WITHOUT_RATING.includes(event.state))
      throw new BadRequestError("The event is not closed or finished.");

    const existing: IRating | undefined = this.findUserRating(event, userId);
    if (existing) {
      existing.score = value;
      return this.ratings.save(existing);
    }

    const rating: IRating = await this.ratings.create({ score: value, user: userId });
    event.ratings.push(rating);
    await this.events.save(event);
    return rating;
  }

  async getFromUser(eventId: string, userId: string): Promise<IRating | null> {
    this.assertValidIds(eventId, userId);
    const event: IEventWithRatings = await this.getEventWithMember(eventId, userId);
    return this.findUserRating(event, userId) ?? null;
  }

  private async getEventWithMember(eventId: string, userId: string): Promise<IEventWithRatings> {
    const event: IEventWithRatings | null = await this.events.findByIdWithRatings(eventId);
    if (!event) throw new NotFoundError("The event with the given ID was not found.");
    const user = new mongoose.Types.ObjectId(userId);
    if (!event.members.some((member) => user.equals(member)))
      throw new BadRequestError("The user with the given ID was not found in the event.");
    return event;
  }

  private assertValidIds(...ids: string[]): void {
    if (!ids.every((id) => isValidId(id))) throw new BadRequestError("Invalid ObjectID");
  }

  private findUserRating(event: IEventWithRatings, userId: string): IRating | undefined {
    return event.ratings.find((rating) => rating.user.equals(userId));
  }
}
