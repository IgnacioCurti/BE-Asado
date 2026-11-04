import { Response } from "express";
import { AppError } from "../errors/AppError.js";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";

// AppError -> su status y mensaje. Cualquier otro error -> 500 con su mensaje,
// igual que los try/catch de los controladores originales.
export function sendError(res: Response, error: unknown): Response {
  if (error instanceof AppError)
    return res.status(error.status).json({ message: error.message });
  const message: string =
    (error as { message?: string } | undefined)?.message || "Internal server error";
  return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ message });
}
