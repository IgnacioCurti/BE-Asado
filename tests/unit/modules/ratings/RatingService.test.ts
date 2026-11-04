import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { RatingService } from "../../../../src/modules/ratings/RatingService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function rating(user: mongoose.Types.ObjectId, score: number) {
  return { _id: id(), user, score } as any;
}

function setup(event: any) {
  const events = {
    findByIdWithRatings: vi.fn().mockResolvedValue(event),
    save: vi.fn(async (doc: any) => doc),
  };
  const ratings = {
    create: vi.fn(async (data: any) => ({ _id: id(), ...data, user: new mongoose.Types.ObjectId(data.user) })),
    save: vi.fn(async (doc: any) => doc),
  };
  return { service: new RatingService(events as any, ratings as any), events, ratings };
}

function eventWith(state: string, members: mongoose.Types.ObjectId[], ratings: any[] = []) {
  return { _id: id(), state, members, ratings };
}

describe("RatingService.createOrUpdate", () => {
  it("crea la calificación y la agrega al evento", async () => {
    const user = id();
    const event = eventWith("finished", [user]);
    const { service, events, ratings } = setup(event);

    const result = await service.createOrUpdate(String(event._id), String(user), String(user), 4);

    expect(ratings.create).toHaveBeenCalledWith({ score: 4, user: String(user) });
    expect(event.ratings).toEqual([result]);
    expect(events.save).toHaveBeenCalledWith(event);
  });

  it("actualiza la calificación existente sin crear otra", async () => {
    const user = id();
    const existing = rating(user, 2);
    const event = eventWith("closed", [user], [existing]);
    const { service, events, ratings } = setup(event);

    const result = await service.createOrUpdate(String(event._id), String(user), String(user), 5);

    expect(result).toBe(existing);
    expect(existing.score).toBe(5);
    expect(ratings.save).toHaveBeenCalledWith(existing);
    expect(ratings.create).not.toHaveBeenCalled();
    expect(events.save).not.toHaveBeenCalled();
  });

  it.each(["available", "cancelled"])("en estado %s lanza BadRequestError", async (state) => {
    const user = id();
    const { service, ratings } = setup(eventWith(state, [user]));

    await expect(service.createOrUpdate(String(id()), String(user), String(user), 4)).rejects.toEqual(
      new BadRequestError("The event is not closed or finished.")
    );
    expect(ratings.create).not.toHaveBeenCalled();
  });

  it("evento inexistente lanza NotFoundError", async () => {
    const { service } = setup(null);
    const user = String(id());
    await expect(service.createOrUpdate(String(id()), user, user, 4)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("usuario que no es miembro lanza BadRequestError", async () => {
    const { service } = setup(eventWith("finished", [id()]));
    const user = String(id());
    await expect(service.createOrUpdate(String(id()), user, user, 4)).rejects.toEqual(
      new BadRequestError("The user with the given ID was not found in the event.")
    );
  });

  it("id de usuario mal formado -> BadRequestError sin consultar la base", async () => {
    const { service, events } = setup(eventWith("finished", [id()]));
    await expect(service.createOrUpdate(String(id()), "abc", "abc", 4)).rejects.toEqual(new BadRequestError("Invalid ObjectID"));
    expect(events.findByIdWithRatings).not.toHaveBeenCalled();
  });

  it("calificar en nombre de otro -> ForbiddenError", async () => {
    const user = id();
    const { service, ratings } = setup(eventWith("finished", [user]));
    await expect(service.createOrUpdate(String(id()), String(user), String(id()), 4)).rejects.toBeInstanceOf(ForbiddenError);
    expect(ratings.create).not.toHaveBeenCalled();
  });

  it.each([0, 6, 3.5, "x", undefined])("score %s -> BadRequestError", async (score) => {
    const user = id();
    const { service, ratings } = setup(eventWith("finished", [user]));
    await expect(service.createOrUpdate(String(id()), String(user), String(user), score)).rejects.toEqual(
      new BadRequestError("The score must be an integer between 1 and 5.")
    );
    expect(ratings.create).not.toHaveBeenCalled();
  });

  it("si falla la creación no guarda el evento", async () => {
    const user = id();
    const event = eventWith("finished", [user]);
    const { service, events, ratings } = setup(event);
    ratings.create.mockRejectedValue(new Error("validation failed"));

    await expect(service.createOrUpdate(String(event._id), String(user), String(user), 4)).rejects.toThrow("validation failed");
    expect(events.save).not.toHaveBeenCalled();
    expect(event.ratings).toEqual([]);
  });
});

describe("RatingService.getFromUser", () => {
  it("devuelve la calificación del usuario", async () => {
    const user = id();
    const mine = rating(user, 5);
    const { service } = setup(eventWith("available", [user, id()], [rating(id(), 1), mine]));
    expect(await service.getFromUser(String(id()), String(user))).toBe(mine);
  });

  it("devuelve null si el usuario no calificó", async () => {
    const user = id();
    const { service } = setup(eventWith("finished", [user]));
    expect(await service.getFromUser(String(id()), String(user))).toBeNull();
  });

  it("usuario que no es miembro lanza BadRequestError", async () => {
    const { service } = setup(eventWith("finished", [id()]));
    await expect(service.getFromUser(String(id()), String(id()))).rejects.toBeInstanceOf(BadRequestError);
  });
});
