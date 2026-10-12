import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

import { env } from "./env.ts";

// The backend's one connection to Convex, shared by the Convex store and the
// Convex storage driver. Every Brainbox function demands the server secret
// (convex/lib/server.ts), so callers pass the other arguments and this adds it.

type WithoutSecret<F extends FunctionReference<"query" | "mutation">> = Omit<FunctionArgs<F>, "secret">;

export interface ConvexCaller {
  query<F extends FunctionReference<"query">>(fn: F, args: WithoutSecret<F>): Promise<FunctionReturnType<F>>;
  mutation<F extends FunctionReference<"mutation">>(
    fn: F,
    args: WithoutSecret<F>,
  ): Promise<FunctionReturnType<F>>;
}

export function createConvexCaller(url: string, secret: string): ConvexCaller {
  const client = new ConvexHttpClient(url);
  return {
    query: (fn, args) => client.query(fn, withSecret(fn, args, secret)),
    // skipQueue: requests from different users must not wait on each other.
    mutation: (fn, args) => client.mutation(fn, withSecret(fn, args, secret), { skipQueue: true }),
  };
}

/** The full arguments: TypeScript cannot see that `Omit<A, "secret">` plus the
 *  secret is `A` again, so this is the one place that says so. */
function withSecret<F extends FunctionReference<"query" | "mutation">>(
  _fn: F,
  args: WithoutSecret<F>,
  secret: string,
): FunctionArgs<F> {
  return { ...args, secret } as FunctionArgs<F>;
}

let instance: ConvexCaller | null = null;

/** The deployment's Convex connection (CONVEX_URL), opened on first use. */
export function getConvex(): ConvexCaller {
  instance ??= createConvexCaller(env.CONVEX_URL, env.BRAINBOX_SERVER_SECRET);
  return instance;
}
