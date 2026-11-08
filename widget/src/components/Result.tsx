import { useEffect } from "react";
import { Check, Loader2, X } from "./icons.tsx";
import { posClass, type Position } from "../lib/position.ts";

const SUCCESS_DISMISS_MS = 3000;

/** After Send: sending, sent, or failed. Also what shows while a recording
 *  finishes. */
export interface ResultProps {
  kind: "loading" | "success" | "error";
  /** The sent report's id, when the transport returned one. */
  id?: string;
  /** Why sending failed. On `loading`, what is under way: the built-in flow
   *  also shows this while a recording is finishing. Default "Sending…". */
  message?: string;
  /** What a success says: the built-in flow thanks a feature request
   *  differently from a bug report. */
  thanks?: string;
  /** The viewport corner it sits in. */
  position: Position;
  /** Close the widget. Unset while sending. The built-in success closes
   *  itself after a few seconds. On an error this throws the report away. */
  onClose?: () => void;
  /** On an error, go back and try again with the report as it was: the built-in
   *  flow returns to the form with what the user typed and said still in it.
   *  Unset when there is nothing to retry; then only Dismiss is offered. */
  onRetry?: () => void;
}

export function Result({
  kind,
  id,
  message,
  thanks = "Thanks! Feedback sent.",
  position,
  onClose,
  onRetry,
}: ResultProps) {
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
          <Loader2 className="h-4 w-4 animate-spin" /> {message ?? "Sending…"}
        </p>
      )}

      {kind === "success" && (
        <div>
          <p className="flex items-center gap-2 text-sm text-success">
            <Check className="h-4 w-4" /> {thanks}
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
          <div className="mt-3 flex gap-3">
            {onRetry && (
              <button onClick={onRetry} className="text-xs text-emphasis hover:text-default">
                Try again
              </button>
            )}
            <button onClick={onClose} className="text-xs text-muted hover:text-emphasis">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
