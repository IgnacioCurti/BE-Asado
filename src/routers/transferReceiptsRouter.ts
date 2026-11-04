import express from "express";
import {
  auth,
  shoppingDesignee,
  eventParticipant,
  multerUpload,
} from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { transferReceiptController as controller } from "../modules/transferReceipts/index.js";

const transferReceiptRouter: express.Router = express.Router();

// Mensaje por defecto con punto final, como respondía el controlador original.
const handle = (handler: Parameters<typeof asyncHandler>[0]) =>
  asyncHandler(handler, "Internal server error.");

transferReceiptRouter.get(
  "/getTransferReceiptsByEvent/:event",
  [auth, shoppingDesignee],
  handle(controller.listByEvent)
);

transferReceiptRouter.get("/getTransferReceiptsById/:id", auth, handle(controller.getById));

transferReceiptRouter.post(
  "/uploadFile/:transferReceipt",
  [auth, multerUpload.single("file")],
  handle(controller.uploadFile)
);

transferReceiptRouter.post(
  "/createTransferReceipt/:event",
  [auth, eventParticipant],
  handle(controller.create)
);

transferReceiptRouter.post(
  "/approvePaymentWithoutReceipt/:event/:user",
  [auth, shoppingDesignee],
  handle(controller.approveWithoutReceipt)
);

transferReceiptRouter.put(
  "/approveTransferReceipt/:id/:event",
  [auth, shoppingDesignee],
  handle(controller.approve)
);

transferReceiptRouter.delete("/deleteTransferReceipt/:id", [auth], handle(controller.delete));

export default transferReceiptRouter;
