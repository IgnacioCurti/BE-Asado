import { Router } from "express";
import {
  getTransferReceiptsByEvent,
  getTransferReceiptsById,
  uploadFileTransferReceipt,
  createTransferReceipt,
  approvePaymentWithoutReceipt,
  approveTransferReceipt,
  deleteTransferReceipt,
} from "../controllers/transferReceipts";
import { auth, shoppingDesignee, multerUpload } from "../middleware/middleware";

const transferReceiptRouter = Router();

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
  auth,
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
