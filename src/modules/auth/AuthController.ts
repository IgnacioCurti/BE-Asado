import { Request, Response } from "express";
import { STATUS_CODES } from "../../constants/httpStatusCode.js";
import { AuthService, InvalidVerificationCodeError } from "./AuthService.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.service.login(req.body.email, req.body.password);
    return res.status(STATUS_CODES.OK).json(result);
  };

  forgot = async (req: Request, res: Response): Promise<Response> => {
    const email = await this.service.requestPasswordReset(req.body.email);
    return res.status(STATUS_CODES.OK).json({ message: `Mail sent succesfully to ${email}.` });
  };

  verifyCode = async (req: Request, res: Response): Promise<Response> => {
    try {
      await this.service.verifyCode(req.body.email, req.body.verificationCode);
    } catch (error) {
      // Contrato heredado: este endpoint responde el mensaje como string suelto.
      if (error instanceof InvalidVerificationCodeError)
        return res.status(error.status).json(error.message);
      throw error;
    }
    return res.status(STATUS_CODES.OK).json({ message: "Verification code is correct." });
  };

  recover = async (req: Request, res: Response): Promise<Response> => {
    await this.service.resetPassword(
      req.body.email,
      req.body.verificationCode,
      req.body.password
    );
    return res.status(STATUS_CODES.OK).json({ message: "Password was updated correctly." });
  };
}
