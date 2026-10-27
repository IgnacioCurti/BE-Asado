import { beforeEach } from "vitest";
import { installMailerMock } from "../helpers/mailer.js";

// Ningún test debe poder mandar mails reales a Brevo.
beforeEach(() => {
  installMailerMock();
});
