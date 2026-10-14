import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AppDeps } from "./deps.ts";
import { getEmailer } from "./email/index.ts";
import type { Emailer } from "./email/types.ts";
import { env } from "./env.ts";
import type { IntegrationsOptions } from "./integrations/registry.ts";
import { getStorage } from "./storage/index.ts";
import type { Storage } from "./storage/types.ts";
import { getStore } from "./store/index.ts";
import { STORE_MODULES } from "./store/modules.ts";
import type { FullStore } from "./store/types.ts";
import { TRANSCRIPTION_PROVIDERS, type Transcriber } from "./transcription/index.ts";

/**
 * Everything `createApp` takes, from the environment (`src/env.ts`): what the
 * Node server and Azure Functions entries run. The store, file storage and
 * emailer are resolved on each use rather than now, so the deprecated
 * `setStore()`, `setStorage()` and `setEmailer()` still take effect when
 * called after this.
 */
export function fromEnv(): AppDeps {
  return {
    store: lazyStore(getStore),
    storage: lazy<Storage>(getStorage),
    emailer: lazy<Emailer>(getEmailer),
    ...(env.TRANSCRIPTION_PROVIDER && { transcriber: transcriberFromEnv() }),
    integrations: integrationsFromEnv(),
    auth: {
      google: { clientId: env.GOOGLE_ID, clientSecret: env.GOOGLE_SECRET },
      emailMode: env.AUTH_EMAIL_MODE,
      allowedEmailDomains: env.AUTH_ALLOWED_EMAIL_DOMAINS,
    },
    billing: {
      dodo: {
        apiKey: env.DODO_API_KEY,
        environment: env.DODO_ENVIRONMENT,
        products: {
          "pro:monthly": env.DODO_PRODUCT_PRO_MONTHLY,
          "pro:annual": env.DODO_PRODUCT_PRO_ANNUAL,
          "business:monthly": env.DODO_PRODUCT_BUSINESS_MONTHLY,
          "business:annual": env.DODO_PRODUCT_BUSINESS_ANNUAL,
        },
      },
      webhookSecret: env.DODO_WEBHOOK_SECRET,
      exemptEmails: env.BILLING_EXEMPT_EMAILS,
      disabled: env.BILLING_DISABLED,
    },
    options: {
      secret: env.AUTH_SECRET,
      publicUrl: env.PUBLIC_API_URL,
      dashboardOrigin: env.DASHBOARD_ORIGIN,
      // Relative to the backend package (one level above src/ or dist/), not
      // the working directory, which differs between hosts.
      ...(env.DASHBOARD_DIR && {
        dashboardDir: resolve(fileURLToPath(new URL("..", import.meta.url)), env.DASHBOARD_DIR),
      }),
      marketingOrigins: env.MARKETING_ORIGINS,
      limits: {
        screenshotBytes: env.MAX_SCREENSHOT_BYTES,
        videoBytes: env.MAX_VIDEO_BYTES,
        sessionBytes: env.MAX_SESSION_BYTES,
        audioBytes: env.MAX_AUDIO_BYTES,
      },
      ...(env.EMAIL_REPLY_TO && { replyTo: env.EMAIL_REPLY_TO }),
    },
  };
}

/** TRANSCRIPTION_PROVIDER with its key and TRANSCRIPTION_MODEL. A provider
 *  that is unknown or missing its key fails each transcription, which marks
 *  that transcript failed, rather than the boot. */
export function transcriberFromEnv(): Transcriber {
  const name = env.TRANSCRIPTION_PROVIDER;
  const provider = Object.entries(TRANSCRIPTION_PROVIDERS).find(([key]) => key === name)?.[1];
  const fail = (message: string): Transcriber => ({
    transcribe: () => Promise.reject(new Error(message)),
  });
  if (!provider) {
    return fail(
      `Unknown TRANSCRIPTION_PROVIDER "${name}" — expected one of: ${Object.keys(TRANSCRIPTION_PROVIDERS).join(", ")}`,
    );
  }
  const apiKey = env[provider.keyVar];
  if (!apiKey) return fail(`TRANSCRIPTION_PROVIDER=${name} requires ${provider.keyVar}`);
  return provider.create({ apiKey, model: env.TRANSCRIPTION_MODEL });
}

function integrationsFromEnv(): IntegrationsOptions {
  const github = [
    env.GITHUB_APP_ID,
    env.GITHUB_APP_SLUG,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_APP_CLIENT_ID,
    env.GITHUB_APP_CLIENT_SECRET,
  ].every((v) => v !== "");
  return {
    ...(github && {
      github: {
        appId: env.GITHUB_APP_ID,
        slug: env.GITHUB_APP_SLUG,
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
        clientId: env.GITHUB_APP_CLIENT_ID,
        clientSecret: env.GITHUB_APP_CLIENT_SECRET,
        webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      },
    }),
    ...(env.INTEGRATIONS_ENCRYPTION_KEY && {
      azureDevops: { encryptionKey: env.INTEGRATIONS_ENCRYPTION_KEY, url: env.AZURE_DEVOPS_URL },
    }),
  };
}

/** An object that forwards every property to `get()`'s result at the moment
 *  it is read, methods bound to it. */
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, key) {
      const real = get();
      const value: unknown = Reflect.get(real, key);
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

/** A full store whose modules resolve through `get()` on each call. */
function lazyStore(get: () => FullStore): FullStore {
  const modules = Object.fromEntries(STORE_MODULES.map((name) => [name, lazy(() => get()[name])]));
  return {
    ...modules,
    projects: lazy(() => get().projects),
    issues: lazy(() => get().issues),
  } as FullStore;
}
