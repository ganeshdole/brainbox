import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionReplay } from "./SessionReplay.tsx";

// jsdom can't run a real Replayer; this one only has to exist and answer the
// few calls the player makes. Created by hand, so a test can hold it back.
const replayers = vi.hoisted(() => ({ created: 0 }));
vi.mock("@rrweb/replay", () => ({
  Replayer: class {
    wrapper = document.createElement("div");
    iframe = document.createElement("iframe");
    constructor() {
      replayers.created += 1;
    }
    getMetaData() {
      return { startTime: 0, endTime: 1000, totalTime: 1000 };
    }
    getCurrentTime() {
      return 0;
    }
    pause() {}
    play() {}
    on() {}
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const log = JSON.stringify({ v: 1, events: [{ type: 4 }, { type: 2 }] });
/** Settle the fetch, the parse and the lazy import of the replayer. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  replayers.created = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const play = () => container.querySelector<HTMLButtonElement>(".bb-replay__btn--primary");
const error = () => container.querySelector(".bb-replay__error")?.textContent ?? null;

describe("SessionReplay", () => {
  it("can't be played until the replayer is up", async () => {
    let respond: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (respond = resolve))),
    );
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    expect(play()?.disabled).toBe(true);
    expect(play()?.getAttribute("aria-label")).toBe("Loading recording");

    respond(new Response(log));
    await settle();
    expect(replayers.created).toBe(1);
    expect(play()?.disabled).toBe(false);
    expect(play()?.getAttribute("aria-label")).toBe("Play");
  });

  it("loads the next url after one that failed", async () => {
    const fetchLog = vi.fn(async (url: string) =>
      url === "/missing.json" ? new Response("", { status: 404 }) : new Response(log),
    );
    vi.stubGlobal("fetch", fetchLog);

    act(() => root.render(<SessionReplay url="/missing.json" vw={800} vh={600} />));
    await settle();
    expect(error()).toBe("Session fetch failed (404)");

    act(() => root.render(<SessionReplay url="/b.json" vw={800} vh={600} />));
    // the old error is gone as soon as the url changes
    expect(error()).toBeNull();
    await settle();
    expect(fetchLog).toHaveBeenLastCalledWith("/b.json", expect.anything());
    expect(error()).toBeNull();
    expect(replayers.created).toBe(1);
    expect(play()?.disabled).toBe(false);
  });
});
