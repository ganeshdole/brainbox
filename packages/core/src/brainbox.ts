import type { Identity } from "@brainbox/shared";
import { createDraft, type Draft, type DraftOptions } from "./draft.ts";
import { captureErrors } from "./metadata.ts";
import type { SubmitResult, Transport } from "./transport.ts";

export interface BrainboxOptions {
  /** Where finished reports go. */
  transport: Transport;
  /** Who is filing. Can be set later with `identify()`. */
  identity?: Identity;
  /** Called after every successful submit. */
  onSubmitted?: (result: SubmitResult) => void;
}

/** One embedded Brainbox. Collects console errors from the moment it is
 *  created and hands out drafts; `destroy()` undoes all of it. */
export interface Brainbox {
  identify(identity: Identity): void;
  draft(options?: DraftOptions): Draft;
  destroy(): void;
}

export function createBrainbox({ transport, identity, onSubmitted }: BrainboxOptions): Brainbox {
  let who = identity;
  const errors = captureErrors();
  const drafts = new Set<Draft>();

  return {
    identify(next) {
      who = next;
    },
    draft(options) {
      const draft = createDraft(
        {
          transport,
          identity: () => who,
          consoleErrors: () => errors.snapshot(),
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
