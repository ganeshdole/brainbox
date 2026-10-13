import { Camera, Video, X } from "./icons.tsx";
import { posClass, type Position } from "../lib/position.ts";

export function Chooser({
  position,
  canRecord,
  onScreenshot,
  onRecord,
  onCancel,
}: {
  position: Position;
  canRecord: boolean;
  onScreenshot: () => void;
  onRecord: () => void;
  onCancel: () => void;
}) {
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
          className="flex w-full items-center gap-3 rounded-xl border border-default bg-interactive p-3 text-left hover:bg-interactive-hover"
        >
          <Video className="h-5 w-5 shrink-0 text-emphasis" />
          <span>
            <span className="block text-sm font-medium text-emphasis">Record</span>
            <span className="block text-xs text-muted">Capture your actions · voice optional</span>
          </span>
        </button>
      )}

      <a
        href="https://www.brainbox.sh?ref=widget"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center text-xs text-muted hover:text-emphasis"
      >
        Powered by <span className="font-medium">Brainbox</span>
      </a>
    </div>
  );
}
