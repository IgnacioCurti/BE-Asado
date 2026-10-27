import { describe, expect, it } from "vitest";
import { api, auth, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import { createImage, createUser, newId } from "../helpers/fixtures.js";

describe("GET /api/images/getImage/:id", () => {
  it.each([
    ["image/png", PNG_BYTES],
    ["application/pdf", PDF_BYTES],
  ])("devuelve los bytes con Content-Type %s", async (mimetype, content) => {
    const user = await createUser();
    const id = await createImage({ mimetype, content });
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

  it("[comportamiento actual] inexistente -> 400 (no 404)", async () => {
    const user = await createUser();
    const res = await api().get(`/api/images/getImage/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No image was found." });
  });

  it("id mal formado -> 400", async () => {
    const user = await createUser();
    const res = await api().get("/api/images/getImage/abc").set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No valid id was provided." });
  });
});
