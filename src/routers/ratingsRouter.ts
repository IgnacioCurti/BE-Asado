import express from "express";
import { ratingController } from "../modules/ratings/index.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { auth } from "../middleware/middleware.js";

const ratingsRouter: express.Router = express.Router();

ratingsRouter.post(
  "/createRating/:event/:user",
  [auth],
  asyncHandler(ratingController.create)
);

ratingsRouter.get(
  "/getRatingFromUser/:event/:user",
  [auth],
  asyncHandler(ratingController.getFromUser)
);

export default ratingsRouter;
