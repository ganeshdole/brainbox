/**
 * Orders async results that write the same state. Each request takes a ticket
 * with `next()`; when it answers, `isCurrent(ticket)` says whether it is still
 * the newest one. `invalidate()` retires every ticket already out, for a local
 * change that a slower, older answer must not overwrite.
 */
export interface RequestGate {
  next(): number;
  isCurrent(ticket: number): boolean;
  invalidate(): void;
}

export function requestGate(): RequestGate {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (ticket) => ticket === latest,
    invalidate: () => {
      latest++;
    },
  };
}
