import { Router } from "express";
import { createRating, getRatingFromUser } from "../controllers/ratings";
import { auth } from "../middleware/middleware";

const ratingsRouter = Router();

ratingsRouter.post("/createRating/:event/:user", [auth], createRating);

ratingsRouter.get("/getRatingFromUser/:event/:user", [auth], getRatingFromUser);

export default ratingsRouter;
