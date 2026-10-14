import type { Identity, ReportField } from "@ganeshdole/brainbox-shared";
import { createDraft, type BeforeSend, type Draft, type DraftOptions } from "./draft.ts";
import { captureErrors } from "./metadata.ts";
import type { PrivacyOptions } from "./privacy.ts";
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
  /** Sees every finished report before it goes to the transport, to scrub what
   *  the host may not send (console errors, the URL's query string, identity)
   *  or return null to drop it. Submit then rejects, so the UI does not claim
   *  it was sent. */
  beforeSend?: BeforeSend;
  /** Called after every successful submit. */
  onSubmitted?: (result: SubmitResult) => void;
}

/** One embedded Brainbox. Collects console errors from the moment it is
 *  created and hands out drafts; `destroy()` undoes all of it. */
export interface Brainbox {
  identify(identity: Identity): void;
  /** Replaces the details sent with every report from now on. */
  setFields(fields: ReportField[]): void;
  draft(options?: DraftOptions): Draft;
  destroy(): void;
}

export function createBrainbox({
  transport,
  identity,
  fields,
  privacy,
  beforeSend,
  onSubmitted,
}: BrainboxOptions): Brainbox {
  let who = identity;
  let details = fields;
  const errors = captureErrors();
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
          consoleErrors: () => errors.snapshot(),
          privacy,
          beforeSend,
          onSubmitted,
        },
        options,
      );
      drafts.add(draft);
      return draft;
    },
    destroy() {
      for (const draft of drafts) draft.cancel();
      drafts.clear();
      errors.stop();
    },
  };
}
