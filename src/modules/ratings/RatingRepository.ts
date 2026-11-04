import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Rating } from "../../models/rating.js";
import { IRating } from "../../models/interfaces.js";

export class RatingRepository extends BaseRepository<IRating> {
  constructor() {
    super(Rating);
  }
}
