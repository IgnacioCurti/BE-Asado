import { brevo } from "../config.js";
import https from "https";
import { isValidId } from "../core/validation/isValidId.js";

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

export { isValidId, sendEmail };
