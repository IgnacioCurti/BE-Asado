import { EventRepository } from "../events/EventRepository.js";
import { UserRepository } from "../users/UserRepository.js";
import { PurchaseReceiptRepository } from "../purchaseReceipts/PurchaseReceiptRepository.js";
import { TransferReceiptRepository } from "../transferReceipts/TransferReceiptRepository.js";
import { ImageController } from "./ImageController.js";
import { ImageRepository } from "./ImageRepository.js";
import { ImageService } from "./ImageService.js";

// Lo usan también users, purchaseReceipts y transferReceipts para guardar archivos.
export const imageService = new ImageService(
  new ImageRepository(),
  new UserRepository(),
  new PurchaseReceiptRepository(),
  new TransferReceiptRepository(),
  new EventRepository()
);

export const imageController = new ImageController(imageService);
export { ImageService };
