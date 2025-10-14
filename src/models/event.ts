import mongoose from "mongoose";
import { IEvent } from "./interfaces";
import { EventState } from "../repositories/eventsRepository";

const eventSchema: mongoose.Schema<IEvent> = new mongoose.Schema<IEvent>({
  title: { type: String, required: true },

  datetime: { type: Date, required: true },

  description: { type: String, required: true },

  memberLimit: { type: Number, required: true },

  state: {
    type: String,
    required: true,
    default: EventState.available,
    validate: {
      validator: function (v: string): boolean {
        const valid_states: string[] = [
          EventState.closed,
          EventState.available,
          EventState.readyForPayment,
          EventState.cancelled,
          EventState.finished,
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

  penalization: { type: Number, default: null },

  penalizationStartDate: { type: Date },
});

const Event: mongoose.Model<IEvent> = mongoose.model<IEvent>(
  "Event",
  eventSchema
);

export { Event };
