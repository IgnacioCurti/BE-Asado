import { describe, expect, it } from "vitest";
import { sendEmail } from "../../../src/utils/utils.js";
import {
  failBrevoWithNetworkError,
  sentEmails,
  setBrevoResponseStatus,
} from "../../helpers/mailer.js";

describe("sendEmail (integración con Brevo)", () => {
  it("hace un POST a BREVO_URL con el payload esperado", async () => {
    await sendEmail("ana@endava.com", "Asunto", "Ana", "<p>Hola</p>");

    expect(sentEmails).toHaveLength(1);
    const [mail] = sentEmails;
    expect(mail.url).toBe("https://brevo.test/v3/smtp/email");
    expect(mail.method).toBe("POST");
    expect(mail.payload).toEqual({
      sender: {
        name: "FoodSpot",
        email: "food-spot-no-reply@5865554.brevosend.com",
      },
      to: [{ email: "ana@endava.com", name: "Ana" }],
      subject: "Asunto",
      htmlContent: "<p>Hola</p>",
    });
  });

  it("envía la API key y los headers de contenido", async () => {
    await sendEmail("ana@endava.com", "Asunto", "Ana", "x");

    const { headers } = sentEmails[0];
    expect(headers).toMatchObject({
      Accept: "application/json",
      "api-key": "test-brevo-api-key",
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("calcula Content-Length en bytes UTF-8 (no en caracteres)", async () => {
    await sendEmail("ana@endava.com", "Contraseña ñandú", "Ñoño", "<p>áéíóú</p>");

    const { headers, rawBody } = sentEmails[0];
    expect(headers["Content-Length"]).toBe(Buffer.byteLength(rawBody, "utf8"));
    expect(headers["Content-Length"]).toBeGreaterThan(rawBody.length);
  });

  it.each([200, 201, 202, 299])("resuelve cuando Brevo responde %i", async (status) => {
    setBrevoResponseStatus(status);
    await expect(sendEmail("a@endava.com", "s", "n", "h")).resolves.toBeUndefined();
  });

  it.each([199, 300, 400, 401, 500])("rechaza con 'Brevo error: %i' cuando Brevo responde %i", async (status) => {
    setBrevoResponseStatus(status);
    await expect(sendEmail("a@endava.com", "s", "n", "h")).rejects.toThrow(
      `Brevo error: ${status}`
    );
  });

  it("rechaza con el error de red original", async () => {
    failBrevoWithNetworkError(new Error("ECONNRESET"));
    await expect(sendEmail("a@endava.com", "s", "n", "h")).rejects.toThrow("ECONNRESET");
  });
});
