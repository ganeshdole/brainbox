import type { IssueKind, Recording } from "@ganeshdole/brainbox-core";

/** Where the widget is in a report, and what that step needs. The report
 *  itself (screenshot, bake, session, what gets sent) lives in the core
 *  `Draft`; this is only the UI's position in the flow. */
export type Step =
  | { name: "idle" }
  | { name: "choosing" }
  | { name: "marking" }
  | { name: "recording"; recording: Recording }
  /** Stop was pressed: the recorder is handing over the session and the
   *  last frame, which can take seconds on a big page. */
  | { name: "stopping" }
  | { name: "composing" }
  | { name: "requesting" }
  | { name: "submitting" }
  | { name: "done"; issueId: string }
  /** `retry`: the form can be brought back as it was (a failed send). A
   *  recording that failed has nothing to go back to. */
  | { name: "error"; message: string; retry: boolean };

export type StepName = Step["name"];

export interface Flow {
  step: Step;
  /** Which form the report goes through: a feature request has its own, and
   *  its screenshot is a detour that comes back to it. */
  kind: IssueKind;
  /** Bumped by every reset. An async result carries the run it began in,
   *  and one from a run the user has since closed is dropped. */
  run: number;
}

export type FlowAction =
  /** The widget was opened on the chooser. */
  | { type: "open" }
  /** Start marking up a screenshot. */
  | { type: "mark" }
  /** The marks are done: on to the form. */
  | { type: "marked" }
  /** Start a feature request. */
  | { type: "feature" }
  /** Back to the feature form without its screenshot. */
  | { type: "dropScreenshot" }
  | { type: "record"; recording: Recording }
  /** Stop that recording (the user's click or the duration cap; once). */
  | { type: "stop"; recording: Recording }
  | { type: "stopped"; run: number }
  | { type: "submit" }
  | { type: "sent"; run: number; issueId: string }
  | { type: "failed"; run: number; message: string; retry: boolean }
  /** Back from an error to the form, with what was in it. */
  | { type: "retry" }
  | { type: "reset" };

export const initialFlow = (open: boolean): Flow => ({
  step: open ? { name: "choosing" } : { name: "idle" },
  kind: "bug",
  run: 0,
});

/** Whether a new report may start: a host's `start()` must not restart one
 *  under way. */
export const canStart = (flow: Flow): boolean =>
  flow.step.name === "idle" || flow.step.name === "choosing";

/** The form a report is written in, kept mounted (hidden) through the steps
 *  that come back to it, so what the user typed or said survives them. */
export function formMounted(flow: Flow): boolean {
  const { step } = flow;
  if (step.name === "submitting") return true;
  if (step.name === "error") return step.retry;
  if (flow.kind === "feature") return step.name === "requesting" || step.name === "marking";
  return step.name === "composing";
}

/** The form for this kind of report. */
const form = (kind: IssueKind): Step =>
  kind === "feature" ? { name: "requesting" } : { name: "composing" };

/**
 * The next state, or `flow` itself when the action does not apply where the
 * flow is. Every step change goes through here, so a second click, a late
 * promise or a host's `start()` mid-report can't move the flow somewhere it
 * shouldn't be.
 */
export function reduceFlow(flow: Flow, action: FlowAction): Flow {
  const { step } = flow;
  const to = (next: Step, kind = flow.kind): Flow => ({ ...flow, step: next, kind });
  // Results of async work only count in the run that started it.
  if ("run" in action && action.run !== flow.run) return flow;

  switch (action.type) {
    case "open":
      return step.name === "idle" ? to({ name: "choosing" }) : flow;
    case "mark":
      return canStart(flow) || step.name === "requesting" ? to({ name: "marking" }) : flow;
    case "marked":
      return step.name === "marking" ? to(form(flow.kind)) : flow;
    case "feature":
      return canStart(flow) ? to({ name: "requesting" }, "feature") : flow;
    case "dropScreenshot":
      return flow.kind === "feature" && (step.name === "marking" || step.name === "requesting")
        ? to({ name: "requesting" })
        : flow;
    case "record":
      return canStart(flow) ? to({ name: "recording", recording: action.recording }, "bug") : flow;
    case "stop":
      return step.name === "recording" && step.recording === action.recording
        ? to({ name: "stopping" })
        : flow;
    case "stopped":
      return step.name === "stopping" ? to({ name: "composing" }) : flow;
    case "submit":
      return step.name === form(flow.kind).name ? to({ name: "submitting" }) : flow;
    case "sent":
      return step.name === "submitting" ? to({ name: "done", issueId: action.issueId }) : flow;
    case "failed":
      return step.name === "submitting" || step.name === "recording" || step.name === "stopping"
        ? to({ name: "error", message: action.message, retry: action.retry })
        : flow;
    case "retry":
      return step.name === "error" && step.retry ? to(form(flow.kind)) : flow;
    case "reset":
      return { step: { name: "idle" }, kind: "bug", run: flow.run + 1 };
  }
}
