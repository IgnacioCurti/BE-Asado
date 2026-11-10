import mongoose from "mongoose";
import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { IInvitation } from "../../models/interfaces.js";
import { Invitation } from "../../models/invitation.js";

const INVITER_FIELDS: string = "_id name lastName";

export interface PendingInvitation {
  _id: mongoose.Types.ObjectId;
  email: string;
  invitedBy: { _id: mongoose.Types.ObjectId; name: string; lastName?: string } | null;
  expiresAt: Date;
  createdAt: Date;
}

export class InvitationRepository extends BaseRepository<IInvitation> {
  constructor() {
    super(Invitation);
  }

  findByTokenHash(tokenHash: string): Promise<IInvitation | null> {
    return this.model.findOne({ tokenHash }).exec();
  }

  // Pendientes y vigentes, más nuevas primero.
  findPendingByGroup(groupId: string, now: Date): Promise<PendingInvitation[]> {
    return this.model
      .find({ group: groupId, status: "pending", expiresAt: { $gt: now } })
      .select("email invitedBy expiresAt createdAt")
      .populate("invitedBy", INVITER_FIELDS)
      .sort({ createdAt: -1, _id: 1 })
      .lean()
      .exec() as unknown as Promise<PendingInvitation[]>;
  }

  // Mails con una invitación pendiente y vigente en el grupo.
  async findPendingEmails(groupId: string, now: Date): Promise<string[]> {
    const pending = await this.model
      .find({ group: groupId, status: "pending", expiresAt: { $gt: now } })
      .select("email")
      .lean()
      .exec();
    return pending.map((invitation) => invitation.email);
  }

  // Crea la invitación pendiente o, si ya había una para ese mail, la renueva
  // (token y vencimiento nuevos): el link anterior deja de servir.
  async upsertPending(data: {
    group: mongoose.Types.ObjectId;
    email: string;
    invitedBy: mongoose.Types.ObjectId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<IInvitation> {
    const write = () =>
      this.model
        .findOneAndUpdate(
          { group: data.group, email: data.email, status: "pending" },
          { $set: { invitedBy: data.invitedBy, tokenHash: data.tokenHash, expiresAt: data.expiresAt } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        .exec() as Promise<IInvitation>;
    try {
      return await write();
    } catch (error) {
      // Dos upserts simultáneos del mismo mail: el segundo choca con el índice
      // parcial único y, al reintentar, encuentra el documento y lo actualiza.
      if ((error as { code?: number })?.code !== 11000) throw error;
      return write();
    }
  }

  // Marca como aceptada solo si sigue pendiente y vigente: un token sirve una vez.
  claim(
    invitationId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    now: Date,
    session: mongoose.ClientSession
  ): Promise<IInvitation | null> {
    return this.model
      .findOneAndUpdate(
        { _id: invitationId, status: "pending", expiresAt: { $gt: now } },
        { $set: { status: "accepted", acceptedBy: userId, acceptedAt: now } },
        { new: true, session }
      )
      .exec();
  }

  markAccepted(invitationId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId, now: Date): Promise<unknown> {
    return this.model
      .updateOne(
        { _id: invitationId, status: "pending" },
        { $set: { status: "accepted", acceptedBy: userId, acceptedAt: now } }
      )
      .exec();
  }

  // null si no es una invitación pendiente del grupo.
  revoke(groupId: string, invitationId: string): Promise<IInvitation | null> {
    return this.model
      .findOneAndUpdate(
        { _id: invitationId, group: groupId, status: "pending" },
        { $set: { status: "revoked" } },
        { new: true }
      )
      .exec();
  }
}
