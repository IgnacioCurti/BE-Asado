import mongoose, { Model } from "mongoose";
import { ITransferReceipt } from "./interfaces.js";

const transferReceiptSchema: mongoose.Schema<ITransferReceipt> =
  new mongoose.Schema({
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },

    description: { type: String },

    amount: { type: Number, required: true, min: 0 },

    hasPaid: { type: Boolean, default: false },

    paymentMethod: { type: String, default: null },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    datetime: { type: Date, required: true },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  });

const TransferReceipt: Model<ITransferReceipt> =
  mongoose.model<ITransferReceipt>("TransferReceipt", transferReceiptSchema);

export { transferReceiptSchema, TransferReceipt };
