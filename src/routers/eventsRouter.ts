import express from "express";
import {
  auth,
  groupMember,
  sameUser,
  eventOrganizer,
  eventViewer,
  shoppingDesigneeOrEventOrganizer,
} from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { eventController } from "../modules/events/index.js";

const eventRouter: express.Router = express.Router();

eventRouter.get("/getEvents", auth, asyncHandler(eventController.list));

eventRouter.get("/getPublicEvents", asyncHandler(eventController.listPublic));

eventRouter.get(
  "/getPublicAndPrivateEvents",
  auth,
  asyncHandler(eventController.listPublicAndPrivate)
);

// Eventos de un grupo (GROUPS_FEATURE.md §6).
eventRouter.get(
  "/getGroupEvents/:group",
  [auth, groupMember],
  asyncHandler(eventController.listByGroup)
);

eventRouter.get("/getEventById/:id", [auth, eventViewer], asyncHandler(eventController.getById));

eventRouter.get(
  "/getMembersAndReceiptsInfo/:event",
  [auth, eventViewer],
  asyncHandler(eventController.getMembersAndReceiptsInfo)
);

eventRouter.get(
  "/getMembersAmount/:event",
  [auth, eventViewer],
  asyncHandler(eventController.getMembersAmount)
);

eventRouter.get(
  "/getMemberIndividualCost/:user/:event",
  auth,
  asyncHandler(eventController.getMemberIndividualCost)
);

eventRouter.post("/createEvent", auth, asyncHandler(eventController.create));

eventRouter.put(
  "/subscribeToAnEvent/:id/:event",
  [auth, sameUser],
  asyncHandler(eventController.subscribe)
);

eventRouter.put(
  "/unsubscribeFromEvent/:id/:event",
  [auth, sameUser],
  asyncHandler(eventController.unsubscribe)
);

eventRouter.put("/editRoles/:id", auth, asyncHandler(eventController.editRoles));

eventRouter.put(
  "/editEvent/:id",
  [auth, shoppingDesigneeOrEventOrganizer],
  asyncHandler(eventController.edit)
);

eventRouter.delete(
  "/deleteEvent/:id",
  [auth, eventOrganizer],
  asyncHandler(eventController.delete)
);

export default eventRouter;
