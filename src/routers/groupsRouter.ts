import express from "express";
import { auth, groupAdmin, groupMember, multerUploadImages } from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { groupController as controller } from "../modules/groups/index.js";

// GROUPS_FEATURE.md §6.
const groupsRouter: express.Router = express.Router();

groupsRouter.post("/createGroup", auth, asyncHandler(controller.create));

groupsRouter.get("/getMyGroups", auth, asyncHandler(controller.listMine));

groupsRouter.get("/getGroupById/:group", [auth, groupMember], asyncHandler(controller.getById));

groupsRouter.put("/joinGroup", auth, asyncHandler(controller.join));

groupsRouter.put("/leaveGroup/:group", [auth, groupMember], asyncHandler(controller.leave));

groupsRouter.put("/editGroup/:group", [auth, groupAdmin], asyncHandler(controller.edit));

groupsRouter.put(
  "/makeAdmin/:group/:user",
  [auth, groupAdmin],
  asyncHandler(controller.makeAdmin)
);

groupsRouter.put(
  "/regenerateCode/:group",
  [auth, groupAdmin],
  asyncHandler(controller.regenerateCode)
);

groupsRouter.post(
  "/addCoverPhoto/:group",
  [auth, groupAdmin, multerUploadImages.single("file")],
  asyncHandler(controller.addCoverPhoto)
);

groupsRouter.delete(
  "/deleteCoverPhoto/:group/:image",
  [auth, groupAdmin],
  asyncHandler(controller.deleteCoverPhoto)
);

export default groupsRouter;
