import { EventRepository } from "../events/EventRepository.js";
import { MessageController } from "./MessageController.js";
import { MessageRepository } from "./MessageRepository.js";
import { MessageService } from "./MessageService.js";
import { AblyChatRealtime } from "./ChatRealtime.js";
import { ablyApiKey } from "../../config.js";

// Composición manual de dependencias del módulo.
const messageService = new MessageService(
  new EventRepository(),
  new MessageRepository(),
  new AblyChatRealtime(ablyApiKey)
);

export const messageController = new MessageController(messageService);
export { MessageService };
