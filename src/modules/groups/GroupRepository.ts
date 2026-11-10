import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Group, GROUP_LIMITS } from "../../models/group.js";
import { Image } from "../../models/image.js";
import { Invitation } from "../../models/invitation.js";
import { IGroup, IUser } from "../../models/interfaces.js";
import { generateGroupCode } from "./groupCode.js";

// Con 31^8 códigos posibles un choque es rarísimo; varios seguidos indican otro problema.
const MAX_CODE_ATTEMPTS: number = 5;

// Datos de los miembros que ve el resto del grupo (sin email ni datos bancarios).
const MEMBER_FIELDS: string = "_id name lastName profilePicture";

export type NewGroupData = Pick<IGroup, "name" | "admins" | "members"> &
  Partial<Pick<IGroup, "coverPhotos">>;

export type GroupMember = Pick<IUser, "_id" | "name" | "lastName" | "profilePicture">;

export interface IGroupWithMembers extends Omit<IGroup, "members"> {
  members: GroupMember[];
}

function isDuplicateCodeError(error: unknown): boolean {
  const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
  return mongoError?.code === 11000 && Boolean(mongoError.keyPattern?.code);
}

export class GroupRepository extends BaseRepository<IGroup> {
  constructor(private readonly newCode: () => string = generateGroupCode) {
    super(Group);
  }

  // La unicidad del código la garantiza el índice: si choca, se genera otro.
  async createWithUniqueCode(data: NewGroupData): Promise<IGroup> {
    return this.withUniqueCode((code) => this.create({ ...data, code }));
  }

  // El código anterior deja de servir en el acto (§3.4).
  async regenerateCode(groupId: mongoose.Types.ObjectId | string): Promise<IGroup | null> {
    return this.withUniqueCode((code) =>
      this.model.findByIdAndUpdate(groupId, { $set: { code } }, { new: true }).exec()
    );
  }

  findByCode(code: string): Promise<IGroup | null> {
    return this.model.findOne({ code }).exec();
  }

  findByMember(userId: string): Promise<IGroup[]> {
    return this.model.find({ members: userId }).sort({ createdAt: -1, _id: 1 }).exec();
  }

  async hasMember(
    groupId: mongoose.Types.ObjectId | string,
    userId: mongoose.Types.ObjectId | string
  ): Promise<boolean> {
    return Boolean(await this.model.exists({ _id: groupId, members: userId }).exec());
  }

  countByMember(userId: string): Promise<number> {
    return this.model.countDocuments({ members: userId }).exec();
  }

  findByIdWithMembers(id: string): Promise<IGroupWithMembers | null> {
    return this.model
      .findById(id)
      .populate("members", MEMBER_FIELDS)
      .exec() as unknown as Promise<IGroupWithMembers | null>;
  }

  // Suma al usuario solo si no es miembro y el grupo no está lleno, en la misma
  // escritura: dos ingresos simultáneos no pueden pasarse del límite (§8).
  addMemberByCode(code: string, userId: mongoose.Types.ObjectId): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        {
          code,
          members: { $ne: userId },
          [`members.${GROUP_LIMITS.MAX_MEMBERS - 1}`]: { $exists: false },
        },
        { $push: { members: userId } },
        { new: true }
      )
      .exec();
  }

  // Igual que addMemberByCode, para quien entra con una invitación.
  addMemberById(
    groupId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: groupId,
          members: { $ne: userId },
          [`members.${GROUP_LIMITS.MAX_MEMBERS - 1}`]: { $exists: false },
        },
        { $push: { members: userId } },
        { new: true, session }
      )
      .exec();
  }

  // Hace admin a un miembro (idempotente). null si no es miembro.
  addAdmin(groupId: string, userId: mongoose.Types.ObjectId): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        { _id: groupId, members: userId },
        { $addToSet: { admins: userId } },
        { new: true }
      )
      .exec();
  }

  // Agrega la portada solo si, al escribir, el grupo no llegó al límite (§8).
  addCoverPhoto(groupId: string, imageId: mongoose.Types.ObjectId): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        { _id: groupId, [`coverPhotos.${GROUP_LIMITS.MAX_COVER_PHOTOS - 1}`]: { $exists: false } },
        { $push: { coverPhotos: imageId } },
        { new: true }
      )
      .exec();
  }

  // null si la imagen no es portada del grupo.
  removeCoverPhoto(groupId: string, imageId: mongoose.Types.ObjectId): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        { _id: groupId, coverPhotos: imageId },
        { $pull: { coverPhotos: imageId } },
        { new: true }
      )
      .exec();
  }

  findByCoverPhoto(imageId: string): Promise<IGroup | null> {
    return this.model.findOne({ coverPhotos: imageId }).exec();
  }

  rename(groupId: string, name: string): Promise<IGroup | null> {
    return this.model
      .findByIdAndUpdate(groupId, { $set: { name } }, { new: true, runValidators: true })
      .exec();
  }

  // Saca al usuario de members y admins si, al escribir, no deja al grupo sin
  // admin: o no es admin, o hay otro admin. No aplica al último miembro.
  removeMemberKeepingAnAdmin(
    groupId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<IGroup | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: groupId,
          members: userId,
          "members.1": { $exists: true },
          $or: [{ admins: { $ne: userId } }, { "admins.1": { $exists: true } }],
        },
        { $pull: { members: userId, admins: userId } },
        { new: true, session }
      )
      .exec();
  }

  // Borra el grupo solo si el usuario es su único miembro, junto con sus
  // portadas e invitaciones (§4.6). Corre dentro de la transacción de quien llama, que
  // borra también los eventos del grupo. true si lo borró.
  async deleteIfOnlyMember(
    groupId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<boolean> {
    const group: IGroup | null = await this.model
      .findOneAndDelete({ _id: groupId, members: [userId] })
      .session(session)
      .exec();
    if (group) {
      await Image.deleteMany({ _id: { $in: group.coverPhotos } }).session(session).exec();
      await Invitation.deleteMany({ group: group._id }).session(session).exec();
    }
    return Boolean(group);
  }

  private async withUniqueCode<T>(write: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write(this.newCode());
      } catch (error) {
        if (!isDuplicateCodeError(error) || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }
}
