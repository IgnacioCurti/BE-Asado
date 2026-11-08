import mongoose from "mongoose";
import { IEvent } from "./interfaces.js";

const eventSchema: mongoose.Schema<IEvent> = new mongoose.Schema<IEvent>({
  // Grupo dueño del evento (GROUPS_FEATURE.md §3.3): se fija al crearlo y no se
  // mueve a otro grupo. Indexado para listar los eventos de un grupo.
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
    immutable: true,
    index: true,
  },

  title: { type: String, required: true },

  datetime: { type: Date, required: true },

  description: { type: String, required: true },

  memberLimit: { type: Number, required: true, min: 1 },

  state: {
    type: String,
    required: true,
    lowercase: true,
    default: "available",
    validate: {
      validator: function (v: string): boolean {
        const valid_states: string[] = [
          "closed",
          "available",
          "readyforpayment",
          "cancelled",
          "finished",
        ];
        if (!v) return false;
        if (!valid_states.includes(v.toLowerCase())) {
          return false;
        }
        return true;
      },
    },
  },

  members: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },

  chef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },

  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  shoppingDesignee: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: null,
  },

  transferReceipts: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "TransferReceipt",
    default: [],
  },

  purchaseReceipts: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "PurchaseReceipt",
    default: [],
  },

  ratings: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Rating",
  },

  options: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Option",
    default: [],
  },

  isPrivate: { type: Boolean, default: false },

  penalization: { type: Number, default: null, min: 0 },

  penalizationStartDate: { type: Date },
});

const Event: mongoose.Model<IEvent> = mongoose.model<IEvent>(
  "Event",
  eventSchema
);

export { Event };
