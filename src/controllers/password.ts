import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { User } from "../models/user.js";
import { sendEmail } from "../utils/utils.js";
import { STATUS_CODES } from "../constants/httpStatusCode.js";
import { passwordRecoveryTemplate } from "../utils/templates.js";
import { IUser } from "../models/interfaces.js";

const nonExistentUserMessage: string = "User does not exist.";
const neverRequestedMessage: string = "User never requested a password change.";

const VERIFICATION_CODE_TTL_MS: number = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS: number = 5;

type CodeCheck = "valid" | "invalid" | "notRequested" | "expired" | "locked";

const codeCheckMessages: Record<
  Exclude<CodeCheck, "valid" | "invalid">,
  string
> = {
  notRequested: neverRequestedMessage,
  expired: "Verification code expired. Request a new one.",
  locked: "Too many failed attempts. Request a new code.",
};

function clearVerificationCode(user: IUser): void {
  user.verificationCode = null;
  user.verificationCodeExpiresAt = null;
  user.verificationAttempts = 0;
}

// Wrong codes count towards MAX_VERIFICATION_ATTEMPTS across verifyCode and
// recover; reaching the limit (or the code expiring) discards the code.
async function checkVerificationCode(
  user: IUser,
  code: string
): Promise<CodeCheck> {
  if (!user.verificationCode) return "notRequested";
  if (
    !user.verificationCodeExpiresAt ||
    user.verificationCodeExpiresAt.getTime() <= Date.now()
  ) {
    clearVerificationCode(user);
    await user.save();
    return "expired";
  }
  if (await bcrypt.compare(code, user.verificationCode)) return "valid";
  user.verificationAttempts = (user.verificationAttempts ?? 0) + 1;
  if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    clearVerificationCode(user);
    await user.save();
    return "locked";
  }
  await user.save();
  return "invalid";
}

export async function forgot(req: Request, res: Response): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    let user: IUser | null = await User.findOne({ email: req.body.email });
    if (!user) user = await User.findOne({ alternativeEmail: req.body.email });
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });
    const code: number = Math.floor(Math.random() * 900000) + 100000;
    const salt: string = await bcrypt.genSalt(10);
    user.verificationCode = await bcrypt.hash(code.toString(), salt);
    user.verificationCodeExpiresAt = new Date(
      Date.now() + VERIFICATION_CODE_TTL_MS
    );
    user.verificationAttempts = 0;
    await user.save();
    const email: string = user.alternativeEmail
      ? user.alternativeEmail
      : user.email;
    const subject: string = "FoodSpot | Recuperar contraseña";
    const message: string = passwordRecoveryTemplate(code.toString());

    await sendEmail(email, subject, user.name, message);
    return res
      .status(STATUS_CODES.OK)
      .json({ message: `Mail sent succesfully to ${email}.` });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function verifyCode(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const user: IUser | null = await User.findOne({
      email: req.body.email,
    }).exec();
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });
    const check: CodeCheck = await checkVerificationCode(
      user,
      req.body.verificationCode
    );
    if (check === "valid") {
      return res
        .status(STATUS_CODES.OK)
        .json({ message: "Verification code is correct." });
    } else if (check === "invalid") {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json("Invalid verification code.");
    } else {
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: codeCheckMessages[check] });
    }
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}

export async function recover(req: Request, res: Response): Promise<Response> {
  try {
    req.body.email = req.body.email.toLowerCase();
    const user: IUser | null = await User.findOne({
      email: req.body.email,
    }).exec();
    if (!user)
      return res
        .status(STATUS_CODES.NOT_FOUND)
        .json({ message: nonExistentUserMessage });
    const check: CodeCheck = await checkVerificationCode(
      user,
      req.body.verificationCode
    );
    if (check === "invalid")
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: "Invalid verification code." });
    if (check !== "valid")
      return res
        .status(STATUS_CODES.BAD_REQUEST)
        .json({ message: codeCheckMessages[check] });
    const salt: string = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(req.body.password, salt);
    clearVerificationCode(user);
    await user.save();
    return res
      .status(STATUS_CODES.OK)
      .json({ message: "Password was updated correctly." });
  } catch (error) {
    return res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ message: error?.message || "Internal server error." });
  }
}
