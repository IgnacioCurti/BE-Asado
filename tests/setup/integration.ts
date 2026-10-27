import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, inject, vi } from "vitest";
import mongoose from "mongoose";
import { installMailerMock } from "../helpers/mailer.js";

const mongoUri: string = inject("mongoUri");
if (!mongoUri || !mongoUri.startsWith("mongodb://127.0.0.1")) {
  throw new Error(`Refusing to run integration tests against ${mongoUri}`);
}
// Base de datos única por archivo de test: permite correr archivos en paralelo.
process.env.DATABASE_URL = `${mongoUri}be-asado-test-${randomUUID()}`;

beforeAll(async () => {
  // src/app.ts conecta a la base al importarse y loguea "Connected to MongoDB".
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("../../src/app.js");
  if (mongoose.connection.readyState !== 1) {
    await new Promise<void>((resolve, reject) => {
      mongoose.connection.once("connected", () => resolve());
      mongoose.connection.once("error", reject);
    });
  }
  // Crea los índices (p. ej. email único) antes de empezar.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

beforeEach(async () => {
  installMailerMock();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
});
