import { EventRepository } from "../events/EventRepository.js";
import { OptionController } from "./OptionController.js";
import { OptionRepository } from "./OptionRepository.js";
import { OptionService } from "./OptionService.js";

const optionService = new OptionService(new OptionRepository(), new EventRepository());

export const optionController = new OptionController(optionService);
export { OptionService };
