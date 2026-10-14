import { useState } from "react";
import { ImageOff, Loader2, Pencil, Play, Send, X } from "./icons.tsx";
import { VoiceNote } from "./VoiceNote.tsx";
import { posClass, type Position } from "../lib/position.ts";

export function Composer({
  screenshotUrl,
  videoUrl,
  sessionReady,
  voiceCaptured,
  capturePending,
  captureFailed,
  position,
  onCancel,
  onSubmit,
}: {
  screenshotUrl?: string;
  videoUrl?: string;
  sessionReady?: boolean;
  voiceCaptured?: boolean;
  /** Screenshot still rasterising - the composer opens without waiting for it. */
  capturePending?: boolean;
  captureFailed?: boolean;
  position: Position;
  onCancel: () => void;
  onSubmit: (text: string, audio: Blob | null) => void;
}) {
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  // The record flow already captures voice, so the composer only offers a mic
  // when there isn't one attached already.
  const voiceDone = !!videoUrl || !!voiceCaptured;
  const [typing, setTyping] = useState(voiceDone);

  const canSend = !captureFailed || !!text.trim() || !!audio || voiceDone || !!sessionReady;

  return (
    <div
      className={`fixed ${posClass(position)} z-[2147483647] w-96 rounded-2xl border border-default bg-elevated p-4 shadow-3xl`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-emphasis">Send feedback</span>
        <button onClick={onCancel} aria-label="Close" className="text-muted hover:text-emphasis">
          <X className="h-4 w-4" />
        </button>
      </div>

      {capturePending ? (
        <div className="mb-3 flex h-40 items-center justify-center rounded-lg border border-default bg-interactive">
          <span className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grabbing the screenshot
          </span>
        </div>
      ) : captureFailed ? (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-warning-subtle bg-warning p-3 text-xs text-warning">
          <ImageOff className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t grab the screenshot - your
          note still gets through.
        </p>
      ) : videoUrl ? (
        <video
          controls
          src={videoUrl}
          className="mb-3 max-h-48 w-full rounded-lg border border-default"
        />
      ) : sessionReady && screenshotUrl ? (
        <div className="relative mb-3 overflow-hidden rounded-lg border border-default">
          <img
            src={screenshotUrl}
            alt="Recording preview"
            className="max-h-44 w-full bg-canvas object-contain"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <Play className="h-4 w-4 text-white" />
            </span>
          </span>
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
            Recording{voiceCaptured ? " · voice" : ""} - replays in the dashboard
          </span>
        </div>
      ) : screenshotUrl ? (
        <img
          src={screenshotUrl}
          alt="Captured screenshot"
          className="mb-3 max-h-44 w-full rounded-lg border border-default bg-canvas object-contain"
        />
      ) : sessionReady ? (
        <p className="mb-3 rounded-lg border border-default bg-interactive p-3 text-xs text-default">
          ✓ Session recorded{voiceCaptured ? " with voice" : ""} - it will replay in the dashboard.
        </p>
      ) : null}

      {/* Voice leads and is the only thing on screen by default - an empty
          textarea sitting above it made the panel look inert and buried the mic.
          Typing is one click away for whoever wants it. */}
      <div className="overflow-hidden rounded-xl border border-default bg-background focus-within:border-interactive">
        {!voiceDone && <VoiceNote onChange={setAudio} />}
        {typing && (
          <div className={voiceDone ? "" : "border-t border-subtle"}>
            <textarea
              value={text}
              maxLength={10000}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              placeholder={voiceDone ? "Anything to add?" : "Describe what went wrong"}
              className="h-20 w-full resize-none bg-transparent p-3 text-sm text-default outline-none placeholder:text-placeholder"
            />
          </div>
        )}
      </div>

      {!typing && (
        <button
          onClick={() => setTyping(true)}
          className="mt-2 flex items-center gap-1.5 text-xs text-default hover:text-emphasis"
        >
          <Pencil className="h-3 w-3" /> Prefer to type?
        </button>
      )}

      <button
        onClick={() => onSubmit(text, audio)}
        disabled={!canSend}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2 text-sm font-medium text-on-brand shadow-button hover:bg-brand-hover disabled:opacity-40"
      >
        <Send className="h-4 w-4" /> Send
      </button>
    </div>
  );
}
