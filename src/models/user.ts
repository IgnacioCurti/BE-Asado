import mongoose, { Model } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { jwtPrivateKey } from "../config.js";
import { IUser } from "./interfaces.js";

const userSchema: mongoose.Schema<IUser> = new mongoose.Schema({
  name: { type: String, required: true },

  lastName: { type: String },

  email: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function (v: string): boolean {
        if (!v) return false;
        if (v == "davidmartingallegos@gmail.com") return true;
        let username: string, domain: string, rest: string[];
        [username, domain, ...rest] = v.split("@");
        if (rest.length) return false;
        if (domain !== "endava.com") return false;
        return true;
      },
      message: (props) => `${props.value} is not a valid endava email.`,
    },
  },

  alternativeEmail: {
    type: String,
    default: null,
    validate: {
      validator: function (v: string | null): boolean {
        if (v == null) return true;
        let username: string, domain: string, rest: string[];
        [username, domain, ...rest] = v.split("@");
        if (rest.length) return false;
        return true;
      },
      message: (props) => `${props.value} is not a valid email.`,
    },
  },

  password: { type: String, required: true },

  verificationCode: { type: String, default: null },

  verificationCodeExpiresAt: { type: Date, default: null },

  verificationAttempts: { type: Number, default: 0 },

  cbu: { type: String, default: null },

  alias: { type: String, default: null },

  specialDiet: {
    type: [String],
    required: true,
    validate: {
      validator: function (v: string[]): boolean {
        const valid_diets: string[] = [
          "celiac",
          "hypertensive",
          "vegan",
          "vegetarian",
        ];
        if (!v) return false;
        for (const diet of v) {
          if (!valid_diets.includes(diet.toLowerCase())) {
            return false;
          }
        }
        return true;
      },
    },
  },

  notifications: {
    newEvent: { type: Boolean, default: false },
    eventStart: { type: Boolean, default: false },
    penalizationStart: { type: Boolean, default: false },
    penalizationOneWeek: { type: Boolean, default: false },
  },

  profilePicture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Image",
    default: null,
  },
});

userSchema.methods.generateAuthToken = function (this: IUser): string {
  return jwt.sign({ _id: this._id, email: this.email }, jwtPrivateKey);
};

userSchema.methods.isValidPassword = async function (
  this: IUser,
  password: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw error;
  }
};

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);

export { userSchema, User };
