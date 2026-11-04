import { EventRepository } from "../events/EventRepository.js";
import { imageService } from "../images/index.js";
import { paymentCalculator } from "../payments/PaymentCalculator.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { UserController } from "./UserController.js";
import { UserRepository } from "./UserRepository.js";
import { UserService } from "./UserService.js";

const userService = new UserService({
  users: new UserRepository(),
  events: new EventRepository(),
  transferReceipts: new TransferReceiptRepository(),
  images: imageService,
  payments: paymentCalculator,
});

export const userController = new UserController(userService);
export { UserService };
