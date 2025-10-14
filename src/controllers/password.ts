import { compare, genSalt, hash } from "bcrypt";
import { Request, Response } from "express";
import { sendEmail } from "../utils/utils";
import { STATUS_CODES } from "../constants/httpStatusCode";
import { passwordRecoveryTemplate } from "../utils/templates";
import { IUser } from "../models/interfaces";
import { findOne as findOneUser } from "../repositories/usersRepository";

const nonExistentUserMessage: string = "User does not exist.";

export async function forgot(
  req: Request<any, any, { email: string }>,
  res: Response
): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    let user = await findOneUser<IUser>({ email: req.body.email });

    if (!user)
      user = await findOneUser<IUser>({ alternativeEmail: req.body.email });

    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });

    const code = Math.floor(Math.random() * 900000) + 100000;
    const salt = await genSalt(10);
    user.verificationCode = await hash(code.toString(), salt);
    await user.save();
    const email = user.alternativeEmail || user.email;
    const subject = "FoodSpot | Recuperar contraseña";
    const message = passwordRecoveryTemplate(code.toString());

    await sendEmail(email, subject, user.name, message);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: `Mail sent successfully to ${email}.` });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function verifyCode(
  req: Request<any, any, { email: string; verificationCode: string }>,
  res: Response
): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const user = await findOneUser<IUser>({
      email: req.body.email,
    });
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });

    const validCode = await compare(
      req.body.verificationCode,
      user.verificationCode as string
    );
    if (validCode) {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "Verification code is correct." });
    } else {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json("Invalid verification code.");
    }
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function recover(
  req: Request<
    any,
    any,
    { email: string; verificationCode: string; password: string }
  >,
  res: Response
) {
  try {
    req.body.email = req.body.email.toLowerCase();
    const user = await findOneUser<IUser>({
      email: req.body.email,
    });
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });
    if (user.verificationCode === null)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "User never requested a password change." });
    const validCode = await compare(
      req.body.verificationCode,
      user.verificationCode as string
    );
    if (!validCode)
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid verification code." });
    const salt = await genSalt(10);
    user.password = await hash(req.body.password, salt);
    user.verificationCode = null;
    await user.save();
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Password was updated correctly." });
  } catch (error: any) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
