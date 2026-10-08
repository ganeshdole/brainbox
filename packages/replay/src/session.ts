export interface SessionPayload {
  events: unknown[];
  audioOffsetMs: number;
}

/** Parse the widget's session log (`{ v, events, audioOffsetMs? }`).
 *  Older logs have no offset - treat those as voice starting at 0. */
export function parseSessionPayload(text: string): SessionPayload {
  const parsed: unknown = JSON.parse(text);
  const obj =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const events = Array.isArray(obj.events) ? obj.events : [];
  const raw = obj.audioOffsetMs;
  const audioOffsetMs = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
  return { events, audioOffsetMs };
}
