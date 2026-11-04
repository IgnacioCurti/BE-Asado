import { EventRepository } from "../events/EventRepository.js";
import { imageService } from "../images/index.js";
import { PurchaseReceiptController } from "./PurchaseReceiptController.js";
import { PurchaseReceiptRepository } from "./PurchaseReceiptRepository.js";
import { PurchaseReceiptService } from "./PurchaseReceiptService.js";

const purchaseReceiptService = new PurchaseReceiptService(
  new PurchaseReceiptRepository(),
  new EventRepository(),
  imageService
);

export const purchaseReceiptController = new PurchaseReceiptController(purchaseReceiptService);
export { PurchaseReceiptService };
