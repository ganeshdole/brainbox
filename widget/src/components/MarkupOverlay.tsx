import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import {
  boundsOf,
  hitTest,
  DEFAULT_COLOR,
  isDegenerate,
  nextColor,
  type Mark,
  type Tool,
} from "@brainbox/core";
import { isDragTool, nextMarkId, useDrawing } from "../lib/use-drawing.ts";
import { MarkShape, MarkTextInput } from "./MarkShape.tsx";
import { MarkupToolbar } from "./MarkupToolbar.tsx";

const KEY_TO_TOOL: Record<string, Tool> = {
  v: "select",
  r: "box",
  a: "arrow",
  p: "pen",
  t: "text",
};

/**
 * The markup step: the page is frozen and the end-user draws on it - boxes,
 * arrows, freehand, text - before saying what's wrong.
 *
 * The screenshot is already rasterising when this mounts, so the marks are held
 * as vectors here and baked onto the shot on the way out. Drawing never waits
 * on the capture, and everything stays undoable right up to Done.
 */
export function MarkupOverlay({
  frozenUrl,
  pending,
  failed,
  onDone,
  onCancel,
}: {
  /** The frozen page, once rasterised. Until then the live page shows through. */
  frozenUrl?: string;
  pending: boolean;
  failed: boolean;
  onDone: (marks: Mark[]) => void;
  onCancel: () => void;
}) {
  const [tool, setTool] = useState<Tool>("box");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [past, setPast] = useState<Mark[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number; value: string } | null>(null);

  // Both updaters stay pure - React may call one more than once, and pushing
  // history from inside `setMarks` would then record the same step twice and
  // cost the user a second press of undo to get back.
  const commit = useCallback(
    (next: Mark[]) => {
      setPast((p) => [...p, marks]);
      setMarks(next);
    },
    [marks],
  );

  const undo = useCallback(() => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setMarks(prev);
    setSelected(null);
  }, [past]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    commit(marks.filter((m) => m.id !== selected));
    setSelected(null);
  }, [commit, marks, selected]);

  const commitTyping = useCallback(() => {
    if (!typing) return;
    const mark: Mark = {
      kind: "text",
      id: nextMarkId(),
      color,
      x: typing.x,
      y: typing.y,
      text: typing.value,
    };
    setTyping(null);
    if (!isDegenerate(mark)) commit([...marks, mark]);
  }, [color, commit, marks, typing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While the text box is open every key belongs to it.
      if (typing) {
        if (e.key === "Escape") {
          e.preventDefault();
          setTyping(null);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        setColor(nextColor);
        return;
      }
      const next = KEY_TO_TOOL[e.key.toLowerCase()];
      if (next) {
        e.preventDefault();
        setTool(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, removeSelected, typing, undo]);

  // Committed marks accumulate here (unlike the recording overlay, where they
  // fade into the replay), so the hook hands each finished shape to the undo
  // stack rather than straight to the screen.
  const onDrawn = useCallback((m: Mark) => commit([...marks, m]), [commit, marks]);
  const { draft, begin, extend, finish } = useDrawing({ color, onCommit: onDrawn });

  const onPointerDown = (e: React.PointerEvent) => {
    // A click anywhere else closes an open text box rather than losing it.
    if (typing) {
      commitTyping();
      return;
    }
    if (tool === "select") {
      setSelected(hitTest(marks, { x: e.clientX, y: e.clientY }));
      return;
    }
    if (tool === "text") {
      setTyping({ x: e.clientX, y: e.clientY, value: "" });
      return;
    }
    if (isDragTool(tool)) {
      setSelected(null);
      begin(tool, e);
    }
  };

  const committed = useMemo(() => marks.map((m) => <MarkShape key={m.id} mark={m} />), [marks]);

  const selectedBounds = useMemo(() => {
    const m = marks.find((x) => x.id === selected);
    return m ? boundsOf(m) : null;
  }, [marks, selected]);

  const cursor =
    tool === "select" ? "cursor-default" : tool === "text" ? "cursor-text" : "cursor-crosshair";

  return (
    <div
      className={`fixed inset-0 z-[2147483647] touch-none select-none overflow-hidden ${cursor}`}
      onPointerDown={onPointerDown}
      onPointerMove={extend}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {frozenUrl ? (
        <img
          src={frozenUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        // Until the freeze lands the live page shows through, dimmed - the user
        // can already start drawing and the marks land in the same coordinates.
        <div className="absolute inset-0 bg-black/30" />
      )}

      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {/* Held apart from the draft on purpose: the committed layer keeps the
            same element identities across a stroke, so React skips it entirely
            and only the one shape being drawn re-renders per frame. */}
        {committed}
        {draft && <MarkShape mark={draft} />}
        {selectedBounds && (
          <rect
            x={selectedBounds.x - 4}
            y={selectedBounds.y - 4}
            width={selectedBounds.width + 8}
            height={selectedBounds.height + 8}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
      </svg>

      {typing && (
        <MarkTextInput
          at={typing}
          color={color}
          onChange={(value) => setTyping({ ...typing, value })}
          onCommit={commitTyping}
          onCancel={() => setTyping(null)}
        />
      )}

      {/* Stacked just above the toolbar, not at the top of the viewport (#62):
          the top of the page is the header, nav and hero - very often the exact
          thing the user opened the widget to report - and a pill sitting over it
          hides what they came to mark up. `bottom-24` clears the toolbar, whose
          height is fixed by its `h-9` controls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center">
        {pending ? (
          <span className="flex items-center gap-2 rounded-full bg-elevated px-3 py-1 text-xs text-default">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Freezing the page
          </span>
        ) : failed ? (
          <span className="flex items-center gap-2 rounded-full bg-warning px-3 py-1 text-xs text-warning">
            <ImageOff className="h-3.5 w-3.5" /> Couldn&apos;t grab the screenshot - your note
            still sends
          </span>
        ) : (
          <span className="rounded-full bg-elevated px-3 py-1 text-xs text-muted">
            Mark up what&apos;s wrong - or just hit Next to describe it
          </span>
        )}
      </div>

      <MarkupToolbar
        tool={tool}
        color={color}
        canUndo={past.length > 0}
        canDelete={!!selected}
        onTool={(t) => {
          commitTyping();
          setTool(t);
          setSelected(null);
        }}
        onColor={setColor}
        onUndo={undo}
        onDelete={removeSelected}
        onCancel={onCancel}
        onDone={() => onDone(marks)}
      />
    </div>
  );
}
