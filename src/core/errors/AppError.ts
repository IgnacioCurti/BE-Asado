import { STATUS_CODES } from "../../constants/httpStatusCode.js";

// Errores de negocio que los servicios lanzan. La capa HTTP los traduce a
// res.status(status).json({ message }) sin que el servicio conozca Express.
export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(STATUS_CODES.BAD_REQUEST, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(STATUS_CODES.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(STATUS_CODES.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(STATUS_CODES.NOT_FOUND, message);
  }
}
