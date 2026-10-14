import type { Context } from "hono";

/**
 * Run work that must not hold up the response, such as transcription and
 * ticket delivery. A host that freezes an instance once it has responded
 * (Azure Functions, Workers) passes an execution context, and its entry keeps
 * the invocation alive until the work settles. A long-running Node process
 * passes none and simply keeps going. `task` must handle its own errors.
 */
export function runInBackground(c: Context, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    // No execution context (Hono throws on access): the process outlives the
    // response, so the already-running task needs nothing more.
  }
}
