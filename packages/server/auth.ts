import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db.js";
import { sendEmail } from "./email.js";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.WEB_URL ?? "http://localhost:3000"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        "Reset your Folio password",
        `Reset your password: ${url}`,
      );
    },
  },
  user: {
    additionalFields: {
      timezone: { type: "string", defaultValue: "UTC", input: false },
    },
  },
});
