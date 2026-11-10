import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { User } from "../../models/user.js";
import { ISafeUser, IUser } from "../../models/interfaces.js";

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User);
  }

  async hasProfilePicture(imageId: string): Promise<boolean> {
    return Boolean(await this.model.exists({ profilePicture: imageId }));
  }

  findByEmail(email: string): Promise<IUser | null> {
    return this.model.findOne({ email }).exec();
  }

  findByEmails(emails: string[]): Promise<IUser[]> {
    return this.model.find({ email: { $in: emails } }).exec();
  }

  // Campos sensibles que nunca salen en las respuestas de usuarios. También se
  // usa al poblar usuarios desde otros documentos (eventos, comprobantes).
  static readonly SAFE_PROJECTION: string =
    "-password -verificationCode -verificationCodeExpiresAt -verificationAttempts";

  findAllSafe(): Promise<ISafeUser[]> {
    return this.model.find().select(UserRepository.SAFE_PROJECTION).exec();
  }

  findSafeById(id: string): Promise<ISafeUser | null> {
    return this.model.findById(id).select(UserRepository.SAFE_PROJECTION).exec();
  }

  // Entre los usuarios indicados, los que tienen el aviso activado.
  findByIdsWithNotificationEnabled(
    ids: mongoose.Types.ObjectId[],
    notification: keyof IUser["notifications"]
  ): Promise<IUser[]> {
    return this.model.find({ _id: { $in: ids }, [`notifications.${notification}`]: true }).exec();
  }
}
