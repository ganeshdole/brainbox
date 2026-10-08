import { useSyncExternalStore } from "react";
import type { Draft, DraftState } from "@brainbox/core";

/** A draft's state, re-rendering the component whenever it changes. */
export function useDraft(draft: Draft): DraftState {
  return useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);
}
