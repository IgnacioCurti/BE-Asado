/**
 * Reglas de validación y defaults de los schemas. No necesitan base de datos
 * (validateSync). Al migrar de ORM estas reglas deben quedar replicadas en la
 * nueva capa de validación; los mensajes de error de Mongoose no se fijan.
 */
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { User } from "../../../src/models/user.js";
import { Event } from "../../../src/models/event.js";
import { Rating } from "../../../src/models/rating.js";
import { Reminder } from "../../../src/models/reminder.js";
import { TransferReceipt } from "../../../src/models/transferReceipt.js";
import { PurchaseReceipt } from "../../../src/models/purchaseReceipt.js";
import { Option } from "../../../src/models/option.js";
import { Image } from "../../../src/models/image.js";

const oid = () => new mongoose.Types.ObjectId();

function errorsOf(doc: mongoose.Document): string[] {
  const error = doc.validateSync();
  return error ? Object.keys(error.errors).sort() : [];
}

describe("User schema", () => {
  const valid = () => ({
    name: "Ana",
    email: "ana@endava.com",
    password: "hash",
    specialDiet: [],
  });

  it("un usuario mínimo es válido", () => {
    expect(errorsOf(new User(valid()))).toEqual([]);
  });

  it("name, email y password son obligatorios", () => {
    expect(errorsOf(new User({ specialDiet: [] }))).toEqual(["email", "name", "password"]);
  });

  it("aplica los defaults", () => {
    const user = new User(valid());
    expect(user.lastName).toBeUndefined();
    expect(user.verificationCode).toBeNull();
    expect(user.cbu).toBeNull();
    expect(user.alias).toBeNull();
    expect(user.profilePicture).toBeNull();
    expect([...user.specialDiet]).toEqual([]);
    expect(user.notifications).toEqual({
      newEvent: false,
      eventStart: false,
      penalizationStart: false,
      penalizationOneWeek: false,
    });
  });

  describe("email", () => {
    it.each([
      "ana@endava.com",
      "ana.perez+tag@endava.com",
      "ana@gmail.com",
      "ana@mail.endava.com",
      "ana@ENDAVA.COM",
    ])("acepta %s (cualquier dominio)", (email) => {
      expect(errorsOf(new User({ ...valid(), email }))).toEqual([]);
    });

    it.each([
      ["sin arroba", "anaendava.com"],
      ["dos arrobas", "ana@x@endava.com"],
      ["sin parte local", "@endava.com"],
      ["dominio sin punto", "ana@endava"],
      ["con espacios", "ana perez@endava.com"],
      ["string vacío", ""],
    ])("rechaza %s", (_label, email) => {
      expect(errorsOf(new User({ ...valid(), email }))).toContain("email");
    });

    it("el mensaje de error es genérico", () => {
      const error = new User({ ...valid(), email: "ana@endava" }).validateSync();
      expect(error?.errors.email.message).toBe("ana@endava is not a valid email.");
    });
  });

  it("alternativeEmail ya no es parte del schema: se ignora", () => {
    const user = new User({ ...valid(), alternativeEmail: "ana@gmail.com" });
    expect(errorsOf(user)).toEqual([]);
    expect(user.toObject()).not.toHaveProperty("alternativeEmail");
  });

  describe("specialDiet", () => {
    it("acepta las 4 dietas válidas, sin importar mayúsculas", () => {
      const specialDiet = ["celiac", "HYPERTENSIVE", "Vegan", "vegetarian"];
      const user = new User({ ...valid(), specialDiet });
      expect(errorsOf(user)).toEqual([]);
      expect([...user.specialDiet]).toEqual(specialDiet); // no normaliza
    });

    it("rechaza dietas desconocidas", () => {
      expect(errorsOf(new User({ ...valid(), specialDiet: ["vegan", "keto"] }))).toEqual(["specialDiet"]);
    });

    it("si no se envía queda como [] y es válido", () => {
      const { specialDiet: _omit, ...rest } = valid();
      expect(errorsOf(new User(rest))).toEqual([]);
    });
  });

  it("generateAuthToken firma { _id, email } con JWTPRIVATEKEY y sin vencimiento", () => {
    const user = new User(valid());
    const decoded = jwt.verify(user.generateAuthToken(), process.env.JWTPRIVATEKEY as string) as any;
    expect(decoded._id).toBe(user._id.toString());
    expect(decoded.email).toBe("ana@endava.com");
    expect(decoded.exp).toBeUndefined();
    expect(Object.keys(decoded).sort()).toEqual(["_id", "email", "iat"]);
  });

  it("isValidPassword compara contra el hash bcrypt", async () => {
    const user = new User({ ...valid(), password: await bcrypt.hash("Secret123!", 4) });
    await expect(user.isValidPassword("Secret123!")).resolves.toBe(true);
    await expect(user.isValidPassword("otra")).resolves.toBe(false);
  });

  it("isValidPassword propaga el error si no hay password para comparar", async () => {
    const user = new User({ ...valid(), password: await bcrypt.hash("x", 4) });
    await expect(user.isValidPassword(undefined as unknown as string)).rejects.toThrow();
  });
});

describe("Event schema", () => {
  const valid = () => ({
    title: "Asado",
    datetime: new Date("2030-01-01T20:00:00Z"),
    description: "desc",
    memberLimit: 10,
    organizer: oid(),
  });

  it("un evento mínimo es válido", () => {
    expect(errorsOf(new Event(valid()))).toEqual([]);
  });

  it("title, datetime, description, memberLimit y organizer son obligatorios", () => {
    expect(errorsOf(new Event({}))).toEqual(["datetime", "description", "memberLimit", "organizer", "title"]);
  });

  it("aplica los defaults", () => {
    const event = new Event(valid());
    expect(event.state).toBe("available");
    expect([...event.members]).toEqual([]);
    expect(event.chef).toBeNull();
    // shoppingDesignee declara default null, pero Mongoose inicializa los arrays como []
    expect([...(event.shoppingDesignee as any)]).toEqual([]);
    expect([...event.transferReceipts]).toEqual([]);
    expect([...event.purchaseReceipts]).toEqual([]);
    expect([...event.ratings]).toEqual([]);
    expect([...event.options]).toEqual([]);
    expect(event.isPrivate).toBe(false);
    expect(event.penalization).toBeNull();
    expect(event.penalizationStartDate).toBeUndefined();
  });

  it.each(["available", "closed", "readyforpayment", "cancelled", "finished", "CLOSED", "ReadyForPayment"])(
    "acepta el estado %s (sin importar mayúsculas) y lo guarda en minúsculas",
    (state) => {
      const event = new Event({ ...valid(), state });
      expect(errorsOf(event)).toEqual([]);
      expect(event.state).toBe(state.toLowerCase());
    }
  );

  it.each(["open", "ready_for_payment", "", " closed"])("rechaza el estado %j", (state) => {
    expect(errorsOf(new Event({ ...valid(), state }))).toContain("state");
  });

  it("castea strings numéricos y fechas ISO", () => {
    const event = new Event({ ...valid(), memberLimit: "8", datetime: "2030-05-01T10:00:00.000Z" });
    expect(errorsOf(event)).toEqual([]);
    expect(event.memberLimit).toBe(8);
    expect(event.datetime).toEqual(new Date("2030-05-01T10:00:00.000Z"));
  });

  it.each([0, -3])("rechaza memberLimit %d (mínimo 1)", (memberLimit) => {
    expect(errorsOf(new Event({ ...valid(), memberLimit }))).toEqual(["memberLimit"]);
  });

  it("rechaza una penalización negativa y acepta 0", () => {
    expect(errorsOf(new Event({ ...valid(), penalization: -1 }))).toEqual(["penalization"]);
    expect(errorsOf(new Event({ ...valid(), penalization: 0 }))).toEqual([]);
  });

  it("rechaza memberLimit no numérico y fechas inválidas", () => {
    expect(errorsOf(new Event({ ...valid(), memberLimit: "diez", datetime: "no-es-fecha" }))).toEqual([
      "datetime",
      "memberLimit",
    ]);
  });
});

describe("Rating schema", () => {
  it.each([1, 2, 3, 4, 5, "3"])("acepta score %j", (score) => {
    expect(errorsOf(new Rating({ score, user: oid() }))).toEqual([]);
  });

  it.each([0, 6, -1, 2.5, "diez"])("rechaza score %j", (score) => {
    expect(errorsOf(new Rating({ score, user: oid() }))).toEqual(["score"]);
  });

  it("score es obligatorio; user es opcional", () => {
    expect(errorsOf(new Rating({}))).toEqual(["score"]);
    expect(errorsOf(new Rating({ score: 4 }))).toEqual([]);
  });
});

describe("Reminder schema", () => {
  it.each(["newEvent", "eventStart", "penalizationStart", "penalizationOneWeek"])("acepta el tipo %s", (type) => {
    expect(errorsOf(new Reminder({ event: oid(), datetime: new Date(), type }))).toEqual([]);
  });

  it.each(["eventstart", "newevent", ""])("rechaza el tipo %j (sensible a mayúsculas)", (type) => {
    expect(errorsOf(new Reminder({ event: oid(), datetime: new Date(), type }))).toEqual(["type"]);
  });

  it("event, datetime y type son obligatorios", () => {
    expect(errorsOf(new Reminder({}))).toEqual(["datetime", "event", "type"]);
  });
});

describe("TransferReceipt schema", () => {
  it("amount, user, event y datetime son obligatorios", () => {
    expect(errorsOf(new TransferReceipt({}))).toEqual(["amount", "datetime", "event", "user"]);
  });

  it("aplica los defaults", () => {
    const receipt = new TransferReceipt({ amount: 10, user: oid(), event: oid(), datetime: new Date() });
    expect(errorsOf(receipt)).toEqual([]);
    expect(receipt.image).toBeNull();
    expect(receipt.hasPaid).toBe(false);
    expect(receipt.paymentMethod).toBeNull();
    expect(receipt.receiver).toBeNull();
    expect(receipt.description).toBeUndefined();
  });

  it("rechaza un monto negativo y acepta 0 (pago aprobado sin comprobante)", () => {
    const base = { user: oid(), event: oid(), datetime: new Date() };
    expect(errorsOf(new TransferReceipt({ ...base, amount: -1 }))).toEqual(["amount"]);
    expect(errorsOf(new TransferReceipt({ ...base, amount: 0 }))).toEqual([]);
  });
});

describe("PurchaseReceipt schema", () => {
  it("description, amount, event y shoppingDesignee son obligatorios", () => {
    expect(errorsOf(new PurchaseReceipt({}))).toEqual(["amount", "description", "event", "shoppingDesignee"]);
  });

  it("aplica los defaults", () => {
    const receipt = new PurchaseReceipt({ description: "Carne", amount: 10, event: oid(), shoppingDesignee: oid() });
    expect(errorsOf(receipt)).toEqual([]);
    expect(receipt.image).toBeNull();
    expect([...receipt.participants]).toEqual([]);
  });

  it("rechaza description vacía", () => {
    expect(
      errorsOf(new PurchaseReceipt({ description: "", amount: 10, event: oid(), shoppingDesignee: oid() }))
    ).toEqual(["description"]);
  });

  it("rechaza un monto negativo", () => {
    expect(
      errorsOf(new PurchaseReceipt({ description: "Carne", amount: -10, event: oid(), shoppingDesignee: oid() }))
    ).toEqual(["amount"]);
  });
});

describe("Option schema", () => {
  it("no tiene campos obligatorios; participants arranca vacío", () => {
    const option = new Option({});
    expect(errorsOf(option)).toEqual([]);
    expect([...option.participants]).toEqual([]);
  });

  it("rechaza participantes que no son ObjectId", () => {
    expect(errorsOf(new Option({ title: "x", participants: ["no-es-id"] }))).not.toEqual([]);
  });
});

describe("Image schema", () => {
  it("no tiene campos obligatorios", () => {
    expect(errorsOf(new Image({}))).toEqual([]);
  });
});
