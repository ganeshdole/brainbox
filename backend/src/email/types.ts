// A single transactional email. Drivers turn this into a real send (Resend) or
// a console log (dev/test). Kept intentionally small - templates produce the
// html/text, callers never hand-build provider payloads.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

// Swappable transport (mirrors the Storage interface). `id` is the provider's
// message id, and null when nothing was actually sent, as with the console
// driver: the dashboard then offers an invite's link to pass on by hand.
export interface Emailer {
  send(msg: EmailMessage): Promise<{ id: string | null }>;
}
