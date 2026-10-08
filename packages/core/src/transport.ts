import type { CapturedMetadata, FeedbackPayload, ProjectKey, Region } from "@brainbox/shared";

/** A finished report, as handed to a `Transport`. Core does not know about
 *  project keys or endpoints; those belong to whichever transport sends it. */
export interface Report {
  text?: string;
  /** The area the user's marks cover - only for screenshot reports. */
  region?: Region;
  metadata: CapturedMetadata;
  screenshot?: Blob;
  /** Gzipped rrweb event log, from a recording. */
  session?: Blob;
  /** Voice note, or the mic track of a recording. */
  audio?: Blob;
}

/** What a transport reports back. `id` is whatever the receiving side assigned,
 *  if it assigned anything; the UI shows it when present. */
export interface SubmitResult {
  id?: string;
}

/** Where reports go. `brainboxTransport()` is the default; a host with its own
 *  backend supplies its own. */
export interface Transport {
  send(report: Report): Promise<SubmitResult>;
}

/** A value, or a function that produces it at send time: tokens expire and
 *  the current clinic changes, so a static object would go stale. */
type Lazy<T> = T | (() => T);
const resolve = <T>(v: Lazy<T>): T => (typeof v === "function" ? (v as () => T)() : v);

export interface BrainboxTransportOptions {
  endpoint: string;
  projectKey: ProjectKey;
  /** Extra request headers, for a backend that wants a bearer token. */
  headers?: Lazy<HeadersInit>;
  /** Your own fields, sent as a `context` part (JSON) next to `json`. The
   *  Brainbox backend ignores it; your own backend can read it. */
  context?: Lazy<Record<string, unknown>>;
  /** Passed to `fetch`. Default `"same-origin"`, which sends no cookies to a
   *  Brainbox Cloud endpoint on another origin. */
  credentials?: RequestCredentials;
}

/** The Brainbox backend's `/ingest` contract: a multipart POST with a `json`
 *  part (`FeedbackPayload`) plus one file part per attachment. */
export function brainboxTransport({
  endpoint,
  projectKey,
  headers,
  context,
  credentials = "same-origin",
}: BrainboxTransportOptions): Transport {
  return {
    async send(report) {
      const payload: FeedbackPayload = {
        projectKey,
        region: report.region,
        text: report.text,
        metadata: report.metadata,
      };
      const fd = new FormData();
      fd.append("json", JSON.stringify(payload));
      if (context) fd.append("context", JSON.stringify(resolve(context)));
      if (report.screenshot) fd.append("screenshot", report.screenshot, "screenshot.png");
      if (report.session) {
        const name = report.session.type.includes("gzip") ? "session.json.gz" : "session.json";
        fd.append("session", report.session, name);
      }
      if (report.audio) fd.append("audio", report.audio, "voice.webm");

      const res = await fetch(endpoint, {
        method: "POST",
        body: fd,
        mode: "cors",
        credentials,
        headers: headers ? resolve(headers) : undefined,
      });
      if (!res.ok) {
        throw new Error(await errorMessage(res));
      }
      const data: { id?: string } = await res.json();
      if (!data.id) throw new Error("Malformed response");
      return { id: data.id };
    },
  };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data: { error?: string } = await res.json();
    if (data.error) return data.error;
  } catch {
    /* non-JSON error body */
  }
  return `Upload failed (${res.status})`;
}
