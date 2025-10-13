import "dotenv/config";

export const brevo: { apiKey: string; url: string } = {
  apiKey: process.env.BREVO_API_KEY as string,
  url: process.env.BREVO_URL as string,
};
export const adminMail: string = process.env.ADMIN_MAIL as string;

export const jwtPrivateKey: string = process.env.JWTPRIVATEKEY as string;
