import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { api, auth, JPEG_BYTES, PDF_BYTES, PNG_BYTES } from "../helpers/api.js";
import {
  countImages,
  countUsers,
  createEvent,
  createImage,
  createUser,
  findEvent,
  findImage,
  findUser,
  findUserByEmail,
  newId,
} from "../helpers/fixtures.js";

const VALID_PASSWORD = "Secret123!";

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ana",
    lastName: "Pérez",
    email: "ana.perez@endava.com",
    password: VALID_PASSWORD,
    specialDiet: ["vegan"],
    ...overrides,
  };
}

describe("GET /api/users/getUsers", () => {
  it("devuelve todos los usuarios sin password ni verificationCode", async () => {
    const ana = await createUser({ name: "Ana", verificationCodePlain: "123456" });
    await createUser({ name: "Beto" });

    const res = await api().get("/api/users/getUsers").set(auth(ana.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const user of res.body) {
      expect(user).not.toHaveProperty("password");
      expect(user).not.toHaveProperty("verificationCode");
    }
    expect(res.body.find((u: any) => u._id === ana._id)).toEqual({
      _id: ana._id,
      __v: 0,
      name: "Ana",
      lastName: ana.lastName,
      email: ana.email,
      alternativeEmail: null,
      cbu: null,
      alias: null,
      specialDiet: [],
      notifications: { newEvent: false, eventStart: false, penalizationStart: false, penalizationOneWeek: false },
      profilePicture: null,
    });
  });
});

describe("GET /api/users/getUserById/:id", () => {
  it("devuelve el usuario sin datos sensibles", async () => {
    const me = await createUser();
    const other = await createUser({ cbu: "0000003100010000000001", alias: "beto.mp" });
    const res = await api().get(`/api/users/getUserById/${other._id}`).set(auth(me.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: other._id, email: other.email, cbu: other.cbu, alias: other.alias });
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("verificationCode");
  });

  it("inexistente -> 404", async () => {
    const me = await createUser();
    const res = await api().get(`/api/users/getUserById/${newId()}`).set(auth(me.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The user with the given ID was not found." });
  });

  it("[comportamiento actual] id mal formado -> 500 (CastError)", async () => {
    const me = await createUser();
    const res = await api().get("/api/users/getUserById/abc").set(auth(me.token));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/users/register", () => {
  it("crea el usuario con la contraseña hasheada y responde 201", async () => {
    const res = await api().post("/api/users/register").send(registerBody());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      _id: expect.any(String),
      name: "Ana",
      lastName: "Pérez",
      email: "ana.perez@endava.com",
      specialDiet: ["vegan"],
      alternativeEmail: null,
      cbu: null,
      alias: null,
      profilePicture: null,
      verificationCode: null,
      notifications: { newEvent: false, eventStart: false, penalizationStart: false, penalizationOneWeek: false },
    });

    const stored = await findUserByEmail("ana.perez@endava.com");
    expect(stored).not.toBeNull();
    expect(stored!.password).not.toBe(VALID_PASSWORD);
    expect(await bcrypt.compare(VALID_PASSWORD, stored!.password)).toBe(true);
  });

  it("[SEGURIDAD - comportamiento actual] la respuesta incluye el hash de la contraseña", async () => {
    const res = await api().post("/api/users/register").send(registerBody());
    expect(res.body.password).toMatch(/^\$2[aby]\$10\$/);
  });

  it("ignora verificationCode, profilePicture y _id del body", async () => {
    const image = newId();
    const forcedId = newId();
    const res = await api()
      .post("/api/users/register")
      .send(registerBody({ verificationCode: "hash-falso", profilePicture: image, _id: forcedId }));
    expect(res.status).toBe(201);
    expect(res.body._id).not.toBe(forcedId);
    const saved = await findUserByEmail("ana.perez@endava.com");
    expect(saved!.verificationCode).toBeNull();
    expect(saved!.profilePicture).toBeNull();
  });

  it("guarda el email en minúsculas", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ email: "Ana.Perez@ENDAVA.com" }));
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("ana.perez@endava.com");
  });

  it("el usuario recién registrado puede loguearse", async () => {
    await api().post("/api/users/register").send(registerBody());
    const res = await api().post("/api/login").send({ email: "ana.perez@endava.com", password: VALID_PASSWORD });
    expect(res.status).toBe(200);
  });

  it("acepta campos opcionales (cbu, alias, alternativeEmail, notifications)", async () => {
    const res = await api()
      .post("/api/users/register")
      .send(
        registerBody({
          cbu: "0000003100010000000001",
          alias: "ana.mp",
          alternativeEmail: "ana@gmail.com",
          notifications: { newEvent: true, eventStart: true },
        })
      );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cbu: "0000003100010000000001",
      alias: "ana.mp",
      alternativeEmail: "ana@gmail.com",
      notifications: { newEvent: true, eventStart: true, penalizationStart: false, penalizationOneWeek: false },
    });
  });

  it("email ya registrado (sin importar mayúsculas) -> 400", async () => {
    await createUser({ email: "ana.perez@endava.com" });
    const res = await api().post("/api/users/register").send(registerBody({ email: "ANA.PEREZ@endava.com" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "User already registered" });
    expect(await countUsers()).toBe(1);
  });

  it.each([
    ["menos de 8 caracteres", "Ab1!xyz"],
    ["sin minúsculas", "ABCDEFG1!"],
    ["sin mayúsculas", "abcdefg1!"],
    ["sin números", "Abcdefgh!"],
    ["sin caracteres especiales", "Abcdefgh1"],
    ["con mayúscula solo no-ASCII (Ñ no cuenta)", "Ñandú123$"],
  ])("contraseña %s -> 400", async (_label, password) => {
    const res = await api().post("/api/users/register").send(registerBody({ password }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Password doesn't match the requirements." });
    expect(await countUsers()).toBe(0);
  });

  it.each(["Abcdefg1_", "Abcdef 1x", "Ñandú123$A", "A1!aaaaa"])("acepta la contraseña %j", async (password) => {
    const res = await api().post("/api/users/register").send(registerBody({ password }));
    expect(res.status).toBe(201);
  });

  it("un email de cualquier dominio se puede registrar", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ email: "ana@gmail.com" }));
    expect(res.status).toBe(201);
    expect(res.body.email).toBe("ana@gmail.com");
  });

  it("[comportamiento actual] email con formato inválido -> 500 con el mensaje de validación", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ email: "ana@gmail" }));
    expect(res.status).toBe(500);
    expect(res.body.message).toContain("ana@gmail is not a valid email.");
    expect(await countUsers()).toBe(0);
  });

  it("[comportamiento actual] dieta inválida -> 500", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ specialDiet: ["keto"] }));
    expect(res.status).toBe(500);
    expect(await countUsers()).toBe(0);
  });

  it("[comportamiento actual] sin nombre -> 500", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ name: undefined }));
    expect(res.status).toBe(500);
  });

  it("[comportamiento actual] sin email -> 500", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ email: undefined }));
    expect(res.status).toBe(500);
  });

  it("[comportamiento actual] sin password -> 400 (no cumple el patrón)", async () => {
    const res = await api().post("/api/users/register").send(registerBody({ password: undefined }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/users/editUser/:id", () => {
  it("actualiza los campos editables y responde el usuario", async () => {
    const user = await createUser({ name: "Ana", lastName: "Pérez" });
    const res = await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({
        name: "Anita",
        lastName: "Gómez",
        alternativeEmail: "ANITA@Gmail.com",
        specialDiet: ["celiac", "vegan"],
        alias: "anita.mp",
        cbu: "123",
        notifications: { newEvent: true, eventStart: false, penalizationStart: true, penalizationOneWeek: true },
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      _id: user._id,
      name: "Anita",
      lastName: "Gómez",
      alternativeEmail: "anita@gmail.com",
      specialDiet: ["celiac", "vegan"],
      alias: "anita.mp",
      cbu: "123",
      notifications: { newEvent: true, eventStart: false, penalizationStart: true, penalizationOneWeek: true },
    });
    const stored = await findUser(user._id);
    expect(stored).toMatchObject({ name: "Anita", lastName: "Gómez", alternativeEmail: "anita@gmail.com" });
  });

  it("no permite cambiar email ni password", async () => {
    const user = await createUser();
    await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({ email: "otro@endava.com", password: "Hackeada1!", specialDiet: [] })
      .expect(200);
    const stored = await findUser(user._id);
    expect(stored!.email).toBe(user.email);
    expect(stored!.password).toBe(user.password);
  });

  it("si name/lastName vienen vacíos o ausentes se conservan", async () => {
    const user = await createUser({ name: "Ana", lastName: "Pérez" });
    const res = await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({ name: "", specialDiet: [] });
    expect(res.body).toMatchObject({ name: "Ana", lastName: "Pérez" });
  });

  it("si alternativeEmail no viene, se borra (queda null)", async () => {
    const user = await createUser({ alternativeEmail: "ana@gmail.com" });
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({ specialDiet: [] });
    expect(res.body.alternativeEmail).toBeNull();
  });

  it("si alias/cbu no vienen, se borran del documento", async () => {
    const user = await createUser({ alias: "ana.mp", cbu: "123" });
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({ specialDiet: [] });
    expect(res.status).toBe(200);
    expect(res.body.alias ?? null).toBeNull();
    expect(res.body.cbu ?? null).toBeNull();
  });

  it("las notificaciones se mezclan: las que no vienen conservan su valor", async () => {
    const user = await createUser({
      notifications: { newEvent: true, eventStart: true, penalizationStart: false, penalizationOneWeek: false },
    });
    const res = await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({ specialDiet: [], notifications: { eventStart: false, penalizationOneWeek: true } });
    expect(res.body.notifications).toEqual({
      newEvent: true,
      eventStart: false,
      penalizationStart: false,
      penalizationOneWeek: true,
    });
  });

  it("si specialDiet no viene, conserva el valor actual", async () => {
    const user = await createUser({ specialDiet: ["celiac"] });
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({ name: "Otro" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Otro", specialDiet: ["celiac"] });
  });

  it("specialDiet: [] explícito la vacía", async () => {
    const user = await createUser({ specialDiet: ["celiac"] });
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({ specialDiet: [] });
    expect(res.body.specialDiet).toEqual([]);
  });

  it("[comportamiento actual] dieta inválida -> 500", async () => {
    const user = await createUser();
    const res = await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({ specialDiet: ["keto"] });
    expect(res.status).toBe(500);
  });

  it("[comportamiento actual] alternativeEmail con dos arrobas -> 500", async () => {
    const user = await createUser();
    const res = await api()
      .put(`/api/users/editUser/${user._id}`)
      .set(auth(user.token))
      .send({ specialDiet: [], alternativeEmail: "a@b@c.com" });
    expect(res.status).toBe(500);
  });

  it("[SEGURIDAD - comportamiento actual] la respuesta incluye el hash de la contraseña", async () => {
    const user = await createUser();
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({ specialDiet: [] });
    expect(res.body.password).toBe(user.password);
  });

  it("editar a otro usuario -> 403", async () => {
    const me = await createUser();
    const other = await createUser({ name: "Beto" });
    const res = await api().put(`/api/users/editUser/${other._id}`).set(auth(me.token)).send({ name: "X" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. User is trying to access other user's information." });
    expect((await findUser(other._id))!.name).toBe("Beto");
  });

  it("id mal formado -> 400", async () => {
    const me = await createUser();
    const res = await api().put("/api/users/editUser/abc").set(auth(me.token)).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Invalid ObjectID" });
  });

  it("usuario borrado con token todavía válido -> 404", async () => {
    const user = await createUser();
    await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token)).expect(200);
    const res = await api().put(`/api/users/editUser/${user._id}`).set(auth(user.token)).send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The user with the given ID was not found." });
  });
});

describe("PUT /api/users/editProfilePicture/:id", () => {
  it.each([
    ["image/png", "foto.png", PNG_BYTES],
    ["image/jpeg", "foto.jpg", JPEG_BYTES],
  ])("sube una imagen %s, la guarda y la asigna al usuario", async (mimetype, filename, bytes) => {
    const user = await createUser();
    const before = Date.now();
    const res = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("file", bytes, { filename, contentType: mimetype });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imageId: expect.any(String) });

    const image = await findImage(res.body.imageId);
    expect(image).not.toBeNull();
    expect(image!.mimetype).toBe(mimetype);
    expect(image!.image.equals(bytes)).toBe(true);
    // nombre: <nombre original sin extensión>_<timestamp><extensión>
    const [, base, timestamp, ext] = image!.name.match(/^(.*)_(\d+)(\.\w+)$/)!;
    expect(base).toBe("foto");
    expect(ext).toBe(filename.slice(filename.lastIndexOf(".")));
    expect(Number(timestamp)).toBeGreaterThanOrEqual(before);

    expect((await findUser(user._id))!.profilePicture).toBe(res.body.imageId);
  });

  it("al reemplazar la foto se borra la imagen anterior", async () => {
    const oldImage = await createImage();
    const user = await createUser({ profilePicture: oldImage });
    const res = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("file", PNG_BYTES, { filename: "nueva.png", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(await findImage(oldImage)).toBeNull();
    expect(await countImages()).toBe(1);
  });

  it.each([
    ["application/pdf", "doc.pdf", PDF_BYTES],
    ["text/plain", "a.txt", Buffer.from("hola")],
  ])("[comportamiento actual] rechaza %s con 500 (error de multer sin manejar)", async (contentType, filename, bytes) => {
    const user = await createUser();
    const res = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("file", bytes, { filename, contentType });
    expect(res.status).toBe(500);
    expect(await countImages()).toBe(0);
  });

  it("[comportamiento actual] el archivo debe venir en el campo 'file' (otro campo -> 500)", async () => {
    const user = await createUser();
    const res = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("image", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(500);
  });

  it("[comportamiento actual] un archivo de más de 5 MB se rechaza (500 de multer) y no se guarda", async () => {
    const user = await createUser();
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await api()
      .put(`/api/users/editProfilePicture/${user._id}`)
      .set(auth(user.token))
      .attach("file", big, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(500);
    expect(await countImages()).toBe(0);
  });

  it("sin archivo -> 400", async () => {
    const user = await createUser();
    const res = await api().put(`/api/users/editProfilePicture/${user._id}`).set(auth(user.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No file was uploaded." });
  });

  it("cambiar la foto de otro usuario -> 403", async () => {
    const me = await createUser();
    const other = await createUser();
    const res = await api()
      .put(`/api/users/editProfilePicture/${other._id}`)
      .set(auth(me.token))
      .attach("file", PNG_BYTES, { filename: "a.png", contentType: "image/png" });
    expect(res.status).toBe(403);
    expect(await countImages()).toBe(0);
  });
});

describe("DELETE /api/users/deleteUser/:id", () => {
  it("borra al usuario y lo devuelve", async () => {
    const user = await createUser();
    const res = await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: user._id, email: user.email });
    expect(await findUser(user._id)).toBeNull();
  });

  it("[SEGURIDAD - comportamiento actual] la respuesta incluye el hash de la contraseña", async () => {
    const user = await createUser();
    const res = await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token));
    expect(res.body.password).toBe(user.password);
  });

  it("[comportamiento actual] no borra en cascada: el usuario queda referenciado en sus eventos e imagen", async () => {
    const image = await createImage();
    const user = await createUser({ profilePicture: image });
    const event = await createEvent({ organizer: user._id, members: [user._id], shoppingDesignee: [user._id] });

    await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token)).expect(200);

    const stored = await findEvent(event._id);
    expect(stored!.members).toEqual([user._id]);
    expect(stored!.organizer).toBe(user._id);
    expect(await findImage(image)).not.toBeNull();
  });

  it("borrar a otro usuario -> 403", async () => {
    const me = await createUser();
    const other = await createUser();
    const res = await api().delete(`/api/users/deleteUser/${other._id}`).set(auth(me.token));
    expect(res.status).toBe(403);
    expect(await findUser(other._id)).not.toBeNull();
  });

  it("borrarse dos veces -> 404 la segunda", async () => {
    const user = await createUser();
    await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token)).expect(200);
    const res = await api().delete(`/api/users/deleteUser/${user._id}`).set(auth(user.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The user with the given ID was not found." });
  });
});
