import mongoose, { Query, PopulateOptions } from "mongoose";

export type PopulateOption = string | PopulateOptions;

export const createObjectId = (id: string) => new mongoose.Types.ObjectId(id);

export function populateFields<T>(
  query: Query<T, any, any>,
  fieldsToPopulate: PopulateOption[]
): Query<T, any> {
  let resultQuery = query;
  fieldsToPopulate.forEach((fieldToPopulate) => {
    // I need to perform this validation because otherwise typescript complains
    if (typeof fieldToPopulate === "string") {
      resultQuery = resultQuery.populate(fieldToPopulate);
    } else {
      resultQuery = resultQuery.populate(fieldToPopulate);
    }
  });

  return resultQuery;
}
