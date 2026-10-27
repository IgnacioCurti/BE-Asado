import "dotenv/config";

const REQUIRED_ENV_VARS: string[] = [
  "JWTPRIVATEKEY",
  "DATABASE_URL",
  "BREVO_API_KEY",
  "BREVO_URL",
];

// Fail at startup instead of on the first request that needs a missing value.
const missingEnvVars: string[] = REQUIRED_ENV_VARS.filter(
  (name) => !process.env[name]
);
if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

export const brevo: { apiKey: string; url: string } = {
  apiKey: process.env.BREVO_API_KEY,
  url: process.env.BREVO_URL,
};
export const adminMail: string = process.env.ADMIN_MAIL;

export const jwtPrivateKey: string = process.env.JWTPRIVATEKEY;
