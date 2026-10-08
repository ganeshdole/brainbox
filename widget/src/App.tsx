import { useCallback, useEffect, useMemo, useState } from "react";
import { canSessionRecord, type Brainbox, type Mark, type Recording } from "@brainbox/core";
import { useDraft } from "@brainbox/react";
import type { WidgetConfig } from "./lib/config.ts";
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
  config,
  hostEl,
}: {
  brainbox: Brainbox;
  config: WidgetConfig;
  hostEl: HTMLElement;
}) {
  const [status, setStatus] = useState<Status>("idle");
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
  }, [draft]);

  // window.Brainbox.open()/close() drive the widget programmatically.
  useEffect(() => {
    const open = () => setStatus((s) => (s === "idle" ? "choosing" : s));
    window.addEventListener("brainbox:open", open);
    window.addEventListener("brainbox:close", reset);
    return () => {
      window.removeEventListener("brainbox:open", open);
      window.removeEventListener("brainbox:close", reset);
    };
  }, [reset]);

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
      {config.mode === "float" && status === "idle" && (
        <Launcher position={config.position} onClick={() => setStatus("choosing")} />
      )}
      {status === "choosing" && (
        <Chooser
          position={config.position}
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
          position={config.position}
          onCancel={reset}
          onSubmit={onSubmit}
        />
      )}
      {status === "submitting" && <Result kind="loading" position={config.position} />}
      {status === "done" && (
        <Result kind="success" id={issueId} position={config.position} onClose={reset} />
      )}
      {status === "error" && (
        <Result kind="error" message={error} position={config.position} onClose={reset} />
      )}
    </>
  );
}
