import { afterEach, describe, expect, it, vi } from "vitest";
import { brainboxTransport, type Report } from "./transport.ts";

const report: Report = {
  region: { x: 0, y: 0, width: 1, height: 1 },
  text: "broken",
  metadata: {
    url: "u",
    title: "t",
    viewport: { width: 1, height: 1 },
    devicePixelRatio: 1,
    userAgent: "x",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
  screenshot: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
};

const transport = brainboxTransport({ endpoint: "http://x/ingest", projectKey: "pk_x" });

/** Stub fetch to answer `res` and hand back the body and init it was sent. */
function stubFetch(res: Response) {
  let body: FormData | undefined;
  let sentInit: RequestInit | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      body = init.body as FormData;
      sentInit = init;
      return res;
    }),
  );
  return Object.assign(() => body, { init: () => sentInit });
}

afterEach(() => vi.unstubAllGlobals());

describe("brainboxTransport", () => {
  it("posts the json part with the project key, plus the screenshot, and returns the id", async () => {
    const sent = stubFetch(new Response(JSON.stringify({ id: "abc" }), { status: 201 }));

    const result = await transport.send(report);

    expect(result).toEqual({ id: "abc" });
    const body = sent();
    expect(JSON.parse(String(body?.get("json")))).toEqual({
      projectKey: "pk_x",
      region: report.region,
      text: "broken",
      metadata: report.metadata,
    });
    expect(body?.get("screenshot")).toBeInstanceOf(File);
    expect(body?.get("audio")).toBeNull();
    expect(body?.get("session")).toBeNull();
  });

  it("names the session part by its encoding and includes audio only when provided", async () => {
    const sent = stubFetch(new Response(JSON.stringify({ id: "a" }), { status: 201 }));

    await transport.send({
      ...report,
      session: new Blob([new Uint8Array([1])], { type: "application/gzip" }),
      audio: new Blob([new Uint8Array([9])], { type: "audio/webm" }),
    });

    const body = sent();
    expect((body?.get("session") as File).name).toBe("session.json.gz");
    expect(body?.get("audio")).toBeInstanceOf(File);
  });

  it("sends no cookies and no context or headers unless asked", async () => {
    const sent = stubFetch(new Response(JSON.stringify({ id: "a" }), { status: 201 }));
    await transport.send(report);
    expect(sent.init()?.credentials).toBe("same-origin");
    expect(sent.init()?.headers).toBeUndefined();
    expect(sent()?.get("context")).toBeNull();
  });

  it("adds headers and a context part for a host's own backend, read at send time", async () => {
    let token = "t1";
    let clinic = "c1";
    const own = brainboxTransport({
      endpoint: "/api/feedback",
      projectKey: "pk_own",
      headers: () => ({ Authorization: `Bearer ${token}` }),
      context: () => ({ clinicId: clinic }),
      credentials: "include",
    });
    const sent = stubFetch(new Response(JSON.stringify({ id: "a" }), { status: 201 }));

    token = "t2";
    clinic = "c2";
    await own.send(report);

    expect(sent.init()?.headers).toEqual({ Authorization: "Bearer t2" });
    expect(sent.init()?.credentials).toBe("include");
    expect(JSON.parse(String(sent()?.get("context")))).toEqual({ clinicId: "c2" });
  });

  it("throws the server error message on a non-2xx JSON response", async () => {
    stubFetch(new Response(JSON.stringify({ error: "Unknown project key" }), { status: 401 }));
    await expect(transport.send(report)).rejects.toThrow("Unknown project key");
  });

  it("throws a status-coded message when the error body isn't JSON", async () => {
    stubFetch(new Response("nope", { status: 413 }));
    await expect(transport.send(report)).rejects.toThrow("413");
  });

  it("rejects a 2xx without an id", async () => {
    stubFetch(new Response("{}", { status: 201 }));
    await expect(transport.send(report)).rejects.toThrow("Malformed response");
  });
});
