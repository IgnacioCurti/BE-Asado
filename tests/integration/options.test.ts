import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { countOptions, createEvent, createOption, createUser, findEvent, findOption, newId } from "../helpers/fixtures.js";

describe("POST /api/options/createOption/:event", () => {
  it("crea la opción y la agrega al evento", async () => {
    const user = await createUser();
    const event = await createEvent({ organizer: user._id });
    const res = await api()
      .post(`/api/options/createOption/${event._id}`)
      .set(auth(user.token))
      .send({ title: "Vacío", participants: [user._id] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ _id: expect.any(String), title: "Vacío", participants: [user._id], __v: 0 });
    expect((await findEvent(event._id))!.options).toEqual([res.body._id]);
  });

  it("sin participantes arranca con []", async () => {
    const user = await createUser();
    const event = await createEvent({ organizer: user._id });
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(user.token)).send({ title: "Chori" });
    expect(res.body.participants).toEqual([]);
  });

  it("ignora campos desconocidos del body", async () => {
    const user = await createUser();
    const event = await createEvent({ organizer: user._id });
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(user.token)).send({ title: "x", extra: 1 });
    expect(res.body).not.toHaveProperty("extra");
  });

  it("[comportamiento actual] evento inexistente -> 201 y la opción queda huérfana", async () => {
    const user = await createUser();
    const res = await api().post(`/api/options/createOption/${newId()}`).set(auth(user.token)).send({ title: "x" });
    expect(res.status).toBe(201);
    expect(await countOptions()).toBe(1);
  });

  it("[comportamiento actual] participante con id inválido -> 500", async () => {
    const user = await createUser();
    const event = await createEvent({ organizer: user._id });
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(user.token)).send({ title: "x", participants: ["abc"] });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/options/editOption/:id", () => {
  it("actualiza título y participantes y devuelve la versión nueva", async () => {
    const a = await createUser();
    const b = await createUser();
    const event = await createEvent({ organizer: a._id });
    const option = await createOption({ event: event._id, title: "Vacío", participants: [a._id] });

    const res = await api()
      .put(`/api/options/editOption/${option._id}`)
      .set(auth(a.token))
      .send({ title: "Vacío y entraña", participants: [a._id, b._id] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ _id: option._id, title: "Vacío y entraña", participants: [a._id, b._id], __v: 0 });
    expect(await findOption(option._id)).toEqual({ _id: option._id, title: "Vacío y entraña", participants: [a._id, b._id], __v: 0 });
  });

  it("los campos ausentes no se modifican", async () => {
    const a = await createUser();
    const event = await createEvent({ organizer: a._id });
    const option = await createOption({ event: event._id, title: "Vacío", participants: [a._id] });
    const res = await api().put(`/api/options/editOption/${option._id}`).set(auth(a.token)).send({ participants: [] });
    expect(res.body).toMatchObject({ title: "Vacío", participants: [] });
  });

  it("inexistente -> 404", async () => {
    const a = await createUser();
    const res = await api().put(`/api/options/editOption/${newId()}`).set(auth(a.token)).send({ title: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Option not found" });
  });

  it("[comportamiento actual] id mal formado -> 500", async () => {
    const a = await createUser();
    expect((await api().put("/api/options/editOption/abc").set(auth(a.token)).send({})).status).toBe(500);
  });
});

describe("DELETE /api/options/deleteOption/:id", () => {
  it("borra la opción y la quita del evento", async () => {
    const a = await createUser();
    const event = await createEvent({ organizer: a._id });
    const keep = await createOption({ event: event._id, title: "Queda" });
    const option = await createOption({ event: event._id, title: "Se va" });

    const res = await api().delete(`/api/options/deleteOption/${option._id}`).set(auth(a.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: option._id, title: "Se va" });
    expect(await findOption(option._id)).toBeNull();
    expect((await findEvent(event._id))!.options).toEqual([keep._id]);
  });

  it("inexistente -> 404", async () => {
    const a = await createUser();
    const res = await api().delete(`/api/options/deleteOption/${newId()}`).set(auth(a.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Option not found" });
  });
});

describe("GET /api/options/getMembersWhoHaventVoted/:event", () => {
  it("devuelve los miembros que no participan de ninguna opción del evento ({_id, name, lastName})", async () => {
    const ana = await createUser({ name: "Ana" });
    const beto = await createUser({ name: "Beto" });
    const caro = await createUser({ name: "Caro" });
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id, caro._id] });
    await createOption({ event: event._id, title: "Vacío", participants: [ana._id] });
    // una opción de OTRO evento no cuenta
    const other = await createEvent({ organizer: ana._id });
    await createOption({ event: other._id, title: "Chori", participants: [beto._id] });

    const res = await api().get(`/api/options/getMembersWhoHaventVoted/${event._id}`).set(auth(ana.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      membersWhoHaventVoted: [
        { _id: beto._id, name: "Beto", lastName: beto.lastName },
        { _id: caro._id, name: "Caro", lastName: caro.lastName },
      ],
    });
  });

  it("sin opciones, nadie votó", async () => {
    const ana = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id] });
    const res = await api().get(`/api/options/getMembersWhoHaventVoted/${event._id}`).set(auth(ana.token));
    expect(res.body.membersWhoHaventVoted).toHaveLength(1);
  });

  it("si todos votaron devuelve []", async () => {
    const ana = await createUser();
    const beto = await createUser();
    const event = await createEvent({ organizer: ana._id, members: [ana._id, beto._id] });
    await createOption({ event: event._id, title: "A", participants: [ana._id] });
    await createOption({ event: event._id, title: "B", participants: [beto._id, ana._id] });
    const res = await api().get(`/api/options/getMembersWhoHaventVoted/${event._id}`).set(auth(ana.token));
    expect(res.body).toEqual({ membersWhoHaventVoted: [] });
  });

  it("evento inexistente -> 404", async () => {
    const ana = await createUser();
    const res = await api().get(`/api/options/getMembersWhoHaventVoted/${newId()}`).set(auth(ana.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Event not found" });
  });
});
