import { Router } from "express";
import eventRouter from "./routers/eventsRouter";
import imageRouter from "./routers/imagesRouter";
import signInRouter from "./routers/signInRouter";
import purchaseReceiptRouter from "./routers/purchaseReceiptsRouter";
import passwordRouter from "./routers/passwordsRouter";
import transferReceiptRouter from "./routers/transferReceiptsRouter";
import usersRouter from "./routers/usersRouter";
import ratingsRouter from "./routers/ratingsRouter";
import cronRouter from "./routers/cronRouter";
import optionRouter from "./routers/optionsRouter";

const router = Router();

// events routes
router.use("/events", eventRouter);

//images routes
router.use("/images", imageRouter);

// login
router.use("/login", signInRouter);

// options routes
router.use("/options", optionRouter);

// purchaseReceipts routes
router.use("/purchaseReceipts", purchaseReceiptRouter);

// password routes
router.use("/password", passwordRouter);

// transferReceipts routes
router.use("/transferReceipts", transferReceiptRouter);

//users routes
router.use("/users", usersRouter);

//ratings routes
router.use("/ratings", ratingsRouter);

//cron job route
router.use("/cron", cronRouter);

export default router;
