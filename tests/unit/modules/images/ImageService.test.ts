import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { ImageService } from "../../../../src/modules/images/ImageService.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../../src/core/errors/AppError.js";

const id = () => new mongoose.Types.ObjectId();

function setup() {
  const repos = {
    images: { findById: vi.fn(), create: vi.fn(async (data: any) => ({ _id: id(), ...data })) },
    users: { hasProfilePicture: vi.fn().mockResolvedValue(false) },
    purchaseReceipts: { findByImage: vi.fn().mockResolvedValue(null) },
    transferReceipts: { findByImage: vi.fn().mockResolvedValue(null) },
    events: { findById: vi.fn() },
    groups: { findByCoverPhoto: vi.fn().mockResolvedValue(null) },
  };
  const service = new ImageService(
    repos.images as any,
    repos.users as any,
    repos.purchaseReceipts as any,
    repos.transferReceipts as any,
    repos.events as any,
    repos.groups as any,
    () => 1700000000000
  );
  return { service, ...repos };
}

describe("ImageService.getForUser", () => {
  const imageId = String(id());
  const userId = String(id());
  const image = { mimetype: "image/png", image: Buffer.from("x") };

  it("id inválido lanza BadRequestError", async () => {
    const { service } = setup();
    await expect(service.getForUser("abc", userId)).rejects.toEqual(new BadRequestError("No valid id was provided."));
  });

  it("imagen inexistente lanza NotFoundError", async () => {
    const { service, images } = setup();
    images.findById.mockResolvedValue(null);
    await expect(service.getForUser(imageId, userId)).rejects.toEqual(new NotFoundError("No image was found."));
  });

  it("foto de perfil: la ve cualquier usuario", async () => {
    const { service, images, users } = setup();
    images.findById.mockResolvedValue(image);
    users.hasProfilePicture.mockResolvedValue(true);
    expect(await service.getForUser(imageId, userId)).toBe(image);
  });

  it("imagen sin referencias lanza NotFoundError", async () => {
    const { service, images } = setup();
    images.findById.mockResolvedValue(image);
    await expect(service.getForUser(imageId, userId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recibo de compra: la ve un miembro del evento", async () => {
    const { service, images, purchaseReceipts, events } = setup();
    const eventId = id();
    images.findById.mockResolvedValue(image);
    purchaseReceipts.findByImage.mockResolvedValue({ event: eventId });
    events.findById.mockResolvedValue({ members: [new mongoose.Types.ObjectId(userId)] });
    expect(await service.getForUser(imageId, userId)).toBe(image);
    expect(events.findById).toHaveBeenCalledWith(String(eventId));
  });

  it("recibo de transferencia: un no miembro recibe ForbiddenError", async () => {
    const { service, images, transferReceipts, events } = setup();
    images.findById.mockResolvedValue(image);
    transferReceipts.findByImage.mockResolvedValue({ event: id() });
    events.findById.mockResolvedValue({ members: [id()] });
    await expect(service.getForUser(imageId, userId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ImageService.getForUser: portadas de grupo", () => {
  const imageId = String(id());
  const userId = String(id());
  const image = { mimetype: "image/png", image: Buffer.from("x") };

  it("la ve un miembro del grupo", async () => {
    const { service, images, groups } = setup();
    images.findById.mockResolvedValue(image);
    groups.findByCoverPhoto.mockResolvedValue({ members: [new mongoose.Types.ObjectId(userId)] });
    expect(await service.getForUser(imageId, userId)).toBe(image);
    expect(groups.findByCoverPhoto).toHaveBeenCalledWith(imageId);
  });

  it("un no miembro recibe ForbiddenError con el mensaje del grupo", async () => {
    const { service, images, groups, purchaseReceipts } = setup();
    images.findById.mockResolvedValue(image);
    groups.findByCoverPhoto.mockResolvedValue({ members: [id()] });
    await expect(service.getForUser(imageId, userId)).rejects.toEqual(
      new ForbiddenError("Access denied. The user is not a member of the group.")
    );
    expect(purchaseReceipts.findByImage).not.toHaveBeenCalled();
  });
});

describe("ImageService.save", () => {
  it("guarda el archivo con nombre único y devuelve su id", async () => {
    const { service, images } = setup();
    const file = { originalname: "ticket.png", mimetype: "image/png", buffer: Buffer.from("x") } as any;
    const imageId = await service.save(file);
    expect(images.create).toHaveBeenCalledWith({
      name: "ticket_1700000000000.png",
      mimetype: "image/png",
      image: file.buffer,
    });
    expect(imageId).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it("sin archivo lanza un error genérico (500)", async () => {
    const { service } = setup();
    await expect(service.save(undefined as any)).rejects.toThrow("No file provided");
  });
});
