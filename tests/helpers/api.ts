import request from "supertest";
import app from "../../src/app.js";

export const api = () => request(app);

// La API espera el JWT crudo en el header Authorization (sin "Bearer ").
export function auth(token: string): { Authorization: string } {
  return { Authorization: token };
}

// Bytes mínimos con firma real, por si en la migración se valida contenido además del mimetype.
export const PNG_BYTES: Buffer = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex"
);
export const JPEG_BYTES: Buffer = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
export const PDF_BYTES: Buffer = Buffer.from("%PDF-1.4\n%%EOF\n", "utf8");
