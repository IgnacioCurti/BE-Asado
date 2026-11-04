import { sendEmail } from "../../utils/utils.js";
import { passwordRecoveryTemplate } from "../../utils/templates.js";
import { UserRepository } from "../users/UserRepository.js";
import { AuthController } from "./AuthController.js";
import { AuthService } from "./AuthService.js";

const authService = new AuthService({
  users: new UserRepository(),
  sendEmail,
  recoveryTemplate: passwordRecoveryTemplate,
});

export const authController = new AuthController(authService);
export { AuthService };
