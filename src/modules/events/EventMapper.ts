import { IPublicEvent, IPublicEventPreReduction } from "../../models/interfaces.js";

// Vista pública de un evento: sin organizador, members como cantidad, chef
// como nombre y calificaciones como promedio y cantidad.
// Los valores por defecto cubren eventos viejos sin ratings, isPrivate o
// penalization (backwards compatibility; sacar cuando no queden eventos así).
export class EventMapper {
  toPublic(event: IPublicEventPreReduction): IPublicEvent {
    const ratings = event.ratings ?? [];
    const totalScore: number = ratings.reduce((sum, rating) => sum + rating.score, 0);
    return {
      _id: event._id,
      title: event.title,
      datetime: event.datetime,
      description: event.description,
      state: event.state,
      chef: event.chef ? event.chef.name : null,
      shoppingDesignee: event.shoppingDesignee,
      memberLimit: event.memberLimit,
      members: event.members.length,
      ratings: {
        avgScore: ratings.length > 0 ? totalScore / ratings.length : 0,
        ratingsAmount: ratings.length,
      },
      isPrivate: event.isPrivate ? event.isPrivate : false,
      penalization: event.penalization ? event.penalization : null,
      penalizationStartDate: event.penalizationStartDate ? event.penalizationStartDate : null,
    };
  }

  toPublicList(events: IPublicEventPreReduction[]): IPublicEvent[] {
    return events.map((event) => this.toPublic(event));
  }
}
