import express from "express";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { authController } from "../modules/auth/index.js";

const passwordRouter: express.Router = express.Router();

// Mensaje por defecto con punto final, como respondía el controlador original.
const fallbackMessage: string = "Internal server error.";

passwordRouter.post("/forgot", asyncHandler(authController.forgot, fallbackMessage));

passwordRouter.put("/verifyCode", asyncHandler(authController.verifyCode, fallbackMessage));

passwordRouter.put("/recover", asyncHandler(authController.recover, fallbackMessage));

export default passwordRouter;
