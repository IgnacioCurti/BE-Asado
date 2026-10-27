import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { isValidId } from "../../../src/utils/utils.js";

describe("isValidId", () => {
  it("acepta un ObjectId de 24 caracteres hexadecimales en minúscula", () => {
    expect(isValidId("507f1f77bcf86cd799439011")).toBe(true);
    expect(isValidId(new mongoose.Types.ObjectId().toString())).toBe(true);
  });

  it("rechaza un ObjectId válido escrito en mayúsculas (la representación canónica es minúscula)", () => {
    expect(isValidId("507F1F77BCF86CD799439011")).toBe(false);
  });

  it("rechaza strings de 12 caracteres aunque Mongo los acepte como ObjectId", () => {
    expect(mongoose.Types.ObjectId.isValid("aaaaaaaaaaaa")).toBe(true);
    expect(isValidId("aaaaaaaaaaaa")).toBe(false);
  });

  it.each([
    ["string vacío", ""],
    ["texto corto", "abc"],
    ["24 caracteres no hexadecimales", "zzzzzzzzzzzzzzzzzzzzzzzz"],
    ["23 caracteres", "507f1f77bcf86cd79943901"],
    ["25 caracteres", "507f1f77bcf86cd7994390111"],
    ["con espacios", " 507f1f77bcf86cd799439011"],
  ])("rechaza %s", (_label, value) => {
    expect(isValidId(value)).toBe(false);
  });

  it("rechaza undefined y null", () => {
    expect(isValidId(undefined as unknown as string)).toBe(false);
    expect(isValidId(null as unknown as string)).toBe(false);
  });
});
