import { IPublicEvent, IPublicEventPreReduction } from "../../models/interfaces.js";

// Vista resumida de un evento: sin organizador, members como cantidad, chef
// como nombre, el grupo como { _id, name } y las calificaciones como promedio
// y cantidad.
export class EventMapper {
  toPublic(event: IPublicEventPreReduction): IPublicEvent {
    const totalScore: number = event.ratings.reduce((sum, rating) => sum + rating.score, 0);
    return {
      _id: event._id,
      group: { _id: event.group._id, name: event.group.name },
      title: event.title,
      datetime: event.datetime,
      description: event.description,
      state: event.state,
      chef: event.chef ? event.chef.name : null,
      shoppingDesignee: event.shoppingDesignee,
      memberLimit: event.memberLimit,
      members: event.members.length,
      ratings: {
        avgScore: event.ratings.length > 0 ? totalScore / event.ratings.length : 0,
        ratingsAmount: event.ratings.length,
      },
      penalization: event.penalization ?? null,
      penalizationStartDate: event.penalizationStartDate ?? null,
    };
  }

  toPublicList(events: IPublicEventPreReduction[]): IPublicEvent[] {
    return events.map((event) => this.toPublic(event));
  }
}
