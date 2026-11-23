import { describe, expect, it, vi } from "vitest";

import { serveThenCleanUp, type WorkerContext } from "./workers.ts";

function host() {
  const kept: Promise<unknown>[] = [];
  const ctx: WorkerContext = {
    waitUntil: (p) => {
      kept.push(p);
    },
    passThroughOnException: vi.fn(),
  };
  return { ctx, settled: () => Promise.all(kept) };
}

/** A promise and the function that resolves it. */
function later() {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("serveThenCleanUp", () => {
  it("answers before background work finishes, and cleans up only after it", async () => {
    const { ctx, settled } = host();
    const work = later();
    const events: string[] = [];
    const res = await serveThenCleanUp(
      ctx,
      async (scoped) => {
        scoped.waitUntil(work.promise.then(() => events.push("work")));
        return new Response("ok");
      },
      async () => {
        events.push("cleanup");
      },
    );
    expect(await res.text()).toBe("ok");
    expect(events).toEqual([]);
    work.resolve();
    await settled();
    expect(events).toEqual(["work", "cleanup"]);
  });

  it("waits for work that background work starts in turn", async () => {
    const { ctx, settled } = host();
    const events: string[] = [];
    await serveThenCleanUp(
      ctx,
      async (scoped) => {
        scoped.waitUntil(
          (async () => {
            await Promise.resolve();
            scoped.waitUntil(new Promise((r) => setTimeout(r, 5)).then(() => events.push("second")));
            events.push("first");
          })(),
        );
        return new Response(null);
      },
      async () => {
        events.push("cleanup");
      },
    );
    await settled();
    expect(events).toEqual(["first", "second", "cleanup"]);
  });

  it("still cleans up when background work fails or the handler throws", async () => {
    const { ctx, settled } = host();
    const cleanup = vi.fn(async () => {});
    await expect(
      serveThenCleanUp(
        ctx,
        async (scoped) => {
          scoped.waitUntil(Promise.reject(new Error("delivery failed")));
          throw new Error("handler failed");
        },
        cleanup,
      ),
    ).rejects.toThrow("handler failed");
    await settled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("passes passThroughOnException and props through to the host", async () => {
    const { ctx } = host();
    const withProps = { ...ctx, props: { a: 1 } };
    await serveThenCleanUp(
      withProps,
      async (scoped) => {
        scoped.passThroughOnException();
        expect(scoped.props).toEqual({ a: 1 });
        return new Response(null);
      },
      async () => {},
    );
    expect(ctx.passThroughOnException).toHaveBeenCalledOnce();
  });
});
