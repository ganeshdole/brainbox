import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canSessionRecord, preloadCapture, type Brainbox, type Mark, type Recording } from "@ganeshdole/brainbox-core";
import { useDraft } from "@ganeshdole/brainbox-react";
import type { TriggerMode } from "@ganeshdole/brainbox-shared";
import type { Position } from "./lib/position.ts";
import { widgetStore } from "./lib/widget-store.ts";
import { Launcher } from "./components/Launcher.tsx";
import { Chooser } from "./components/Chooser.tsx";
import { MarkupOverlay } from "./components/MarkupOverlay.tsx";
import { RecordOverlay } from "./components/RecordOverlay.tsx";
import { Composer } from "./components/Composer.tsx";
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
  | "submitting"
  | "done"
  | "error";

export function App({
  brainbox,
  hostEl,
  trigger,
  position,
}: {
  brainbox: Brainbox;
  /** The shadow host: left out of screenshots. */
  hostEl: HTMLElement;
  trigger: TriggerMode;
  position: Position;
}) {
  // Open/closed is shared with the host (`useBrainboxWidget`, `mount().open()`),
  // so it lives outside this component and the screen follows it.
  const ui = useMemo(() => widgetStore(brainbox), [brainbox]);
  const [status, setStatus] = useState<Status>(() => (ui.isOpen() ? "choosing" : "idle"));
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState("");
  const [issueId, setIssueId] = useState("");

  // One draft for the lifetime of the widget; `cancel()` resets it between runs.
  const draft = useMemo(() => brainbox.draft({ exclude: hostEl }), [brainbox, hostEl]);
  const report = useDraft(draft);

  const reset = useCallback(() => {
    draft.cancel();
    setRecording(null);
    setStatus("idle");
    setError("");
    setIssueId("");
    ui.close();
  }, [draft, ui]);

  // Fetch the capture libraries while the user is still choosing, so the
  // screenshot or recording they pick isn't waiting on the network.
  const open = status !== "idle";
  useEffect(() => {
    if (open) preloadCapture();
  }, [open]);

  // While a panel is up the widget is a dialog over the page, and says so on
  // the shadow host, the one element the host's document can see. Many focus
  // traps already let events from another dialog through, so a host modal left
  // open behind the composer stops eating its spaces, Enters and Tabs. Not
  // while recording: then the user is working in the host page itself.
  const modal = open && status !== "recording";
  useEffect(() => {
    if (!modal) return;
    hostEl.setAttribute("role", "dialog");
    hostEl.setAttribute("aria-modal", "true");
    hostEl.setAttribute("aria-label", "Brainbox feedback");
    return () => {
      hostEl.removeAttribute("role");
      hostEl.removeAttribute("aria-modal");
      hostEl.removeAttribute("aria-label");
    };
  }, [hostEl, modal]);

  const startMarkup = useCallback(() => {
    draft.captureScreenshot();
    setStatus("marking");
  }, [draft]);

  const onMarksDone = useCallback(
    (marks: Mark[]) => {
      draft.markUp(marks);
      setStatus("composing");
    },
    [draft],
  );

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
  // a host's `start(mode)` goes straight into a screenshot or a recording.
  useEffect(() => {
    const sync = () => {
      if (!ui.isOpen()) return reset();
      const mode = ui.takeStart();
      if (!mode) return setStatus((s) => (s === "idle" ? "choosing" : s));
      if (statusRef.current !== "idle" && statusRef.current !== "choosing") return;
      if (mode === "screenshot") startMarkup();
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
  }, [ui, reset, startMarkup, startRecord]);

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

  return (
    <>
      {trigger === "floating" && status === "idle" && (
        <Launcher position={position} onClick={ui.open} />
      )}
      {status === "choosing" && (
        <Chooser
          position={position}
          canRecord={canSessionRecord()}
          onScreenshot={startMarkup}
          onRecord={startRecord}
          onCancel={reset}
        />
      )}
      {status === "marking" && (
        <MarkupOverlay
          frozenUrl={report.screenshotUrl ?? undefined}
          pending={report.screenshotPending}
          failed={report.screenshotFailed}
          onDone={onMarksDone}
          onCancel={reset}
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
      {status === "submitting" && <Result kind="loading" position={position} />}
      {status === "done" && (
        <Result kind="success" id={issueId} position={position} onClose={reset} />
      )}
      {status === "error" && (
        <Result kind="error" message={error} position={position} onClose={reset} />
      )}
    </>
  );
}
