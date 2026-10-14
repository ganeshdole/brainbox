import type { CapturedMetadata } from "./metadata.ts";
import type { ProjectKey } from "./project.ts";
import type { Region } from "./region.ts";

/** What a report is about: something broken (`bug`), or something the
 *  end-user wants the app to do (`feature`). */
export type IssueKind = "bug" | "feature";

/** How much a requested feature matters to the end-user who asked for it. */
export type Importance = "nice" | "important" | "critical";

/** The structured (JSON) part of the widget's multipart `/ingest` POST.
 *  The screenshot / video / audio travel as separate binary file parts and are
 *  intentionally NOT in this type.
 *
 *  `region` is the area the end-user's marks cover, so it is optional: a
 *  report with no marks (a plain note, or a recording with nothing drawn in
 *  view when it stopped) has none.
 *
 *  `kind` is absent from clients older than feature requests, and absent
 *  means `bug`. `importance` only means something on a feature request. */
export interface FeedbackPayload {
  projectKey: ProjectKey;
  kind?: IssueKind;
  importance?: Importance;
  region?: Region;
  text?: string;
  metadata: CapturedMetadata;
}
