import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { getEmailer } from "../email/index.ts";
import { earlyAccessReservedEmail } from "../email/templates/early-access.ts";
import { env } from "../env.ts";
import type { AppEnv } from "../types.ts";

// Trim + lowercase BEFORE validating so " Foo@Bar.com " normalizes rather than
// failing z.email() on the surrounding whitespace. parsed.data.email is the
// canonical form used as the unique key.
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

// --- lightweight in-memory rate limit (per process instance) ---
// A basic bot/spam speed bump for this public, email-triggering endpoint. It is
// per-instance (multiple replicas each get their own budget) - Cloudflare
// Turnstile is the real defense and the intended follow-up.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string, now: number): boolean {
  // Opportunistic prune so the map can't grow without bound.
  if (hits.size > 10_000) {
    for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const fwd = c.req.header("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || c.req.header("cf-connecting-ip") || "unknown";
}

export const waitlist = new Hono<AppEnv>();

// Public: called cross-origin from the marketing site, no cookies. Only the
// configured marketing origins may POST here.
waitlist.use("*", cors({ origin: env.MARKETING_ORIGINS, credentials: false }));

waitlist.post("/", async (c) => {
  if (rateLimited(clientIp(c), Date.now())) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid email" }, 400);
  const email = parsed.data.email;

  const store = c.get("store");

  // Idempotent capture: a re-submitted email is a no-op (null).
  const row = await store.waitlist.add(email, "marketing");

  if (!row) return c.json({ ok: true, alreadyRegistered: true });

  // New signup: send the confirmation (best-effort, tracked). A send failure
  // must never lose the signup or 500 the request.
  const emailer = getEmailer();
  const tmpl = earlyAccessReservedEmail();
  try {
    await emailer.send({
      to: email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    });
    await store.waitlist.setEmailStatus(row.id, { status: "sent" });
  } catch (err) {
    console.error("[waitlist] confirmation email failed:", err);
    await store.waitlist
      .setEmailStatus(row.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
      .catch((dbErr: unknown) => {
        console.error("[waitlist] failed to record email failure:", dbErr);
      });
  }

  return c.json({ ok: true }, 201);
});
