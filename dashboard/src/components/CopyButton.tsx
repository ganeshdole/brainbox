import { Check, Copy } from "lucide-react";

import { useFlash } from "../lib/flash";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, flashCopied] = useFlash(1500);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          flashCopied();
        });
      }}
      className="flex shrink-0 items-center gap-1 rounded-md border border-default px-2 py-1 text-xs text-muted transition hover:bg-interactive-hover hover:text-emphasis"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}
