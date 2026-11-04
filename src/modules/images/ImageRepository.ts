import { BaseRepository } from "../../core/repositories/BaseRepository.js";
import { Image } from "../../models/image.js";
import { IImage } from "../../models/interfaces.js";

export class ImageRepository extends BaseRepository<IImage> {
  constructor() {
    super(Image);
  }
}
