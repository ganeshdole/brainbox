import { useLayoutEffect, useRef } from "react";
import type { Draft, Mark } from "@ganeshdole/brainbox-core";
import { useDraft } from "@ganeshdole/brainbox-react";
import { MarkupOverlay } from "./MarkupOverlay.tsx";

export interface DraftMarkupProps {
  /** The report being built, from `brainbox.draft({ exclude })`. */
  draft: Draft;
  /** Next. The marks have already gone to `draft.markUp()`, which bakes them
   *  onto the screenshot in the background. */
  onDone: (marks: Mark[]) => void;
  /** Cancel or Escape. The draft is left as it is: `draft.cancel()` it if the
   *  report is abandoned. */
  onCancel: () => void;
  /** Start the screenshot when this mounts (default `true`). Pass `false` if
   *  you already called `draft.captureScreenshot()`. */
  capture?: boolean;
  /** What the pill above the toolbar says once the screenshot is up. */
  hint?: string;
}

/** The markup step over a core `Draft`: freezes the page, lets the user draw
 *  on it, and hands the marks to the draft. The same overlay the widget
 *  shows, without the rest of the widget. */
export function DraftMarkup({ draft, onDone, onCancel, capture = true, hint }: DraftMarkupProps) {
  const state = useDraft(draft);

  // Once per draft, before the first paint, so the pill reads "Freezing" from
  // the start. A ref rather than the effect alone: StrictMode runs effects
  // twice, and a second capture would rasterise the page again for nothing.
  const captured = useRef<Draft | null>(null);
  useLayoutEffect(() => {
    if (!capture || captured.current === draft) return;
    captured.current = draft;
    draft.captureScreenshot();
  }, [draft, capture]);

  return (
    <MarkupOverlay
      screenshotUrl={state.screenshotUrl ?? undefined}
      capturePending={state.screenshotPending}
      captureFailed={state.screenshotFailed}
      hint={hint}
      onDone={(marks) => {
        draft.markUp(marks);
        onDone(marks);
      }}
      onCancel={onCancel}
    />
  );
}
