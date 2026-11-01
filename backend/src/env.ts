import { isEncryptionKey } from "./store/credentials.ts";

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

/** An env var that must be one of `allowed`; unset means `fallback`. */
function oneOf<const T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name];
  if (!value) return fallback;
  const match = allowed.find((option) => option === value);
  if (!match) throw new Error(`${name} must be one of ${allowed.join(", ")}; got "${value}"`);
  return match;
}

// Where data and uploaded files live. Each driver needs only its own settings,
// checked at boot so a misconfigured deployment fails loudly.
// "custom" means the entry passes its own to setStore() / setStorage().
const DATABASE_DRIVER = oneOf("DATABASE_DRIVER", ["postgres", "convex", "custom"], "postgres");
const STORAGE_DRIVER = oneOf("STORAGE_DRIVER", ["local", "s3", "r2", "convex", "custom"], "local");
const USES_CONVEX = DATABASE_DRIVER === "convex" || STORAGE_DRIVER === "convex";

// Both S3 keys, or neither (the SDK's own credential chain). One alone would
// boot fine and then fail, or quietly sign as someone else, on the first upload.
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? "";
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "";
if (STORAGE_DRIVER === "s3" && !S3_ACCESS_KEY_ID !== !S3_SECRET_ACCESS_KEY) {
  throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use an IAM role");
}

// A key that is set but unusable would only fail at the first connect, so it
// fails the boot instead.
const INTEGRATIONS_ENCRYPTION_KEY = process.env.INTEGRATIONS_ENCRYPTION_KEY ?? "";
if (INTEGRATIONS_ENCRYPTION_KEY && !isEncryptionKey(INTEGRATIONS_ENCRYPTION_KEY)) {
  throw new Error("INTEGRATIONS_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32)");
}

// Email sign-in off leaves Google as the only way in, so it needs a client:
// without one the server would boot to a login page no one can get past.
const AUTH_EMAIL_MODE = oneOf("AUTH_EMAIL_MODE", ["link", "code", "both", "off"], "link");
if (AUTH_EMAIL_MODE === "off" && !(process.env.GOOGLE_ID && process.env.GOOGLE_SECRET)) {
  throw new Error("AUTH_EMAIL_MODE=off turns email sign-in off: set GOOGLE_ID and GOOGLE_SECRET for Google sign-in");
}

// AUTH_SECRET and the chosen store's settings are infra and must be present to
// boot. GOOGLE_* are optional so the server can boot for inspection before the
// OAuth client exists; Google sign-in obviously won't work until they're set.
export const env = {
  AUTH_SECRET: required("AUTH_SECRET"),

  // "postgres" needs DATABASE_URL. "convex" needs CONVEX_URL and the
  // BRAINBOX_SERVER_SECRET also set on the Convex deployment (convex/lib/server.ts).
  DATABASE_DRIVER,
  DATABASE_URL: DATABASE_DRIVER === "postgres" ? required("DATABASE_URL") : (process.env.DATABASE_URL ?? ""),
  CONVEX_URL: USES_CONVEX ? required("CONVEX_URL") : "",
  BRAINBOX_SERVER_SECRET: USES_CONVEX ? required("BRAINBOX_SERVER_SECRET") : "",
  GOOGLE_ID: optional("GOOGLE_ID", ""),
  GOOGLE_SECRET: optional("GOOGLE_SECRET", ""),
  AUTH_URL: process.env.AUTH_URL ?? "http://localhost:8787/api/auth",
  DASHBOARD_ORIGIN: process.env.DASHBOARD_ORIGIN ?? "http://localhost:5173",
  PORT: Number(process.env.PORT ?? 8787),

  // Public base URL of this API - used to build local file URLs (STORAGE_DRIVER=local).
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? "http://localhost:8787",

  // A built dashboard for this API to serve itself (e.g. "dashboard", relative
  // to the backend package folder). Unset: the dashboard is hosted elsewhere.
  DASHBOARD_DIR: process.env.DASHBOARD_DIR ?? "",

  // Object storage. "local" writes to backend/.storage/ (dev only); "s3" is
  // any S3-compatible store (S3_* below); "r2" is Cloudflare R2 (R2_* below);
  // "convex" uses Convex file storage (CONVEX_URL).
  STORAGE_DRIVER,
  // S3_ENDPOINT unset means AWS itself. Keys unset means the SDK's own
  // credential chain (an IAM role). S3_FORCE_PATH_STYLE=true for MinIO and
  // Supabase Storage.
  S3_BUCKET: STORAGE_DRIVER === "s3" ? required("S3_BUCKET") : "",
  S3_REGION: STORAGE_DRIVER === "s3" ? required("S3_REGION") : "",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE === "true",
  R2_ENDPOINT: STORAGE_DRIVER === "r2" ? required("R2_ENDPOINT") : "",
  R2_ACCESS_KEY_ID: STORAGE_DRIVER === "r2" ? required("R2_ACCESS_KEY_ID") : "",
  R2_SECRET_ACCESS_KEY: STORAGE_DRIVER === "r2" ? required("R2_SECRET_ACCESS_KEY") : "",
  R2_BUCKET: STORAGE_DRIVER === "r2" ? required("R2_BUCKET") : "",

  // How email sign-in works: "link" emails a one-time sign-in link, "code"
  // emails a 6-digit code typed into the dashboard (link scanners in mail
  // filters cannot use it up), "both" sends both in one email. "off" offers no
  // email sign-in at all, only Google (which then needs GOOGLE_ID/SECRET).
  AUTH_EMAIL_MODE,

  // Who may sign in, for a deployment that is one company's own. Unset:
  // anyone. Set (comma-separated, e.g. "acme.com,acme.io"): addresses on these
  // domains, plus anyone a Team invites from elsewhere (auth/allowed.ts).
  AUTH_ALLOWED_EMAIL_DOMAINS: (process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean),

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
    "https://brainbox.sh,https://www.brainbox.sh,http://localhost:5173,http://localhost:4173"
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

  // Seals stored integration credentials (Azure DevOps tokens). Optional:
  // unset = Azure DevOps answers 503. 32 bytes, base64 (`openssl rand -base64 32`).
  // Changing it makes every stored token unreadable: those connections need
  // connecting again.
  INTEGRATIONS_ENCRYPTION_KEY,
  // Azure DevOps Services unless set, e.g. to the local fake
  // (`pnpm fake:ado`, http://localhost:8790).
  AZURE_DEVOPS_URL: (process.env.AZURE_DEVOPS_URL ?? "https://dev.azure.com").replace(/\/+$/, ""),

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
