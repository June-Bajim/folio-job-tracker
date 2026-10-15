import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db.js";
import { sendEmail, EmailDeliveryError } from "./email.js";
import { serviceOrigin } from "../shared/urls.js";
async function sendAccountEmail(to: string, subject: string, text: string) {
  try {
    await sendEmail(to, subject, text);
  } catch (error) {
    // Provider errors contain only a status and category, never message content.
    console.error("Account email delivery failed", {
      reason: error instanceof Error ? error.name : "UnknownError",
      ...(error instanceof EmailDeliveryError
        ? { providerStatus: error.status, providerCode: error.providerCode }
        : {}),
    });
    throw new APIError("SERVICE_UNAVAILABLE", {
      code: "EMAIL_DELIVERY_UNAVAILABLE",
      message:
        "We couldn't send the email. Please try again later or contact support.",
    });
  }
}
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: serviceOrigin(process.env.BETTER_AUTH_URL, "http://localhost:4000"),
  trustedOrigins: [serviceOrigin(process.env.WEB_URL, "http://localhost:3000")],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await sendAccountEmail(
        user.email,
        "Reset your Folio password",
        `Reset your password: ${url}`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAccountEmail(
        user.email,
        "Verify your Folio email",
        `Verify your email to access Folio: ${url}`,
      );
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: {
      "/send-verification-email": { window: 60, max: 3 },
      "/sign-up/email": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  user: {
    deleteUser: { enabled: true },
    additionalFields: {
      timezone: { type: "string", defaultValue: "UTC", input: false },
    },
  },
});
