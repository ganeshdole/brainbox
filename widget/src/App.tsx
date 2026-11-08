import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  canSessionRecord,
  type Brainbox,
  type Mark,
  type Recording,
  type SubmitInput,
} from "@ganeshdole/brainbox-core";
import { useDraft } from "@ganeshdole/brainbox-react";
import type { TriggerMode } from "@ganeshdole/brainbox-shared";
import {
  canStart,
  formMounted,
  initialFlow,
  reduceFlow,
  type Flow,
  type FlowAction,
} from "./lib/flow.ts";
import type { Position } from "./lib/position.ts";
import { widgetStore } from "./lib/widget-store.ts";
import type { WidgetComponents } from "./slots.ts";
import * as builtIn from "./components/screens.ts";

const reason = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function App({
  brainbox,
  hostEl,
  trigger,
  position,
  featureRequests,
  components = {},
}: {
  brainbox: Brainbox;
  /** The shadow host: left out of screenshots. */
  hostEl: HTMLElement;
  trigger: TriggerMode;
  position: Position;
  /** Whether the chooser offers "Suggest a feature". */
  featureRequests: boolean;
  /** The host's own screens, in place of ours, step by step. */
  components?: WidgetComponents;
}) {
  const Launcher = components.Launcher ?? builtIn.Launcher;
  const Chooser = components.Chooser ?? builtIn.Chooser;
  const MarkupOverlay = components.MarkupOverlay ?? builtIn.MarkupOverlay;
  const RecordOverlay = components.RecordOverlay ?? builtIn.RecordOverlay;
  const Composer = components.Composer ?? builtIn.Composer;
  const FeatureComposer = components.FeatureComposer ?? builtIn.FeatureComposer;
  const Result = components.Result ?? builtIn.Result;

  // Open/closed is shared with the host (`useBrainboxWidget`, `mount().open()`),
  // so it lives outside this component and the flow follows it: the store
  // opening moves the flow off idle, and the flow going back to idle closes
  // the store. Nothing else changes either.
  const ui = useMemo(() => widgetStore(brainbox), [brainbox]);

  // The flow is state for rendering, and a ref for deciding: a check made in
  // a click or a store notification must see a step changed earlier in the
  // same tick, which state only shows on the next render.
  const [flow, setFlow] = useState<Flow>(() => initialFlow(ui.isOpen()));
  const flowRef = useRef(flow);
  /** Apply `action`; false when it doesn't apply where the flow is. */
  const dispatch = useCallback((action: FlowAction): boolean => {
    const next = reduceFlow(flowRef.current, action);
    if (next === flowRef.current) return false;
    flowRef.current = next;
    setFlow(next);
    return true;
  }, []);
  const { step, kind } = flow;

  // One draft for the lifetime of the widget; `cancel()` resets it between runs.
  const draft = useMemo(() => brainbox.draft({ exclude: hostEl }), [brainbox, hostEl]);
  const report = useDraft(draft);

  // Closing the store notifies the listener below, which resets: the guard
  // keeps a reset from running itself a second time on the way.
  const resetting = useRef(false);
  const reset = useCallback(() => {
    if (resetting.current) return;
    resetting.current = true;
    try {
      draft.cancel();
      dispatch({ type: "reset" });
      ui.close();
    } finally {
      resetting.current = false;
    }
  }, [draft, dispatch, ui]);

  // Fetch the capture libraries while the user is still choosing, so the
  // screenshot or recording they pick isn't waiting on the network.
  const open = step.name !== "idle";
  useEffect(() => {
    if (open) brainbox.preloadCapture();
  }, [open, brainbox]);

  // Not a dialog while recording: then the user is working in the host page.
  const modal = open && step.name !== "recording";

  const startMarkup = useCallback(() => {
    if (dispatch({ type: "mark" })) draft.captureScreenshot();
  }, [draft, dispatch]);

  const onMarksDone = useCallback(
    (marks: Mark[]) => {
      if (dispatch({ type: "marked" })) draft.markUp(marks);
    },
    [draft, dispatch],
  );

  const startFeature = useCallback(() => {
    dispatch({ type: "feature" });
  }, [dispatch]);

  // Back to the form without the screenshot. The draft holds nothing else of a
  // feature request; its words live in the form.
  const dropScreenshot = useCallback(() => {
    if (dispatch({ type: "dropScreenshot" })) draft.cancel();
  }, [draft, dispatch]);

  const finishRecording = useCallback(
    async (rec: Recording) => {
      const { run } = flowRef.current;
      // Once: the cap and the user's click can both get here.
      if (!dispatch({ type: "stop", recording: rec })) return;
      try {
        await rec.stop();
        dispatch({ type: "stopped", run });
      } catch (e) {
        dispatch({ type: "failed", run, message: reason(e, "Recording failed"), retry: false });
      }
    },
    [dispatch],
  );

  // rrweb DOM recording - starts instantly, no permission prompt, captures only the app.
  const startRecord = useCallback(() => {
    if (!canStart(flowRef.current)) return;
    let rec: Recording;
    try {
      rec = draft.startRecording({ onAutoStop: () => void finishRecording(rec) });
    } catch {
      dispatch({ type: "open" });
      return;
    }
    dispatch({ type: "record", recording: rec });
    const { run } = flowRef.current;
    // A recorder that never loads says so now, not after a minute of clock.
    rec.ready.catch((e: unknown) => {
      dispatch({ type: "failed", run, message: reason(e, "Couldn't start recording"), retry: false });
    });
  }, [draft, dispatch, finishRecording]);

  // The screen follows the shared open state. `open()` lands on the chooser;
  // a host's `start(mode)` goes straight into a screenshot, a recording or a
  // feature request, unless a report is already under way.
  useEffect(() => {
    const sync = () => {
      if (!ui.isOpen()) return reset();
      const mode = ui.takeStart();
      if (!mode) return void dispatch({ type: "open" });
      if (!canStart(flowRef.current)) return;
      if (mode === "screenshot") startMarkup();
      else if (mode === "feature") startFeature();
      else if (canSessionRecord()) startRecord();
      else dispatch({ type: "open" });
    };
    const unsubscribe = ui.subscribe(sync);
    // A start() made before this subscription, e.g. `mount()` then `start()`
    // in one tick, notified no one. Pick it up once, as a store notification
    // would: deferred, and skipped if this effect was torn down meanwhile.
    let live = true;
    queueMicrotask(() => {
      if (live && ui.isOpen()) sync();
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [ui, reset, dispatch, startMarkup, startRecord, startFeature]);

  const send = useCallback(
    async (input: SubmitInput) => {
      const { run } = flowRef.current;
      if (!dispatch({ type: "submit" })) return;
      try {
        const { id } = await draft.submit(input);
        dispatch({ type: "sent", run, issueId: id ?? "" });
      } catch (e) {
        // Kept: the form, what is in it and the draft, for "Try again".
        dispatch({ type: "failed", run, message: reason(e, "Upload failed"), retry: true });
      }
    },
    [draft, dispatch],
  );

  const retry = useCallback(() => {
    dispatch({ type: "retry" });
  }, [dispatch]);

  // The form stays mounted, hidden, through the steps that come back to it
  // (the feature request's markup, sending, a failed send), so what the user
  // typed or said is still there.
  const showForm = formMounted(flow);
  const formHidden = step.name !== (kind === "feature" ? "requesting" : "composing");

  return (
    <>
      {/* First, so it commits before any panel below autofocuses. */}
      <DialogMark hostEl={hostEl} active={modal} />
      {trigger === "floating" && step.name === "idle" && (
        <Launcher position={position} onClick={ui.open} />
      )}
      {step.name === "choosing" && (
        <Chooser
          position={position}
          canRecord={canSessionRecord()}
          onScreenshot={startMarkup}
          onRecord={startRecord}
          onFeature={featureRequests ? startFeature : undefined}
          onCancel={reset}
        />
      )}
      {step.name === "marking" && (
        <MarkupOverlay
          screenshotUrl={report.screenshotUrl ?? undefined}
          capturePending={report.screenshotPending}
          captureFailed={report.screenshotFailed}
          onDone={onMarksDone}
          onCancel={kind === "feature" ? dropScreenshot : reset}
        />
      )}
      {step.name === "recording" && (
        <RecordOverlay
          annotations={step.recording.annotations}
          onStop={() => void finishRecording(step.recording)}
          micActive={step.recording.micActive}
          onMuteChange={step.recording.setMicMuted}
        />
      )}
      {step.name === "stopping" && (
        <Result kind="loading" message="Finishing the recording…" position={position} />
      )}
      {kind === "bug" && showForm && (
        <div hidden={formHidden}>
          <Composer
            screenshotUrl={report.screenshotUrl ?? undefined}
            sessionReady={report.hasSession}
            voiceCaptured={report.hasVoice}
            capturePending={report.screenshotPending}
            captureFailed={report.screenshotFailed}
            position={position}
            onCancel={reset}
            onSubmit={(text, audio) => void send({ text, audio })}
          />
        </div>
      )}
      {kind === "feature" && showForm && (
        <div hidden={formHidden}>
          <FeatureComposer
            screenshotUrl={report.screenshotUrl ?? undefined}
            capturePending={report.screenshotPending}
            captureFailed={report.screenshotFailed}
            position={position}
            onScreenshot={startMarkup}
            onRemoveScreenshot={dropScreenshot}
            onCancel={reset}
            onSubmit={(text, audio, importance) =>
              void send({ text, audio, kind: "feature", importance })
            }
          />
        </div>
      )}
      {step.name === "submitting" && <Result kind="loading" position={position} />}
      {step.name === "done" && (
        <Result
          kind="success"
          id={step.issueId}
          thanks={kind === "feature" ? "Thanks! Your idea was sent." : undefined}
          position={position}
          onClose={reset}
        />
      )}
      {step.name === "error" && (
        <Result
          kind="error"
          message={step.message}
          position={position}
          onClose={reset}
          onRetry={step.retry ? retry : undefined}
        />
      )}
    </>
  );
}

/**
 * While a panel is up the widget is a dialog over the page, and says so on the
 * shadow host, the one element the host's document can see. Many focus traps
 * already let events from another dialog through, so a host modal left open
 * behind the composer stops eating its spaces, Enters and Tabs.
 *
 * The timing matters. A trap that pulls focus back on `focusin` judges the
 * composer's `autoFocus`, which React applies while committing the textarea,
 * before any passive effect, and before its ancestors' layout effects too. A
 * layout effect in an earlier sibling is committed ahead of it, so this
 * renders before every panel.
 */
function DialogMark({ hostEl, active }: { hostEl: HTMLElement; active: boolean }) {
  useLayoutEffect(() => {
    if (!active) return;
    hostEl.setAttribute("role", "dialog");
    hostEl.setAttribute("aria-modal", "true");
    hostEl.setAttribute("aria-label", "Brainbox feedback");
    return () => {
      hostEl.removeAttribute("role");
      hostEl.removeAttribute("aria-modal");
      hostEl.removeAttribute("aria-label");
    };
  }, [hostEl, active]);
  return null;
}
