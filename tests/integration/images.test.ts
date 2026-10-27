import { describe, expect, it } from "vitest";
import { api, auth, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import { createEvent, createImage, createPurchaseReceipt, createTransferReceipt, createUser, newId } from "../helpers/fixtures.js";

describe("GET /api/images/getImage/:id", () => {
  it.each([
    ["image/png", PNG_BYTES],
    ["application/pdf", PDF_BYTES],
  ])("devuelve los bytes con Content-Type %s", async (mimetype, content) => {
    const user = await createUser();
    const id = await createImage({ mimetype, content });
    await createUser({ profilePicture: id });
    const res = await api().get(`/api/images/getImage/${id}`).set(auth(user.token)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain(mimetype);
    expect(Buffer.compare(res.body, content)).toBe(0);
  });

  it("una imagen subida se puede descargar idéntica", async () => {
    const user = await createUser();
    const upload = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("file", PNG_BYTES, { filename: "yo.png", contentType: "image/png" });
    const res = await api().get(`/api/images/getImage/${upload.body.imageId}`).set(auth(user.token));
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, PNG_BYTES)).toBe(0);
  });

  it("inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api().get(`/api/images/getImage/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No image was found." });
  });

  it("una imagen que no está asociada a nada -> 404", async () => {
    const user = await createUser();
    const id = await createImage();
    const res = await api().get(`/api/images/getImage/${id}`).set(auth(user.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No image was found." });
  });

  it("la foto de perfil de otro usuario es visible para cualquier logueado", async () => {
    const viewer = await createUser();
    const id = await createImage();
    await createUser({ profilePicture: id });
    expect((await api().get(`/api/images/getImage/${id}`).set(auth(viewer.token))).status).toBe(200);
  });

  describe.each(["compra", "transferencia"] as const)("imagen de un comprobante de %s", (kind) => {
    async function receiptImage() {
      const owner = await createUser();
      const member = await createUser();
      const outsider = await createUser();
      const event = await createEvent({ organizer: owner._id, members: [owner._id, member._id] });
      const image = await createImage();
      if (kind === "compra") {
        await createPurchaseReceipt({ event: event._id, shoppingDesignee: owner._id, amount: 10, participants: [], image });
      } else {
        await createTransferReceipt({ event: event._id, user: owner._id, amount: 10, image });
      }
      return { member, outsider, image };
    }

    it("un miembro del evento la ve", async () => {
      const { member, image } = await receiptImage();
      expect((await api().get(`/api/images/getImage/${image}`).set(auth(member.token))).status).toBe(200);
    });

    it("quien no es miembro del evento -> 403", async () => {
      const { outsider, image } = await receiptImage();
      const res = await api().get(`/api/images/getImage/${image}`).set(auth(outsider.token));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: "Access denied. The user is not a participant of the event." });
    });
  });

  it("id mal formado -> 400", async () => {
    const user = await createUser();
    const res = await api().get("/api/images/getImage/abc").set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No valid id was provided." });
  });
});
