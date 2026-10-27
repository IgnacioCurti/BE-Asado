import express from "express";
import {
  getUsers,
  getUserById,
  isDebtor,
  hasPendingTransfers,
  register,
  editUser,
  editProfilePicture,
  deleteUser,
} from "../controllers/users.js";
import {
  auth,
  multerUploadImages,
  sameUser,
} from "../middleware/middleware.js";

const usersRouter: express.Router = express.Router();

usersRouter.get("/getUsers", auth, getUsers);

usersRouter.get("/getUserById/:id", auth, getUserById);

usersRouter.get("/isDebtor/:id", [auth, sameUser], isDebtor);

usersRouter.get("/hasPendingTransfers/:id", [auth, sameUser], hasPendingTransfers);

usersRouter.post("/register", register);

usersRouter.put("/editUser/:id", [auth, sameUser], editUser);

usersRouter.put(
  "/editProfilePicture/:id",
  [auth, sameUser, multerUploadImages.single("file")],
  editProfilePicture
);

usersRouter.delete("/deleteUser/:id", [auth, sameUser], deleteUser);

export default usersRouter;
