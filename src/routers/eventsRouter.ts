import { Router } from "express";
import {
  getEvents,
  getPublicEvents,
  getPublicAndPrivateEvents,
  getEventById,
  getMembersAndReceiptsInfo,
  getMembersAmount,
  getMemberIndividualCost,
  createEvent,
  subscribeToAnEvent,
  unsubscribeFromEvent,
  editRoles,
  editEvent,
  deleteEvent,
} from "../controllers/events";
import {
  auth,
  sameUser,
  eventOrganizer,
  shoppingDesigneeOrEventOrganizer,
} from "../middleware/middleware";

const eventRouter = Router();

eventRouter.get("/getEvents", auth, getEvents);

eventRouter.get("/getPublicEvents", getPublicEvents);

eventRouter.get("/getPublicAndPrivateEvents", auth, getPublicAndPrivateEvents);

eventRouter.get("/getEventById/:id", getEventById);

eventRouter.get("/getMembersAndReceiptsInfo/:event", getMembersAndReceiptsInfo);

eventRouter.get("/getMembersAmount/:event", getMembersAmount);

eventRouter.get(
  "/getMemberIndividualCost/:user/:event",
  auth,
  getMemberIndividualCost
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
