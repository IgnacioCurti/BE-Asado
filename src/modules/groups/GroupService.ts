import mongoose from "mongoose";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { runInTransaction, TransactionRunner } from "../../core/repositories/transaction.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { GROUP_LIMITS } from "../../models/group.js";
import { IEvent, IGroup } from "../../models/interfaces.js";
import { EventRepository } from "../events/EventRepository.js";
import { ImageService } from "../images/ImageService.js";
import { TransferReceiptService } from "../transferReceipts/TransferReceiptService.js";
import { groupNotFoundMessage } from "./GroupAccessPolicy.js";
import { isValidGroupCode, normalizeGroupCode } from "./groupCode.js";
import { GroupRepository, IGroupWithMembers } from "./GroupRepository.js";

const groupLimitMessage: string = `A user can belong to at most ${GROUP_LIMITS.MAX_GROUPS_PER_USER} groups.`;
const coverPhotoLimitMessage: string = `A group can have at most ${GROUP_LIMITS.MAX_COVER_PHOTOS} cover photos.`;
const onlyAdminMessage: string =
  "The only admin can't leave the group while it has other members. Make another member an admin first.";
const pendingDebtMessage: string =
  "The user has pending payments in events of the group. Settle them before leaving.";
const activeRoleMessage: string =
  "The user is the chef or a shopping designee of a closed or ready-for-payment event of the group. Wait until the event ends or is reopened and release the role before leaving.";

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
  | "addCoverPhoto"
  | "removeCoverPhoto"
>;

// Lo que necesita "salir del grupo" de los eventos del grupo (§4.4 y §4.6).
export interface GroupEventsDeps {
  events: Pick<
    EventRepository,
    "findActiveInGroupInvolving" | "removeUserFromAvailableInGroup" | "findIdsByGroup" | "deleteCascade"
  >;
  debtors: Pick<TransferReceiptService, "getDebtors">;
  transaction: TransactionRunner;
}

// Grupos de usuarios (GROUPS_FEATURE.md). Quién es miembro o admin lo validan
// los middlewares groupMember y groupAdmin; acá van las reglas de negocio.
// Los admins y miembros salen siempre del token, nunca del body.
export class GroupService {
  constructor(
    private readonly groups: GroupServiceDeps,
    private readonly groupEvents: GroupEventsDeps,
    private readonly images: Pick<ImageService, "save" | "delete">
  ) {}

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

  // Salir del grupo (§4.4), en este orden:
  // - el único admin no puede irse si quedan otros miembros;
  // - no puede irse con deudas en eventos readyforpayment del grupo, ni siendo
  //   chef o designado de un evento closed/readyforpayment del grupo;
  // - sale de los eventos available del grupo (con sus roles, votos y
  //   comprobantes) y sigue en los demás (historial);
  // - si es el último miembro, el grupo se borra con sus eventos (§4.6).
  // La baja del grupo y de sus eventos es una sola transacción.
  async leave(groupId: string, userId: string): Promise<LeaveResult> {
    const group: IGroup = await this.getGroup(groupId);
    const user = new mongoose.Types.ObjectId(userId);
    if (!group.members.some((member) => user.equals(member)))
      throw new ForbiddenError("Access denied. The user is not a member of the group.");
    if (group.members.length > 1 && this.isOnlyAdmin(group, user))
      throw new ConflictError(onlyAdminMessage);
    await this.assertCanLeaveEvents(group._id, user);

    const { events, transaction } = this.groupEvents;
    if (group.members.length === 1) {
      const deleted: boolean = await transaction(async (session) => {
        if (!(await this.groups.deleteIfOnlyMember(group._id, user, session))) return false;
        await events.deleteCascade(await events.findIdsByGroup(group._id, session), session);
        return true;
      });
      if (deleted) return { groupDeleted: true };
    } else {
      const left: boolean = await transaction(async (session) => {
        if (!(await this.groups.removeMemberKeepingAnAdmin(group._id, user, session))) return false;
        await events.removeUserFromAvailableInGroup(group._id, user, session);
        return true;
      });
      if (left) return { groupDeleted: false };
    }

    // No se pudo escribir: o es el único admin, o el grupo cambió en el medio.
    const current: IGroup | null = await this.groups.findById(groupId);
    if (!current) throw new NotFoundError(groupNotFoundMessage);
    if (!current.members.some((member) => user.equals(member)))
      throw new ForbiddenError("Access denied. The user is not a member of the group.");
    if (this.isOnlyAdmin(current, user) && current.members.length > 1)
      throw new ConflictError(onlyAdminMessage);
    throw new ConflictError("The group changed while leaving. Try again.");
  }

  // Deudas y roles en los eventos activos del grupo (§4.4). Las deudas se
  // revisan primero: son lo que el usuario tiene que resolver por su cuenta.
  private async assertCanLeaveEvents(
    groupId: mongoose.Types.ObjectId,
    user: mongoose.Types.ObjectId
  ): Promise<void> {
    const active: IEvent[] = await this.groupEvents.events.findActiveInGroupInvolving(groupId, user);
    for (const event of active) {
      if (event.state !== "readyforpayment" || !event.members.some((m) => user.equals(m))) continue;
      const debtors = await this.groupEvents.debtors.getDebtors(event._id);
      if (debtors.some((debtor) => user.equals(debtor._id)))
        throw new ConflictError(pendingDebtMessage);
    }
    const hasRole = (event: IEvent): boolean =>
      (event.chef != null && user.equals(event.chef)) ||
      (event.shoppingDesignee ?? []).some((designee) => user.equals(designee));
    if (active.some(hasRole)) throw new ConflictError(activeRoleMessage);
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

  // Portadas (§3.5): hasta 5, en el orden en que se subieron. El límite se
  // vuelve a verificar al escribir; si se llenó en el medio, se borra la imagen.
  async addCoverPhoto(groupId: string, file: Express.Multer.File | undefined): Promise<IGroup> {
    if (!file) throw new BadRequestError("No file was uploaded.");
    const group: IGroup = await this.getGroup(groupId);
    if (group.coverPhotos.length >= GROUP_LIMITS.MAX_COVER_PHOTOS)
      throw new ConflictError(coverPhotoLimitMessage);
    const imageId: mongoose.Types.ObjectId = await this.images.save(file);
    const updated: IGroup | null = await this.groups.addCoverPhoto(groupId, imageId);
    if (updated) return updated;
    await this.images.delete(imageId);
    await this.getGroup(groupId);
    throw new ConflictError(coverPhotoLimitMessage);
  }

  async deleteCoverPhoto(groupId: string, imageId: string): Promise<IGroup> {
    if (!isValidId(imageId)) throw new BadRequestError("Invalid ObjectID");
    const image = new mongoose.Types.ObjectId(imageId);
    const updated: IGroup | null = await this.groups.removeCoverPhoto(groupId, image);
    if (!updated) throw new NotFoundError("The image is not a cover photo of the group.");
    await this.images.delete(image);
    return updated;
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
