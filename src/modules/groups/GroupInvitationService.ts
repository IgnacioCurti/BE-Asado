import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors/AppError.js";
import { TransactionRunner } from "../../core/repositories/transaction.js";
import { isValidId } from "../../core/validation/isValidId.js";
import { GROUP_LIMITS } from "../../models/group.js";
import { IGroup, IInvitation, IUser } from "../../models/interfaces.js";
import { INVITATION_LIMITS } from "../../models/invitation.js";
import { UserRepository } from "../users/UserRepository.js";
import { groupNotFoundMessage } from "./GroupAccessPolicy.js";
import { GroupRepository, IGroupWithMembers } from "./GroupRepository.js";
import { InvitationRepository, PendingInvitation } from "./InvitationRepository.js";

// Tope por pedido: la API no tiene rate limiting todavía (WORKTODO §6.A).
export const MAX_INVITATION_EMAILS: number = 20;

// Mismo criterio que el schema de User.
const EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const invalidInvitationMessage: string = "The invitation is not valid.";
const groupLimitMessage: string = `A user can belong to at most ${GROUP_LIMITS.MAX_GROUPS_PER_USER} groups.`;
const alreadyMemberMessage: string = "The user is already a member of the group.";

type SendEmail = (email: string, subject: string, name: string, html: string) => Promise<void>;

export interface GroupInvitationDeps {
  groups: Pick<GroupRepository, "findById" | "findByIdWithMembers" | "countByMember" | "addMemberById">;
  users: Pick<UserRepository, "findById" | "findByEmails">;
  invitations: Pick<
    InvitationRepository,
    | "findByTokenHash"
    | "findPendingByGroup"
    | "findPendingEmails"
    | "upsertPending"
    | "claim"
    | "markAccepted"
    | "revoke"
    | "deleteById"
  >;
  transaction: TransactionRunner;
  sendEmail: SendEmail;
  template: (groupName: string, inviterName: string, token: string) => string;
  now?: () => Date;
  newToken?: () => string;
}

export interface InvitationResult {
  sent: string[];
  failed: string[];
  alreadyMembers: string[];
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Invitaciones por mail con token propio (GROUPS_FEATURE §4.3, opción B):
// - cada mail recibe un link con un token de un solo uso que vence a los 7 días;
// - solo la puede aceptar un usuario logueado con ese mismo mail;
// - el código del grupo (joinGroup) sigue funcionando aparte.
export class GroupInvitationService {
  private readonly now: () => Date;
  private readonly newToken: () => string;

  constructor(private readonly deps: GroupInvitationDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newToken = deps.newToken ?? (() => randomBytes(32).toString("base64url"));
  }

  async invite(groupId: string, inviterId: string, rawEmails: unknown): Promise<InvitationResult> {
    const emails: string[] = this.parseEmails(rawEmails);
    const group: IGroup = await this.getGroup(groupId);
    const inviter: IUser | null = await this.deps.users.findById(inviterId);
    const inviterName: string = inviter ? [inviter.name, inviter.lastName].filter(Boolean).join(" ") : "";

    const members: Set<string> = new Set(group.members.map(String));
    const registered: IUser[] = await this.deps.users.findByEmails(emails);
    const memberEmails: Set<string> = new Set(
      registered.filter((user) => members.has(String(user._id))).map((user) => user.email)
    );
    const toInvite: string[] = emails.filter((email) => !memberEmails.has(email));

    // Reinvitar a un mail con invitación pendiente la renueva: no suma al tope.
    const pending: Set<string> = new Set(await this.deps.invitations.findPendingEmails(groupId, this.now()));
    const newOnes: number = toInvite.filter((email) => !pending.has(email)).length;
    if (pending.size + newOnes > INVITATION_LIMITS.MAX_PENDING_PER_GROUP)
      throw new ConflictError(
        `A group can have at most ${INVITATION_LIMITS.MAX_PENDING_PER_GROUP} pending invitations. Revoke some first.`
      );

    const result: InvitationResult = { sent: [], failed: [], alreadyMembers: emails.filter((email) => memberEmails.has(email)) };
    for (const email of toInvite) {
      const token: string = this.newToken();
      const invitation: IInvitation = await this.deps.invitations.upsertPending({
        group: group._id,
        email,
        invitedBy: new mongoose.Types.ObjectId(inviterId),
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(this.now().getTime() + INVITATION_LIMITS.TTL_MS),
      });
      // Un mail fallido no corta el resto: se informa y la invitación se borra,
      // porque nadie recibió su link.
      try {
        await this.deps.sendEmail(
          email,
          "FoodSpot | Te invitaron a un grupo",
          email,
          this.deps.template(group.name, inviterName, token)
        );
        result.sent.push(email);
      } catch (error: any) {
        console.log(`Error sending group invitation to ${email}: ${error?.message || "unknown error"}`);
        await this.deps.invitations.deleteById(String(invitation._id));
        result.failed.push(email);
      }
    }
    return result;
  }

  // Acepta la invitación del token. El reclamo del token y el alta en el grupo
  // son una sola transacción: si el grupo está lleno, el token sigue pendiente.
  async accept(userId: string, rawToken: unknown): Promise<IGroupWithMembers> {
    if (typeof rawToken !== "string" || !rawToken.trim())
      throw new BadRequestError("The invitation token is required.");
    const invitation: IInvitation | null = await this.deps.invitations.findByTokenHash(
      hashInvitationToken(rawToken.trim())
    );
    if (!invitation || invitation.status !== "pending") throw new NotFoundError(invalidInvitationMessage);
    if (invitation.expiresAt.getTime() <= this.now().getTime())
      throw new ConflictError("The invitation has expired. Ask an admin to invite you again.");

    const user: IUser | null = await this.deps.users.findById(userId);
    if (!user || user.email !== invitation.email)
      throw new ForbiddenError("The invitation was sent to another email.");

    const group: IGroup = await this.getGroup(String(invitation.group));
    if (group.members.some((member) => user._id.equals(member))) {
      await this.deps.invitations.markAccepted(invitation._id, user._id, this.now());
      throw new ConflictError(alreadyMemberMessage);
    }
    if ((await this.deps.groups.countByMember(userId)) >= GROUP_LIMITS.MAX_GROUPS_PER_USER)
      throw new ConflictError(groupLimitMessage);

    await this.deps.transaction(async (session) => {
      if (!(await this.deps.invitations.claim(invitation._id, user._id, this.now(), session)))
        throw new NotFoundError(invalidInvitationMessage);
      if (!(await this.deps.groups.addMemberById(group._id, user._id, session))) {
        const current: IGroup | null = await this.deps.groups.findById(String(group._id));
        if (current?.members.some((member) => user._id.equals(member)))
          throw new ConflictError(alreadyMemberMessage);
        throw new ConflictError(`The group already has ${GROUP_LIMITS.MAX_MEMBERS} members.`);
      }
    });

    const joined: IGroupWithMembers | null = await this.deps.groups.findByIdWithMembers(String(group._id));
    if (!joined) throw new NotFoundError(groupNotFoundMessage);
    return joined;
  }

  listPending(groupId: string): Promise<PendingInvitation[]> {
    return this.deps.invitations.findPendingByGroup(groupId, this.now());
  }

  async revoke(groupId: string, invitationId: string): Promise<IInvitation> {
    if (!isValidId(invitationId)) throw new BadRequestError("Invalid ObjectID");
    const revoked: IInvitation | null = await this.deps.invitations.revoke(groupId, invitationId);
    if (!revoked) throw new NotFoundError("The group has no pending invitation with the given ID.");
    return revoked;
  }

  private async getGroup(groupId: string): Promise<IGroup> {
    const group: IGroup | null = await this.deps.groups.findById(groupId);
    if (!group) throw new NotFoundError(groupNotFoundMessage);
    return group;
  }

  // Recorta, pasa a minúsculas y quita repetidos. Cualquier mail inválido -> 400.
  private parseEmails(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length === 0)
      throw new BadRequestError("emails must be a non-empty array.");
    const emails: string[] = [
      ...new Set(raw.map((email) => (typeof email === "string" ? email.trim().toLowerCase() : ""))),
    ];
    const invalid: string[] = emails.filter((email) => !EMAIL_PATTERN.test(email));
    if (invalid.length > 0)
      throw new BadRequestError(`Invalid emails: ${invalid.map((e) => e || "(empty)").join(", ")}`);
    if (emails.length > MAX_INVITATION_EMAILS)
      throw new BadRequestError(`At most ${MAX_INVITATION_EMAILS} emails can be invited at once.`);
    return emails;
  }
}
