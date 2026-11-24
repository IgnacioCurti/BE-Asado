import express from "express";
import { auth, eventParticipant, eventViewer } from "../middleware/middleware.js";
import { asyncHandler } from "../core/http/asyncHandler.js";
import { messageController as controller } from "../modules/messages/index.js";

// Chat por evento (CHAT_FEATURE.md §4). Leen los miembros del grupo del evento;
// escriben los participantes del evento.
const messagesRouter: express.Router = express.Router();

messagesRouter.get("/getMessages/:event", [auth, eventViewer], asyncHandler(controller.list));

messagesRouter.post("/sendMessage/:event", [auth, eventParticipant], asyncHandler(controller.send));

// Token de Ably para escuchar el canal del evento: misma regla que leer.
messagesRouter.get("/getChatToken/:event", [auth, eventViewer], asyncHandler(controller.chatToken));

export default messagesRouter;
