import mongoose, { Model } from "mongoose";
import { IImage } from "./interfaces";

const imageSchema: mongoose.Schema = new mongoose.Schema<IImage>({
  name: { type: String },

  mimetype: { type: String },

  image: { type: Buffer },
});

const Image: Model<IImage> = mongoose.model<IImage>("Image", imageSchema);

export { imageSchema, Image };
