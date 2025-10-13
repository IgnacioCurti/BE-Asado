import { FilterQuery, ProjectionType } from "mongoose";
import { IUser } from "../models/interfaces";
import { User } from "../models/user";

export async function findById<T>(
  id: string,
  projection?: ProjectionType<IUser> | null | undefined
): Promise<T | null> {
  let query = User.findById<T>(id);

  query = projection ? query.select(projection) : query;

  return await query.exec();
}

export async function find<T>(
  filter?: FilterQuery<T>,
  projection?: ProjectionType<T> | null | undefined
): Promise<T[]> {
  let query = filter ? User.find<T>(filter) : User.find<T>();
  query = projection ? query.select(projection) : query;
  return await query.exec();
}

export async function findOne<T>(filter: FilterQuery<T>): Promise<T | null> {
  return await User.findOne<T>(filter);
}

export async function findByIdAndRemove(id: string) {
  return await User.findByIdAndRemove(id);
}
