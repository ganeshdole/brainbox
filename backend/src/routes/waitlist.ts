import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { earlyAccessReservedEmail } from "../email/templates/early-access.ts";
import { requireModule } from "../store/modules.ts";
import type { AppEnv } from "../types.ts";

// Trim + lowercase BEFORE validating so " Foo@Bar.com " normalizes rather than
// failing z.email() on the surrounding whitespace. parsed.data.email is the
// canonical form used as the unique key.
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

// --- lightweight in-memory rate limit (per app instance) ---
// A basic bot/spam speed bump for this public, email-triggering endpoint. It is
// per-instance (multiple replicas each get their own budget) - Cloudflare
// Turnstile is the real defense and the intended follow-up.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

type Hits = Map<string, { count: number; resetAt: number }>;

function rateLimited(hits: Hits, ip: string, now: number): boolean {
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

/** The marketing site's early-access signup. One per app, each with its own
 *  rate limit. Mounted with the waitlist module. */
export function createWaitlistRoute(marketingOrigins: readonly string[]) {
  const hits: Hits = new Map();
  return (
    new Hono<AppEnv>()
      // Public: called cross-origin from the marketing site, no cookies. Only
      // the configured marketing origins may POST here.
      .use("*", cors({ origin: [...marketingOrigins], credentials: false }))
      .post("/", (c) => signUp(c, hits))
  );
}

async function signUp(c: Context<AppEnv>, hits: Hits) {
  if (rateLimited(hits, clientIp(c), Date.now())) {
    return c.json({ error: "Too many requests" }, 429);
  }

  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid email" }, 400);
  const email = parsed.data.email;

  const { store, emailer, options } = c.get("deps");
  const waitlist = requireModule(store, "waitlist");

  // Idempotent capture: a re-submitted email is a no-op (null).
  const row = await waitlist.add(email, "marketing");

  if (!row) return c.json({ ok: true, alreadyRegistered: true });

  // New signup: send the confirmation (best-effort, tracked). A send failure
  // must never lose the signup or 500 the request.
  const tmpl = earlyAccessReservedEmail();
  try {
    await emailer.send({
      to: email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });
    await waitlist.setEmailStatus(row.id, { status: "sent" });
  } catch (err) {
    console.error("[waitlist] confirmation email failed:", err);
    await waitlist
      .setEmailStatus(row.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
      .catch((dbErr: unknown) => {
        console.error("[waitlist] failed to record email failure:", dbErr);
      });
  }

  return c.json({ ok: true }, 201);
}
