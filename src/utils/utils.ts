import mongoose from "mongoose";
import { brevo } from "../config";
import { request } from "https";
import { createObjectId } from "../repositories/utils/mongoose";

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
    const req = request(brevo.url, options, (res: any) => {
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
    if (String(createObjectId(id)) == id) {
      return true;
    }
  }
  return false;
}

export { isValidId, sendEmail };
