import { GroupAccessPolicy } from "./GroupAccessPolicy.js";
import { GroupController } from "./GroupController.js";
import { GroupRepository } from "./GroupRepository.js";
import { GroupService } from "./GroupService.js";

// Composición manual de dependencias del módulo.
const groupRepository = new GroupRepository();

export const groupController = new GroupController(new GroupService(groupRepository));
export const groupAccessPolicy = new GroupAccessPolicy(groupRepository);
export { GroupService };
