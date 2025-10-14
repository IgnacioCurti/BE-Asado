import { Query } from "mongoose";
import { IImage, ObjectId } from "../models/interfaces";
import { Image } from "../models/image";
import { extname } from "path";

export async function findById(id: string): Promise<IImage | null> {
  return await Image.findById(id);
}

export async function findByIdAndDelete(
  id: string | ObjectId
): Promise<Query<IImage | null, IImage, {}, IImage>> {
  return await Image.findByIdAndDelete(id);
}

export async function findOneAndDelete(id: ObjectId): Promise<IImage | null> {
  return await Image.findOneAndDelete(id);
}

export async function saveImage(file: Express.Multer.File): Promise<ObjectId> {
  if (!file) {
    throw new Error("No file provided");
  }
  const image = new Image();
  image.name = createImageName(file);
  image.mimetype = file.mimetype;
  image.image = file.buffer;
  await image.save();
  return image._id;
}

function createImageName({ originalname }: { originalname: string }): string {
  const fileExtension = extname(originalname);
  const fileName = originalname.split(fileExtension)[0];
  return `${fileName}_${Date.now()}${fileExtension}`;
}
