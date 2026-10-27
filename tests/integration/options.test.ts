import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { countOptions, createEvent, createOption, createUser, findEvent, findOption, newId } from "../helpers/fixtures.js";

/** Evento con organizadora, una compradora y un miembro común. */
async function votingScenario() {
  const organizer = await createUser({ name: "Orga" });
  const designee = await createUser({ name: "Compradora" });
  const member = await createUser({ name: "Miembro" });
  const outsider = await createUser({ name: "Afuera" });
  const event = await createEvent({
    organizer: organizer._id,
    members: [organizer._id, designee._id, member._id],
    shoppingDesignee: [designee._id],
  });
  return { organizer, designee, member, outsider, event };
}

describe("POST /api/options/createOption/:event", () => {
  it("el organizador crea la opción, sin votos, y la agrega al evento", async () => {
    const { organizer, event } = await votingScenario();
    const res = await api()
      .post(`/api/options/createOption/${event._id}`)
      .set(auth(organizer.token))
      .send({ title: "Vacío" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ _id: expect.any(String), title: "Vacío", participants: [], __v: 0 });
    expect((await findEvent(event._id))!.options).toEqual([res.body._id]);
  });

  it("un comprador también puede crear", async () => {
    const { designee, event } = await votingScenario();
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(designee.token)).send({ title: "Chori" });
    expect(res.status).toBe(201);
  });

  it("ignora participants del body (los votos se cargan con /vote)", async () => {
    const { organizer, member, event } = await votingScenario();
    const res = await api()
      .post(`/api/options/createOption/${event._id}`)
      .set(auth(organizer.token))
      .send({ title: "Vacío", participants: [organizer._id, member._id, "abc"] });
    expect(res.status).toBe(201);
    expect(res.body.participants).toEqual([]);
  });

  it("ignora campos desconocidos del body", async () => {
    const { organizer, event } = await votingScenario();
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(organizer.token)).send({ title: "x", extra: 1 });
    expect(res.body).not.toHaveProperty("extra");
  });

  it("un miembro que no es organizador ni comprador -> 403", async () => {
    const { member, event } = await votingScenario();
    const res = await api().post(`/api/options/createOption/${event._id}`).set(auth(member.token)).send({ title: "x" });
    expect(res.status).toBe(403);
    expect(await countOptions()).toBe(0);
  });

  it("evento inexistente -> 404 y no crea nada", async () => {
    const user = await createUser();
    const res = await api().post(`/api/options/createOption/${newId()}`).set(auth(user.token)).send({ title: "x" });
    expect(res.status).toBe(404);
    expect(await countOptions()).toBe(0);
  });
});

describe("PUT /api/options/editOption/:id", () => {
  it("renombra la opción y devuelve la versión nueva", async () => {
    const { organizer, member, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío", participants: [member._id] });

    const res = await api()
      .put(`/api/options/editOption/${option._id}`)
      .set(auth(organizer.token))
      .send({ title: "Vacío y entraña" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ _id: option._id, title: "Vacío y entraña", participants: [member._id], __v: 0 });
  });

  it("ignora participants: no permite cambiar los votos", async () => {
    const { designee, member, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío", participants: [member._id] });
    const res = await api().put(`/api/options/editOption/${option._id}`).set(auth(designee.token)).send({ participants: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "Vacío", participants: [member._id] });
  });

  it("un miembro que no es organizador ni comprador -> 403", async () => {
    const { member, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío" });
    const res = await api().put(`/api/options/editOption/${option._id}`).set(auth(member.token)).send({ title: "x" });
    expect(res.status).toBe(403);
    expect((await findOption(option._id))!.title).toBe("Vacío");
  });

  it("inexistente -> 404", async () => {
    const a = await createUser();
    const res = await api().put(`/api/options/editOption/${newId()}`).set(auth(a.token)).send({ title: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Option not found" });
  });

  it("id mal formado -> 400", async () => {
    const a = await createUser();
    expect((await api().put("/api/options/editOption/abc").set(auth(a.token)).send({})).status).toBe(400);
  });
});

describe.each([
  ["put", "vota"],
  ["delete", "quita el voto"],
] as const)("%s /api/options/vote/:id", (method, action) => {
  it(`un miembro ${action} solo por sí mismo y recibe la opción actualizada`, async () => {
    const { organizer, member, event } = await votingScenario();
    const option = await createOption({
      event: event._id,
      title: "Vacío",
      participants: method === "put" ? [organizer._id] : [organizer._id, member._id],
    });

    const res = await (api() as any)[method](`/api/options/vote/${option._id}`).set(auth(member.token));

    expect(res.status).toBe(200);
    const expected = method === "put" ? [organizer._id, member._id] : [organizer._id];
    expect(res.body.participants).toEqual(expected);
    expect((await findOption(option._id))!.participants).toEqual(expected);
  });

  it("es idempotente", async () => {
    const { member, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío", participants: method === "put" ? [member._id] : [] });
    const res = await (api() as any)[method](`/api/options/vote/${option._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body.participants).toEqual(method === "put" ? [member._id] : []);
  });

  it("quien no es miembro del evento -> 403", async () => {
    const { outsider, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío" });
    const res = await (api() as any)[method](`/api/options/vote/${option._id}`).set(auth(outsider.token));
    expect(res.status).toBe(403);
    expect((await findOption(option._id))!.participants).toEqual([]);
  });

  it("opción inexistente -> 404", async () => {
    const user = await createUser();
    const res = await (api() as any)[method](`/api/options/vote/${newId()}`).set(auth(user.token));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Option not found" });
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

  it("un miembro que no es organizador ni comprador -> 403", async () => {
    const { member, event } = await votingScenario();
    const option = await createOption({ event: event._id, title: "Vacío" });
    const res = await api().delete(`/api/options/deleteOption/${option._id}`).set(auth(member.token));
    expect(res.status).toBe(403);
    expect(await findOption(option._id)).not.toBeNull();
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
