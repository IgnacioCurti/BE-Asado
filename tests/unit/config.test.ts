import { afterEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

// config.ts valida al importarse, así que cada test importa una copia nueva.
async function importConfig() {
  vi.resetModules();
  return import("../../src/config.js");
}

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con todas las variables obligatorias exporta la configuración", async () => {
    const config = await importConfig();
    expect(config.jwtPrivateKey).toBe("test-jwt-private-key");
    expect(config.brevo).toEqual({ apiKey: "test-brevo-api-key", url: "https://brevo.test/v3/smtp/email" });
  });

  it("si falta alguna variable obligatoria falla al importar y dice cuáles", async () => {
    // Un string vacío cuenta como faltante, y dotenv no pisa variables ya definidas.
    vi.stubEnv("JWTPRIVATEKEY", "");
    vi.stubEnv("BREVO_URL", "");
    await expect(importConfig()).rejects.toThrow("Missing required environment variables: JWTPRIVATEKEY, BREVO_URL");
  });
});

describe("connectDB", () => {
  it("si no puede conectar, loguea y propaga el error", async () => {
    const error = new Error("connection refused");
    vi.spyOn(mongoose, "connect").mockRejectedValueOnce(error);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { connectDB } = await import("../../src/connection/connection.js");

    await expect(connectDB()).rejects.toBe(error);
    expect(logged).toHaveBeenCalledWith("Could not connect to MongoDB:", error);
  });
});
