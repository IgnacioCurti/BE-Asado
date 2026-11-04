import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Option } from "../../models/option.js";
import { IOption } from "../../models/interfaces.js";

export type VoteOperator = "$addToSet" | "$pull";

export class OptionRepository extends BaseRepository<IOption> {
  constructor() {
    super(Option);
  }

  updateTitle(id: string, title: string): Promise<IOption | null> {
    return this.model.findByIdAndUpdate(id, { title }, { new: true }).exec();
  }

  updateParticipant(id: string, operator: VoteOperator, userId: string): Promise<IOption | null> {
    return this.model
      .findByIdAndUpdate(id, { [operator]: { participants: userId } }, { new: true })
      .exec();
  }

  findByIds(ids: mongoose.Types.ObjectId[]): Promise<IOption[]> {
    return this.model.find({ _id: { $in: ids } }).exec();
  }
}
