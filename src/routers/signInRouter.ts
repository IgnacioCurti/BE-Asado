import express from "express";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { authController } from "../modules/auth/index.js";

const signInRouter: express.Router = express.Router();

signInRouter.post("/", asyncHandler(authController.login));

export default signInRouter;
