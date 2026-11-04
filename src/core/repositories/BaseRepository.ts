import { Document, FilterQuery, Model } from "mongoose";

// Acceso genérico a una colección. Es la única capa que habla con Mongoose;
// los repositorios concretos agregan consultas específicas (populate, etc.).
export abstract class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  find(filter: FilterQuery<T> = {}): Promise<T[]> {
    return this.model.find(filter).exec();
  }

  create(data: Partial<T> | Record<string, unknown>): Promise<T> {
    return this.model.create(data) as Promise<T>;
  }

  save<D extends Document>(doc: D): Promise<D> {
    return doc.save();
  }

  async deleteById(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec();
  }
}
