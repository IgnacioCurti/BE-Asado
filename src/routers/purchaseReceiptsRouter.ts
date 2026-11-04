import express from "express";
import {
  auth,
  shoppingDesignee,
  eventParticipant,
  multerUpload,
} from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { purchaseReceiptController as controller } from "../modules/purchaseReceipts/index.js";

const purchaseReceiptRouter: express.Router = express.Router();

// Mensaje por defecto con punto final, como respondía el controlador original.
const handle = (handler: Parameters<typeof asyncHandler>[0]) =>
  asyncHandler(handler, "Internal server error.");

purchaseReceiptRouter.get(
  "/getPurchaseReceiptsByEvent/:event",
  [auth, eventParticipant],
  handle(controller.listByEvent)
);

purchaseReceiptRouter.get(
  "/getPurchaseReceiptById/:id/:event",
  [auth, eventParticipant],
  handle(controller.getById)
);

purchaseReceiptRouter.put("/assignMembersToReceipt", [auth], handle(controller.assignMembers));

purchaseReceiptRouter.post(
  "/uploadFile/:purchaseReceipt",
  [auth, multerUpload.single("file")],
  handle(controller.uploadFile)
);

purchaseReceiptRouter.post(
  "/createPurchaseReceipt/:event",
  [auth, shoppingDesignee],
  handle(controller.create)
);

purchaseReceiptRouter.delete(
  "/deletePurchaseReceipt/:id/:event",
  [auth, shoppingDesignee],
  handle(controller.delete)
);

export default purchaseReceiptRouter;
