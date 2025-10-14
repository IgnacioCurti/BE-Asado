import { Router } from "express";
import { auth } from "../middleware/middleware";
import {
  getMembersWhoHaventVoted,
  createOption,
  deleteOption,
  editOptions,
} from "../controllers/options";

const optionRouter = Router();

optionRouter.get(
  "/getMembersWhoHaventVoted/:event",
  auth,
  getMembersWhoHaventVoted
);
optionRouter.post("/createOption/:event", auth, createOption);
optionRouter.put("/editOption/:id", auth, editOptions);
optionRouter.delete("/deleteOption/:id", auth, deleteOption);

export default optionRouter;
