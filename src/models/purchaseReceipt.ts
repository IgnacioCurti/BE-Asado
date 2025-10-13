import mongoose, { Model } from "mongoose";
import { IPurchaseReceipt } from "./interfaces";

const purchaseReceiptSchema: mongoose.Schema =
  new mongoose.Schema<IPurchaseReceipt>({
    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },

    description: { type: String, required: true },

    amount: { type: Number, required: true },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    shoppingDesignee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
    },
  });

const PurchaseReceipt: Model<IPurchaseReceipt> =
  mongoose.model<IPurchaseReceipt>("PurchaseReceipt", purchaseReceiptSchema);

export { purchaseReceiptSchema, PurchaseReceipt };
