import { runInTransaction } from "../../core/repositories/transaction.js";
import { EventRepository } from "../events/EventRepository.js";
import { imageService } from "../images/index.js";
import { transferReceiptService } from "../transferReceipts/index.js";
import { GroupAccessPolicy } from "./GroupAccessPolicy.js";
import { sendEmail } from "../../utils/utils.js";
import { groupInvitationTemplate } from "../../utils/templates.js";
import { UserRepository } from "../users/UserRepository.js";
import { InvitationRepository } from "./InvitationRepository.js";
import { GroupController } from "./GroupController.js";
import { GroupInvitationService } from "./GroupInvitationService.js";
import { GroupRepository } from "./GroupRepository.js";
import { GroupService } from "./GroupService.js";

// Composición manual de dependencias del módulo.
const groupRepository = new GroupRepository();

export const groupController = new GroupController(
  new GroupService(groupRepository, {
    events: new EventRepository(),
    debtors: transferReceiptService,
    transaction: runInTransaction,
  }, imageService),
  new GroupInvitationService({
    groups: groupRepository,
    users: new UserRepository(),
    invitations: new InvitationRepository(),
    transaction: runInTransaction,
    sendEmail,
    template: groupInvitationTemplate,
  })
);
export const groupAccessPolicy = new GroupAccessPolicy(groupRepository);
export { GroupService };
