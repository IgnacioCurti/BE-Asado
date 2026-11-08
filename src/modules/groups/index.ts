import { runInTransaction } from "../../core/repositories/transaction.js";
import { EventRepository } from "../events/EventRepository.js";
import { transferReceiptService } from "../transferReceipts/index.js";
import { GroupAccessPolicy } from "./GroupAccessPolicy.js";
import { GroupController } from "./GroupController.js";
import { GroupRepository } from "./GroupRepository.js";
import { GroupService } from "./GroupService.js";

// Composición manual de dependencias del módulo.
const groupRepository = new GroupRepository();

export const groupController = new GroupController(
  new GroupService(groupRepository, {
    events: new EventRepository(),
    debtors: transferReceiptService,
    transaction: runInTransaction,
  })
);
export const groupAccessPolicy = new GroupAccessPolicy(groupRepository);
export { GroupService };
