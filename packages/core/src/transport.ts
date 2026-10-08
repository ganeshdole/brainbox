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

/** The Brainbox backend's `/ingest` contract: a multipart POST with a `json`
 *  part (`FeedbackPayload`) plus one file part per attachment. */
export function brainboxTransport({
  endpoint,
  projectKey,
}: {
  endpoint: string;
  projectKey: ProjectKey;
}): Transport {
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
      if (report.screenshot) fd.append("screenshot", report.screenshot, "screenshot.png");
      if (report.session) {
        const name = report.session.type.includes("gzip") ? "session.json.gz" : "session.json";
        fd.append("session", report.session, name);
      }
      if (report.audio) fd.append("audio", report.audio, "voice.webm");

      const res = await fetch(endpoint, { method: "POST", body: fd, mode: "cors" });
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
