import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Draft, DraftState } from "@brainbox/core";
import { useDraft } from "./use-draft.ts";

/** The two methods the hook uses, over a state the test can replace. */
function fakeDraft(initial: DraftState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const draft = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as Pick<Draft, "getState" | "subscribe"> as Draft;
  const set = (next: DraftState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return { draft, set, listeners };
}

const idle: DraftState = {
  screenshotUrl: null,
  screenshotPending: false,
  screenshotFailed: false,
  hasSession: false,
  hasVoice: false,
};

/** Commits so far. A publish that changes nothing must not add one. */
let commits = 0;
function Preview({ draft }: { draft: Draft }) {
  const state = useDraft(draft);
  useEffect(() => {
    commits += 1;
  });
  return <output>{state.screenshotPending ? "pending" : (state.screenshotUrl ?? "none")}</output>;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commits = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useDraft", () => {
  it("renders the current state and re-renders when it changes", () => {
    const { draft, set } = fakeDraft(idle);
    act(() => root.render(<Preview draft={draft} />));
    expect(container.textContent).toBe("none");

    act(() => set({ ...idle, screenshotPending: true }));
    expect(container.textContent).toBe("pending");

    act(() => set({ ...idle, screenshotUrl: "blob:1" }));
    expect(container.textContent).toBe("blob:1");
  });

  it("does not re-render when the same state object is published again", () => {
    const { draft, set } = fakeDraft(idle);
    act(() => root.render(<Preview draft={draft} />));
    const before = commits;

    act(() => set(idle));
    expect(commits).toBe(before);
  });

  it("unsubscribes on unmount", () => {
    const { draft, listeners } = fakeDraft(idle);
    act(() => root.render(<Preview draft={draft} />));
    expect(listeners.size).toBe(1);

    act(() => root.unmount());
    expect(listeners.size).toBe(0);
  });
});
