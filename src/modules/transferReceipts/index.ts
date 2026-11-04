import { EventRepository } from "../events/EventRepository.js";
import { imageService } from "../images/index.js";
import { paymentCalculator } from "../payments/PaymentCalculator.js";
import { TransferReceiptController } from "./TransferReceiptController.js";
import { TransferReceiptRepository } from "./TransferReceiptRepository.js";
import { TransferReceiptService } from "./TransferReceiptService.js";

// Lo usa también events para el estado de pago de los miembros.
export const transferReceiptService = new TransferReceiptService({
  receipts: new TransferReceiptRepository(),
  events: new EventRepository(),
  images: imageService,
  payments: paymentCalculator,
});

export const transferReceiptController = new TransferReceiptController(transferReceiptService);
export { TransferReceiptService };
