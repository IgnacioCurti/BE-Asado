import { Router } from "express";
import { reminderCheck } from "../controllers/notifications";

const cronRouter = Router();

cronRouter.get("/reminderCheck", reminderCheck);

export default cronRouter;
