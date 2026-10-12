import type { BillingPeriod, PlanId } from "@ganeshdole/brainbox-shared";

import { env } from "../env.ts";

// Host is derived from DODO_ENVIRONMENT, never passed in by a caller: the two
// catalogues are separate and a key is scoped to one of them, so choosing the
// host per call would be a way to accidentally hit live from a dev box.
const HOSTS = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
} as const;

/** Which of the four products a (plan, period) pair maps to. */
const PRODUCT_ENV_KEYS = {
  "pro:monthly": "DODO_PRODUCT_PRO_MONTHLY",
  "pro:annual": "DODO_PRODUCT_PRO_ANNUAL",
  "business:monthly": "DODO_PRODUCT_BUSINESS_MONTHLY",
  "business:annual": "DODO_PRODUCT_BUSINESS_ANNUAL",
} as const satisfies Record<`${PlanId}:${BillingPeriod}`, keyof typeof env>;

export function dodoHost(): string {
  return HOSTS[env.DODO_ENVIRONMENT];
}

/**
 * True once billing can actually complete a sale: a key AND every product id.
 *
 * Checking only the key would let a half-configured deployment throw from
 * productIdFor() deep inside the route, which surfaces as a 502 (provider
 * failure) when the truth is a 503 (our own configuration is incomplete).
 */
export function billingConfigured(): boolean {
  if (env.DODO_API_KEY === "") return false;
  return Object.values(PRODUCT_ENV_KEYS).every((key) => env[key] !== "");
}

/**
 * The Dodo product id for a plan/period.
 * @throws if that product is not configured - a missing id means checkout would
 *         silently sell the wrong thing, so it must fail loudly.
 */
export function productIdFor(plan: PlanId, period: BillingPeriod): string {
  const key = PRODUCT_ENV_KEYS[`${plan}:${period}`];
  const id = env[key];
  if (typeof id !== "string" || id === "") {
    throw new Error(`No Dodo product configured for ${plan}/${period} (set ${key})`);
  }
  return id;
}

/** Reverse lookup, for turning a webhook's product id back into a plan. */
export function planForProductId(
  productId: string,
): { plan: PlanId; period: BillingPeriod } | null {
  for (const [pair, envKey] of Object.entries(PRODUCT_ENV_KEYS)) {
    if (env[envKey] === productId && productId !== "") {
      const [plan, period] = pair.split(":");
      return { plan: plan as PlanId, period: period as BillingPeriod };
    }
  }
  return null;
}

// Someone is staring at a spinner on the other end of every one of these, so
// fail fast rather than holding the request open until the platform's own
// timeout. Dodo's docs put their per-request ceiling at 30s; we give up sooner.
const REQUEST_TIMEOUT_MS = 15_000;

async function dodoFetch(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${dodoHost()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${env.DODO_API_KEY}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(
        `Dodo ${init.method ?? "GET"} ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`,
        { cause: err },
      );
    }
    throw err;
  }
  const body = await res.text();
  if (!res.ok) {
    // Include the status and body: Dodo returns actionable 422s naming the
    // offending field, and losing that turns every failure into a guess.
    throw new Error(`Dodo ${init.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return body ? (JSON.parse(body) as unknown) : null;
}

export interface CheckoutSession {
  checkoutUrl: string;
  sessionId: string;
}

/**
 * Start a hosted checkout for one subscription product.
 *
 * `metadata.userId` is the thread back to our Account: the webhook that
 * eventually confirms the subscription arrives out-of-band with no session, so
 * without it we could not tell whose subscription just went active.
 */
export async function createCheckoutSession(opts: {
  productId: string;
  userId: string;
  email: string;
  name?: string | null;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const json = (await dodoFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: opts.productId, quantity: 1 }],
      customer: { email: opts.email, ...(opts.name ? { name: opts.name } : {}) },
      return_url: opts.returnUrl,
      cancel_url: opts.cancelUrl,
      metadata: { userId: opts.userId },
    }),
  })) as { checkout_url?: string; session_id?: string } | null;

  if (!json?.checkout_url || !json.session_id) {
    throw new Error(`Dodo checkout returned no url: ${JSON.stringify(json)}`);
  }
  return { checkoutUrl: json.checkout_url, sessionId: json.session_id };
}
