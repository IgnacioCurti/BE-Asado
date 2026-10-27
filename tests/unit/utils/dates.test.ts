import { afterEach, describe, expect, it, vi } from "vitest";
import { nowArgentina } from "../../../src/utils/dates.js";

describe("nowArgentina", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve la hora de Argentina guardada como si fuera UTC (ahora - 3 horas)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-10T21:00:00.000Z"));
    expect(nowArgentina().toISOString()).toBe("2030-01-10T18:00:00.000Z");
  });

  it("no depende de la zona horaria del servidor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-10T21:00:00.000Z"));
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      expect(nowArgentina().toISOString()).toBe("2030-01-10T18:00:00.000Z");
    } finally {
      process.env.TZ = original;
    }
  });
});
