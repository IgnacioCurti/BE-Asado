import { Router } from "express";
import { getImage } from "../controllers/images";
import { auth } from "../middleware/middleware";

const imageRouter = Router();

imageRouter.get("/getImage/:id", auth, getImage);

export default imageRouter;
