/**
 * Capa de acceso a datos de los tests de integración.
 *
 * Es el ÚNICO lugar de tests/integration que conoce la persistencia (Mongoose).
 * Los tests siembran datos y verifican efectos secundarios a través de estas
 * funciones, y ejercitan la API solo por HTTP. Al migrar de base de datos u ORM
 * alcanza con reimplementar este archivo manteniendo las mismas firmas.
 */
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { vi } from "vitest";
import { User } from "../../src/models/user.js";
import { Event } from "../../src/models/event.js";
import { PurchaseReceipt } from "../../src/models/purchaseReceipt.js";
import { TransferReceipt } from "../../src/models/transferReceipt.js";
import { Rating } from "../../src/models/rating.js";
import { Option } from "../../src/models/option.js";
import { Reminder } from "../../src/models/reminder.js";
import { Image } from "../../src/models/image.js";

export const JWT_SECRET: string = process.env.JWTPRIVATEKEY as string;
export const DEFAULT_PASSWORD: string = "Secret123!";

export type Id = string;

export function newId(): Id {
  return new mongoose.Types.ObjectId().toString();
}

export function tokenFor(user: { _id: Id; email: string }): string {
  return jwt.sign({ _id: user._id, email: user.email }, JWT_SECRET);
}

// Plain objects, sin _id de Mongo: todo id que sale de acá es string.
function plain<T>(doc: unknown): T {
  return JSON.parse(JSON.stringify(doc));
}

// ---------------------------------------------------------------- users

export interface UserFixture {
  _id: Id;
  name: string;
  lastName?: string;
  email: string;
  alternativeEmail: string | null;
  password: string; // hash
  verificationCode: string | null;
  cbu: string | null;
  alias: string | null;
  specialDiet: string[];
  notifications: {
    newEvent: boolean;
    eventStart: boolean;
    penalizationStart: boolean;
    penalizationOneWeek: boolean;
  };
  profilePicture: Id | null;
  token: string;
  plainPassword: string;
}

let userCounter: number = 0;

export async function createUser(
  overrides: Partial<Omit<UserFixture, "_id" | "token" | "plainPassword">> & {
    _id?: Id;
    plainPassword?: string;
    verificationCodePlain?: string;
  } = {}
): Promise<UserFixture> {
  userCounter += 1;
  const { plainPassword = DEFAULT_PASSWORD, verificationCodePlain, ...rest } =
    overrides;
  const doc = await User.create({
    name: `User${userCounter}`,
    lastName: `Last${userCounter}`,
    email: `user${userCounter}.${Date.now()}@endava.com`,
    specialDiet: [],
    ...rest,
    password: await bcrypt.hash(plainPassword, 4),
    verificationCode: verificationCodePlain
      ? await bcrypt.hash(verificationCodePlain, 4)
      : rest.verificationCode ?? null,
  });
  const user = plain<UserFixture>(doc);
  return { ...user, token: tokenFor(user), plainPassword };
}

export async function findUser(id: Id): Promise<UserFixture | null> {
  const doc = await User.findById(id).lean();
  return doc ? plain<UserFixture>(doc) : null;
}

export async function findUserByEmail(email: string): Promise<UserFixture | null> {
  const doc = await User.findOne({ email }).lean();
  return doc ? plain<UserFixture>(doc) : null;
}

export async function countUsers(): Promise<number> {
  return User.countDocuments();
}

// ---------------------------------------------------------------- events

export type EventState =
  | "available"
  | "closed"
  | "readyforpayment"
  | "cancelled"
  | "finished";

export interface EventFixture {
  _id: Id;
  title: string;
  datetime: string;
  description: string;
  memberLimit: number;
  state: EventState | string;
  members: Id[];
  chef: Id | null;
  organizer: Id;
  shoppingDesignee: Id[];
  transferReceipts: Id[];
  purchaseReceipts: Id[];
  ratings: Id[];
  options: Id[];
  isPrivate: boolean;
  penalization: number | null;
  penalizationStartDate?: string | null;
}

export async function createEvent(
  overrides: Partial<Omit<EventFixture, "datetime" | "penalizationStartDate">> & {
    organizer: Id;
    datetime?: Date | string;
    penalizationStartDate?: Date | string | null;
  }
): Promise<EventFixture> {
  const doc = await Event.create({
    title: "Asado",
    description: "Asado de los viernes",
    datetime: new Date("2030-01-10T21:00:00.000Z"),
    memberLimit: 10,
    members: [overrides.organizer],
    ...overrides,
  });
  return plain<EventFixture>(doc);
}

/** Inserta un evento sin pasar por los defaults/validaciones del schema (simula datos legados). */
export async function insertRawEvent(raw: Record<string, unknown>): Promise<Id> {
  const _id = new mongoose.Types.ObjectId();
  await Event.collection.insertOne({ _id, ...raw });
  return _id.toString();
}

export async function findEvent(id: Id): Promise<EventFixture | null> {
  const doc = await Event.findById(id).lean();
  return doc ? plain<EventFixture>(doc) : null;
}

export async function findEventByTitle(title: string): Promise<EventFixture | null> {
  const doc = await Event.findOne({ title }).lean();
  return doc ? plain<EventFixture>(doc) : null;
}

export async function listEvents(): Promise<EventFixture[]> {
  return plain<EventFixture[]>(await Event.find().lean());
}

export async function countEvents(): Promise<number> {
  return Event.countDocuments();
}

export async function updateEvent(id: Id, changes: Record<string, unknown>): Promise<void> {
  await Event.updateOne({ _id: id }, { $set: changes });
}

// ---------------------------------------------------------------- purchase receipts

export interface PurchaseReceiptFixture {
  _id: Id;
  image: Id | null;
  description: string;
  amount: number;
  event: Id;
  shoppingDesignee: Id;
  participants: Id[];
}

/** Crea el comprobante de compra y lo agrega a event.purchaseReceipts. */
export async function createPurchaseReceipt(data: {
  event: Id;
  shoppingDesignee: Id;
  amount: number;
  participants: Id[];
  description?: string;
  image?: Id | null;
  attachToEvent?: boolean;
}): Promise<PurchaseReceiptFixture> {
  const { attachToEvent = true, ...rest } = data;
  const doc = await PurchaseReceipt.create({ description: "Compra", ...rest });
  if (attachToEvent) {
    await Event.updateOne({ _id: data.event }, { $push: { purchaseReceipts: doc._id } });
  }
  return plain<PurchaseReceiptFixture>(doc);
}

export async function findPurchaseReceipt(id: Id): Promise<PurchaseReceiptFixture | null> {
  const doc = await PurchaseReceipt.findById(id).lean();
  return doc ? plain<PurchaseReceiptFixture>(doc) : null;
}

export async function countPurchaseReceipts(): Promise<number> {
  return PurchaseReceipt.countDocuments();
}

// ---------------------------------------------------------------- transfer receipts

export interface TransferReceiptFixture {
  _id: Id;
  image: Id | null;
  description?: string;
  amount: number;
  hasPaid: boolean;
  paymentMethod: string | null;
  user: Id;
  event: Id;
  datetime: string;
  receiver: Id | null;
}

/** Crea el comprobante de transferencia y lo agrega a event.transferReceipts. */
export async function createTransferReceipt(data: {
  event: Id;
  user: Id;
  amount: number;
  hasPaid?: boolean;
  receiver?: Id | null;
  image?: Id | null;
  description?: string;
  paymentMethod?: string | null;
  datetime?: Date;
  attachToEvent?: boolean;
}): Promise<TransferReceiptFixture> {
  const { attachToEvent = true, ...rest } = data;
  const doc = await TransferReceipt.create({ datetime: new Date(), ...rest });
  if (attachToEvent) {
    await Event.updateOne({ _id: data.event }, { $push: { transferReceipts: doc._id } });
  }
  return plain<TransferReceiptFixture>(doc);
}

export async function findTransferReceipt(id: Id): Promise<TransferReceiptFixture | null> {
  const doc = await TransferReceipt.findById(id).lean();
  return doc ? plain<TransferReceiptFixture>(doc) : null;
}

export async function listTransferReceipts(): Promise<TransferReceiptFixture[]> {
  return plain<TransferReceiptFixture[]>(await TransferReceipt.find().lean());
}

export async function countTransferReceipts(): Promise<number> {
  return TransferReceipt.countDocuments();
}

// ---------------------------------------------------------------- ratings

export interface RatingFixture {
  _id: Id;
  score: number;
  user: Id;
}

/** Crea la calificación y la agrega a event.ratings. */
export async function createRating(data: { event: Id; user: Id; score: number }): Promise<RatingFixture> {
  const doc = await Rating.create({ user: data.user, score: data.score });
  await Event.updateOne({ _id: data.event }, { $push: { ratings: doc._id } });
  return plain<RatingFixture>(doc);
}

export async function findRating(id: Id): Promise<RatingFixture | null> {
  const doc = await Rating.findById(id).lean();
  return doc ? plain<RatingFixture>(doc) : null;
}

export async function countRatings(): Promise<number> {
  return Rating.countDocuments();
}

// ---------------------------------------------------------------- options

export interface OptionFixture {
  _id: Id;
  title: string;
  participants: Id[];
}

/** Crea la opción y la agrega a event.options. */
export async function createOption(data: { event: Id; title: string; participants?: Id[] }): Promise<OptionFixture> {
  const doc = await Option.create({ title: data.title, participants: data.participants ?? [] });
  await Event.updateOne({ _id: data.event }, { $push: { options: doc._id } });
  return plain<OptionFixture>(doc);
}

export async function findOption(id: Id): Promise<OptionFixture | null> {
  const doc = await Option.findById(id).lean();
  return doc ? plain<OptionFixture>(doc) : null;
}

export async function countOptions(): Promise<number> {
  return Option.countDocuments();
}

// ---------------------------------------------------------------- reminders

export type ReminderType = "eventStart" | "penalizationStart" | "penalizationOneWeek";

export interface ReminderFixture {
  _id: Id;
  event: Id;
  datetime: string;
  type: ReminderType;
}

export async function createReminder(data: { event: Id; datetime: Date; type: ReminderType }): Promise<ReminderFixture> {
  return plain<ReminderFixture>(await Reminder.create(data));
}

export async function findReminders(eventId: Id): Promise<ReminderFixture[]> {
  return plain<ReminderFixture[]>(await Reminder.find({ event: eventId }).lean());
}

export async function remindersByType(eventId: Id): Promise<Partial<Record<ReminderType, ReminderFixture[]>>> {
  const result: Partial<Record<ReminderType, ReminderFixture[]>> = {};
  for (const reminder of await findReminders(eventId)) {
    (result[reminder.type] ??= []).push(reminder);
  }
  return result;
}

export async function countReminders(): Promise<number> {
  return Reminder.countDocuments();
}

// ---------------------------------------------------------------- images

export interface ImageFixture {
  _id: Id;
  name: string;
  mimetype: string;
  image: Buffer;
}

export async function createImage(data: { name?: string; mimetype?: string; content?: Buffer } = {}): Promise<Id> {
  const doc = await Image.create({
    name: data.name ?? "photo_1.png",
    mimetype: data.mimetype ?? "image/png",
    image: data.content ?? Buffer.from("fake-png-bytes"),
  });
  return doc._id.toString();
}

export async function findImage(id: Id): Promise<ImageFixture | null> {
  const doc = await Image.findById(id);
  if (!doc) return null;
  return { _id: doc._id.toString(), name: doc.name, mimetype: doc.mimetype as string, image: Buffer.from(doc.image) };
}

export async function countImages(): Promise<number> {
  return Image.countDocuments();
}

// ---------------------------------------------------------------- fallas

/** Hace fallar toda lectura/consulta a la base hasta el final del test (restoreMocks la deshace). */
export function simulateDatabaseFailure(message: string): void {
  vi.spyOn(mongoose.Query.prototype, "exec").mockRejectedValue(new Error(message));
}
