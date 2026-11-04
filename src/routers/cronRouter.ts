import express from "express";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { notificationController } from "../modules/notifications/index.js";

const cronRouter: express.Router = express.Router();

cronRouter.get("/reminderCheck", asyncHandler(notificationController.reminderCheck));

export default cronRouter;
