import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { PurchaseReceipt } from "../../models/purchaseReceipt.js";
import { IPurchaseReceipt } from "../../models/interfaces.js";

export class PurchaseReceiptRepository extends BaseRepository<IPurchaseReceipt> {
  constructor() {
    super(PurchaseReceipt);
  }

  findByImage(imageId: string): Promise<IPurchaseReceipt | null> {
    return this.model.findOne({ image: imageId }).exec();
  }

  async addParticipant(
    receiptIds: mongoose.Types.ObjectId[],
    userId: mongoose.Types.ObjectId
  ): Promise<void> {
    await this.model
      .updateMany({ _id: { $in: receiptIds } }, { $addToSet: { participants: userId } })
      .exec();
  }
}
