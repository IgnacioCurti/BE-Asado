import mongoose, { Model } from "mongoose";
import { IReminder } from "./interfaces.js";

const reminderSchema: mongoose.Schema<IReminder> = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },

  datetime: {
    type: Date,
    required: true,
  },

  type: {
    type: String,
    required: true,
    validate: {
      validator: function (v: string): boolean {
        const valid_types: string[] = [
          "newEvent",
          "eventStart",
          "penalizationStart",
          "penalizationOneWeek",
        ];
        if (!v) return false;
        if (!valid_types.includes(v)) {
          return false;
        }
        return true;
      },
    },
  },
});

const Reminder: Model<IReminder> = mongoose.model<IReminder>(
  "Reminder",
  reminderSchema
);

export { Reminder };
