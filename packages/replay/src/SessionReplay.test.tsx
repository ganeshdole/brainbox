import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionReplay } from "./SessionReplay.tsx";

// jsdom can't run a real Replayer; this one only has to exist and answer the
// few calls the player makes. Created by hand, so a test can hold it back.
const replayers = vi.hoisted(() => ({ created: 0, calls: [] as string[] }));
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
    pause(ms?: number) {
      replayers.calls.push(ms === undefined ? "pause" : `pause ${ms}`);
    }
    play(ms?: number) {
      replayers.calls.push(ms === undefined ? "play" : `play ${ms}`);
    }
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
  replayers.calls = [];
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
const range = () => container.querySelector<HTMLInputElement>(".bb-replay__range");
/** Moves the scrubber the way a drag does: a new value, then React's input event. */
function scrubTo(ms: number) {
  const el = range();
  if (!el) throw new Error("no scrubber");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, String(ms));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
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

  it("plays a url whose earlier load failed, once it loads", async () => {
    let aFails = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/a.json" && aFails ? new Response("", { status: 503 }) : new Response(log),
      ),
    );
    const player = () => container.querySelector<HTMLElement>(".bb-replay");

    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    await settle();
    expect(error()).toBe("Session fetch failed (503)");
    expect(player()?.hidden).toBe(true);

    act(() => root.render(<SessionReplay url="/b.json" vw={800} vh={600} />));
    await settle();
    aFails = false;
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    // not the old failure while it loads again
    expect(error()).toBeNull();
    await settle();
    expect(error()).toBeNull();
    expect(player()?.hidden).toBe(false);
    expect(play()?.disabled).toBe(false);
  });

  it("holds playback still while the scrubber is dragged, then plays on from where it landed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(log)));
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    await settle();
    act(() => play()?.click());
    expect(replayers.calls.at(-1)).toBe("play 0");
    replayers.calls = [];

    act(() => {
      range()?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    act(() => scrubTo(400));
    act(() => scrubTo(650));
    // every position is shown paused; nothing plays from it mid-drag
    expect(replayers.calls).toEqual(["pause", "pause 400", "pause 650"]);
    // still reads as playing: the drag is a pause the person didn't ask for
    expect(play()?.getAttribute("aria-label")).toBe("Pause");

    // let go off the bar: the release still ends the scrub
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    });
    expect(replayers.calls.at(-1)).toBe("play 650");
  });

  it("stays paused after a scrub that started paused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(log)));
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    await settle();
    replayers.calls = [];

    act(() => {
      range()?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    act(() => scrubTo(300));
    act(() => {
      range()?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    });
    expect(replayers.calls).toEqual(["pause 300"]);
    expect(play()?.getAttribute("aria-label")).toBe("Play");
  });

  it("ends a scrub when the window loses focus mid-drag", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(log)));
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    await settle();
    act(() => play()?.click());
    act(() => {
      range()?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });
    act(() => scrubTo(200));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(replayers.calls.at(-1)).toBe("play 200");
    // a later drag plays on from its own landing spot, not frozen
    act(() => scrubTo(800));
    expect(replayers.calls.at(-1)).toBe("play 800");
  });

  it("doesn't scrub on a right-click", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(log)));
    act(() => root.render(<SessionReplay url="/a.json" vw={800} vh={600} />));
    await settle();
    act(() => play()?.click());
    replayers.calls = [];
    act(() => {
      range()?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 2 }));
    });
    expect(replayers.calls).toEqual([]);
  });
});
