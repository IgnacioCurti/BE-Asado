import { Query } from "mongoose";
import { IRating, ObjectId } from "../models/interfaces";
import { Rating } from "../models/rating";

export async function findByIdAndDelete(
  id: ObjectId | any
): Promise<Query<IRating | null, IRating, {}, IRating>> {
  return await Rating.findByIdAndDelete(id);
}
