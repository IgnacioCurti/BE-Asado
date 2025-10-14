import mongoose, { Model } from "mongoose";
import { IRating } from "./interfaces";

const ratingSchema: mongoose.Schema = new mongoose.Schema<IRating>({
  score: {
    type: Number,
    required: true,
    validate: {
      validator: function (v: number): boolean {
        if (!v) return false;
        if (![1, 2, 3, 4, 5].includes(v)) return false;
        return true;
      },
    },
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

const Rating: Model<IRating> = mongoose.model<IRating>("Rating", ratingSchema);

export { Rating };
