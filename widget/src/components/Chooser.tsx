import { Camera, Lightbulb, Video, X } from "./icons.tsx";
import { posClass, type Position } from "../lib/position.ts";

/** The first panel after opening: what kind of report this is. */
export interface ChooserProps {
  /** The viewport corner it sits in. */
  position: Position;
  /** Whether this browser can record a session (`canSessionRecord()` from
   *  core). The built-in chooser hides Record when it can't. */
  canRecord: boolean;
  /** Freeze the page and mark it up. */
  onScreenshot: () => void;
  /** Start a session recording. */
  onRecord: () => void;
  /** Open the feature-request form. Unset when the host turned feature
   *  requests off, and the option should not be offered. */
  onFeature?: () => void;
  /** Close the widget. */
  onCancel: () => void;
}

export function Chooser({
  position,
  canRecord,
  onScreenshot,
  onRecord,
  onFeature,
  onCancel,
}: ChooserProps) {
  return (
    <div
      className={`fixed ${posClass(position)} z-[2147483647] w-72 rounded-2xl border border-default bg-elevated p-4 shadow-3xl`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-emphasis">Send feedback</span>
        <button onClick={onCancel} aria-label="Close" className="text-muted hover:text-emphasis">
          <X className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={onScreenshot}
        className="mb-2 flex w-full items-center gap-3 rounded-xl border border-default bg-interactive p-3 text-left hover:bg-interactive-hover"
      >
        <Camera className="h-5 w-5 shrink-0 text-emphasis" />
        <span>
          <span className="block text-sm font-medium text-emphasis">Screenshot</span>
          <span className="block text-xs text-muted">Mark up the page, then talk it through</span>
        </span>
      </button>

      {canRecord && (
        <button
          onClick={onRecord}
          className="mb-2 flex w-full items-center gap-3 rounded-xl border border-default bg-interactive p-3 text-left hover:bg-interactive-hover"
        >
          <Video className="h-5 w-5 shrink-0 text-emphasis" />
          <span>
            <span className="block text-sm font-medium text-emphasis">Record</span>
            <span className="block text-xs text-muted">Capture your actions · voice optional</span>
          </span>
        </button>
      )}

      {onFeature && (
        <button
          onClick={onFeature}
          className="flex w-full items-center gap-3 rounded-xl border border-default bg-interactive p-3 text-left hover:bg-interactive-hover"
        >
          <Lightbulb className="h-5 w-5 shrink-0 text-emphasis" />
          <span>
            <span className="block text-sm font-medium text-emphasis">Suggest a feature</span>
            <span className="block text-xs text-muted">Tell us what you wish it did</span>
          </span>
        </button>
      )}

      <a
        href="https://brainbox.ganeshdole.com?ref=widget"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center text-xs text-muted hover:text-emphasis"
      >
        Powered by <span className="font-medium">Brainbox</span>
      </a>
    </div>
  );
}
