import express from "express";
import {
  auth,
  multerUploadImages,
  sameUser,
} from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { userController } from "../modules/users/index.js";

const usersRouter: express.Router = express.Router();

// Mensaje por defecto con punto final, como respondía el controlador original.
const handle = (handler: Parameters<typeof asyncHandler>[0]) =>
  asyncHandler(handler, "Internal server error.");

usersRouter.get("/getUsers", auth, handle(userController.list));

usersRouter.get("/getUserById/:id", auth, handle(userController.getById));

usersRouter.get("/isDebtor/:id", [auth, sameUser], handle(userController.isDebtor));

usersRouter.get(
  "/hasPendingTransfers/:id",
  [auth, sameUser],
  handle(userController.hasPendingTransfers)
);

usersRouter.post("/register", handle(userController.register));

usersRouter.put("/editUser/:id", [auth, sameUser], handle(userController.edit));

usersRouter.put(
  "/editProfilePicture/:id",
  [auth, sameUser, multerUploadImages.single("file")],
  handle(userController.editProfilePicture)
);

usersRouter.delete("/deleteUser/:id", [auth, sameUser], handle(userController.delete));

export default usersRouter;
