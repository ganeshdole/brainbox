import { describe, expect, it } from "vitest";
import type { Recording } from "@ganeshdole/brainbox-core";
import { canStart, formMounted, initialFlow, reduceFlow, type Flow, type FlowAction } from "./flow.ts";

const recording = (): Recording => ({
  ready: Promise.resolve(),
  annotations: {
    show: () => {},
    undo: () => false,
    count: () => 0,
    inView: () => [],
    clear: () => {},
  },
  micActive: () => false,
  setMicMuted: () => {},
  stop: async () => {},
});
const run = (actions: FlowAction[], from: Flow = initialFlow(true)) =>
  actions.reduce(reduceFlow, from);

describe("reduceFlow", () => {
  it("starts one report at a time", () => {
    const marking = run([{ type: "mark" }]);
    expect(marking.step.name).toBe("marking");
    expect(canStart(marking)).toBe(false);
    // a host's start("record") mid-markup changes nothing
    expect(reduceFlow(marking, { type: "record", recording: recording() })).toBe(marking);
    expect(reduceFlow(marking, { type: "feature" })).toBe(marking);
  });

  it("stops a recording once, through stopping, onto the composer", () => {
    const rec = recording();
    const recordingFlow = run([{ type: "record", recording: rec }]);
    const stopping = reduceFlow(recordingFlow, { type: "stop", recording: rec });
    expect(stopping.step.name).toBe("stopping");
    // the cap and the click both asking
    expect(reduceFlow(stopping, { type: "stop", recording: rec })).toBe(stopping);
    expect(reduceFlow(stopping, { type: "stopped", run: 0 }).step.name).toBe("composing");
  });

  it("drops a result from a run the user has closed", () => {
    const rec = recording();
    const stopping = run([{ type: "record", recording: rec }, { type: "stop", recording: rec }]);
    const reopened = run([{ type: "reset" }, { type: "open" }], stopping);
    expect(reopened.run).toBe(1);
    expect(reduceFlow(reopened, { type: "stopped", run: 0 })).toBe(reopened);
    expect(reduceFlow(reopened, { type: "failed", run: 0, message: "x", retry: false })).toBe(
      reopened,
    );

    const submitting = run([{ type: "feature" }, { type: "submit" }]);
    const closed = reduceFlow(submitting, { type: "reset" });
    expect(reduceFlow(closed, { type: "sent", run: submitting.run, issueId: "late" })).toBe(closed);
  });

  it("brings a failed send back to its form, kept mounted all the way", () => {
    const composing = run([{ type: "mark" }, { type: "marked" }]);
    expect(composing.step.name).toBe("composing");
    const submitting = reduceFlow(composing, { type: "submit" });
    expect(formMounted(submitting)).toBe(true);
    const failed = reduceFlow(submitting, { type: "failed", run: 0, message: "Offline", retry: true });
    expect(failed.step).toEqual({ name: "error", message: "Offline", retry: true });
    expect(formMounted(failed)).toBe(true);
    expect(reduceFlow(failed, { type: "retry" }).step.name).toBe("composing");

    const feature = run([{ type: "feature" }, { type: "submit" }]);
    const featureFailed = reduceFlow(feature, { type: "failed", run: 0, message: "x", retry: true });
    expect(reduceFlow(featureFailed, { type: "retry" }).step.name).toBe("requesting");
  });

  it("offers no retry for a recording that failed", () => {
    const rec = recording();
    const failed = run([
      { type: "record", recording: rec },
      { type: "failed", run: 0, message: "Couldn't load widget-capture.js", retry: false },
    ]);
    expect(failed.step.name).toBe("error");
    expect(formMounted(failed)).toBe(false);
    expect(reduceFlow(failed, { type: "retry" })).toBe(failed);
  });

  it("sends only from the form its kind uses", () => {
    expect(reduceFlow(initialFlow(true), { type: "submit" }).step.name).toBe("choosing");
    const bugOnFeatureForm = { ...run([{ type: "feature" }]), kind: "bug" as const };
    expect(reduceFlow(bugOnFeatureForm, { type: "submit" })).toBe(bugOnFeatureForm);
  });

  it("takes a feature request's screenshot as a detour back to its form", () => {
    const marking = run([{ type: "feature" }, { type: "mark" }]);
    expect(marking).toMatchObject({ kind: "feature", step: { name: "marking" } });
    expect(formMounted(marking)).toBe(true);
    expect(reduceFlow(marking, { type: "marked" }).step.name).toBe("requesting");
    expect(reduceFlow(marking, { type: "dropScreenshot" }).step.name).toBe("requesting");
  });

  it("resets to idle as a bug report, in a new run", () => {
    const reset = run([{ type: "feature" }, { type: "reset" }]);
    expect(reset).toEqual({ step: { name: "idle" }, kind: "bug", run: 1 });
  });
});
