import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  canSessionRecord,
  preloadCapture,
  type Brainbox,
  type Importance,
  type IssueKind,
  type Mark,
  type Recording,
} from "@ganeshdole/brainbox-core";
import { useDraft } from "@ganeshdole/brainbox-react";
import type { TriggerMode } from "@ganeshdole/brainbox-shared";
import type { Position } from "./lib/position.ts";
import { widgetStore } from "./lib/widget-store.ts";
import { Launcher } from "./components/Launcher.tsx";
import { Chooser } from "./components/Chooser.tsx";
import { MarkupOverlay } from "./components/MarkupOverlay.tsx";
import { RecordOverlay } from "./components/RecordOverlay.tsx";
import { Composer } from "./components/Composer.tsx";
import { FeatureComposer } from "./components/FeatureComposer.tsx";
import { Result } from "./components/Result.tsx";

/** Which screen is showing. The report itself - screenshot, bake, recording,
 *  what gets sent - lives in the core `Draft`; this is only the UI's position
 *  in the flow. */
type Status =
  | "idle"
  | "choosing"
  | "marking"
  | "recording"
  | "composing"
  | "requesting"
  | "submitting"
  | "done"
  | "error";

export function App({
  brainbox,
  hostEl,
  trigger,
  position,
  featureRequests,
}: {
  brainbox: Brainbox;
  /** The shadow host: left out of screenshots. */
  hostEl: HTMLElement;
  trigger: TriggerMode;
  position: Position;
  /** Whether the chooser offers "Suggest a feature". */
  featureRequests: boolean;
}) {
  // Open/closed is shared with the host (`useBrainboxWidget`, `mount().open()`),
  // so it lives outside this component and the screen follows it.
  const ui = useMemo(() => widgetStore(brainbox), [brainbox]);
  const [status, setStatus] = useState<Status>(() => (ui.isOpen() ? "choosing" : "idle"));
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const [issueId, setIssueId] = useState("");
  // A feature request takes its own form, and its screenshot is a detour that
  // comes back to it rather than going on to the bug composer.
  const [kind, setKind] = useState<IssueKind>("bug");

  // One draft for the lifetime of the widget; `cancel()` resets it between runs.
  const draft = useMemo(() => brainbox.draft({ exclude: hostEl }), [brainbox, hostEl]);
  const report = useDraft(draft);

  const reset = useCallback(() => {
    draft.cancel();
    setRecording(null);
    setStatus("idle");
    setError("");
    setIssueId("");
    setKind("bug");
    ui.close();
  }, [draft, ui]);

  // Fetch the capture libraries while the user is still choosing, so the
  // screenshot or recording they pick isn't waiting on the network.
  const open = status !== "idle";
  useEffect(() => {
    if (open) preloadCapture();
  }, [open]);

  // Not a dialog while recording: then the user is working in the host page.
  const modal = open && status !== "recording";

  const startMarkup = useCallback(() => {
    draft.captureScreenshot();
    setStatus("marking");
  }, [draft]);

  const onMarksDone = useCallback(
    (marks: Mark[]) => {
      draft.markUp(marks);
      setStatus(kind === "feature" ? "requesting" : "composing");
    },
    [draft, kind],
  );

  const startFeature = useCallback(() => {
    setKind("feature");
    setStatus("requesting");
  }, []);

  // Back to the form without the screenshot. The draft holds nothing else of a
  // feature request; its words live in the form.
  const dropScreenshot = useCallback(() => {
    draft.cancel();
    setStatus("requesting");
  }, [draft]);

  const finishRecording = useCallback(async (rec: Recording) => {
    setRecording(null);
    try {
      await rec.stop();
      setStatus("composing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recording failed");
      setStatus("error");
    }
  }, []);

  // rrweb DOM recording - starts instantly, no permission prompt, captures only the app.
  const startRecord = useCallback(() => {
    try {
      const rec: Recording = draft.startRecording({
        onAutoStop: () => void finishRecording(rec),
      });
      setRecording(rec);
      setStatus("recording");
    } catch {
      setStatus("choosing");
    }
  }, [draft, finishRecording]);

  // Read by the store listener below, which must not restart a run under way.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // The screen follows the shared open state. `open()` lands on the chooser;
  // a host's `start(mode)` goes straight into a screenshot, a recording or a
  // feature request.
  useEffect(() => {
    const sync = () => {
      if (!ui.isOpen()) return reset();
      const mode = ui.takeStart();
      if (!mode) return setStatus((s) => (s === "idle" ? "choosing" : s));
      if (statusRef.current !== "idle" && statusRef.current !== "choosing") return;
      if (mode === "screenshot") startMarkup();
      else if (mode === "feature") startFeature();
      else if (canSessionRecord()) startRecord();
      else setStatus("choosing");
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
  }, [ui, reset, startMarkup, startRecord, startFeature]);

  const onSubmit = useCallback(
    async (text: string, audio: Blob | null) => {
      setStatus("submitting");
      try {
        const { id } = await draft.submit({ text, audio });
        setIssueId(id ?? "");
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setStatus("error");
      }
    },
    [draft],
  );

  const onSubmitFeature = useCallback(
    async (text: string, audio: Blob | null, importance: Importance | undefined) => {
      setStatus("submitting");
      try {
        const { id } = await draft.submit({ text, audio, kind: "feature", importance });
        setIssueId(id ?? "");
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setStatus("error");
      }
    },
    [draft],
  );

  return (
    <>
      {/* First, so it commits before any panel below autofocuses. */}
      <DialogMark hostEl={hostEl} active={modal} />
      {trigger === "floating" && status === "idle" && (
        <Launcher position={position} onClick={ui.open} />
      )}
      {status === "choosing" && (
        <Chooser
          position={position}
          canRecord={canSessionRecord()}
          onScreenshot={startMarkup}
          onRecord={startRecord}
          onFeature={featureRequests ? startFeature : undefined}
          onCancel={reset}
        />
      )}
      {status === "marking" && (
        <MarkupOverlay
          frozenUrl={report.screenshotUrl ?? undefined}
          pending={report.screenshotPending}
          failed={report.screenshotFailed}
          onDone={onMarksDone}
          onCancel={kind === "feature" ? dropScreenshot : reset}
        />
      )}
      {status === "recording" && recording && (
        <RecordOverlay
          annotations={recording.annotations}
          onStop={() => void finishRecording(recording)}
          micActive={recording.micActive}
          onMuteChange={recording.setMicMuted}
        />
      )}
      {status === "composing" && (
        <Composer
          screenshotUrl={report.screenshotUrl ?? undefined}
          sessionReady={report.hasSession}
          voiceCaptured={report.hasVoice}
          capturePending={report.screenshotPending}
          captureFailed={report.screenshotFailed}
          position={position}
          onCancel={reset}
          onSubmit={onSubmit}
        />
      )}
      {/* Kept mounted, hidden, while its screenshot is marked up, so what the
          user typed or said is still there when they come back. */}
      {kind === "feature" && (status === "requesting" || status === "marking") && (
        <div hidden={status === "marking"}>
          <FeatureComposer
            screenshotUrl={report.screenshotUrl ?? undefined}
            capturePending={report.screenshotPending}
            captureFailed={report.screenshotFailed}
            position={position}
            onScreenshot={startMarkup}
            onRemoveScreenshot={dropScreenshot}
            onCancel={reset}
            onSubmit={(text, audio, importance) => void onSubmitFeature(text, audio, importance)}
          />
        </div>
      )}
      {status === "submitting" && <Result kind="loading" position={position} />}
      {status === "done" && (
        <Result
          kind="success"
          id={issueId}
          thanks={kind === "feature" ? "Thanks! Your idea was sent." : undefined}
          position={position}
          onClose={reset}
        />
      )}
      {status === "error" && (
        <Result kind="error" message={error} position={position} onClose={reset} />
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
