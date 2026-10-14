import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";
import type { ScreenshotOptions } from "./capture.ts";
import { createDraft, type BeforeSend, type Draft, type DraftOptions } from "./draft.ts";
import { defaultCaptureLoader, preloadCapture, type CaptureLoader } from "./loader.ts";
import { captureErrors } from "./metadata.ts";
import type { PrivacyOptions } from "./privacy.ts";
import type { RecordingOptions } from "./session.ts";
import type { SubmitResult, Transport } from "./transport.ts";

export interface BrainboxOptions {
  /** Where finished reports go. */
  transport: Transport;
  /** Who is filing. Can be set later with `identify()`. */
  identity?: Identity;
  /** Your app's own details for every report (clinic, plan, ...). Can be set
   *  later with `setFields()`. */
  fields?: ReportField[];
  /** Hold back more of the page: mask text in recordings, cover it in
   *  screenshots. All off by default. */
  privacy?: PrivacyOptions;
  /** Collect the page's console errors and uncaught exceptions for bug
   *  reports. Default true. With false, `console.error` is never patched and
   *  reports carry an empty list. */
  consoleErrors?: boolean;
  /** Session recordings: whether to record narration over the mic (default
   *  yes), and extra rrweb options. */
  recording?: RecordingOptions;
  /** Screenshot tuning: pixel density, asset timeout, size budget. */
  screenshot?: ScreenshotOptions;
  /** How rrweb and modern-screenshot are loaded. Default `import()`, which a
   *  bundler splits into chunks of their own; supply your own to load them
   *  from somewhere else. */
  loader?: CaptureLoader;
  /** Sees every finished report before it goes to the transport, to scrub what
   *  the host may not send (console errors, the URL's query string, identity)
   *  or return null to drop it. Submit then rejects, so the UI does not claim
   *  it was sent. */
  beforeSend?: BeforeSend;
  /** Called after every successful submit. */
  onSubmitted?: (result: SubmitResult) => void;
}

/** One embedded Brainbox. Collects console errors from the moment it is
 *  created (unless `consoleErrors: false`) and hands out drafts; `destroy()`
 *  undoes all of it. */
export interface Brainbox {
  identify(identity: Identity): void;
  /** Replaces the details sent with every report from now on. */
  setFields(fields: ReportField[]): void;
  draft(options?: DraftOptions): Draft;
  /** Start loading the capture libraries through this instance's loader, so
   *  the first capture isn't waiting on the network. A UI calls this when it
   *  opens. */
  preloadCapture(): void;
  destroy(): void;
}

export function createBrainbox({
  transport,
  identity,
  fields,
  privacy,
  consoleErrors = true,
  recording,
  screenshot,
  loader = defaultCaptureLoader,
  beforeSend,
  onSubmitted,
}: BrainboxOptions): Brainbox {
  let who = identity;
  let details = fields;
  const errors = consoleErrors ? captureErrors() : null;
  const drafts = new Set<Draft>();

  return {
    identify(next) {
      who = next;
    },
    setFields(next) {
      details = next;
    },
    draft(options) {
      const draft = createDraft(
        {
          transport,
          identity: () => who,
          fields: () => details,
          consoleErrors: () => errors?.snapshot() ?? [],
          privacy,
          screenshot,
          recording,
          loader,
          beforeSend,
          onSubmitted,
        },
        options,
      );
      drafts.add(draft);
      return draft;
    },
    preloadCapture() {
      preloadCapture(loader);
    },
    destroy() {
      for (const draft of drafts) draft.cancel();
      drafts.clear();
      errors?.stop();
    },
  };
}
