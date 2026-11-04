import express from "express";
import { auth, optionManager, optionVoter } from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { IRequestWithUser } from "../models/interfaces.js";
import { optionController } from "../modules/options/index.js";

const optionRouter: express.Router = express.Router();

optionRouter.get(
  "/getMembersWhoHaventVoted/:event",
  auth,
  asyncHandler(optionController.getMembersWhoHaventVoted)
);
optionRouter.post("/createOption/:event", [auth, optionManager], asyncHandler(optionController.create));
optionRouter.put("/editOption/:id", [auth, optionManager], asyncHandler(optionController.edit));
optionRouter.delete("/deleteOption/:id", [auth, optionManager], asyncHandler(optionController.delete));
optionRouter.put("/vote/:id", [auth, optionVoter], asyncHandler<IRequestWithUser>(optionController.vote));
optionRouter.delete("/vote/:id", [auth, optionVoter], asyncHandler<IRequestWithUser>(optionController.unvote));

export default optionRouter;
