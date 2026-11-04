import { EventRepository } from "../events/EventRepository.js";
import { RatingController } from "./RatingController.js";
import { RatingRepository } from "./RatingRepository.js";
import { RatingService } from "./RatingService.js";

// Composición manual de dependencias del módulo.
const ratingService = new RatingService(new EventRepository(), new RatingRepository());

export const ratingController = new RatingController(ratingService);
export { RatingService };
