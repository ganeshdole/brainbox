import { env } from "../env.ts";
import { ConsoleEmailer } from "./console.ts";
import { ResendEmailer } from "./resend.ts";
import type { Emailer } from "./types.ts";

export type EmailDriver = "console" | "resend";
export { ConsoleEmailer } from "./console.ts";
export { ResendEmailer, type ResendOptions } from "./resend.ts";
export type { Emailer, EmailMessage } from "./types.ts";

let instance: Emailer | null = null;

// The env-built app's emailer, chosen by EMAIL_DRIVER (mirrors getStorage()).
// Unknown driver values fall back to console rather than crashing the process
// on a typo.
export function getEmailer(): Emailer {
  instance ??=
    env.EMAIL_DRIVER === "resend"
      ? new ResendEmailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
      : new ConsoleEmailer();
  return instance;
}

/**
 * Use `emailer` instead of the EMAIL_DRIVER one (SES, SMTP, ...) in the
 * env-built app: call it before serving. `null` goes back to the configured
 * driver.
 * @deprecated Pass `emailer` to `createApp()` instead.
 */
export function setEmailer(emailer: Emailer | null): void {
  instance = emailer;
}
