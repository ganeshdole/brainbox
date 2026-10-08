import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Mic,
  MicOff,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { DEFAULT_COLOR, nextColor, type Annotations, type Mark, type Tool } from "@brainbox/core";
import { isDragTool, nextMarkId, useDrawing } from "../lib/use-drawing.ts";
import { fmtDuration } from "../lib/time.ts";
import { MarkShape, MarkTextInput } from "./MarkShape.tsx";

/** `null` means "hands off - the user is driving their own app". Everything
 *  else arms the drawing surface. */
type RecordTool = Tool | null;

const TOOLS: { tool: Exclude<RecordTool, null | "select">; label: string; Icon: typeof Square }[] = [
  { tool: "box", label: "Box", Icon: Square },
  { tool: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { tool: "pen", label: "Draw", Icon: Pencil },
  { tool: "text", label: "Text", Icon: Type },
];

export function RecordOverlay({
  annotations,
  onStop,
  micActive,
  onMuteChange,
}: {
  /** The recording's marks on the host page - drawn here, cleared by core. */
  annotations: Annotations;
  onStop: () => void;
  micActive: () => boolean;
  onMuteChange: (muted: boolean) => void;
}) {
  const [secs, setSecs] = useState(0);
  const [tool, setTool] = useState<RecordTool>(null);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [typing, setTyping] = useState<{ x: number; y: number; value: string } | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [muted, setMuted] = useState(false);
  /** Marks left on the page. They persist now, so the user needs a way back.
   *  Mirrors the recording's own list rather than counting separately - core
   *  clears it too, and two tallies of the same thing drift. */
  const [onPage, setOnPage] = useState(0);
  // App passes inline arrows - keep them out of the effects' deps via refs.
  const micRef = useRef(micActive);
  useEffect(() => {
    micRef.current = micActive;
  }, [micActive]);
  const muteRef = useRef(onMuteChange);
  useEffect(() => {
    muteRef.current = onMuteChange;
  }, [onMuteChange]);

  useEffect(() => {
    setMicOn(micRef.current());
    const t = setInterval(() => {
      setSecs((s) => s + 1);
      // the mic can arrive seconds in, once the permission prompt is answered
      setMicOn(micRef.current());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    muteRef.current(muted);
  }, [muted]);

  // A finished mark goes straight to the host page, where rrweb records it as
  // ordinary mutations. It stays there until the user takes it away, so the
  // count below is only here to know whether undo/clear have anything to do.
  const commit = useCallback(
    (m: Mark) => {
      annotations.show(m);
      setOnPage(annotations.count());
    },
    [annotations],
  );

  const undo = useCallback(() => {
    annotations.undo();
    setOnPage(annotations.count());
  }, [annotations]);

  const clearAll = useCallback(() => {
    annotations.clear();
    setOnPage(annotations.count());
  }, [annotations]);

  const { draft, begin, extend, finish } = useDrawing({ color, onCommit: commit });

  const commitTyping = useCallback(() => {
    if (!typing) return;
    const text = typing.value.trim();
    setTyping(null);
    if (text) {
      annotations.show({ kind: "text", id: nextMarkId(), color, x: typing.x, y: typing.y, text });
      setOnPage(annotations.count());
    }
  }, [annotations, color, typing]);

  // Esc backs out of drawing rather than stopping the recording - stopping is a
  // deliberate act and shouldn't share a key with "put the pen down".
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (typing) setTyping(null);
      else setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, typing]);

  return (
    <>
      {tool && (
        <div
          className={`fixed inset-0 z-[2147483646] touch-none select-none ${
            tool === "text" ? "cursor-text" : "cursor-crosshair"
          }`}
          onPointerDown={(e) => {
            if (typing) {
              commitTyping();
              return;
            }
            if (tool === "text") {
              setTyping({ x: e.clientX, y: e.clientY, value: "" });
              return;
            }
            if (isDragTool(tool)) begin(tool, e);
          }}
          onPointerMove={extend}
          onPointerUp={finish}
          onPointerCancel={finish}
        >
          {/* Only the stroke in progress renders here. Once it's committed it
              belongs to the host page, so it appears in the replay - drawing it
              twice would double it up on screen. */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {draft && <MarkShape mark={draft} />}
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
        </div>
      )}

      {/* Bottom-centre, same as the markup toolbar. Both are the same kind of
          thing - a bar of drawing tools over a full-screen surface - so they
          belong in the same place. The corner `position` config is for the
          launcher, which sits in the customer's page; this doesn't. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483647] flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-default bg-elevated px-3 py-2 shadow-3xl">
        {/* Capture status in one group: the dot, the clock and whether voice is
            going in all answer the same question - "what is being recorded right
            now?" - so they shouldn't be at opposite ends of the bar. Voice is a
            control too, but it's read far more often than it's clicked. */}
        <span className="ml-1 flex items-center gap-2 text-sm text-emphasis">
          <span
            className="h-2.5 w-2.5 animate-pulse rounded-full"
            style={{ background: "#ef4444" }}
          />
          <span className="font-mono">{fmtDuration(secs)}</span>
        </span>

        {/* Voice is on by default, so this has to *say* so rather than being an
            icon the user has to interpret. Someone narrating a bug report needs
            to know they're being heard, and someone who didn't realise needs an
            obvious way out - a silent mic glyph gave them neither. */}
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          disabled={!micOn}
          title={
            !micOn
              ? "No mic - the recording has no voice"
              : muted
                ? "Voice off - click to record narration again"
                : "Voice on - click to mute"
          }
          aria-pressed={!muted && micOn}
          className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors disabled:opacity-40 ${
            micOn && !muted
              ? "bg-interactive text-emphasis"
              : "text-muted hover:bg-interactive-hover hover:text-emphasis"
          }`}
        >
          {micOn && !muted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          {micOn && !muted ? "Voice on" : "Voice off"}
        </button>

        <span className="mx-1 h-5 w-px bg-subtle" />

        {/* Hands-off is a tool like any other, and it's the default: the user is
            recording their app, not drawing on it, most of the time. */}
        <ToolButton
          label="Use the page"
          active={tool === null}
          onClick={() => {
            commitTyping();
            setTool(null);
          }}
        >
          <MousePointer2 className="h-4 w-4" />
        </ToolButton>

        {TOOLS.map(({ tool: t, label, Icon }) => (
          <ToolButton
            key={t}
            label={label}
            active={tool === t}
            onClick={() => {
              commitTyping();
              setTool(t);
            }}
          >
            <Icon className="h-4 w-4" />
          </ToolButton>
        ))}

        <button
          type="button"
          title="Colour"
          aria-label="Colour"
          onClick={() => setColor(nextColor)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-interactive-hover"
        >
          <span
            className="h-4 w-4 rounded-full border border-default"
            style={{ background: color }}
          />
        </button>

        <IconButton label="Undo last mark" disabled={onPage === 0} onClick={undo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Clear all marks" disabled={onPage === 0} onClick={clearAll}>
          <Trash2 className="h-4 w-4" />
        </IconButton>

        <span className="mx-1 h-5 w-px bg-subtle" />

        <button
          onClick={onStop}
          className="ml-1 flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-medium text-on-brand hover:bg-brand-hover"
        >
          <Square className="h-3 w-3" /> Stop
        </button>
        </div>
      </div>
    </>
  );
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-brand text-on-brand"
          : "text-default hover:bg-interactive-hover hover:text-emphasis"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-default hover:bg-interactive-hover hover:text-emphasis disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
