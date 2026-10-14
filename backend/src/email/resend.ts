import { Resend } from "resend";

import type { Emailer, EmailMessage } from "./types.ts";

export interface ResendOptions {
  apiKey: string;
  /** An address on a Resend-verified domain, e.g. "Brainbox <hello@mail.example.com>". */
  from: string;
}

// Prod driver. Throws on a provider error so the route can record delivery status.
export class ResendEmailer implements Emailer {
  private readonly client: Resend;
  private readonly from: string;

  constructor(options: ResendOptions) {
    if (!options.apiKey) {
      throw new Error("EMAIL_DRIVER=resend requires RESEND_API_KEY");
    }
    this.client = new Resend(options.apiKey);
    this.from = options.from;
  }

  async send(msg: EmailMessage): Promise<{ id: string | null }> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    });
    if (error) throw new Error(`Resend send failed: ${error.message}`);
    return { id: data?.id ?? null };
  }
}
