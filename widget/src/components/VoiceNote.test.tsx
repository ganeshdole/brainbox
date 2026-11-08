import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer.tsx";
import { FeatureComposer } from "./FeatureComposer.tsx";
import { VoiceNote } from "./VoiceNote.tsx";

// jsdom has no mic. Each call to the mic hands back a recorder the test
// resolves by hand, so the permission prompt can be held open.
const mic = vi.hoisted(() => ({
  calls: 0,
  grant: (() => {}) as () => void,
  deny: (() => {}) as () => void,
  stop: vi.fn(async () => new Blob(["voice"])),
}));
vi.mock("../../../packages/core/src/audio.ts", () => ({
  startAudioRecording: () => {
    mic.calls += 1;
    return new Promise((resolve, reject) => {
      mic.grant = () =>
        resolve({ stream: { getAudioTracks: () => [], getTracks: () => [] }, stop: mic.stop });
      mic.deny = () => reject(new Error("NotAllowedError"));
    });
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mic.calls = 0;
  mic.stop.mockClear();
  Object.assign(URL, { createObjectURL: () => "blob:clip", revokeObjectURL: () => {} });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    (b.getAttribute("aria-label") ?? b.textContent?.trim() ?? "").startsWith(label),
  );
const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});
function typeInto(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("VoiceNote", () => {
  it("asks for the mic once, and records when it is granted", async () => {
    act(() => root.render(<VoiceNote onChange={() => {}} />));
    act(() => button("Record a voice note")?.click());
    expect(mic.calls).toBe(1);
    expect(button("Waiting for the microphone")?.disabled).toBe(false);

    mic.grant();
    await settle();
    expect(button("Stop recording")?.disabled).toBe(false);
  });

  it("gives up on a prompt the user hasn't answered, and lets a late grant go", async () => {
    act(() => root.render(<VoiceNote onChange={() => {}} />));
    act(() => button("Record a voice note")?.click());
    act(() => button("Waiting for the microphone")?.click());
    expect(button("Record a voice note")).toBeDefined();
    expect(mic.calls).toBe(1);

    mic.grant();
    await settle();
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(button("Stop recording")).toBeUndefined();
  });

  it("lets the mic go when it comes up after the form has gone", async () => {
    act(() => root.render(<VoiceNote onChange={() => {}} />));
    act(() => button("Record a voice note")?.click());
    act(() => root.render(null));

    mic.grant();
    await settle();
    expect(mic.stop).toHaveBeenCalledOnce();
  });

  it("tells the form each phase it goes through", async () => {
    const phases: string[] = [];
    act(() => root.render(<VoiceNote onChange={() => {}} onPhaseChange={(p) => phases.push(p)} />));
    act(() => button("Record a voice note")?.click());
    mic.grant();
    await settle();
    await act(async () => button("Stop recording")?.click());
    await settle();
    expect(phases).toEqual(["idle", "requesting", "recording", "stopping", "recorded"]);
    expect(button("Play voice note")).toBeDefined();
  });

  it("clears its error when the clip is deleted", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.reject(new Error("no audio output")));
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    try {
      act(() => root.render(<VoiceNote onChange={() => {}} />));
      act(() => button("Record a voice note")?.click());
      mic.grant();
      await settle();
      await act(async () => button("Stop recording")?.click());
      await settle();
      await act(async () => button("Play voice note")?.click());
      await settle();
      expect(container.textContent).toContain("Playback unavailable");

      act(() => button("Delete voice note")?.click());
      expect(container.textContent).not.toContain("Playback unavailable");
    } finally {
      play.mockRestore();
      pause.mockRestore();
    }
  });

  it("goes back to idle when the mic is denied, and can be asked again", async () => {
    act(() => root.render(<VoiceNote onChange={() => {}} />));
    act(() => button("Record a voice note")?.click());
    mic.deny();
    await settle();
    expect(container.textContent).toContain("Mic blocked");
    expect(button("Record a voice note")?.disabled).toBe(false);
  });
});

describe("Send while a voice note records", () => {
  it("goes ahead while the mic prompt is up, and lets the mic go if it comes later", async () => {
    const onSubmit = vi.fn();
    act(() =>
      root.render(<Composer position="bottom-right" onCancel={() => {}} onSubmit={onSubmit} />),
    );
    act(() => button("Prefer to type?")?.click());
    act(() => typeInto(container.querySelector("textarea")!, "Total is wrong"));
    act(() => button("Record a voice note")?.click());
    // a prompt the user ignores must not trap what they typed
    expect(button("Send")?.disabled).toBe(false);
    act(() => button("Send")?.click());
    expect(onSubmit).toHaveBeenCalledWith("Total is wrong", null);

    mic.grant();
    await settle();
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(button("Stop recording")).toBeUndefined();
  });

  it("is held in the bug composer until the clip is in", async () => {
    const onSubmit = vi.fn();
    act(() =>
      root.render(<Composer position="bottom-right" onCancel={() => {}} onSubmit={onSubmit} />),
    );
    act(() => button("Record a voice note")?.click());
    mic.grant();
    await settle();
    expect(button("Send")?.disabled).toBe(true);

    await act(async () => button("Stop recording")?.click());
    await settle();
    expect(button("Send")?.disabled).toBe(false);
    act(() => button("Send")?.click());
    expect(onSubmit).toHaveBeenCalledWith("", expect.any(Blob));
  });

  it("is held in the feature form until the clip is in", async () => {
    const onSubmit = vi.fn();
    act(() =>
      root.render(
        <FeatureComposer
          position="bottom-right"
          onScreenshot={() => {}}
          onRemoveScreenshot={() => {}}
          onCancel={() => {}}
          onSubmit={onSubmit}
        />,
      ),
    );
    act(() => typeInto(container.querySelector("textarea")!, "Dark mode"));
    expect(button("Send idea")?.disabled).toBe(false);
    act(() => button("Record a voice note")?.click());
    mic.grant();
    await settle();
    expect(button("Send idea")?.disabled).toBe(true);

    await act(async () => button("Stop recording")?.click());
    await settle();
    act(() => button("Send idea")?.click());
    expect(onSubmit).toHaveBeenCalledWith("Dark mode", expect.any(Blob), undefined);
  });
});
