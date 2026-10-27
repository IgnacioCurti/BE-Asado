import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import { countRatings, createEvent, createRating, createUser, findEvent, findRating, newId } from "../helpers/fixtures.js";

async function scenario(state = "finished") {
  const organizer = await createUser();
  const member = await createUser();
  const outsider = await createUser();
  const event = await createEvent({ organizer: organizer._id, members: [organizer._id, member._id], state });
  return { organizer, member, outsider, event };
}

describe("POST /api/ratings/createRating/:event/:user", () => {
  it.each(["closed", "readyforpayment", "finished"])("en estado %s crea la calificación y la agrega al evento", async (state) => {
    const { member, event } = await scenario(state);
    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(member.token)).send({ score: 4 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ _id: expect.any(String), score: 4, user: member._id, __v: 0 });
    expect((await findEvent(event._id))!.ratings).toEqual([res.body._id]);
  });

  it("si el usuario ya calificó, actualiza la misma calificación", async () => {
    const { member, event } = await scenario();
    const existing = await createRating({ event: event._id, user: member._id, score: 2 });

    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(member.token)).send({ score: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: existing._id, score: 5 });
    expect(await countRatings()).toBe(1);
    expect((await findEvent(event._id))!.ratings).toEqual([existing._id]);
  });

  it.each(["available", "cancelled"])("en estado %s -> 400", async (state) => {
    const { member, event } = await scenario(state);
    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(member.token)).send({ score: 4 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The event is not closed or finished." });
  });

  it("usuario que no es miembro -> 400", async () => {
    const { outsider, event } = await scenario();
    const res = await api().post(`/api/ratings/createRating/${event._id}/${outsider._id}`).set(auth(outsider.token)).send({ score: 4 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user with the given ID was not found in the event." });
  });

  it("evento inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api().post(`/api/ratings/createRating/${newId()}/${user._id}`).set(auth(user.token)).send({ score: 4 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "The event with the given ID was not found." });
  });

  it.each([0, 6, 3.5])("[comportamiento actual] score %s inválido -> 500 y no se guarda", async (score) => {
    const { member, event } = await scenario();
    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(member.token)).send({ score });
    expect(res.status).toBe(500);
    expect(await countRatings()).toBe(0);
    expect((await findEvent(event._id))!.ratings).toEqual([]);
  });

  it("[comportamiento actual] actualizar con score inválido -> 500 y conserva el anterior", async () => {
    const { member, event } = await scenario();
    const existing = await createRating({ event: event._id, user: member._id, score: 3 });
    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(member.token)).send({ score: 9 });
    expect(res.status).toBe(500);
    expect((await findRating(existing._id))!.score).toBe(3);
  });

  it("[SEGURIDAD - comportamiento actual] se puede calificar en nombre de otro miembro", async () => {
    const { organizer, member, event } = await scenario();
    const res = await api().post(`/api/ratings/createRating/${event._id}/${member._id}`).set(auth(organizer.token)).send({ score: 1 });
    expect(res.status).toBe(200);
    expect(res.body.user).toBe(member._id);
  });

  it("[comportamiento actual] id de usuario mal formado -> 500", async () => {
    const { member, event } = await scenario();
    const res = await api().post(`/api/ratings/createRating/${event._id}/abc`).set(auth(member.token)).send({ score: 4 });
    expect(res.status).toBe(500);
  });
});

describe("GET /api/ratings/getRatingFromUser/:event/:user", () => {
  it("devuelve la calificación del usuario", async () => {
    const { organizer, member, event } = await scenario();
    const rating = await createRating({ event: event._id, user: member._id, score: 5 });
    await createRating({ event: event._id, user: organizer._id, score: 1 });
    const res = await api().get(`/api/ratings/getRatingFromUser/${event._id}/${member._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ _id: rating._id, score: 5, user: member._id, __v: 0 });
  });

  it("sin calificación -> 200 con mensaje", async () => {
    const { member, event } = await scenario();
    const res = await api().get(`/api/ratings/getRatingFromUser/${event._id}/${member._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "User does not have a rating for this event." });
  });

  it("[comportamiento actual] no valida el estado del evento", async () => {
    const { member, event } = await scenario("available");
    const res = await api().get(`/api/ratings/getRatingFromUser/${event._id}/${member._id}`).set(auth(member.token));
    expect(res.status).toBe(200);
  });

  it("usuario que no es miembro -> 400", async () => {
    const { outsider, event } = await scenario();
    const res = await api().get(`/api/ratings/getRatingFromUser/${event._id}/${outsider._id}`).set(auth(outsider.token));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user with the given ID was not found in the event." });
  });

  it("evento inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api().get(`/api/ratings/getRatingFromUser/${newId()}/${user._id}`).set(auth(user.token));
    expect(res.status).toBe(404);
  });
});
