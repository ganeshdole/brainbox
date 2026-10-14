import { ChevronDown, Minus, OctagonAlert, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import type { IssuePriority, IssueStatus, IssueTriagePatch } from "@ganeshdole/brainbox-shared";

import { CLOSE_REASONS, PRIORITIES, STATUSES, priorityLabel, statusLabel } from "../lib/triage";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function StatusDot({ status, className }: { status: IssueStatus; className?: string }) {
  const dot = STATUSES.find((s) => s.value === status)?.dot;
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", dot, className)} />;
}

const PRIORITY_ICON = {
  urgent: OctagonAlert,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
  none: Minus,
} as const;

export function PriorityIcon({ priority, className }: { priority: IssuePriority; className?: string }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <Icon
      aria-hidden
      className={cn("size-3.5 shrink-0", priority === "urgent" ? "text-error" : "text-muted", className)}
    />
  );
}

const trigger =
  "flex h-7 items-center gap-1.5 rounded-md border border-interactive bg-interactive px-2 text-xs text-emphasis transition hover:bg-interactive-hover data-[state=open]:bg-interactive-hover disabled:opacity-50";

/** Status picker. Closing goes through a reason, so "closed" is never bare. */
export function StatusMenu({
  status,
  onChange,
  disabled,
  label,
}: {
  status?: IssueStatus;
  onChange: (patch: IssueTriagePatch) => void;
  disabled?: boolean;
  /** Trigger text when there is no single current status (bulk edit). */
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={trigger} disabled={disabled}>
        {status && <StatusDot status={status} />}
        {status ? statusLabel(status) : label}
        <ChevronDown className="size-3 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {STATUSES.filter((s) => s.value !== "closed").map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange({ status: s.value })}>
            <StatusDot status={s.value} />
            {s.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted">Close as</DropdownMenuLabel>
        {CLOSE_REASONS.map((r) => (
          <DropdownMenuItem key={r.value} onSelect={() => onChange({ status: "closed", closeReason: r.value })}>
            <StatusDot status="closed" />
            {r.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityMenu({
  priority,
  onChange,
  disabled,
  label,
}: {
  priority?: IssuePriority;
  onChange: (patch: IssueTriagePatch) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={trigger} disabled={disabled}>
        {priority && <PriorityIcon priority={priority} />}
        {priority ? priorityLabel(priority) : label}
        <ChevronDown className="size-3 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p.value} onSelect={() => onChange({ priority: p.value })}>
            <PriorityIcon priority={p.value} />
            {p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
