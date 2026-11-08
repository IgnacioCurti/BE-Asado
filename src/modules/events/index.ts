import { ReminderRepository } from "../notifications/ReminderRepository.js";
import { ReminderScheduler } from "../notifications/ReminderScheduler.js";
import { OptionRepository } from "../options/OptionRepository.js";
import { paymentCalculator } from "../payments/PaymentCalculator.js";
import { PurchaseReceiptRepository } from "../purchaseReceipts/PurchaseReceiptRepository.js";
import { transferReceiptService } from "../transferReceipts/index.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { UserRepository } from "../users/UserRepository.js";
import { EventAccessPolicy } from "./EventAccessPolicy.js";
import { EventController } from "./EventController.js";
import { EventMapper } from "./EventMapper.js";
import { EventRepository } from "./EventRepository.js";
import { EventService } from "./EventService.js";
import { GroupRepository } from "../groups/GroupRepository.js";

const groupRepository = new GroupRepository();

export const reminderScheduler = new ReminderScheduler(new ReminderRepository());

const eventService = new EventService({
  events: new EventRepository(),
  paymentStatus: transferReceiptService,
  payments: paymentCalculator,
  mapper: new EventMapper(),
  users: new UserRepository(),
  purchaseReceipts: new PurchaseReceiptRepository(),
  options: new OptionRepository(),
  transferReceipts: new TransferReceiptRepository(),
  reminders: reminderScheduler,
  groups: groupRepository,
});

export const eventController = new EventController(eventService);
export const eventAccessPolicy = new EventAccessPolicy(
  new EventRepository(),
  new TransferReceiptRepository(),
  groupRepository
);
export { EventService };
