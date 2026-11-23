/** The part of a Workers `ExecutionContext` the app uses. */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
  props?: unknown;
}

/**
 * Serve one request whose resources (a database connection, on Workers) must
 * close once everything it started has finished. `handle` gets a context whose
 * `waitUntil` collects background work (transcription, ticket delivery); the
 * host's `waitUntil` then keeps the Worker alive until that work, and any work
 * it starts in turn, has settled, and only then runs `cleanup`. The response
 * goes out without waiting for any of it.
 */
export async function serveThenCleanUp(
  ctx: WorkerContext,
  handle: (ctx: WorkerContext) => Promise<Response>,
  cleanup: () => Promise<unknown>,
): Promise<Response> {
  const pending = new Set<Promise<unknown>>();
  const scoped: WorkerContext = {
    waitUntil: (task) => {
      pending.add(task);
    },
    passThroughOnException: () => ctx.passThroughOnException(),
    props: ctx.props,
  };
  const finish = async () => {
    // A task may add another as it runs, so drain until nothing new arrived.
    while (pending.size > 0) {
      const batch = [...pending];
      pending.clear();
      await Promise.allSettled(batch);
    }
    await cleanup().catch((err: unknown) => console.error("[worker] cleanup failed:", err));
  };
  try {
    return await handle(scoped);
  } finally {
    ctx.waitUntil(finish());
  }
}
