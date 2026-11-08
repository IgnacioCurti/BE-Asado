/**
 * Endpoints de grupos (GROUPS_FEATURE.md §4 a §6). Las reglas de salida que
 * dependen de los eventos del grupo (deudas, roles, baja de eventos, cascada)
 * son del paso 4.
 */
import { describe, expect, it } from "vitest";
import { api, auth } from "../helpers/api.js";
import {
  countEvents,
  countGroups,
  countImages,
  countOptions,
  countPurchaseReceipts,
  countReminders,
  createEvent,
  createOption,
  createPurchaseReceipt,
  createReminder,
  createTransferReceipt,
  findEvent,
  findOption,
  findPurchaseReceipt,
  simulateDeleteFailure,
  createGroup,
  createImage,
  createUser,
  findGroup,
  findImage,
  insertGroupsForMember,
  newId,
  uniqueGroupCode,
  UserFixture,
} from "../helpers/fixtures.js";

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

async function trio() {
  const admin = await createUser({ name: "Admin" });
  const member = await createUser({ name: "Miembro" });
  const outsider = await createUser({ name: "Afuera" });
  const group = await createGroup({ members: [admin._id, member._id], admins: [admin._id] });
  return { admin, member, outsider, group };
}

const as = (user: UserFixture) => auth(user.token);

describe("POST /api/groups/createGroup", () => {
  it("crea el grupo con el usuario del token como único admin y miembro, y un código nuevo", async () => {
    const user = await createUser();
    const res = await api().post("/api/groups/createGroup").set(as(user)).send({ name: "  Los del asado  " });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      _id: expect.any(String),
      name: "Los del asado",
      admins: [user._id],
      members: [user._id],
      coverPhotos: [],
      createdAt: expect.any(String),
    });
    expect(res.body.code).toMatch(CODE_PATTERN);
    expect(await findGroup(res.body._id)).not.toBeNull();
  });

  it("ignora admins y members del body", async () => {
    const user = await createUser();
    const other = await createUser();
    const res = await api()
      .post("/api/groups/createGroup")
      .set(as(user))
      .send({ name: "Asado", admins: [other._id], members: [other._id] });
    expect(res.body).toMatchObject({ admins: [user._id], members: [user._id] });
  });

  it("cada grupo tiene un código distinto", async () => {
    const user = await createUser();
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++)
      codes.add((await api().post("/api/groups/createGroup").set(as(user)).send({ name: `G${i}` })).body.code);
    expect(codes.size).toBe(5);
  });

  it.each([
    ["sin nombre", {}],
    ["nombre vacío", { name: "   " }],
    ["nombre que no es string", { name: 123 }],
    ["nombre de 51 caracteres", { name: "a".repeat(51) }],
  ])("%s -> 400 y no crea nada", async (_case, body) => {
    const user = await createUser();
    const res = await api().post("/api/groups/createGroup").set(as(user)).send(body);
    expect(res.status).toBe(400);
    expect(await countGroups()).toBe(0);
  });

  it("acepta un nombre de 50 caracteres", async () => {
    const user = await createUser();
    const res = await api().post("/api/groups/createGroup").set(as(user)).send({ name: "a".repeat(50) });
    expect(res.status).toBe(201);
  });

  it("un usuario que ya está en 100 grupos -> 409", async () => {
    const user = await createUser();
    await insertGroupsForMember(user._id, 100);
    const res = await api().post("/api/groups/createGroup").set(as(user)).send({ name: "Uno más" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "A user can belong to at most 100 groups." });
    expect(await countGroups()).toBe(100);
  });
});

describe("GET /api/groups/getMyGroups", () => {
  it("devuelve un resumen de los grupos del usuario, sin código ni miembros", async () => {
    const { admin, member, group } = await trio();
    const photo = await createImage();
    const mine = await createGroup({ members: [member._id], name: "Solo yo", coverPhotos: [photo] });
    await createGroup({ members: [admin._id], name: "Ajeno" });

    const res = await api().get("/api/groups/getMyGroups").set(as(member));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { _id: group._id, name: "Los del asado", coverPhotos: [], membersCount: 2, isAdmin: false },
        { _id: mine._id, name: "Solo yo", coverPhotos: [photo], membersCount: 1, isAdmin: true },
      ])
    );
    expect(res.body).toHaveLength(2);
  });

  it("sin grupos -> lista vacía", async () => {
    const user = await createUser();
    expect((await api().get("/api/groups/getMyGroups").set(as(user))).body).toEqual([]);
  });
});

describe("GET /api/groups/getGroupById/:group", () => {
  it("un miembro ve el detalle con los miembros (sin datos sensibles), admins y código", async () => {
    const { admin, member, group } = await trio();
    const res = await api().get(`/api/groups/getGroupById/${group._id}`).set(as(member));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: group._id, name: group.name, code: group.code, admins: [admin._id] });
    expect(res.body.members).toEqual([
      { _id: admin._id, name: "Admin", lastName: admin.lastName, profilePicture: null },
      { _id: member._id, name: "Miembro", lastName: member.lastName, profilePicture: null },
    ]);
  });

  it("quien no es miembro -> 403", async () => {
    const { outsider, group } = await trio();
    const res = await api().get(`/api/groups/getGroupById/${group._id}`).set(as(outsider));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not a member of the group." });
  });

  it("inexistente -> 404; id mal formado -> 400", async () => {
    const user = await createUser();
    const notFound = await api().get(`/api/groups/getGroupById/${newId()}`).set(as(user));
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ message: "The group with the given ID does not exist." });
    expect((await api().get("/api/groups/getGroupById/abc").set(as(user))).status).toBe(400);
  });
});

describe("PUT /api/groups/joinGroup", () => {
  it("se une con el código (normalizado) y recibe el detalle del grupo", async () => {
    const { outsider, group } = await trio();
    const res = await api()
      .put("/api/groups/joinGroup")
      .set(as(outsider))
      .send({ code: `  ${group.code.toLowerCase()} ` });

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(group._id);
    expect(res.body.members.map((m: any) => m._id)).toContain(outsider._id);
    expect((await findGroup(group._id))!.members).toContain(outsider._id);
    expect((await findGroup(group._id))!.admins).not.toContain(outsider._id);
  });

  it("código inexistente -> 404", async () => {
    const user = await createUser();
    const res = await api().put("/api/groups/joinGroup").set(as(user)).send({ code: uniqueGroupCode() });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "No group was found with the given code." });
  });

  it.each([{}, { code: "" }, { code: "K7PX2MQ0" }, { code: 12345678 }])("código mal formado %j -> 400", async (body) => {
    const user = await createUser();
    expect((await api().put("/api/groups/joinGroup").set(as(user)).send(body)).status).toBe(400);
  });

  it("ya es miembro -> 409", async () => {
    const { member, group } = await trio();
    const res = await api().put("/api/groups/joinGroup").set(as(member)).send({ code: group.code });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "The user is already a member of the group." });
  });

  it("grupo con 200 miembros -> 409", async () => {
    const users = await Promise.all(Array.from({ length: 200 }, () => newId()));
    const group = await createGroup({ members: users });
    const late = await createUser();
    const res = await api().put("/api/groups/joinGroup").set(as(late)).send({ code: group.code });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "The group already has 200 members." });
    expect((await findGroup(group._id))!.members).toHaveLength(200);
  });

  it("dos ingresos simultáneos con un solo lugar libre: entra uno y el otro recibe 409", async () => {
    const group = await createGroup({ members: Array.from({ length: 199 }, () => newId()) });
    const [a, b] = [await createUser(), await createUser()];
    const results = await Promise.all([
      api().put("/api/groups/joinGroup").set(as(a)).send({ code: group.code }),
      api().put("/api/groups/joinGroup").set(as(b)).send({ code: group.code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await findGroup(group._id))!.members).toHaveLength(200);
  });

  it("el mismo usuario dos veces en simultáneo queda una sola vez", async () => {
    const { outsider, group } = await trio();
    const results = await Promise.all([
      api().put("/api/groups/joinGroup").set(as(outsider)).send({ code: group.code }),
      api().put("/api/groups/joinGroup").set(as(outsider)).send({ code: group.code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await findGroup(group._id))!.members.filter((m) => m === outsider._id)).toHaveLength(1);
  });

  it("un usuario que ya está en 100 grupos -> 409", async () => {
    const { group } = await trio();
    const user = await createUser();
    await insertGroupsForMember(user._id, 100);
    const res = await api().put("/api/groups/joinGroup").set(as(user)).send({ code: group.code });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "A user can belong to at most 100 groups." });
  });
});

describe("PUT /api/groups/leaveGroup/:group", () => {
  it("un miembro sale: deja de estar en members", async () => {
    const { admin, member, group } = await trio();
    const res = await api().put(`/api/groups/leaveGroup/${group._id}`).set(as(member));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Left the group.", groupDeleted: false });
    expect(await findGroup(group._id)).toMatchObject({ members: [admin._id], admins: [admin._id] });
  });

  it("un admin sale si hay otro admin: deja members y admins", async () => {
    const { admin, member, group } = await trio();
    await api().put(`/api/groups/makeAdmin/${group._id}/${member._id}`).set(as(admin)).expect(200);
    await api().put(`/api/groups/leaveGroup/${group._id}`).set(as(admin)).expect(200);
    expect(await findGroup(group._id)).toMatchObject({ members: [member._id], admins: [member._id] });
  });

  it("el único admin con otros miembros -> 409 y no sale", async () => {
    const { admin, group } = await trio();
    const res = await api().put(`/api/groups/leaveGroup/${group._id}`).set(as(admin));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/only admin/);
    expect((await findGroup(group._id))!.members).toContain(admin._id);
  });

  it("dos admins salen a la vez: uno sale y el otro recibe 409 (nunca queda sin admin)", async () => {
    const { admin, member, group } = await trio();
    const third = await createUser();
    await api().put("/api/groups/joinGroup").set(as(third)).send({ code: group.code }).expect(200);
    await api().put(`/api/groups/makeAdmin/${group._id}/${member._id}`).set(as(admin)).expect(200);

    const results = await Promise.all([
      api().put(`/api/groups/leaveGroup/${group._id}`).set(as(admin)),
      api().put(`/api/groups/leaveGroup/${group._id}`).set(as(member)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const after = (await findGroup(group._id))!;
    expect(after.admins).toHaveLength(1);
    expect(after.members).toContain(after.admins[0]);
  });

  it("el último miembro sale: el grupo se borra con sus portadas", async () => {
    const user = await createUser();
    const photo = await createImage();
    const unrelated = await createImage();
    const group = await createGroup({ members: [user._id], coverPhotos: [photo] });

    const res = await api().put(`/api/groups/leaveGroup/${group._id}`).set(as(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Left the group. It had no other members, so it was deleted.",
      groupDeleted: true,
    });
    expect(await findGroup(group._id)).toBeNull();
    expect(await findImage(photo)).toBeNull();
    expect(await findImage(unrelated)).not.toBeNull();
    expect(await countImages()).toBe(1);
  });

  it("quien no es miembro -> 403", async () => {
    const { outsider, group } = await trio();
    expect((await api().put(`/api/groups/leaveGroup/${group._id}`).set(as(outsider))).status).toBe(403);
  });
});

describe("PUT /api/groups/leaveGroup/:group con eventos del grupo (§4.4)", () => {
  const leave = (group: { _id: string }, user: UserFixture) =>
    api().put(`/api/groups/leaveGroup/${group._id}`).set(as(user));

  it("sale de los eventos available (miembro, roles, votos y comprobantes) y sigue en los demás", async () => {
    const { admin, member, group } = await trio();
    const open = await createEvent({
      organizer: admin._id,
      group: group._id,
      members: [admin._id, member._id],
      chef: member._id,
      shoppingDesignee: [admin._id, member._id],
    });
    const option = await createOption({ event: open._id, title: "Vacío", participants: [admin._id, member._id] });
    const receipt = await createPurchaseReceipt({
      event: open._id,
      shoppingDesignee: admin._id,
      amount: 100,
      participants: [admin._id, member._id],
    });
    const closed = await createEvent({ organizer: admin._id, group: group._id, members: [admin._id, member._id], state: "closed" });
    const finished = await createEvent({
      organizer: admin._id,
      group: group._id,
      members: [admin._id, member._id],
      shoppingDesignee: [member._id],
      state: "finished",
    });
    const otherGroupEvent = await createEvent({ organizer: member._id, members: [member._id] });

    const res = await leave(group, member);

    expect(res.status).toBe(200);
    expect(await findEvent(open._id)).toMatchObject({ members: [admin._id], chef: null, shoppingDesignee: [admin._id] });
    expect((await findOption(option._id))!.participants).toEqual([admin._id]);
    expect((await findPurchaseReceipt(receipt._id))!.participants).toEqual([admin._id]);
    expect((await findEvent(closed._id))!.members).toEqual([admin._id, member._id]);
    expect(await findEvent(finished._id)).toMatchObject({ members: [admin._id, member._id], shoppingDesignee: [member._id] });
    expect((await findEvent(otherGroupEvent._id))!.members).toEqual([member._id]);
  });

  it("después de salir sigue viendo un evento terminado del que es miembro, pero no los demás del grupo", async () => {
    const { admin, member, group } = await trio();
    const finished = await createEvent({ organizer: admin._id, group: group._id, members: [admin._id, member._id], state: "finished" });
    const notMine = await createEvent({ organizer: admin._id, group: group._id, members: [admin._id] });
    await leave(group, member).expect(200);

    expect((await api().get(`/api/events/getEventById/${finished._id}`).set(as(member))).status).toBe(200);
    expect((await api().get(`/api/events/getEventById/${notMine._id}`).set(as(member))).status).toBe(403);
    expect((await api().get(`/api/events/getGroupEvents/${group._id}`).set(as(member))).status).toBe(403);
  });

  it("con deuda en un evento readyforpayment del grupo -> 409 y no sale de nada", async () => {
    const { admin, member, group } = await trio();
    const event = await createEvent({
      organizer: admin._id,
      group: group._id,
      members: [admin._id, member._id],
      shoppingDesignee: [admin._id],
      state: "readyforpayment",
    });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: admin._id, amount: 100, participants: [admin._id, member._id] });

    const res = await leave(group, member);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/pending payments/);
    expect((await findGroup(group._id))!.members).toContain(member._id);
  });

  it("con el pago aprobado puede salir", async () => {
    const { admin, member, group } = await trio();
    const event = await createEvent({
      organizer: admin._id,
      group: group._id,
      members: [admin._id, member._id],
      shoppingDesignee: [admin._id],
      state: "readyforpayment",
    });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: admin._id, amount: 100, participants: [admin._id, member._id] });
    await createTransferReceipt({ event: event._id, user: member._id, receiver: admin._id, amount: 50, hasPaid: true });

    expect((await leave(group, member)).status).toBe(200);
    expect((await findEvent(event._id))!.members).toEqual([admin._id, member._id]);
  });

  it("una deuda en un evento de otro grupo no impide salir", async () => {
    const { admin, member, group } = await trio();
    const elsewhere = await createEvent({
      organizer: admin._id,
      members: [admin._id, member._id],
      shoppingDesignee: [admin._id],
      state: "readyforpayment",
    });
    await createPurchaseReceipt({ event: elsewhere._id, shoppingDesignee: admin._id, amount: 100, participants: [admin._id, member._id] });
    expect((await leave(group, member)).status).toBe(200);
  });

  it.each([
    ["chef", "closed", (u: string) => ({ chef: u })],
    ["comprador", "closed", (u: string) => ({ shoppingDesignee: [u] })],
    ["chef", "readyforpayment", (u: string) => ({ chef: u })],
    ["comprador", "readyforpayment", (u: string) => ({ shoppingDesignee: [u] })],
  ])("siendo %s de un evento %s del grupo -> 409 y no sale", async (_role, state, role) => {
    const { admin, member, group } = await trio();
    await createEvent({
      organizer: admin._id,
      group: group._id,
      members: [admin._id, member._id],
      shoppingDesignee: [admin._id],
      state,
      ...role(member._id),
    });
    const res = await leave(group, member);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/chef or a shopping designee/);
    expect((await findGroup(group._id))!.members).toContain(member._id);
  });

  it("ser organizer de un evento activo no impide salir (§4.4.1)", async () => {
    const { admin, member, group } = await trio();
    const event = await createEvent({
      organizer: member._id,
      group: group._id,
      members: [admin._id],
      shoppingDesignee: [admin._id],
      state: "closed",
    });
    expect((await leave(group, member)).status).toBe(200);
    expect((await findEvent(event._id))!.organizer).toBe(member._id);
  });

  it("el último miembro sale: se borran los eventos del grupo con todo lo que cuelga, y no los de otros grupos", async () => {
    const user = await createUser();
    const group = await createGroup({ members: [user._id] });
    const event = await createEvent({ organizer: user._id, group: group._id, state: "finished" });
    await createOption({ event: event._id, title: "Vacío" });
    await createPurchaseReceipt({ event: event._id, shoppingDesignee: user._id, amount: 10, participants: [user._id] });
    await createReminder({ event: event._id, datetime: new Date("2030-01-01T00:00:00Z"), type: "eventStart" });
    const other = await createEvent({ organizer: user._id });

    const res = await leave(group, user);

    expect(res.body.groupDeleted).toBe(true);
    expect(await findEvent(event._id)).toBeNull();
    expect(await findEvent(other._id)).not.toBeNull();
    expect(await countEvents()).toBe(1);
    expect(await countOptions()).toBe(0);
    expect(await countPurchaseReceipts()).toBe(0);
    expect(await countReminders()).toBe(0);
  });

  it("si el borrado en cascada falla, no se borra nada (ni el grupo ni sus eventos)", async () => {
    const user = await createUser();
    const group = await createGroup({ members: [user._id] });
    const event = await createEvent({ organizer: user._id, group: group._id, state: "finished" });
    await createOption({ event: event._id, title: "Vacío" });
    simulateDeleteFailure("Option", "falla simulada");

    expect((await leave(group, user)).status).toBe(500);
    expect(await findGroup(group._id)).not.toBeNull();
    expect(await findEvent(event._id)).not.toBeNull();
    expect(await countOptions()).toBe(1);
  });
});

describe("PUT /api/groups/editGroup/:group", () => {
  it("un admin cambia el nombre", async () => {
    const { admin, group } = await trio();
    const res = await api().put(`/api/groups/editGroup/${group._id}`).set(as(admin)).send({ name: " Nuevo " });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Nuevo");
    expect((await findGroup(group._id))!.name).toBe("Nuevo");
  });

  it("solo cambia el nombre (ignora code, members y admins)", async () => {
    const { admin, member, group } = await trio();
    await api()
      .put(`/api/groups/editGroup/${group._id}`)
      .set(as(admin))
      .send({ name: "Nuevo", code: uniqueGroupCode(), members: [member._id], admins: [member._id] })
      .expect(200);
    expect(await findGroup(group._id)).toMatchObject({ code: group.code, members: group.members, admins: group.admins });
  });

  it("un miembro que no es admin -> 403", async () => {
    const { member, group } = await trio();
    const res = await api().put(`/api/groups/editGroup/${group._id}`).set(as(member)).send({ name: "X" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "Access denied. The user is not an admin of the group." });
  });

  it("nombre inválido -> 400", async () => {
    const { admin, group } = await trio();
    expect((await api().put(`/api/groups/editGroup/${group._id}`).set(as(admin)).send({ name: "" })).status).toBe(400);
    expect((await api().put(`/api/groups/editGroup/${group._id}`).set(as(admin)).send({ name: "a".repeat(51) })).status).toBe(400);
  });
});

describe("PUT /api/groups/makeAdmin/:group/:user", () => {
  it("un admin hace admin a otro miembro (idempotente)", async () => {
    const { admin, member, group } = await trio();
    for (let i = 0; i < 2; i++) {
      const res = await api().put(`/api/groups/makeAdmin/${group._id}/${member._id}`).set(as(admin));
      expect(res.status).toBe(200);
      expect(res.body.admins).toEqual([admin._id, member._id]);
    }
  });

  it("el destino no es miembro -> 400", async () => {
    const { admin, outsider, group } = await trio();
    const res = await api().put(`/api/groups/makeAdmin/${group._id}/${outsider._id}`).set(as(admin));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The user is not a member of the group." });
    expect((await findGroup(group._id))!.admins).toEqual([admin._id]);
  });

  it("un miembro que no es admin no puede nombrarse admin -> 403", async () => {
    const { member, group } = await trio();
    expect((await api().put(`/api/groups/makeAdmin/${group._id}/${member._id}`).set(as(member))).status).toBe(403);
  });

  it("id de usuario mal formado -> 400", async () => {
    const { admin, group } = await trio();
    expect((await api().put(`/api/groups/makeAdmin/${group._id}/abc`).set(as(admin))).status).toBe(400);
  });
});

describe("PUT /api/groups/regenerateCode/:group", () => {
  it("un admin genera un código nuevo; el anterior deja de servir", async () => {
    const { admin, outsider, group } = await trio();
    const res = await api().put(`/api/groups/regenerateCode/${group._id}`).set(as(admin));

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(CODE_PATTERN);
    expect(res.body.code).not.toBe(group.code);
    expect((await findGroup(group._id))!.code).toBe(res.body.code);

    expect((await api().put("/api/groups/joinGroup").set(as(outsider)).send({ code: group.code })).status).toBe(404);
    expect((await api().put("/api/groups/joinGroup").set(as(outsider)).send({ code: res.body.code })).status).toBe(200);
  });

  it("un miembro que no es admin -> 403", async () => {
    const { member, group } = await trio();
    expect((await api().put(`/api/groups/regenerateCode/${group._id}`).set(as(member))).status).toBe(403);
  });
});
