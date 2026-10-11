import type { FetchLike } from "../destination.ts";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export type QueuedResponse = { status: number; body?: unknown } | Error;

/** Records every call and answers from a queue; an `Error` entry is thrown. */
export function fakeFetch(...queue: QueuedResponse[]): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn: FetchLike = async (input, init) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`fakeFetch: no response queued for ${String(input)}`);
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  };
  return Object.assign(fn, { calls });
}
