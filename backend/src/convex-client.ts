import { createConvexCaller, type ConvexCaller } from "./convex-caller.ts";
import { env } from "./env.ts";

export { createConvexCaller, type ConvexCaller } from "./convex-caller.ts";

let instance: ConvexCaller | null = null;

/** The deployment's Convex connection (CONVEX_URL), opened on first use. */
export function getConvex(): ConvexCaller {
  instance ??= createConvexCaller(env.CONVEX_URL, env.BRAINBOX_SERVER_SECRET);
  return instance;
}
