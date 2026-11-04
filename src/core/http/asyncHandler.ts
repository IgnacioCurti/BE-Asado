import { NextFunction, Request, Response } from "express";
import { sendError } from "./sendError.js";

type AsyncRoute<Req extends Request> = (req: Req, res: Response) => Promise<unknown>;

// Envuelve un método async de controlador: los errores se responden con
// sendError en lugar de repetir try/catch en cada handler.
// No se usa un error handler global de Express para no alterar las respuestas
// actuales de errores de multer o de body-parser.
export function asyncHandler<Req extends Request = Request>(
  handler: AsyncRoute<Req>,
  fallbackMessage?: string
) {
  return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      await handler(req as Req, res);
    } catch (error) {
      sendError(res, error, fallbackMessage);
    }
  };
}
