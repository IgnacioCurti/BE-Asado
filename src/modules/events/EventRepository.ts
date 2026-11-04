import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Event } from "../../models/event.js";
import { IEvent, IRating } from "../../models/interfaces.js";

export interface IEventWithRatings extends Omit<IEvent, "ratings"> {
  ratings: IRating[];
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
}
