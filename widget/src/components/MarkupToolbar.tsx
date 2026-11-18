import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  MousePointer2,
  Pencil,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "./icons.tsx";
import { MARK_COLORS, type Tool } from "@ganeshdole/brainbox-core";

/** Single-key shortcuts, the way every markup tool does it. Shown in the
 *  tooltip so they're discoverable without a legend. */
const TOOLS: { tool: Tool; label: string; key: string; Icon: typeof Square }[] = [
  { tool: "select", label: "Select", key: "v", Icon: MousePointer2 },
  { tool: "box", label: "Box", key: "r", Icon: Square },
  { tool: "arrow", label: "Arrow", key: "a", Icon: ArrowUpRight },
  { tool: "pen", label: "Draw", key: "p", Icon: Pencil },
  { tool: "text", label: "Text", key: "t", Icon: Type },
];

/** The markup step's tools, colour, undo and Next. Controlled: it holds only
 *  whether its colour popover is open. Sits at the bottom of a positioned
 *  drawing surface and keeps its own presses off it. */
export interface MarkupToolbarProps {
  tool: Tool;
  color: string;
  canUndo: boolean;
  /** A mark is selected. */
  canDelete: boolean;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onUndo: () => void;
  onDelete: () => void;
  onCancel: () => void;
  /** Next: the marks are done. */
  onDone: () => void;
}

export function MarkupToolbar({
  tool,
  color,
  canUndo,
  canDelete,
  onTool,
  onColor,
  onUndo,
  onDelete,
  onCancel,
  onDone,
}: MarkupToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);

  // The swatch row is transient - anything else the user reaches for closes it.
  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: Event) => {
      if (!picker.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [pickerOpen]);

  return (
    // Centred with flex rather than `left-1/2 -translate-x-1/2`: transforms are
    // the thing that breaks first inside a shadow root (see `shadowCss`), and a
    // centring rule that can silently no-op isn't worth the risk.
    // On a phone the bar is wider than the screen, so under 32rem it breaks
    // into two rows (drawing, then undo and Next) instead of pushing Cancel
    // and Next off either edge, and drops its dividers, which would otherwise
    // start or end a row. Always two rows there, never one or three: the hint
    // above it (MarkupOverlay) climbs by exactly one row. Lifted by
    // the safe area, so it clears the home indicator where the page draws
    // under it.
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] flex justify-center">
      {/* The toolbar sits inside the drawing surface, so without this a press on
          any button is also a press on the canvas - with Text armed that plants
          a caret over the toolbar itself. The colour picker's own dismiss
          listener is capture-phase on `window`, so it still fires. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-default bg-elevated p-1.5 shadow-3xl max-[32rem]:max-w-[calc(100%-1rem)] max-[32rem]:flex-wrap max-[32rem]:justify-center"
      >
        {/* Leaving is a corner action, not something competing with the tools -
            so it's an icon on the far left, opposite the one button that moves
            the flow forward. */}
        <IconButton label="Cancel (Esc)" onClick={onCancel}>
          <X className="h-4 w-4" />
        </IconButton>

        <Divider />

        {TOOLS.map(({ tool: t, label, key, Icon }) => (
          <button
            key={t}
            type="button"
            title={`${label} (${key})`}
            aria-label={label}
            aria-pressed={t === tool}
            onClick={() => onTool(t)}
            // No colour transition: the tool also changes from the keyboard
            // (v, r, a, p, t), and a shortcut should land at once.
            className={`press flex h-9 w-9 items-center justify-center rounded-xl ${
              t === tool
                ? "bg-brand text-on-brand"
                : "text-default hover:bg-interactive-hover hover:text-emphasis"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}

        <Divider />

        {/* One swatch showing the current colour; the palette is a popover, so
            there's no second bar parked on screen for the whole session. */}
        <div ref={picker} className="relative">
          <button
            type="button"
            title="Colour (c)"
            aria-label="Colour"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className="press flex h-9 w-9 items-center justify-center rounded-xl hover:bg-interactive-hover"
          >
            <span
              className="h-5 w-5 rounded-full border border-default"
              style={{ background: color }}
            />
          </button>

          {pickerOpen && (
            // Grows out of the swatch that opened it (above, right-aligned).
            <div className="pop-in absolute bottom-11 right-0 flex origin-bottom-right items-center gap-1 rounded-xl border border-default bg-elevated p-1.5 shadow-3xl">
              {MARK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-label={`Colour ${c}`}
                  aria-pressed={c === color}
                  onClick={() => {
                    onColor(c);
                    setPickerOpen(false);
                  }}
                  className={`press flex h-7 w-7 items-center justify-center rounded-lg hover:bg-interactive-hover ${
                    c === color ? "bg-interactive" : ""
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-default"
                    style={{ background: c }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The row break under 32rem: a full-width, zero-height flex item. */}
        <span aria-hidden="true" className="hidden basis-full max-[32rem]:block" />

        <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label="Delete (⌫)" disabled={!canDelete} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>

        <Divider />

        {/* One stable label. It always does the same thing - move on to the
            voice step with the screenshot attached - so it shouldn't rename
            itself, and least of all to "Skip": Cancel is already the way out,
            so a second escape hatch wearing the primary button's colour just
            competed with it. Marking up being optional is the hint's job. */}
        <button
          type="button"
          onClick={onDone}
          className="press-colors flex h-9 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-on-brand shadow-button hover:bg-brand-hover"
        >
          Next
        </button>
      </div>
    </div>
  );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-subtle max-[32rem]:hidden" />;

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
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
      className="press flex h-9 w-9 items-center justify-center rounded-xl text-default hover:bg-interactive-hover hover:text-emphasis disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
