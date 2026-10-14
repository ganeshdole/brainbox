import { useState } from "react";
import type { Importance } from "@ganeshdole/brainbox-core";
import { Camera, ImageOff, Loader2, Send, X } from "./icons.tsx";
import { VoiceNote } from "./VoiceNote.tsx";
import { posClass, type Position } from "../lib/position.ts";

const IMPORTANCE: Array<{ value: Importance; label: string }> = [
  { value: "nice", label: "Nice to have" },
  { value: "important", label: "Important" },
  { value: "critical", label: "Blocking me" },
];

export interface FeatureComposerProps {
  /** The attached screenshot, marked up, as an object URL. */
  screenshotUrl?: string;
  /** The attached screenshot is still rasterising or baking. */
  capturePending?: boolean;
  /** The screenshot could not be taken. The request still goes out. */
  captureFailed?: boolean;
  /** The viewport corner it sits in. */
  position: Position;
  /** Take a screenshot to mark up. The built-in flow keeps this form mounted,
   *  hidden, until the markup is done, so what was typed survives. */
  onScreenshot: () => void;
  /** Drop the attached screenshot and stay on the form. */
  onRemoveScreenshot: () => void;
  /** Throw the request away and close. */
  onCancel: () => void;
  /** Send it. A feature request needs text or a voice note. */
  onSubmit: (text: string, audio: Blob | null, importance: Importance | undefined) => void;
}

/** The feature-request form. Words lead, typed or spoken: an idea is told, not
 *  shown. How much it matters and a screenshot are both optional. */
export function FeatureComposer({
  screenshotUrl,
  capturePending,
  captureFailed,
  position,
  onScreenshot,
  onRemoveScreenshot,
  onCancel,
  onSubmit,
}: FeatureComposerProps) {
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [importance, setImportance] = useState<Importance | undefined>();

  const canSend = !!text.trim() || !!audio;
  const hasShot = !!screenshotUrl || !!capturePending;

  return (
    <div
      className={`fixed ${posClass(position)} z-[2147483647] w-96 rounded-2xl border border-default bg-elevated p-4 shadow-3xl`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-emphasis">Suggest a feature</span>
        <button onClick={onCancel} aria-label="Close" className="text-muted hover:text-emphasis">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-default bg-background focus-within:border-interactive">
        <textarea
          value={text}
          maxLength={10000}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="What are you trying to do, and what's in the way?"
          aria-label="Your idea"
          className="h-24 w-full resize-none bg-transparent p-3 text-sm text-default outline-none placeholder:text-placeholder"
        />
        <div className="border-t border-subtle">
          <VoiceNote onChange={setAudio} prompt="Or say it out loud" />
        </div>
      </div>

      <p className="mb-1.5 mt-3 text-xs text-muted">How much does it matter to you?</p>
      <div className="flex gap-1.5" role="group" aria-label="How much it matters">
        {IMPORTANCE.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={importance === option.value}
            onClick={() => setImportance((v) => (v === option.value ? undefined : option.value))}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition ${
              importance === option.value
                ? "border-interactive bg-interactive text-emphasis"
                : "border-default text-default hover:bg-interactive-hover"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {captureFailed ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-warning-subtle bg-warning p-2 text-xs text-warning">
          <ImageOff className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t grab the screenshot - your
          idea still gets through.
        </p>
      ) : hasShot ? (
        <div className="mt-3 flex items-center gap-3">
          {screenshotUrl ? (
            <img
              src={screenshotUrl}
              alt="Attached screenshot"
              className="h-12 w-20 rounded-md border border-default bg-canvas object-cover object-top"
            />
          ) : (
            <span className="flex h-12 w-20 items-center justify-center rounded-md border border-default bg-interactive">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
            </span>
          )}
          <span className="flex-1 text-xs text-default">Screenshot attached</span>
          <button onClick={onRemoveScreenshot} className="text-xs text-muted hover:text-emphasis">
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={onScreenshot}
          className="mt-3 flex items-center gap-1.5 text-xs text-default hover:text-emphasis"
        >
          <Camera className="h-3.5 w-3.5" /> Add a screenshot
        </button>
      )}

      <button
        onClick={() => onSubmit(text, audio, importance)}
        disabled={!canSend}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2 text-sm font-medium text-on-brand shadow-button hover:bg-brand-hover disabled:opacity-40"
      >
        <Send className="h-4 w-4" /> Send idea
      </button>
    </div>
  );
}
