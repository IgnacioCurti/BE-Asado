import mongoose from "mongoose";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError.js";
import { IRating } from "../../models/interfaces.js";
import { EventRepository, IEventWithRatings } from "../events/EventRepository.js";
import { RatingRepository } from "./RatingRepository.js";

const STATES_WITHOUT_RATING: string[] = ["available", "cancelled"];

export class RatingService {
  constructor(
    private readonly events: Pick<EventRepository, "findByIdWithRatings" | "save">,
    private readonly ratings: Pick<RatingRepository, "create" | "save">
  ) {}

  // Crea la calificación del usuario o actualiza la existente.
  async createOrUpdate(eventId: string, userId: string, score: number): Promise<IRating> {
    const event: IEventWithRatings = await this.getEventWithMember(eventId, userId);
    if (STATES_WITHOUT_RATING.includes(event.state))
      throw new BadRequestError("The event is not closed or finished.");

    const existing: IRating | undefined = this.findUserRating(event, userId);
    if (existing) {
      existing.score = score;
      return this.ratings.save(existing);
    }

    const rating: IRating = await this.ratings.create({ score, user: userId });
    event.ratings.push(rating);
    await this.events.save(event);
    return rating;
  }

  async getFromUser(eventId: string, userId: string): Promise<IRating | null> {
    const event: IEventWithRatings = await this.getEventWithMember(eventId, userId);
    return this.findUserRating(event, userId) ?? null;
  }

  private async getEventWithMember(eventId: string, userId: string): Promise<IEventWithRatings> {
    const event: IEventWithRatings | null = await this.events.findByIdWithRatings(eventId);
    if (!event) throw new NotFoundError("The event with the given ID was not found.");
    // new ObjectId lanza con un id mal formado; se conserva la respuesta 500 actual.
    const user = new mongoose.Types.ObjectId(userId);
    if (!event.members.some((member) => user.equals(member)))
      throw new BadRequestError("The user with the given ID was not found in the event.");
    return event;
  }

  private findUserRating(event: IEventWithRatings, userId: string): IRating | undefined {
    return event.ratings.find((rating) => rating.user.equals(userId));
  }
}
