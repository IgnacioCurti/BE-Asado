import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { User } from "../models/user.js";
import { IUser } from "../models/interfaces.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";

export async function login(req: Request, res: Response): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const existingUser: IUser | null = await User.findOne({
      email: req.body.email,
    });
    if (!existingUser)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid email or password" });
    const validPassword: boolean = await bcrypt.compare(
      req.body.password,
      existingUser.password
    );
    if (!validPassword)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid email or password" });
    const token: string = `Bearer ${existingUser.generateAuthToken()}`;
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
