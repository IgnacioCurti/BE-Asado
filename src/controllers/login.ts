import { compare } from "bcrypt";
import { Request, Response } from "express";
import { IUser } from "../models/interfaces";
import { STATUS_CODES } from "../constants/httpStatusCode";
import { findOne } from "../repositories/usersRepository";

export async function login(
  req: Request<any, any, { email: string; password: string }>,
  res: Response
): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const existingUser = await findOne<IUser>({
      email: req.body.email,
    });
    if (!existingUser)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid email or password" });
    const validPassword: boolean = await compare(
      req.body.password,
      existingUser.password
    );
    if (!validPassword)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid email or password" });
    const token: string = existingUser.generateAuthToken();
    return res.status(STATUS_CODES.OK).json({
      id: existingUser.id,
      name: existingUser.name,
      jwt: token,
    });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error" });
  }
}
