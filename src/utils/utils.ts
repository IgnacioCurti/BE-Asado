import mongoose from "mongoose";
import { brevo } from "../config.js";
import https from "https";
import {
  IEventAmountCalculationsWithTransfers,
  ITransferInfo,
  IUser,
  IUserBalance,
} from "../models/interfaces.js";
import { Event } from "../models/event.js";
import {
  assignEventValues,
  calculateTransfersInfo,
} from "../controllers/events.js";

function sendEmail(
  email: string,
  subject: string,
  name: string,
  htmlContent: string
): Promise<void> {
  const payload: string = JSON.stringify({
    sender: {
      name: "FoodSpot",
      email: "food-spot-no-reply@5865554.brevosend.com",
    },
    to: [{ email, name }],
    subject,
    htmlContent,
  });

  const byteLength: number = Buffer.byteLength(payload, "utf8");

  const options: any = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "api-key": brevo.apiKey,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": byteLength,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(brevo.url, options, (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Brevo error: ${res.statusCode}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload, "utf8");
    req.end();
  });
}

function isValidId(id: string): boolean {
  if (mongoose.Types.ObjectId.isValid(id)) {
    if (String(new mongoose.Types.ObjectId(id)) == id) {
      return true;
    }
  }
  return false;
}

async function getEventsDebtors(eventId: string): Promise<IUser[]> {
  const event: IEventAmountCalculationsWithTransfers | null =
    await Event.findById(eventId).populate([
      {
        path: "purchaseReceipts",
        populate: [
          {
            path: "shoppingDesignee",
            model: "User",
          },
          {
            path: "participants",
            model: "User",
          },
        ],
      },
      {
        path: "members",
        model: "User",
      },
      {
        path: "transferReceipts",
        populate: {
          path: "user",
          model: "User",
        },
      },
    ]);

  if (!event) {
    throw new Error(`Event with ID ${eventId} not found.`);
  }

  const userBalances: IUserBalance[] = assignEventValues(
    event.purchaseReceipts
  );
  const transferInfo: ITransferInfo[] = calculateTransfersInfo(userBalances);
  const expectedTransfers: ITransferInfo[] = transferInfo.filter(
    (t) => t.receiver !== null
  );

  const debtors: IUser[] = expectedTransfers
    .filter((transfer) => {
      const receipt = event.transferReceipts.find((r) =>
        r.user._id.equals(transfer.userId)
      );
      return !receipt || !receipt.hasPaid;
    })
    .map((transfer) =>
      event.members.find((member) => member._id.equals(transfer.userId))
    )
    .filter((user): user is IUser => user !== undefined);
  return debtors;
}

export { isValidId, sendEmail, getEventsDebtors };
