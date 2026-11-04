import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { Group } from "../../../../src/models/group.js";
import { GroupRepository } from "../../../../src/modules/groups/GroupRepository.js";

const oid = () => new mongoose.Types.ObjectId();

function duplicateKeyError(field: string) {
  return Object.assign(new Error("E11000 duplicate key error"), { code: 11000, keyPattern: { [field]: 1 } });
}

function setup(codes: string[]) {
  const newCode = vi.fn(() => codes.shift() ?? "ZZZZZZZZ");
  const create = vi.spyOn(Group, "create");
  return { repository: new GroupRepository(newCode), newCode, create };
}

const data = () => {
  const user = oid();
  return { name: "Los del asado", admins: [user], members: [user] };
};

describe("GroupRepository.createWithUniqueCode", () => {
  it("crea el grupo con un código nuevo", async () => {
    const { repository, create } = setup(["K7PX2MQA"]);
    create.mockImplementation(async (doc: any) => doc);
    const input = data();
    const group = await repository.createWithUniqueCode(input);
    expect(group).toMatchObject({ ...input, code: "K7PX2MQA" });
  });

  it("si el código ya existe genera otro y reintenta", async () => {
    const { repository, create, newCode } = setup(["AAAAAAAA", "BBBBBBBB"]);
    create
      .mockRejectedValueOnce(duplicateKeyError("code"))
      .mockImplementationOnce(async (doc: any) => doc);
    const group = await repository.createWithUniqueCode(data());
    expect(group.code).toBe("BBBBBBBB");
    expect(newCode).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("después de 5 choques seguidos se rinde y propaga el error", async () => {
    const { repository, create } = setup([]);
    create.mockRejectedValue(duplicateKeyError("code"));
    await expect(repository.createWithUniqueCode(data())).rejects.toMatchObject({ code: 11000 });
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("otros errores (validación, otra clave duplicada) no se reintentan", async () => {
    const { repository, create } = setup([]);
    create.mockRejectedValueOnce(duplicateKeyError("name"));
    await expect(repository.createWithUniqueCode(data())).rejects.toMatchObject({ keyPattern: { name: 1 } });
    create.mockRejectedValueOnce(new mongoose.Error.ValidationError());
    await expect(repository.createWithUniqueCode(data())).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
