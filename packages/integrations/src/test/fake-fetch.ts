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
      body: bodyOf(init?.body),
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

/** JSON bodies parsed, form and other text kept as a string, bytes as they are. */
function bodyOf(body: RequestInit["body"]): unknown {
  if (typeof body !== "string") return body ?? undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
