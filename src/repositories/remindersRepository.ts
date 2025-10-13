import { FilterQuery, ProjectionType, Query } from "mongoose";
import { IReminder, ObjectId } from "../models/interfaces";
import { Reminder } from "../models/reminder";
import { User } from "../models/user";

export enum ReminderType {
  eventStart = "eventStart",
  penalizationStart = "penalizationStart",
  penalizationOneWeek = "penalizationOneWeek",
}

export async function createReminder(
  eventId: ObjectId,
  type: ReminderType,
  datetime: Date
): Promise<void> {
  const reminder: IReminder = new Reminder({
    event: eventId,
    type,
    datetime,
  });
  await reminder.save();
}

export async function find<T>(
  filter?: FilterQuery<T>,
  projection?: ProjectionType<T> | null | undefined
): Promise<T[]> {
  let query = filter ? User.find<T>(filter) : User.find<T>();
  query = projection ? query.select(projection) : query;
  return await query.exec();
}

export async function findById(id: ObjectId): Promise<IReminder[]> {
  return await Reminder.find({ event: id });
}

export async function findByIdAndDelete(
  id: string | ObjectId
): Promise<Query<IReminder | null, IReminder, {}, IReminder>> {
  return await Reminder.findByIdAndDelete(id);
}

export async function deleteReminders(id: ObjectId): Promise<void> {
  try {
    await Reminder.deleteMany({ event: id });
  } catch (error) {
    console.error("Error deleting reminders:", error);
  }
}
