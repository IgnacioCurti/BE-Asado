import { NotFoundError } from "../../core/errors/AppError.js";
import { IOption, IUserName } from "../../models/interfaces.js";
import { EventRepository, IEventWithMemberNames } from "../events/EventRepository.js";
import { OptionRepository, VoteOperator } from "./OptionRepository.js";

const optionNotFoundMessage: string = "Option not found";

// La autorización (organizador/designado para gestionar, miembro para votar)
// la aplican hoy los middlewares optionManager y optionVoter.
export class OptionService {
  constructor(
    private readonly options: Pick<
      OptionRepository,
      "create" | "updateTitle" | "updateParticipant" | "deleteById" | "findByIds"
    >,
    private readonly events: Pick<
      EventRepository,
      "addOption" | "removeOption" | "findByIdWithMemberNames"
    >
  ) {}

  // Los votos solo cambian con vote/unvote: create y edit ignoran participants.
  async create(eventId: string, title: string): Promise<IOption> {
    const option: IOption = await this.options.create({ title });
    await this.events.addOption(eventId, option._id);
    return option;
  }

  async editTitle(optionId: string, title: string): Promise<IOption> {
    return this.orNotFound(await this.options.updateTitle(optionId, title));
  }

  vote(optionId: string, userId: string): Promise<IOption> {
    return this.updateOwnVote(optionId, userId, "$addToSet");
  }

  unvote(optionId: string, userId: string): Promise<IOption> {
    return this.updateOwnVote(optionId, userId, "$pull");
  }

  async delete(optionId: string): Promise<IOption> {
    const deleted: IOption = this.orNotFound(await this.options.deleteById(optionId));
    await this.events.removeOption(deleted._id);
    return deleted;
  }

  async getMembersWhoHaventVoted(eventId: string): Promise<IUserName[]> {
    const event: IEventWithMemberNames | null =
      await this.events.findByIdWithMemberNames(eventId);
    if (!event) throw new NotFoundError("Event not found");

    const options: IOption[] = await this.options.findByIds(event.options);
    const voters = new Set<string>(
      options.flatMap((option) => option.participants.map((id) => id.toString()))
    );
    return event.members.filter((member) => !voters.has(member._id.toString()));
  }

  private async updateOwnVote(optionId: string, userId: string, operator: VoteOperator): Promise<IOption> {
    return this.orNotFound(await this.options.updateParticipant(optionId, operator, userId));
  }

  private orNotFound(option: IOption | null): IOption {
    if (!option) throw new NotFoundError(optionNotFoundMessage);
    return option;
  }
}
