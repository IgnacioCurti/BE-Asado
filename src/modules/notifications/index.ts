import { sendEmail } from "../../utils/utils.js";
import {
  eventStartTemplate,
  newEventTemplate,
  penalizationOneWeekTemplate,
  penalizationStartTemplate,
} from "../../utils/templates.js";
import { EventRepository } from "../events/EventRepository.js";
import { transferReceiptService } from "../transferReceipts/index.js";
import { UserRepository } from "../users/UserRepository.js";
import { NotificationController } from "./NotificationController.js";
import { NotificationService } from "./NotificationService.js";
import { ReminderRepository } from "./ReminderRepository.js";

const notificationService = new NotificationService({
  events: new EventRepository(),
  users: new UserRepository(),
  reminders: new ReminderRepository(),
  debtors: transferReceiptService,
  sendEmail,
  templates: {
    newEvent: newEventTemplate,
    eventStart: eventStartTemplate,
    penalizationStart: penalizationStartTemplate,
    penalizationOneWeek: penalizationOneWeekTemplate,
  },
});

export const notificationController = new NotificationController(notificationService);
export { NotificationService };
