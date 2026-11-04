import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { User } from "../../models/user.js";
import { IUser } from "../../models/interfaces.js";

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User);
  }

  async hasProfilePicture(imageId: string): Promise<boolean> {
    return Boolean(await this.model.exists({ profilePicture: imageId }));
  }
}
