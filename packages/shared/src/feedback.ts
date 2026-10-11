import type { CapturedMetadata } from "./metadata.ts";
import type { ProjectKey } from "./project.ts";
import type { Region } from "./region.ts";

/** The structured (JSON) part of the widget's multipart `/ingest` POST.
 *  The screenshot / video / audio travel as separate binary file parts and are
 *  intentionally NOT in this type.
 *
 *  `region` is the area the end-user's marks cover, so it is optional: a
 *  report with no marks (a plain note, or a recording with nothing drawn in
 *  view when it stopped) has none. */
export interface FeedbackPayload {
  projectKey: ProjectKey;
  region?: Region;
  text?: string;
  metadata: CapturedMetadata;
}
