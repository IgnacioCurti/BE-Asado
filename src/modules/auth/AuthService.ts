import bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { BadRequestError, NotFoundError } from "../../core/errors/AppError.js";
import { IUser } from "../../models/interfaces.js";
import { UserRepository } from "../users/UserRepository.js";

const invalidCredentialsMessage: string = "Invalid email or password";
const nonExistentUserMessage: string = "User does not exist.";

const VERIFICATION_CODE_TTL_MS: number = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS: number = 5;

type CodeCheck = "valid" | "invalid" | "notRequested" | "expired" | "locked";

const codeCheckMessages: Record<Exclude<CodeCheck, "valid">, string> = {
  invalid: "Invalid verification code.",
  notRequested: "User never requested a password change.",
  expired: "Verification code expired. Request a new one.",
  locked: "Too many failed attempts. Request a new code.",
};

export interface LoginResult {
  id: string;
  name: string;
  jwt: string;
}

export type SendEmail = (email: string, subject: string, name: string, html: string) => Promise<void>;

export interface AuthServiceDeps {
  users: Pick<UserRepository, "findByEmail" | "save">;
  sendEmail: SendEmail;
  recoveryTemplate: (code: string) => string;
  now?: () => number;
  generateCode?: () => number;
}

export class AuthService {
  private readonly users: AuthServiceDeps["users"];
  private readonly sendEmail: SendEmail;
  private readonly recoveryTemplate: (code: string) => string;
  private readonly now: () => number;
  private readonly generateCode: () => number;

  constructor(deps: AuthServiceDeps) {
    this.users = deps.users;
    this.sendEmail = deps.sendEmail;
    this.recoveryTemplate = deps.recoveryTemplate;
    this.now = deps.now ?? Date.now;
    this.generateCode = deps.generateCode ?? (() => randomInt(100000, 1000000));
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user: IUser | null = await this.users.findByEmail(email.toLowerCase());
    if (!user) throw new BadRequestError(invalidCredentialsMessage);
    if (!(await bcrypt.compare(password, user.password)))
      throw new BadRequestError(invalidCredentialsMessage);
    return { id: user.id, name: user.name, jwt: user.generateAuthToken() };
  }

  // Genera un código de 6 dígitos, guarda su hash y lo envía por mail.
  async requestPasswordReset(email: string): Promise<string> {
    const user: IUser = await this.getUserByEmail(email);
    const code: string = this.generateCode().toString();
    user.verificationCode = await bcrypt.hash(code, await bcrypt.genSalt(10));
    user.verificationCodeExpiresAt = new Date(this.now() + VERIFICATION_CODE_TTL_MS);
    user.verificationAttempts = 0;
    await this.users.save(user);
    await this.sendEmail(
      user.email,
      "FoodSpot | Recuperar contraseña",
      user.name,
      this.recoveryTemplate(code)
    );
    return user.email;
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const user: IUser = await this.getUserByEmail(email);
    await this.assertValidCode(user, code);
  }

  async resetPassword(email: string, code: string, password: string): Promise<void> {
    const user: IUser = await this.getUserByEmail(email);
    await this.assertValidCode(user, code);
    user.password = await bcrypt.hash(password, await bcrypt.genSalt(10));
    this.clearVerificationCode(user);
    await this.users.save(user);
  }

  private async getUserByEmail(email: string): Promise<IUser> {
    const user: IUser | null = await this.users.findByEmail(email.toLowerCase());
    if (!user) throw new NotFoundError(nonExistentUserMessage);
    return user;
  }

  private async assertValidCode(user: IUser, code: string): Promise<void> {
    const check: CodeCheck = await this.checkVerificationCode(user, code);
    if (check === "valid") return;
    throw new BadRequestError(codeCheckMessages[check]);
  }

  // Los códigos incorrectos suman a MAX_VERIFICATION_ATTEMPTS entre verifyCode
  // y recover; al llegar al límite (o al expirar) el código se descarta.
  private async checkVerificationCode(user: IUser, code: string): Promise<CodeCheck> {
    if (!user.verificationCode) return "notRequested";
    if (
      !user.verificationCodeExpiresAt ||
      user.verificationCodeExpiresAt.getTime() <= this.now()
    ) {
      this.clearVerificationCode(user);
      await this.users.save(user);
      return "expired";
    }
    if (await bcrypt.compare(code, user.verificationCode)) return "valid";
    user.verificationAttempts = (user.verificationAttempts ?? 0) + 1;
    if (user.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      this.clearVerificationCode(user);
      await this.users.save(user);
      return "locked";
    }
    await this.users.save(user);
    return "invalid";
  }

  private clearVerificationCode(user: IUser): void {
    user.verificationCode = null;
    user.verificationCodeExpiresAt = null;
    user.verificationAttempts = 0;
  }
}
