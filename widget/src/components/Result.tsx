import { useEffect } from "react";
import { Check, Loader2, X } from "./icons.tsx";
import { posClass, type Position } from "../lib/position.ts";

const SUCCESS_DISMISS_MS = 3000;

export function Result({
  kind,
  id,
  message,
  position,
  onClose,
}: {
  kind: "loading" | "success" | "error";
  id?: string;
  message?: string;
  position: Position;
  onClose?: () => void;
}) {
  // success is a confirmation, not a decision - dismiss itself. Errors stay.
  useEffect(() => {
    if (kind !== "success" || !onClose) return;
    const t = setTimeout(onClose, SUCCESS_DISMISS_MS);
    return () => clearTimeout(t);
  }, [kind, onClose]);
  return (
    <div
      className={`fixed ${posClass(position)} z-[2147483647] w-72 rounded-2xl border border-default bg-elevated p-4 shadow-3xl`}
    >
      {kind === "loading" && (
        <p className="flex items-center gap-2 text-sm text-default">
          <Loader2 className="h-4 w-4 animate-spin" /> Sending…
        </p>
      )}

      {kind === "success" && (
        <div>
          <p className="flex items-center gap-2 text-sm text-success">
            <Check className="h-4 w-4" /> Thanks! Feedback sent.
          </p>
          {id && <p className="mt-1 font-mono text-xs text-muted">#{id.slice(0, 8)}</p>}
          <button onClick={onClose} className="mt-3 text-xs text-muted hover:text-emphasis">
            Close
          </button>
        </div>
      )}

      {kind === "error" && (
        <div>
          <p className="flex items-center gap-2 text-sm text-error">
            <X className="h-4 w-4" /> {message ?? "Something went wrong"}
          </p>
          <button onClick={onClose} className="mt-3 text-xs text-muted hover:text-emphasis">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
