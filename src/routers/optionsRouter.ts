import express from "express";
import { auth, optionManager, optionVoter } from "../middleware/middleware.js";
import {
  getMembersWhoHaventVoted,
  createOption,
  deleteOption,
  editOptions,
  voteOption,
  unvoteOption,
} from "../controllers/options.js";

const optionRouter: express.Router = express.Router();

optionRouter.get("/getMembersWhoHaventVoted/:event", auth, getMembersWhoHaventVoted);
optionRouter.post("/createOption/:event", [auth, optionManager], createOption);
optionRouter.put("/editOption/:id", [auth, optionManager], editOptions);
optionRouter.delete("/deleteOption/:id", [auth, optionManager], deleteOption);
optionRouter.put("/vote/:id", [auth, optionVoter], voteOption);
optionRouter.delete("/vote/:id", [auth, optionVoter], unvoteOption);

export default optionRouter;
