import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "../../../src/core/http/asyncHandler.js";
import { sendError } from "../../../src/core/http/sendError.js";
import { ForbiddenError, NotFoundError } from "../../../src/core/errors/AppError.js";

function fakeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("sendError", () => {
  it("AppError -> su status y mensaje", () => {
    const res = fakeRes();
    sendError(res, new ForbiddenError("nope"));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "nope" });
  });

  it("error genérico -> 500 con su mensaje", () => {
    const res = fakeRes();
    sendError(res, new Error("db down"));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "db down" });
  });

  it("error sin mensaje -> 500 con mensaje por defecto", () => {
    const res = fakeRes();
    sendError(res, undefined);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
  });
});

describe("asyncHandler", () => {
  it("responde el error lanzado por el handler", async () => {
    const res = fakeRes();
    const next = vi.fn();
    await asyncHandler(async () => {
      throw new NotFoundError("missing");
    })({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "missing" });
    expect(next).not.toHaveBeenCalled();
  });

  it("no toca la respuesta si el handler termina bien", async () => {
    const res = fakeRes();
    await asyncHandler(async (_req, r) => r.status(200).json({ ok: true }))({} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe("fallbackMessage", () => {
  it("se usa cuando el error no tiene mensaje", async () => {
    const res = fakeRes();
    await asyncHandler(async () => {
      throw {};
    }, "Internal server error.")({} as any, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error." });
  });
});
