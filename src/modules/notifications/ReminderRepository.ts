import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Reminder } from "../../models/reminder.js";
import { IReminder } from "../../models/interfaces.js";

export class ReminderRepository extends BaseRepository<IReminder> {
  constructor() {
    super(Reminder);
  }

  findByEvent(eventId: mongoose.Types.ObjectId): Promise<IReminder[]> {
    return this.model.find({ event: eventId }).exec();
  }

  async deleteByEvent(eventId: mongoose.Types.ObjectId): Promise<void> {
    await this.model.deleteMany({ event: eventId }).exec();
  }

  findDue(now: Date): Promise<IReminder[]> {
    return this.model.find({ datetime: { $lte: now } }).exec();
  }
}
