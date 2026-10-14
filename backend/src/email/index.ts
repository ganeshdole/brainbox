import { env } from "../env.ts";
import { ConsoleEmailer } from "./console.ts";
import { ResendEmailer } from "./resend.ts";
import type { Emailer } from "./types.ts";

export type EmailDriver = "console" | "resend";
export type { Emailer, EmailMessage } from "./types.ts";

let instance: Emailer | null = null;

// Singleton emailer chosen by env (mirrors getStorage()). Unknown driver values
// fall back to console rather than crashing the process on a typo.
export function getEmailer(): Emailer {
  instance ??= env.EMAIL_DRIVER === "resend" ? new ResendEmailer() : new ConsoleEmailer();
  return instance;
}

/** Use `emailer` instead of the EMAIL_DRIVER one (SES, SMTP, ...): call it
 *  before serving. `null` goes back to the configured driver. */
export function setEmailer(emailer: Emailer | null): void {
  instance = emailer;
}
