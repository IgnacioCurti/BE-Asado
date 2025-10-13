import { Router } from "express";
import { login } from "../controllers/login";

const signInRouter = Router();

signInRouter.post("/", login);

export default signInRouter;
