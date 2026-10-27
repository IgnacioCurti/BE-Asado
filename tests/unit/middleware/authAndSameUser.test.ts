import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { auth, sameUser } from "../../../src/middleware/middleware.js";
import { IRequestWithUser } from "../../../src/models/interfaces.js";

const SECRET: string = process.env.JWTPRIVATEKEY as string;

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function mockReq(headers: Record<string, string> = {}, extra: Partial<IRequestWithUser> = {}): IRequestWithUser {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    params: {},
    ...extra,
  } as unknown as IRequestWithUser;
}

describe("auth middleware", () => {
  it("responde 401 si no hay header Authorization", () => {
    const res = mockRes();
    const next = vi.fn();
    auth(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Access denied. No token provided." });
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 (no 401) si el token es inválido", () => {
    const res = mockRes();
    const next = vi.fn();
    auth(mockReq({ authorization: "not-a-jwt" }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid token." });
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 si el token está firmado con otra clave", () => {
    const res = mockRes();
    const token = jwt.sign({ _id: "x", email: "x@endava.com" }, "otra-clave");
    auth(mockReq({ authorization: token }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("responde 400 si el token está vencido", () => {
    const res = mockRes();
    const token = jwt.sign({ _id: "x", email: "x@endava.com" }, SECRET, { expiresIn: -10 });
    auth(mockReq({ authorization: token }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("NO acepta el prefijo 'Bearer ' (espera el JWT crudo)", () => {
    const res = mockRes();
    const token = jwt.sign({ _id: "x", email: "x@endava.com" }, SECRET);
    auth(mockReq({ authorization: `Bearer ${token}` }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("con un token válido setea req.user con el payload y llama a next()", () => {
    const res = mockRes();
    const next = vi.fn();
    const id = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign({ _id: id, email: "ana@endava.com" }, SECRET);
    const req = mockReq({ authorization: token });
    auth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ _id: id, email: "ana@endava.com" });
    expect(req.user).toHaveProperty("iat");
  });

  it("los tokens no expiran (no se firman con exp)", () => {
    const res = mockRes();
    const next = vi.fn();
    const token = jwt.sign({ _id: "x", email: "x@endava.com", iat: 0 }, SECRET);
    auth(mockReq({ authorization: token }), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("sameUser middleware", () => {
  const id = new mongoose.Types.ObjectId().toString();
  const other = new mongoose.Types.ObjectId().toString();

  function run(userId: string, paramId: string) {
    const res = mockRes();
    const next = vi.fn();
    const req = mockReq({}, { user: { _id: userId, email: "a@endava.com" }, params: { id: paramId } as any });
    return sameUser(req, res, next).then(() => ({ res, next }));
  }

  it("llama a next() si el id del token coincide con :id", async () => {
    const { res, next } = await run(id, id);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responde 403 si los ids no coinciden", async () => {
    const { res, next } = await run(id, other);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Access denied. User is trying to access other user's information.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 'Invalid ObjectID' si :id no es un ObjectId válido", async () => {
    const { res } = await run(id, "abc");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid ObjectID" });
  });

  it("responde 400 'Invalid ObjectID' si el _id del token no es un ObjectId válido", async () => {
    const { res } = await run("abc", id);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid ObjectID" });
  });

  it("la comparación es sensible a mayúsculas (un id en mayúsculas es inválido)", async () => {
    const { res } = await run(id, id.toUpperCase());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
