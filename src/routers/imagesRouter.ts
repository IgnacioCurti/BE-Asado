import express from "express";
import { auth } from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { IRequestWithUser } from "../models/interfaces.js";
import { imageController } from "../modules/images/index.js";

const imageRouter: express.Router = express.Router();

imageRouter.get("/getImage/:id", auth, asyncHandler<IRequestWithUser>(imageController.get));

export default imageRouter;
