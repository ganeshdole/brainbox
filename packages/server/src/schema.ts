import { z } from "zod";
import type { CapturedMetadata, FeedbackPayload, Region } from "@ganeshdole/brainbox-shared";

export const regionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  selector: z.string().optional(),
});

/** Caps on the host app's `fields`, so one report cannot carry an unbounded
 *  amount of host data. */
export const REPORT_FIELD_LIMITS = { count: 30, label: 60, value: 500 } as const;

export const reportFieldSchema = z.object({
  label: z.string().min(1).max(REPORT_FIELD_LIMITS.label),
  value: z.string().max(REPORT_FIELD_LIMITS.value),
  type: z.enum(["text", "email", "phone", "url", "id"]).optional(),
  highlight: z.boolean().optional(),
});

export const metadataSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  devicePixelRatio: z.number(),
  userAgent: z.string(),
  language: z.string(),
  timezone: z.string(),
  selector: z.string().optional(),
  consoleErrors: z.array(z.string()),
  identity: z
    .object({
      id: z.string().optional(),
      email: z.string().optional(),
      name: z.string().max(200).optional(),
      phone: z.string().max(50).optional(),
    })
    .optional(),
  fields: z.array(reportFieldSchema).max(REPORT_FIELD_LIMITS.count).optional(),
});

export const feedbackSchema = z.object({
  projectKey: z.custom<`pk_${string}`>(
    (v) => typeof v === "string" && v.startsWith("pk_"),
  ),
  // Only present when the end-user drew marks (on a screenshot, or still in
  // view when a recording stopped).
  region: regionSchema.optional(),
  text: z.string().max(10_000).optional(),
  metadata: metadataSchema,
});

// Compile-time drift guards (no runtime cost): if a shared type gains a field
// the zod schema doesn't cover, these assignments stop type-checking.
type _Region = (x: z.infer<typeof regionSchema>) => Region;
type _Metadata = (x: z.infer<typeof metadataSchema>) => CapturedMetadata;
type _Feedback = (x: z.infer<typeof feedbackSchema>) => FeedbackPayload;
const _guards: [_Region, _Metadata, _Feedback] = [
  (x) => x,
  (x) => x,
  (x) => x,
];
void _guards;
