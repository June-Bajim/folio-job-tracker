import "dotenv/config";
export function validateConfig() {
  for (const name of [
    "DATABASE_URL",
    "REDIS_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "WEB_URL",
    "EMAIL_FROM",
  ])
    if (!process.env[name])
      throw new Error(`Missing environment variable: ${name}`);
  if (!["smtp", "resend"].includes(process.env.EMAIL_PROVIDER ?? "smtp"))
    throw new Error("EMAIL_PROVIDER must be smtp or resend");
  if (process.env.EMAIL_PROVIDER === "resend" && !process.env.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY is required");
  if (process.env.NODE_ENV === "production") {
    if (
      (process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32 ||
      process.env.BETTER_AUTH_SECRET?.startsWith("replace-")
    )
      throw new Error("Set a strong BETTER_AUTH_SECRET before production");
    if (
      !process.env.WEB_URL?.startsWith("https:") ||
      !process.env.BETTER_AUTH_URL?.startsWith("https:")
    )
      throw new Error("Production requires HTTPS public URLs");
    if (process.env.EMAIL_PROVIDER !== "resend")
      throw new Error(
        "Production reminder delivery requires the Resend idempotent provider",
      );
  }
}
