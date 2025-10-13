import { Router } from "express";
import { forgot, verifyCode, recover } from "../controllers/password";

const passwordRouter = Router();

passwordRouter.post("/forgot", forgot);

passwordRouter.put("/verifyCode", verifyCode);

passwordRouter.put("/recover", recover);

export default passwordRouter;
