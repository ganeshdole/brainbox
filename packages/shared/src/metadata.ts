/** Who filed the feedback. Supplied by the customer via `Brainbox.identify()`. */
export interface Identity {
  id?: string;
  email?: string;
  name?: string;
  phone?: string;
}

/** How the dashboard shows a field's value: a link for `email`, `phone` and
 *  `url`, monospace for `id`, plain otherwise. */
export type ReportFieldType = "text" | "email" | "phone" | "url" | "id";

/**
 * A detail the host app attaches to every report, such as which clinic or
 * plan the user is on. The app decides which fields exist and what they are
 * called; Brainbox stores and shows them as given, so adding one needs no
 * change on the Brainbox side. Supplied via `Brainbox.setFields()`.
 */
export interface ReportField {
  label: string;
  value: string;
  type?: ReportFieldType;
  /** Shown under the reporter's name too, for the one or two details that
   *  say where a report came from at a glance (a clinic, a workspace). */
  highlight?: boolean;
}

/** Context auto-captured from the host page at submit time. */
export interface CapturedMetadata {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  userAgent: string;
  language: string;
  timezone: string;
  /** CSS selector under the highlighted region (mirrors Region.selector). */
  selector?: string;
  /** Rolling buffer of recent console errors / uncaught exceptions. */
  consoleErrors: string[];
  identity?: Identity;
  /** The host app's own details, in the order it gave them. */
  fields?: ReportField[];
}
