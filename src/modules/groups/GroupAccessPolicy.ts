import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { IGroup } from "../../models/interfaces.js";
import { GroupRepository } from "./GroupRepository.js";

export const groupNotFoundMessage: string = "The group with the given ID does not exist.";

// Reglas de acceso a un grupo (GROUPS_FEATURE.md §5.1). Las usan los
// middlewares groupMember y groupAdmin: 400 id inválido, 404 inexistente, 403.
export class GroupAccessPolicy {
  constructor(private readonly groups: Pick<GroupRepository, "findById">) {}

  async assertMember(groupId: string, userId: string): Promise<void> {
    const group: IGroup = await this.getGroup(groupId);
    if (!group.members.some((member) => member.toString() === userId))
      throw new ForbiddenError("Access denied. The user is not a member of the group.");
  }

  async assertAdmin(groupId: string, userId: string): Promise<void> {
    const group: IGroup = await this.getGroup(groupId);
    if (!group.admins.some((admin) => admin.toString() === userId))
      throw new ForbiddenError("Access denied. The user is not an admin of the group.");
  }

  private async getGroup(groupId: string): Promise<IGroup> {
    if (!isValidId(groupId)) throw new BadRequestError("Invalid ObjectID");
    const group: IGroup | null = await this.groups.findById(groupId);
    if (!group) throw new NotFoundError(groupNotFoundMessage);
    return group;
  }
}
