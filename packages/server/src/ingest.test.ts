import { describe, expect, it } from "vitest";
import { DEFAULT_INGEST_LIMITS, parseIngest, type IngestLimits } from "./ingest.ts";

const payload = {
  projectKey: "pk_test",
  region: { x: 1, y: 2, width: 3, height: 4 },
  text: "broken",
  metadata: {
    url: "http://host/app",
    title: "App",
    viewport: { width: 800, height: 600 },
    devicePixelRatio: 1,
    userAgent: "UA",
    language: "en",
    timezone: "UTC",
    consoleErrors: ["e1"],
  },
};

const png = (bytes = 4) => new File([new Uint8Array(bytes)], "s.png", { type: "image/png" });

/** A widget upload: the json part (`null` to leave it out) plus whatever
 *  files the test adds. */
function upload(json: unknown = payload, files: Record<string, File> = { screenshot: png() }) {
  const fd = new FormData();
  if (json !== null) fd.append("json", typeof json === "string" ? json : JSON.stringify(json));
  for (const [name, f] of Object.entries(files)) fd.append(name, f);
  return new Request("http://x/ingest", { method: "POST", body: fd });
}

const parse = (req: Request, limits: IngestLimits = DEFAULT_INGEST_LIMITS) => parseIngest(req, limits);

describe("parseIngest", () => {
  it("returns the typed payload and files for a screenshot report", async () => {
    const audio = new File([new Uint8Array([9])], "a.webm", { type: "audio/webm" });
    const result = await parse(upload(payload, { screenshot: png(), audio }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.projectKey).toBe("pk_test");
    expect(result.payload.region).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(result.payload.metadata.consoleErrors).toEqual(["e1"]);
    expect(result.files.screenshot?.type).toBe("image/png");
    expect(result.files.audio?.name).toBe("a.webm");
    expect(result.files.session).toBeUndefined();
    expect(result.files.video).toBeUndefined();
  });

  it("accepts a session recording with no screenshot", async () => {
    const session = new File([new Uint8Array([1, 2])], "session.json.gz", { type: "application/gzip" });
    const result = await parse(upload({ ...payload, region: undefined }, { session }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.session?.name).toBe("session.json.gz");
    expect(result.payload.region).toBeUndefined();
  });

  it("rejects a body that is not multipart", async () => {
    const req = new Request("http://x/ingest", { method: "POST", body: "{}" });
    expect(await parse(req)).toEqual({
      ok: false,
      status: 400,
      body: { error: "Expected multipart form data" },
    });
  });

  it("rejects a missing or malformed json part", async () => {
    expect(await parse(upload(null))).toMatchObject({ status: 400, body: { error: "Missing json part" } });
    expect(await parse(upload("{not json"))).toMatchObject({ status: 400, body: { error: "Invalid json" } });
  });

  it("rejects a payload that fails the schema, with zod's issues", async () => {
    const result = await parse(upload({ ...payload, projectKey: "nope" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid payload");
    expect(result.body.issues?.[0]?.path).toEqual(["projectKey"]);
  });

  it("rejects wrong file types", async () => {
    const txt = new File(["x"], "s.txt", { type: "text/plain" });
    expect(await parse(upload(payload, { screenshot: txt }))).toMatchObject({
      status: 400,
      body: { error: "screenshot must be an image" },
    });
    expect(await parse(upload(payload, { screenshot: png(), audio: txt }))).toMatchObject({
      status: 400,
      body: { error: "audio must be an audio file" },
    });
    expect(await parse(upload(payload, { video: txt }))).toMatchObject({
      status: 400,
      body: { error: "video must be a video file" },
    });
  });

  it("rejects files over the limit with 413", async () => {
    const small: IngestLimits = { ...DEFAULT_INGEST_LIMITS, screenshotBytes: 3 };
    expect(await parse(upload(payload, { screenshot: png(4) }), small)).toMatchObject({
      status: 413,
      body: { error: "screenshot too large" },
    });
    // at the limit is fine
    expect((await parse(upload(payload, { screenshot: png(3) }), small)).ok).toBe(true);
  });

  it("rejects an upload with nothing to store", async () => {
    expect(await parse(upload(payload, {}))).toMatchObject({
      status: 400,
      body: { error: "Missing screenshot, video or session" },
    });
  });
});
