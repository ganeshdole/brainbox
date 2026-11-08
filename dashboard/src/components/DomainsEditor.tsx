import { useState } from "react";
import { Globe, Plus, X } from "lucide-react";

import { api, isAuthRedirect } from "../lib/api";
import { normalizeOrigin } from "../lib/utils";

/** Strip the scheme for display - the chip reads "app.example.com", the
 *  stored value stays a full origin ("https://app.example.com"). */
function display(origin: string): string {
  return origin.replace(/^https:\/\//, "");
}

export function DomainsEditor({
  projectId,
  origins,
  onChange,
}: {
  projectId: string;
  origins: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProject(projectId, { allowedOrigins: next });
      onChange(updated.allowedOrigins);
    } catch (e) {
      if (!isAuthRedirect(e)) setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const origin = normalizeOrigin(input);
    if (!origin) {
      setError("Enter a domain like myapp.com or http://localhost:3000");
      return;
    }
    if (origins.includes(origin)) {
      setInput("");
      return;
    }
    setInput("");
    void save([...origins, origin]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {origins.map((o) => (
          <span
            key={o}
            className="flex items-center gap-1.5 rounded-full border border-default bg-subtle py-1 pl-2.5 pr-1.5 font-mono text-xs text-default"
          >
            <Globe className="h-3 w-3 text-muted" />
            {display(o)}
            <button
              type="button"
              aria-label={`Remove ${display(o)}`}
              disabled={saving}
              onClick={() => void save(origins.filter((x) => x !== o))}
              className="rounded-full p-0.5 text-muted transition hover:bg-interactive-hover hover:text-error"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none"
        >
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder="myapp.com"
            disabled={saving}
            className="min-w-0 flex-1 rounded-full border border-interactive bg-interactive px-3 py-1 font-mono text-xs text-emphasis placeholder:text-placeholder outline-none focus-visible:ring-[3px] focus-visible:ring-focus sm:w-40 sm:flex-none"
          />
          <button
            type="submit"
            disabled={saving || !input.trim()}
            className="flex items-center gap-1 rounded-full border border-default px-2.5 py-1 text-xs text-muted transition enabled:hover:bg-interactive-hover enabled:hover:text-emphasis disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </form>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-error">{error}</p>
      ) : origins.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          Feedback is accepted from any site. Add your app's domain to lock it down.
        </p>
      ) : null}
    </div>
  );
}
