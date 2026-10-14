import { MessageSquarePlus } from "./icons.tsx";
import { posClass, type Position } from "../lib/position.ts";

export function Launcher({ position, onClick }: { position: Position; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Send feedback"
      className={`fixed ${posClass(position)} z-[2147483647] flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-button transition hover:bg-brand-hover`}
    >
      <MessageSquarePlus className="h-5 w-5" />
    </button>
  );
}
