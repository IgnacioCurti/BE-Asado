import mongoose from "mongoose";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { GROUP_LIMITS } from "../../models/group.js";
import { IGroup } from "../../models/interfaces.js";
import { groupNotFoundMessage } from "./GroupAccessPolicy.js";
import { isValidGroupCode, normalizeGroupCode } from "./groupCode.js";
import { GroupRepository, IGroupWithMembers } from "./GroupRepository.js";

const groupLimitMessage: string = `A user can belong to at most ${GROUP_LIMITS.MAX_GROUPS_PER_USER} groups.`;

export interface GroupSummary {
  _id: mongoose.Types.ObjectId;
  name: string;
  coverPhotos: mongoose.Types.ObjectId[];
  membersCount: number;
  isAdmin: boolean;
}

export interface LeaveResult {
  groupDeleted: boolean;
}

export type GroupServiceDeps = Pick<
  GroupRepository,
  | "createWithUniqueCode"
  | "regenerateCode"
  | "findById"
  | "findByCode"
  | "findByMember"
  | "countByMember"
  | "findByIdWithMembers"
  | "addMemberByCode"
  | "addAdmin"
  | "rename"
  | "removeMemberKeepingAnAdmin"
  | "deleteIfOnlyMember"
>;

// Grupos de usuarios (GROUPS_FEATURE.md). Quién es miembro o admin lo validan
// los middlewares groupMember y groupAdmin; acá van las reglas de negocio.
// Los admins y miembros salen siempre del token, nunca del body.
export class GroupService {
  constructor(private readonly groups: GroupServiceDeps) {}

  async create(userId: string, name: unknown): Promise<IGroup> {
    const cleanName: string = this.parseName(name);
    if ((await this.groups.countByMember(userId)) >= GROUP_LIMITS.MAX_GROUPS_PER_USER)
      throw new ConflictError(groupLimitMessage);
    const user = new mongoose.Types.ObjectId(userId);
    return this.groups.createWithUniqueCode({ name: cleanName, admins: [user], members: [user] });
  }

  async listForUser(userId: string): Promise<GroupSummary[]> {
    const groups: IGroup[] = await this.groups.findByMember(userId);
    return groups.map((group) => ({
      _id: group._id,
      name: group.name,
      coverPhotos: group.coverPhotos,
      membersCount: group.members.length,
      isAdmin: group.admins.some((admin) => admin.toString() === userId),
    }));
  }

  async getDetails(groupId: string): Promise<IGroupWithMembers> {
    const group: IGroupWithMembers | null = await this.groups.findByIdWithMembers(groupId);
    if (!group) throw new NotFoundError(groupNotFoundMessage);
    return group;
  }

  // Unirse con el código del grupo (§4.2).
  async join(userId: string, rawCode: unknown): Promise<IGroupWithMembers> {
    const code: string = normalizeGroupCode(rawCode);
    if (!isValidGroupCode(code)) throw new BadRequestError("Invalid group code.");
    const group: IGroup | null = await this.groups.findByCode(code);
    if (!group) throw new NotFoundError("No group was found with the given code.");
    const user = new mongoose.Types.ObjectId(userId);
    if (group.members.some((member) => user.equals(member)))
      throw new ConflictError("The user is already a member of the group.");
    if ((await this.groups.countByMember(userId)) >= GROUP_LIMITS.MAX_GROUPS_PER_USER)
      throw new ConflictError(groupLimitMessage);

    // Las condiciones (no es miembro, hay lugar) se vuelven a verificar al escribir.
    const joined: IGroup | null = await this.groups.addMemberByCode(code, user);
    if (!joined) {
      const current: IGroup | null = await this.groups.findByCode(code);
      if (!current) throw new NotFoundError("No group was found with the given code.");
      if (current.members.some((member) => user.equals(member)))
        throw new ConflictError("The user is already a member of the group.");
      throw new ConflictError(this.fullMessage());
    }
    return this.getDetails(String(joined._id));
  }

  // Salir del grupo (§4.4). El único admin no puede irse si quedan otros
  // miembros; si es el último miembro, el grupo se borra (§4.6).
  // TODO(paso 4, Event.group): bloquear por deudas o roles en eventos
  // closed/readyforpayment del grupo, dar de baja de los available y borrar
  // los eventos del grupo en la cascada.
  async leave(groupId: string, userId: string): Promise<LeaveResult> {
    const group: IGroup = await this.getGroup(groupId);
    const user = new mongoose.Types.ObjectId(userId);
    if (!group.members.some((member) => user.equals(member)))
      throw new ForbiddenError("Access denied. The user is not a member of the group.");

    if (group.members.length === 1) {
      if (await this.groups.deleteIfOnlyMember(group._id, user)) return { groupDeleted: true };
    } else if (await this.groups.removeMemberKeepingAnAdmin(group._id, user)) {
      return { groupDeleted: false };
    }

    // No se pudo escribir: o es el único admin, o el grupo cambió en el medio.
    const current: IGroup | null = await this.groups.findById(groupId);
    if (!current) throw new NotFoundError(groupNotFoundMessage);
    if (!current.members.some((member) => user.equals(member)))
      throw new ForbiddenError("Access denied. The user is not a member of the group.");
    if (this.isOnlyAdmin(current, user) && current.members.length > 1)
      throw new ConflictError(
        "The only admin can't leave the group while it has other members. Make another member an admin first."
      );
    throw new ConflictError("The group changed while leaving. Try again.");
  }

  async rename(groupId: string, name: unknown): Promise<IGroup> {
    const updated: IGroup | null = await this.groups.rename(groupId, this.parseName(name));
    if (!updated) throw new NotFoundError(groupNotFoundMessage);
    return updated;
  }

  async makeAdmin(groupId: string, targetId: string): Promise<IGroup> {
    if (!isValidId(targetId)) throw new BadRequestError("Invalid ObjectID");
    const updated: IGroup | null = await this.groups.addAdmin(
      groupId,
      new mongoose.Types.ObjectId(targetId)
    );
    if (!updated) throw new BadRequestError("The user is not a member of the group.");
    return updated;
  }

  async regenerateCode(groupId: string): Promise<string> {
    const updated: IGroup | null = await this.groups.regenerateCode(groupId);
    if (!updated) throw new NotFoundError(groupNotFoundMessage);
    return updated.code;
  }

  private parseName(name: unknown): string {
    const clean: string = typeof name === "string" ? name.trim() : "";
    if (!clean) throw new BadRequestError("The group name is required.");
    if (clean.length > GROUP_LIMITS.NAME_MAX_LENGTH)
      throw new BadRequestError(
        `The group name can have at most ${GROUP_LIMITS.NAME_MAX_LENGTH} characters.`
      );
    return clean;
  }

  private async getGroup(groupId: string): Promise<IGroup> {
    const group: IGroup | null = await this.groups.findById(groupId);
    if (!group) throw new NotFoundError(groupNotFoundMessage);
    return group;
  }

  private isOnlyAdmin(group: IGroup, user: mongoose.Types.ObjectId): boolean {
    return group.admins.length === 1 && user.equals(group.admins[0]);
  }

  private fullMessage(): string {
    return `The group already has ${GROUP_LIMITS.MAX_MEMBERS} members.`;
  }
}
