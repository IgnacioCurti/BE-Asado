import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Event } from "../../models/event.js";
import mongoose from "mongoose";
import { IEvent, IRating, IUserName } from "../../models/interfaces.js";

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
}
