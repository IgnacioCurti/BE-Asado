import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { OptionService } from "../../../../src/modules/options/OptionService.js";
import { NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const options = {
    create: vi.fn(async (data: any) => ({ _id: id(), participants: [], ...data })),
    updateTitle: vi.fn(),
    updateParticipant: vi.fn(),
    deleteById: vi.fn(),
    findByIds: vi.fn(),
  };
  const events = {
    addOption: vi.fn(),
    removeOption: vi.fn(),
    findByIdWithMemberNames: vi.fn(),
  };
  return { service: new OptionService(options as any, events as any), options, events };
}

describe("OptionService", () => {
  it("create guarda solo el título y lo agrega al evento", async () => {
    const { service, options, events } = setup();
    const option = await service.create("event-1", "Asado");
    expect(options.create).toHaveBeenCalledWith({ title: "Asado" });
    expect(events.addOption).toHaveBeenCalledWith("event-1", option._id);
  });

  it("editTitle devuelve la opción actualizada", async () => {
    const { service, options } = setup();
    const updated = { _id: id(), title: "Pizza" };
    options.updateTitle.mockResolvedValue(updated);
    expect(await service.editTitle("opt", "Pizza")).toBe(updated);
  });

  it("editTitle de una opción inexistente lanza NotFoundError", async () => {
    const { service, options } = setup();
    options.updateTitle.mockResolvedValue(null);
    await expect(service.editTitle("opt", "x")).rejects.toEqual(new NotFoundError("Option not found"));
  });

  it.each([
    ["vote", "$addToSet"],
    ["unvote", "$pull"],
  ] as const)("%s usa el operador %s con el usuario autenticado", async (method, operator) => {
    const { service, options } = setup();
    const updated = { _id: id() };
    options.updateParticipant.mockResolvedValue(updated);
    expect(await service[method]("opt", "user-1")).toBe(updated);
    expect(options.updateParticipant).toHaveBeenCalledWith("opt", operator, "user-1");
  });

  it("vote de una opción inexistente lanza NotFoundError", async () => {
    const { service, options } = setup();
    options.updateParticipant.mockResolvedValue(null);
    await expect(service.vote("opt", "user-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete borra la opción y la quita del evento", async () => {
    const { service, options, events } = setup();
    const deleted = { _id: id() };
    options.deleteById.mockResolvedValue(deleted);
    expect(await service.delete("opt")).toBe(deleted);
    expect(events.removeOption).toHaveBeenCalledWith(deleted._id);
  });

  it("delete de una opción inexistente no toca el evento", async () => {
    const { service, options, events } = setup();
    options.deleteById.mockResolvedValue(null);
    await expect(service.delete("opt")).rejects.toBeInstanceOf(NotFoundError);
    expect(events.removeOption).not.toHaveBeenCalled();
  });

  it("getMembersWhoHaventVoted devuelve los miembros sin voto en ninguna opción", async () => {
    const { service, options, events } = setup();
    const [ana, beto, caro] = [id(), id(), id()].map((_id, i) => ({ _id, name: `n${i}`, lastName: `l${i}` }));
    const optionIds = [id(), id()];
    events.findByIdWithMemberNames.mockResolvedValue({ members: [ana, beto, caro], options: optionIds });
    options.findByIds.mockResolvedValue([
      { participants: [ana._id] },
      { participants: [ana._id, caro._id] },
    ]);

    expect(await service.getMembersWhoHaventVoted("event-1")).toEqual([beto]);
    expect(options.findByIds).toHaveBeenCalledWith(optionIds);
  });

  it("getMembersWhoHaventVoted con evento inexistente lanza NotFoundError", async () => {
    const { service, events } = setup();
    events.findByIdWithMemberNames.mockResolvedValue(null);
    await expect(service.getMembersWhoHaventVoted("event-1")).rejects.toEqual(new NotFoundError("Event not found"));
  });
});
