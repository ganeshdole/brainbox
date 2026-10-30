function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  if (!value) console.warn(`[env] ${name} not set - using fallback`);
  return value ?? fallback;
}

// AUTH_SECRET + DATABASE_URL are infra and must be present to boot.
// GOOGLE_* are optional so the server can boot for inspection before the OAuth
// client exists; Google sign-in obviously won't work until they're set.
export const env = {
  AUTH_SECRET: required("AUTH_SECRET"),
  DATABASE_URL: required("DATABASE_URL"),
  GOOGLE_ID: optional("GOOGLE_ID", ""),
  GOOGLE_SECRET: optional("GOOGLE_SECRET", ""),
  AUTH_URL: process.env.AUTH_URL ?? "http://localhost:8787/api/auth",
  DASHBOARD_ORIGIN: process.env.DASHBOARD_ORIGIN ?? "http://localhost:5173",
  PORT: Number(process.env.PORT ?? 8787),

  // Public base URL of this API - used to build local file URLs (STORAGE_DRIVER=local).
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? "http://localhost:8787",

  // Object storage. "local" writes to backend/.storage/ (dev); "r2" uses
  // Cloudflare R2. R2_* are only needed when STORAGE_DRIVER=r2.
  STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? "local",
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",

  // Transactional email. "console" logs the message (dev/test, no network);
  // "resend" sends via the Resend API. RESEND_API_KEY is only needed for the
  // resend driver. EMAIL_FROM must be an address on a Resend-verified domain.
  EMAIL_DRIVER: process.env.EMAIL_DRIVER ?? "console",
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "Brainbox <hello@mail.brainbox.sh>",
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO ?? "",

  // Origins allowed to POST the public /waitlist endpoint (the marketing site,
  // cross-origin from this API). Comma-separated; parsed into an allowlist.
  MARKETING_ORIGINS: (
    process.env.MARKETING_ORIGIN ??
    "https://brainbox.ganeshdole.com,http://localhost:5173,http://localhost:4173"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Voice-note transcription (Vercel AI SDK). Unset provider = transcription
  // off. TRANSCRIPTION_MODEL overrides the provider's default model; only the
  // selected provider's API key is needed.
  TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER ?? "",
  TRANSCRIPTION_MODEL: process.env.TRANSCRIPTION_MODEL ?? "",
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",

  // Upload caps (bytes): screenshot 5MB, audio 10MB, screen recording 50MB.
  MAX_SCREENSHOT_BYTES: Number(process.env.MAX_SCREENSHOT_BYTES ?? 5 * 1024 * 1024),
  MAX_AUDIO_BYTES: Number(process.env.MAX_AUDIO_BYTES ?? 10 * 1024 * 1024),
  MAX_VIDEO_BYTES: Number(process.env.MAX_VIDEO_BYTES ?? 50 * 1024 * 1024),
  // Session replay (gzipped rrweb events) - 15MB.
  MAX_SESSION_BYTES: Number(process.env.MAX_SESSION_BYTES ?? 15 * 1024 * 1024),

  // Dodo Payments. One key + one environment flag rather than separate
  // test/live key vars: the flag picks the API host, and a key only works
  // against its own host (a test key 401s on live and vice versa), so a
  // mismatch fails loudly on the first call instead of silently charging real
  // cards from a dev box.
  DODO_API_KEY: process.env.DODO_API_KEY ?? "",
  DODO_ENVIRONMENT: process.env.DODO_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
  // Signing secret for the webhook endpoint, from Dashboard > Developer >
  // Webhooks. Without it the webhook route rejects everything - refusing
  // unverifiable payment events is the only safe default.
  DODO_WEBHOOK_SECRET: process.env.DODO_WEBHOOK_SECRET ?? "",

  // Product ids are per-environment (the live catalogue has different ids from
  // test), so they are configuration, not constants.
  DODO_PRODUCT_PRO_MONTHLY: process.env.DODO_PRODUCT_PRO_MONTHLY ?? "",
  DODO_PRODUCT_PRO_ANNUAL: process.env.DODO_PRODUCT_PRO_ANNUAL ?? "",
  DODO_PRODUCT_BUSINESS_MONTHLY: process.env.DODO_PRODUCT_BUSINESS_MONTHLY ?? "",
  DODO_PRODUCT_BUSINESS_ANNUAL: process.env.DODO_PRODUCT_BUSINESS_ANNUAL ?? "",

  // GitHub App. All optional: unset = the GitHub section answers 503. The key
  // is PKCS#8 PEM, raw or base64 (`openssl pkcs8 -topk8 -nocrypt -in app.pem | base64`).
  GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? "",
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG ?? "",
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY ?? "",
  // OAuth client of the same app: proves the installing user owns the install.
  GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID ?? "",
  GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? "",

  // Accounts allowed past the paywall without a subscription (ours). Kept in
  // env rather than the codebase so access can be granted or revoked without a
  // deploy, and so no personal address is committed.
  BILLING_EXEMPT_EMAILS: (process.env.BILLING_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Kill switch for the paywall: "true" treats every Account as exempt, so
  // nobody is asked to pay. For running before payments are live; checkout
  // and webhooks still work, they are just never required.
  BILLING_DISABLED: process.env.BILLING_DISABLED === "true",
} as const;
