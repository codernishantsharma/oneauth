import "server-only";

export type VerificationEmailInput = {
  email: string;
  displayName?: string | null;
  verificationUrl: string;
  expiresInHours?: number;
};

export class BrevoEmailError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "BrevoEmailError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new BrevoEmailError(`Missing required email configuration: ${name}`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const apiKey = requiredEnv("BREVO_API_KEY");
  const senderEmail = requiredEnv("BREVO_SENDER_EMAIL");
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || "OneAuth";
  const recipientName = input.displayName?.trim();
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi there,";
  const greetingText = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const expiresInHours = input.expiresInHours ?? 3;
  const safeUrl = escapeHtml(input.verificationUrl);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: input.email, ...(recipientName ? { name: recipientName } : {}) }],
      subject: "Verify your OneAuth email address",
      textContent: [
        greetingText,
        "",
        "Thanks for creating a OneAuth account.",
        "Verify your email address using this link:",
        input.verificationUrl,
        "",
        `This link expires in ${expiresInHours} hours.`,
        "If you didn't create this account, you can ignore this email.",
      ].join("\n"),
      htmlContent: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717">
    <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:32px">
      <p style="font-size:12px;font-weight:700;letter-spacing:2px;color:#525252">ONEAUTH</p>
      <h1 style="font-size:24px;line-height:1.3">Verify your email</h1>
      <p>${greeting}</p>
      <p>Thanks for creating a OneAuth account. Confirm this email address to finish setting up your account.</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Verify email address</a></p>
      <p style="font-size:14px;color:#525252">This link expires in ${expiresInHours} hours. If the button doesn't work, copy this URL into your browser:</p>
      <p style="font-size:12px;overflow-wrap:anywhere"><a href="${safeUrl}" style="color:#404040">${safeUrl}</a></p>
      <hr style="border:0;border-top:1px solid #e5e5e5;margin:28px 0" />
      <p style="font-size:12px;color:#737373">If you didn't create this account, you can safely ignore this email.</p>
    </main>
  </body>
</html>`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new BrevoEmailError("Could not connect to the email delivery service.");
  });

  if (!response.ok) {
    // Do not expose Brevo's response body or credentials to the client.
    throw new BrevoEmailError("The email delivery service rejected the message.", response.status);
  }
}
