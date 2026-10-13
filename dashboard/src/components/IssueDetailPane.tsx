import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Inbox, RotateCcw, ZoomIn } from "lucide-react";
import type { Issue, IssueEvent, IssueTriagePatch } from "@ganeshdole/brainbox-shared";
import { SessionReplay } from "@ganeshdole/brainbox-replay";

import { api, isAuthRedirect } from "../lib/api";
import { issueTitle, pageLabel } from "../lib/issue";
import { applyTriage, closeReasonLabel, describeEvent } from "../lib/triage";
import { timeAgo } from "../lib/utils";
import { CopyButton } from "./CopyButton";
import { Eyebrow } from "./Eyebrow";
import { IssueDeliveries } from "./IssueDeliveries";
import { ReporterCard } from "./IssueReporter";
import { Lightbox } from "./Lightbox";
import { PriorityMenu, StatusMenu } from "./TriageControls";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

function Figure({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <figure>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <Eyebrow>{label}</Eyebrow>
        {aside && <span className="font-mono text-[11px] text-muted">{aside}</span>}
      </div>
      {children}
    </figure>
  );
}

function Shot({ label, url, onZoom }: { label: string; url: string; onZoom: (u: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZoom(url)}
      aria-label={`Enlarge ${label.toLowerCase()}`}
      className="group relative block w-full overflow-hidden rounded-xl border border-default"
    >
      <img src={url} alt={label} className="w-full cursor-zoom-in transition group-hover:opacity-95" />
      <span className="pointer-events-none absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black-a9 px-2 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
        <ZoomIn className="h-3.5 w-3.5" /> Enlarge
      </span>
    </button>
  );
}

/** Whether a keypress belongs to something being typed into, not a shortcut. */
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
  );
}

/** Status, priority and the one obvious next step, with its shortcut. */
function TriageBar({
  issue,
  busy,
  error,
  onChange,
}: {
  issue: Issue;
  busy: boolean;
  error: string | null;
  onChange: (patch: IssueTriagePatch) => void;
}) {
  const done = issue.status === "resolved" || issue.status === "closed";
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <StatusMenu status={issue.status} onChange={onChange} disabled={busy} />
      <PriorityMenu priority={issue.priority} onChange={onChange} disabled={busy} />
      {issue.status === "closed" && issue.closeReason && (
        <span className="text-xs text-muted">{closeReasonLabel(issue.closeReason)}</span>
      )}
      {issue.status === "new" && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onChange({ status: "open" })}>
          <Inbox /> Accept <kbd className="font-mono text-[10px] text-muted">A</kbd>
        </Button>
      )}
      {!done && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onChange({ status: "resolved" })}>
          <Check /> Resolve <kbd className="font-mono text-[10px] text-muted">E</kbd>
        </Button>
      )}
      {done && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange({ status: "open" })}>
          <RotateCcw /> Reopen
        </Button>
      )}
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
}

function Activity({ issue, events }: { issue: Issue; events: IssueEvent[] }) {
  return (
    <div className="mb-6">
      <Eyebrow className="block px-1 pb-2">Activity</Eyebrow>
      <ol className="space-y-2 px-1 text-xs">
        <li className="flex items-baseline justify-between gap-3">
          <span className="text-default">Reported</span>
          <span className="shrink-0 font-mono text-[11px] text-muted">{timeAgo(issue.createdAt)}</span>
        </li>
        {events.map((e) => (
          <li key={e.id} className="flex items-baseline justify-between gap-3">
            <span className="text-default">{describeEvent(e)}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted">{timeAgo(e.createdAt)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 text-xs">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="truncate font-mono text-default" title={value}>
        {value}
      </span>
    </div>
  );
}

export function IssueDetailPane({ issueId, projectId }: { issueId: string; projectId: string }) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<IssueEvent[]>([]);
  const [triage, setTriage] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const loadActivity = useCallback(() => {
    api
      .getIssueActivity(issueId)
      .then(setEvents)
      .catch(() => {
        /* the log is secondary; the issue itself still renders */
      });
  }, [issueId]);

  useEffect(loadActivity, [loadActivity]);

  // Shows the change at once and puts it back if the server refuses it.
  const changeTriage = useCallback(
    async (patch: IssueTriagePatch) => {
      if (!issue || triage.busy) return;
      const before = issue;
      setIssue(applyTriage(issue, patch));
      setTriage({ busy: true, error: null });
      try {
        const saved = await api.triageIssue(issueId, patch);
        // PATCH answers without deliveries; keep the ones on screen
        setIssue((prev) => ({ ...saved, deliveries: prev?.deliveries }));
        setTriage({ busy: false, error: null });
        loadActivity();
      } catch (e) {
        setIssue(before);
        setTriage({ busy: false, error: isAuthRedirect(e) ? null : (e as Error).message });
      }
    },
    [issue, issueId, triage.busy, loadActivity],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!issue || isTyping(e)) return;
      if (e.key === "a" && issue.status === "new") void changeTriage({ status: "open" });
      if (e.key === "e" && issue.status !== "resolved" && issue.status !== "closed") {
        void changeTriage({ status: "resolved" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issue, changeTriage]);

  useEffect(() => {
    let cancelled = false;
    api
      .getIssue(issueId)
      .then((next) => {
        if (!cancelled) setIssue(next);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  // transcription runs in the background after ingest - poll while pending so
  // the transcript appears without a manual refresh
  useEffect(() => {
    const pending =
      issue?.audio?.transcriptStatus === "pending" ||
      issue?.video?.transcriptStatus === "pending" ||
      issue?.deliveries?.some((d) => d.status === "pending");
    if (!pending) return;
    const t = setTimeout(() => {
      api
        .getIssue(issueId)
        .then(setIssue)
        .catch(() => {
          /* keep showing the stale issue; the next poll retries */
        });
    }, 3000);
    return () => clearTimeout(t);
  }, [issue, issueId]);

  const back = (
    <Link
      to={`/projects/${projectId}`}
      className="mb-3 flex w-fit items-center gap-1 text-xs text-muted transition hover:text-emphasis"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Reports
    </Link>
  );

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <p className="text-sm text-error">{error}</p>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-4 sm:p-6">
        {back}
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-3 h-3 w-1/2" />
        <Skeleton className="mt-8 aspect-video w-full max-w-2xl rounded-xl" />
      </div>
    );
  }

  const m = issue.metadata;
  // one transcript panel beside the media: a report has voice OR a recording
  const transcript = issue.audio?.transcriptStatus
    ? { label: "Voice transcript", text: issue.audio.transcript, status: issue.audio.transcriptStatus }
    : issue.video?.transcriptStatus
      ? { label: "Recording transcript", text: issue.video.transcript, status: issue.video.transcriptStatus }
      : null;
  return (
    <article className="mx-auto w-full max-w-6xl">
      <header className="px-4 pt-6 sm:px-6">
        {back}
        <h2 className="line-clamp-2 text-base font-medium tracking-tight text-emphasis">
          {issueTitle(issue)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
          <span>{new Date(issue.createdAt).toLocaleString()}</span>
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 max-w-full items-center gap-1 transition hover:text-link"
          >
            <span className="truncate">{pageLabel(m.url)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
        <TriageBar
          issue={issue}
          busy={triage.busy}
          error={triage.error}
          onChange={(patch) => void changeTriage(patch)}
        />
        <IssueDeliveries
          issueId={issue.id}
          projectId={projectId}
          deliveries={issue.deliveries ?? []}
          onChange={(deliveries) => setIssue({ ...issue, deliveries })}
        />
      </header>

      <div className="mt-6 grid gap-8 border-t border-default p-4 pt-6 sm:p-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(260px,1fr)]">
        <div className="min-w-0 space-y-6">
          {issue.session?.url && (
            <Figure label="Session replay" aside={issue.audio ? "with voice" : undefined}>
              <SessionReplay
                url={issue.session.url}
                audioUrl={issue.audio?.url}
                vw={m.viewport.width}
                vh={m.viewport.height}
                // local storage serves files behind the session cookie
                credentials="include"
              />
            </Figure>
          )}
          {issue.video?.url && (
            <Figure label="Screen recording">
              <video controls src={issue.video.url} className="w-full rounded-xl border border-default" />
            </Figure>
          )}
          {issue.crop?.url && (
            <Figure
              label="Highlighted region"
              aside={
                issue.region
                  ? `${issue.region.width}×${issue.region.height} · (${issue.region.x}, ${issue.region.y})`
                  : undefined
              }
            >
              <Shot label="Highlighted region" url={issue.crop.url} onZoom={setZoomUrl} />
            </Figure>
          )}
          {issue.screenshot?.url && (
            <Figure label={issue.session ? "Last frame" : "Full screenshot"}>
              <Shot
                label={issue.session ? "Last frame" : "Full screenshot"}
                url={issue.screenshot.url}
                onZoom={setZoomUrl}
              />
            </Figure>
          )}
          {/* short notes already read in full as the header title */}
          {issue.text && issue.text.trim().length > 140 && (
            <Figure label="Note">
              <p className="rounded-xl border border-default bg-elevated p-4 text-sm leading-relaxed text-default">
                {issue.text}
              </p>
            </Figure>
          )}
          {/* with a session, the voice plays inside the replay instead */}
          {issue.audio && !issue.session && (
            <Figure label="Voice note">
              <audio controls src={issue.audio.url} className="w-full">
                <track kind="captions" />
              </audio>
            </Figure>
          )}
        </div>

        <aside className="min-w-0">
          <ReporterCard identity={m.identity} fields={m.fields} />

          {/* status is only set when transcription ran; "done" implies text */}
          {transcript && (
            <div className="mb-6">
              <div className="flex items-center justify-between px-1 pb-2">
                <Eyebrow>{transcript.label}</Eyebrow>
                {transcript.text && <CopyButton text={transcript.text} />}
              </div>
              {transcript.text ? (
                <p className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-default bg-elevated p-4 text-sm leading-relaxed text-default">
                  {transcript.text}
                </p>
              ) : (
                <p className="px-1 text-xs text-muted">
                  {transcript.status === "pending" ? "Transcribing…" : "Transcription failed."}
                </p>
              )}
            </div>
          )}

          <Activity issue={issue} events={events} />

          <Eyebrow className="block px-1 pb-1">Environment</Eyebrow>
          <Meta label="URL" value={m.url} />
          <Meta label="Title" value={m.title} />
          <Meta
            label="Viewport"
            value={`${m.viewport.width}×${m.viewport.height} @${m.devicePixelRatio}x`}
          />
          <Meta label="Language" value={m.language} />
          <Meta label="Timezone" value={m.timezone} />
          {m.selector && <Meta label="Selector" value={m.selector} />}
          <Meta label="User agent" value={m.userAgent} />

          {m.consoleErrors.length > 0 && (
            <div className="mt-6">
              <Eyebrow className="block px-1 pb-2 text-error">
                Console · {m.consoleErrors.length}
              </Eyebrow>
              <ul className="space-y-2 rounded-lg border border-error-subtle bg-error p-3">
                {m.consoleErrors.map((err, i) => (
                  <li key={i} className="break-words font-mono text-xs leading-relaxed text-error">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {zoomUrl && <Lightbox src={zoomUrl} onClose={() => setZoomUrl(null)} />}
    </article>
  );
}
