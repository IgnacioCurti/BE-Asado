import mongoose, { Document } from "mongoose";
import { Request } from "express";

export type ObjectId = mongoose.Types.ObjectId;

export interface IUser extends Document {
  _id: ObjectId;
  name: string;
  lastName?: string;
  email: string;
  alternativeEmail?: string | null;
  password: string;
  verificationCode?: string | null;
  cbu?: string | null;
  alias?: string | null;
  specialDiet: string[];
  notifications: {
    newEvent: boolean;
    eventStart: boolean;
    penalizationStart: boolean;
    penalizationOneWeek: boolean;
  };
  profilePicture?: ObjectId | null;
  generateAuthToken(): string;
  isValidPassword(password: string): Promise<boolean>;
}

export interface ISafeUser
  extends Omit<IUser, "password" | "verificationCode"> {}

export interface IUserName extends Pick<IUser, "_id" | "name" | "lastName"> {}

export interface IUserBalance {
  userId: ObjectId;
  userName: string;
  userLastName: string;
  userCbu: string;
  userAlias: string;
  totalCost: number;
}

export interface ITransferInfo {
  userId: ObjectId;
  userName: string;
  amount: number;
  receiver: {
    receiverId: ObjectId;
    receiverName: string;
    receiverLastName: string;
    receiverCbu: string;
    receiverAlias: string;
  } | null;
}

export interface IReceiptInfo {
  hasReceiptApproved: boolean;
  transferReceipt: ObjectId;
}

export interface IMemberWhoHasUploaded {
  userId: ObjectId;
  userName: string;
  userLastName: string;
  specialDiet: string[];
  transferReceipt: ObjectId | null;
  hasReceiptApproved: boolean | null;
  hasUploaded: boolean;
}

export interface ITransferReceipt extends Document {
  _id: ObjectId;
  image?: ObjectId | null;
  description?: string;
  amount: number;
  hasPaid: boolean;
  paymentMethod?: string | null;
  user: ObjectId;
  event: ObjectId;
  datetime: Date;
  receiver: ObjectId | null;
}

export interface ITransferReceiptWithUser
  extends Omit<ITransferReceipt, "user"> {
  user: IUser;
}

export interface IHasUploadedInfo {
  hasUploaded: boolean;
  hasReceiptApproved: boolean;
  transferReceipt: ObjectId | null;
}

export interface IReminder extends Document {
  _id: ObjectId;
  event: ObjectId;
  datetime: Date;
  type: string;
}

export interface IRating extends Document {
  _id: ObjectId;
  score: number;
  user: ObjectId;
}

export interface IPurchaseReceipt extends Document {
  _id: ObjectId;
  image?: ObjectId | null;
  description?: string;
  amount: number;
  event: ObjectId;
  shoppingDesignee: ObjectId;
  participants: ObjectId[];
}

export interface IPurchaseReceiptWithUsers
  extends Omit<IPurchaseReceipt, "participants" | "shoppingDesignee"> {
  participants: IUser[];
  shoppingDesignee: IUser;
}

export interface IImage extends Document {
  _id: ObjectId;
  name: string;
  mimetype?: string;
  image: Buffer;
}

export interface IEvent extends Document {
  _id: ObjectId;
  description?: string;
  title: string;
  datetime: Date;
  memberLimit: number;
  state: string;
  members: ObjectId[];
  chef?: ObjectId | null;
  organizer: ObjectId;
  shoppingDesignee?: ObjectId[] | null;
  transferReceipts: ObjectId[];
  purchaseReceipts: ObjectId[];
  ratings: ObjectId[];
  options: ObjectId[];
  isPrivate?: boolean;
  penalization?: number | null;
  penalizationStartDate?: Date | null;
}

export interface IEventWithMembersTransferReceipts
  extends Omit<IEvent, "members" | "transferReceipts"> {
  members: IUser[];
  transferReceipts: ITransferReceipt[];
}

export interface IEventWithPurchaseReceiptsPopulatedMembersTransferReceipts
  extends Omit<IEvent, "purchaseReceipts" | "members" | "transferReceipts"> {
  members: IUser[];
  transferReceipts: ITransferReceipt[];
  purchaseReceipts: IPurchaseReceiptWithUsers[];
}

export interface IPublicEventPreReduction
  extends Omit<
    IEvent,
    | "chef"
    | "shoppingDesignee"
    | "ratings"
    | "organizer"
    | "transferReceipts"
    | "purchaseReceipts"
  > {
  ratings: IRating[];
  shoppingDesignee: IUser[];
  chef: {
    name: string;
  } | null;
}

export interface IPublicEvent {
  _id: ObjectId;
  description?: string;
  title: string;
  datetime: Date;
  memberLimit: number;
  state: string;
  shoppingDesignee?: IUser[];
  isPrivate?: boolean;
  penalization?: number | null;
  penalizationStartDate?: Date | null;
  members: number;
  chef: string;
  ratings: {
    avgScore: number;
    ratingsAmount: number;
  };
}

export interface IEventPopulated
  extends Omit<
    IEvent,
    | "members"
    | "chef"
    | "organizer"
    | "shoppingDesignee"
    | "transferReceipts"
    | "purchaseReceipts"
    | "ratings"
    | "options"
  > {
  members: IEvent["members"];
  chef: IUser | null;
  organizer: IUser;
  shoppingDesignee: IUser[] | null;
  transferReceipts: ITransferReceipt[];
  purchaseReceipts: IPurchaseReceipt[];
  ratings: IRating[];
  options: IOption[];
}

export interface IEventPopulatedWithOptions extends Omit<IEvent, "options"> {
  options: IOptionPopulated[];
}

export interface IEventWithTransferReceipts
  extends Omit<IEvent, "transferReceipts"> {
  transferReceipts: ITransferReceipt[];
}

export interface IEventWithPurchaseReceipts
  extends Omit<IEvent, "purchaseReceipts"> {
  purchaseReceipts: IPurchaseReceipt[];
}

export interface IEventWithPurchaseReceiptsOptions
  extends Omit<IEvent, "purchaseReceipts" | "options"> {
  purchaseReceipts: IPurchaseReceipt[];
  options: IOption[];
}

export interface IEventWithPurchaseReceiptsPopulated
  extends Omit<IEvent, "purchaseReceipts"> {
  purchaseReceipts: IPurchaseReceiptWithUsers[];
}

export interface IEventWithMembersPurchaseReceiptsPopulated
  extends Omit<IEvent, "purchaseReceipts" | "members"> {
  purchaseReceipts: IPurchaseReceiptWithUsers[];
  members: IUser[];
}

export interface IEventWithMembers extends Omit<IEvent, "members"> {
  members: IUser[];
}

export interface IEventWithMembersTransferReceiptsPurchaseReceipts
  extends Omit<IEvent, "members" | "transferReceipts" | "purchaseReceipts"> {
  members: IUser[];
  transferReceipts: ITransferReceipt[];
  purchaseReceipts: IPurchaseReceipt[];
}

export interface IEventWithTransferReceiptsPurchaseReceiptsRatings
  extends Omit<IEvent, "ratings" | "transferReceipts" | "purchaseReceipts"> {
  ratings: IRating[];
  transferReceipts: ITransferReceipt[];
  purchaseReceipts: IPurchaseReceipt[];
}

export interface IEventAmountCalculations
  extends Omit<IEvent, "members" | "purchaseReceipts"> {
  members: IUser[];
  purchaseReceipts: IPurchaseReceiptWithUsers[];
}

export interface IEventAmountCalculationsWithTransfers
  extends Omit<IEventAmountCalculations, "transferReceipts"> {
  transferReceipts: ITransferReceiptWithUser[];
}

export interface IUserPayload {
  _id: string;
  email: string;
}

export interface IRequestWithUser extends Request {
  user?: IUserPayload;
}

export interface IOption extends Document {
  _id: ObjectId;
  title: string;
  participants: ObjectId[];
}

export interface IOptionPopulated extends Omit<IOption, "participants"> {
  participants: IUserName[];
}
