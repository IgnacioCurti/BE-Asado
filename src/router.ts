import express from "express";
import eventRouter from "./routers/eventsRouter.js";
import imageRouter from "./routers/imagesRouter.js";
import signInRouter from "./routers/signInRouter.js";
import purchaseReceiptRouter from "./routers/purchaseReceiptsRouter.js";
import passwordRouter from "./routers/passwordsRouter.js";
import transferReceiptRouter from "./routers/transferReceiptsRouter.js";
import usersRouter from "./routers/usersRouter.js";
import ratingsRouter from "./routers/ratingsRouter.js";
import cronRouter from "./routers/cronRouter.js";
import optionRouter from "./routers/optionsRouter.js";
import groupsRouter from "./routers/groupsRouter.js";

const router: express.Router = express.Router();

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

// groups routes
router.use("/groups", groupsRouter);

//cron job route
router.use("/cron", cronRouter);

export default router;
