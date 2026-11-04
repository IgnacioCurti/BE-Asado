import mongoose from "mongoose";

// true solo si el string es un ObjectId canónico (24 hex en minúscula).
export function isValidId(id: string): boolean {
  if (mongoose.Types.ObjectId.isValid(id)) {
    if (String(new mongoose.Types.ObjectId(id)) == id) {
      return true;
    }
  }
  return false;
}
