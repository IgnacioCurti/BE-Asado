import { paymentCalculator } from "../payments/PaymentCalculator.js";
import { transferReceiptService } from "../transferReceipts/index.js";
import { EventController } from "./EventController.js";
import { EventMapper } from "./EventMapper.js";
import { EventRepository } from "./EventRepository.js";
import { EventService } from "./EventService.js";

const eventService = new EventService({
  events: new EventRepository(),
  transferReceipts: transferReceiptService,
  payments: paymentCalculator,
  mapper: new EventMapper(),
});

export const eventController = new EventController(eventService);
export { EventService };
