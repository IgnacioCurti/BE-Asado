import {
  FilterQuery,
  ProjectionType,
  Query,
  QueryOptions,
  UpdateQuery,
} from "mongoose";
import { IOption, ObjectId } from "../models/interfaces";
import { Option } from "../models/option";

export async function find<T>(
  filter?: FilterQuery<T>,
  projection?: ProjectionType<T> | null | undefined
): Promise<T[]> {
  let query = filter ? Option.find<T>(filter) : Option.find<T>();
  query = projection ? query.select(projection) : query;
  return await query.exec();
}

export async function findByIdAndUpdate(
  id: string | ObjectId,
  update: UpdateQuery<IOption>,
  options?: QueryOptions<IOption>
): Promise<IOption | null> {
  return await Option.findByIdAndUpdate(id, update, options);
}

export async function findByIdAndDelete(
  id: string | ObjectId
): Promise<Query<IOption | null, IOption, {}, IOption>> {
  return await Option.findByIdAndDelete(id);
}
