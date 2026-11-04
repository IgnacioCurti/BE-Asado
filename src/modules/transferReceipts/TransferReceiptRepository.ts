import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { TransferReceipt } from "../../models/transferReceipt.js";
import { ITransferReceipt } from "../../models/interfaces.js";

export class TransferReceiptRepository extends BaseRepository<ITransferReceipt> {
  constructor() {
    super(TransferReceipt);
  }

  findByImage(imageId: string): Promise<ITransferReceipt | null> {
    return this.model.findOne({ image: imageId }).exec();
  }

  findByEventAndUser(
    eventId: mongoose.Types.ObjectId,
    userId: string
  ): Promise<ITransferReceipt | null> {
    return this.model.findOne({ event: eventId, user: userId }).exec();
  }
}
