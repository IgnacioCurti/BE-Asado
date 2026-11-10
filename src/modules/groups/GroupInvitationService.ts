import { BadRequestError, NotFoundError } from "../../core/errors/AppError.js";
import { IGroup, IUser } from "../../models/interfaces.js";
import { UserRepository } from "../users/UserRepository.js";
import { groupNotFoundMessage } from "./GroupAccessPolicy.js";
import { GroupRepository } from "./GroupRepository.js";

// Tope por pedido: la API no tiene rate limiting todavía (WORKTODO §6.A).
export const MAX_INVITATION_EMAILS: number = 20;

// Mismo criterio que el schema de User.
const EMAIL_PATTERN: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SendEmail = (email: string, subject: string, name: string, html: string) => Promise<void>;

export interface GroupInvitationDeps {
  groups: Pick<GroupRepository, "findById">;
  users: Pick<UserRepository, "findById" | "findByEmails">;
  sendEmail: SendEmail;
  template: (groupName: string, inviterName: string, code: string) => string;
}

export interface InvitationResult {
  sent: string[];
  failed: string[];
  alreadyMembers: string[];
}

// Invitaciones por mail, opción A (GROUPS_FEATURE §4.3): el mail lleva el link
// con el código del grupo. El contrato { emails: [] } es el mismo que tendrá la
// opción B (token propio); solo cambiará el contenido del mail.
export class GroupInvitationService {
  constructor(private readonly deps: GroupInvitationDeps) {}

  async invite(groupId: string, inviterId: string, rawEmails: unknown): Promise<InvitationResult> {
    const emails: string[] = this.parseEmails(rawEmails);
    const group: IGroup | null = await this.deps.groups.findById(groupId);
    if (!group) throw new NotFoundError(groupNotFoundMessage);
    const inviter: IUser | null = await this.deps.users.findById(inviterId);
    const inviterName: string = inviter ? [inviter.name, inviter.lastName].filter(Boolean).join(" ") : "";

    const members: Set<string> = new Set(group.members.map(String));
    const registered: IUser[] = await this.deps.users.findByEmails(emails);
    const memberEmails: Set<string> = new Set(
      registered.filter((user) => members.has(String(user._id))).map((user) => user.email)
    );

    const result: InvitationResult = { sent: [], failed: [], alreadyMembers: [] };
    const html: string = this.deps.template(group.name, inviterName, group.code);
    for (const email of emails) {
      if (memberEmails.has(email)) {
        result.alreadyMembers.push(email);
        continue;
      }
      // Un mail fallido no corta el resto: se informa en la respuesta.
      try {
        await this.deps.sendEmail(email, "FoodSpot | Te invitaron a un grupo", email, html);
        result.sent.push(email);
      } catch (error: any) {
        console.log(`Error sending group invitation to ${email}: ${error?.message || "unknown error"}`);
        result.failed.push(email);
      }
    }
    return result;
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
