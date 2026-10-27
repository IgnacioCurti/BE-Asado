import express from "express";
import {
  getTransferReceiptsByEvent,
  getTransferReceiptsById,
  uploadFileTransferReceipt,
  createTransferReceipt,
  approvePaymentWithoutReceipt,
  approveTransferReceipt,
  deleteTransferReceipt,
} from "../controllers/transferReceipts.js";
import {
  auth,
  shoppingDesignee,
  eventParticipant,
  multerUpload,
} from "../middleware/middleware.js";

const transferReceiptRouter: express.Router = express.Router();

transferReceiptRouter.get(
  "/getTransferReceiptsByEvent/:event",
  [auth, shoppingDesignee],
  getTransferReceiptsByEvent
);

transferReceiptRouter.get(
  "/getTransferReceiptsById/:id",
  auth,
  getTransferReceiptsById
);

transferReceiptRouter.post(
  "/uploadFile/:transferReceipt",
  [auth, multerUpload.single("file")],
  uploadFileTransferReceipt
);

transferReceiptRouter.post(
  "/createTransferReceipt/:event",
  [auth, eventParticipant],
  createTransferReceipt
);

transferReceiptRouter.post(
  "/approvePaymentWithoutReceipt/:event/:user",
  [auth, shoppingDesignee],
  approvePaymentWithoutReceipt
);

transferReceiptRouter.put(
  "/approveTransferReceipt/:id/:event",
  [auth, shoppingDesignee],
  approveTransferReceipt
);

transferReceiptRouter.delete(
  "/deleteTransferReceipt/:id",
  [auth],
  deleteTransferReceipt
);

export default transferReceiptRouter;
