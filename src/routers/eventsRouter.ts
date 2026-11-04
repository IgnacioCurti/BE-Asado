import express from "express";
import {
  createEvent,
  subscribeToAnEvent,
  unsubscribeFromEvent,
  editRoles,
  editEvent,
  deleteEvent,
} from "../controllers/events.js";
import {
  auth,
  sameUser,
  eventOrganizer,
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

eventRouter.get("/getEventById/:id", asyncHandler(eventController.getById));

eventRouter.get(
  "/getMembersAndReceiptsInfo/:event",
  asyncHandler(eventController.getMembersAndReceiptsInfo)
);

eventRouter.get("/getMembersAmount/:event", asyncHandler(eventController.getMembersAmount));

eventRouter.get(
  "/getMemberIndividualCost/:user/:event",
  auth,
  asyncHandler(eventController.getMemberIndividualCost)
);

eventRouter.post("/createEvent", auth, createEvent);

eventRouter.put(
  "/subscribeToAnEvent/:id/:event",
  [auth, sameUser],
  subscribeToAnEvent
);

eventRouter.put(
  "/unsubscribeFromEvent/:id/:event",
  [auth, sameUser],
  unsubscribeFromEvent
);

eventRouter.put("/editRoles/:id", auth, editRoles);

eventRouter.put(
  "/editEvent/:id",
  [auth, shoppingDesigneeOrEventOrganizer],
  editEvent
);

eventRouter.delete("/deleteEvent/:id", [auth, eventOrganizer], deleteEvent);

export default eventRouter;
