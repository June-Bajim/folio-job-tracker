import "dotenv/config";
import nodemailer from "nodemailer";
export class EmailDeliveryError extends Error {
  constructor(
    public status: number,
    public providerCode?: string,
  ) {
    super(`Email provider returned ${status}`);
    this.name = "EmailDeliveryError";
  }
}
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  key?: string,
) {
  if (process.env.EMAIL_PROVIDER === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      const code =
        typeof details?.name === "string" && /^[a-z_]{1,80}$/.test(details.name)
          ? details.name
          : undefined;
      throw new EmailDeliveryError(response.status, code);
    }
  } else {
    await nodemailer
      .createTransport({
        host: process.env.SMTP_HOST ?? "localhost",
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: process.env.SMTP_SECURE === "true",
        connectionTimeout: 10000,
        socketTimeout: 15000,
        ...(process.env.SMTP_USER
          ? {
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              },
            }
          : {}),
      })
      .sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
        ...(key ? { messageId: `<${key}@folio.local>` } : {}),
      });
  }
}
