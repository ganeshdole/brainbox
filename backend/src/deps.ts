import { DEFAULT_INGEST_LIMITS, type IngestLimits } from "@ganeshdole/brainbox-server";
import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";

import { ConsoleEmailer } from "./email/console.ts";
import type { Emailer } from "./email/types.ts";
import { createIntegrations, type Integrations, type IntegrationsOptions } from "./integrations/registry.ts";
import type { DodoSettings } from "./lib/dodo.ts";
import type { Storage } from "./storage/types.ts";
import type { AuthStore, BillingStore, Store } from "./store/types.ts";
import type { Transcriber } from "./transcription/index.ts";

/** Settings every deployment has. */
export interface AppOptions {
  /** Signs sessions and the public file links in tickets (`openssl rand -base64 32`). */
  secret: string;
  /** Where this API is reachable, e.g. `https://api.feedback.example.com`. */
  publicUrl: string;
  /** Where the dashboard is: CORS for /api, and the links in emails and tickets. */
  dashboardOrigin: string;
  /** A built dashboard for this API to serve itself, as an absolute path. */
  dashboardDir?: string;
  /** Origins allowed to POST /waitlist (the marketing site). Default none. */
  marketingOrigins?: readonly string[];
  /** Upload caps in bytes; `DEFAULT_INGEST_LIMITS` for any left out. */
  limits?: Partial<IngestLimits>;
  /** Reply-To on every email sent. */
  replyTo?: string;
}

/** Signing in to the dashboard (Auth.js). Needs a store with `auth`. */
export interface AuthOptions {
  /** Google sign-in; left out, it isn't offered. Email sign-in always is. */
  google?: { clientId: string; clientSecret: string };
  /** What a sign-in email carries: a link, a 6-digit code, or both. Default "link". */
  emailMode?: EmailSignInMode;
  /** Only addresses on these domains, plus anyone a Team invites, may sign
   *  in. Empty lets anyone in, which a store without `teams` refuses. */
  allowedEmailDomains?: readonly string[];
}

/** The paywall, over Dodo Payments. Needs a store with `billing`. */
export interface BillingOptions {
  dodo: DodoSettings;
  /** Verifies /webhooks/dodo. Without it every event is refused. */
  webhookSecret?: string;
  /** Accounts let past the paywall without paying, lower-cased. */
  exemptEmails?: readonly string[];
  /** Nobody is asked to pay; checkout and webhooks still work. */
  disabled?: boolean;
}

/** What a backend is built from: `createApp(deps)`. Only `store`, `storage`
 *  and `options` are required; each part left out turns its feature off. */
export interface AppDeps {
  /** The core, plus whichever modules it has. Routes for a module mount only
   *  when the store has it. */
  store: Store;
  storage: Storage;
  /** Default: logs each email instead of sending it. */
  emailer?: Emailer;
  /** Default: none, and reports arrive without a transcript. */
  transcriber?: Transcriber;
  /** Default: no tracker is configured. */
  integrations?: IntegrationsOptions;
  /** Default: no sign-in, so no dashboard API: only ingest, files and webhooks. */
  auth?: AuthOptions;
  /** Default: no paywall. */
  billing?: BillingOptions;
  options: AppOptions;
}

/** The deps as routes see them (`c.get("deps")`): defaults filled in, and
 *  sign-in and billing present only when both the setting and the store
 *  module are. */
export interface Deps {
  store: Store;
  storage: Storage;
  emailer: Emailer;
  transcriber: Transcriber | null;
  integrations: Integrations;
  auth: ResolvedAuth | null;
  billing: ResolvedBilling | null;
  options: ResolvedOptions;
}

export interface ResolvedAuth {
  store: AuthStore;
  google: { clientId: string; clientSecret: string } | null;
  emailMode: EmailSignInMode;
  allowedEmailDomains: readonly string[];
}

export interface ResolvedBilling {
  store: BillingStore;
  dodo: DodoSettings;
  webhookSecret: string;
  exemptEmails: readonly string[];
  disabled: boolean;
}

export interface ResolvedOptions extends AppOptions {
  marketingOrigins: readonly string[];
  limits: IngestLimits;
}

/** Fills in defaults and refuses combinations that cannot work. */
export function resolveDeps(deps: AppDeps): Deps {
  const { store, options } = deps;
  if (!options.secret) throw new Error("createApp needs options.secret");

  let auth: ResolvedAuth | null = null;
  if (deps.auth) {
    if (!store.auth) throw new Error("Sign-in (deps.auth) needs a store with the auth module");
    const allowedEmailDomains = deps.auth.allowedEmailDomains ?? [];
    // Without Teams there is no one to keep apart: every signed-in Account
    // sees every project. That is only safe for a known set of people.
    if (!store.teams && allowedEmailDomains.length === 0) {
      throw new Error(
        "A store without the teams module shows every project to everyone who signs in: set auth.allowedEmailDomains",
      );
    }
    auth = {
      store: store.auth,
      google: deps.auth.google ?? null,
      emailMode: deps.auth.emailMode ?? "link",
      allowedEmailDomains,
    };
  }

  let billing: ResolvedBilling | null = null;
  if (deps.billing) {
    if (!store.billing) throw new Error("Billing (deps.billing) needs a store with the billing module");
    billing = {
      store: store.billing,
      dodo: deps.billing.dodo,
      webhookSecret: deps.billing.webhookSecret ?? "",
      exemptEmails: deps.billing.exemptEmails ?? [],
      disabled: deps.billing.disabled ?? false,
    };
  }

  return {
    store,
    storage: deps.storage,
    emailer: deps.emailer ?? new ConsoleEmailer(),
    transcriber: deps.transcriber ?? null,
    integrations: createIntegrations(deps.integrations),
    auth,
    billing,
    options: {
      ...options,
      marketingOrigins: options.marketingOrigins ?? [],
      limits: { ...DEFAULT_INGEST_LIMITS, ...options.limits },
    },
  };
}
