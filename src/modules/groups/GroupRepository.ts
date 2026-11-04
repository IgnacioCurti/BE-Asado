import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Group } from "../../models/group.js";
import { IGroup } from "../../models/interfaces.js";
import { generateGroupCode } from "./groupCode.js";

// Con 31^8 códigos posibles un choque es rarísimo; varios seguidos indican otro problema.
const MAX_CODE_ATTEMPTS: number = 5;

export type NewGroupData = Pick<IGroup, "name" | "admins" | "members"> & Partial<Pick<IGroup, "coverPhotos">>;

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
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.create({ ...data, code: this.newCode() });
      } catch (error) {
        if (!isDuplicateCodeError(error) || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }

  findByCode(code: string): Promise<IGroup | null> {
    return this.model.findOne({ code }).exec();
  }

  findByMember(userId: string): Promise<IGroup[]> {
    return this.model.find({ members: userId }).exec();
  }

  countByMember(userId: string): Promise<number> {
    return this.model.countDocuments({ members: userId }).exec();
  }
}
