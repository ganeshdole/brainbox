# @ganeshdole/brainbox-server

The receiving end of a Brainbox report. `parseIngest()` reads the widget's
upload from a web-standard `Request` and hands back typed data or a ready
error, so any server that has `Request` (Node 18+, Bun, Deno, Workers) can
accept reports without the Brainbox database. The Brainbox backend uses it.

## Use

```ts
import { parseIngest, DEFAULT_INGEST_LIMITS } from "@ganeshdole/brainbox-server";

async function handle(request: Request): Promise<Response> {
  const parsed = await parseIngest(request, DEFAULT_INGEST_LIMITS);
  if (!parsed.ok) return Response.json(parsed.body, { status: parsed.status });

  const { payload, files } = parsed;
  // payload.projectKey, payload.text, payload.region, payload.metadata
  // files.screenshot, files.session, files.audio, files.video (each a File or undefined)
  const id = await store(payload, files);
  return Response.json({ id }, { status: 201 });
}
```

`parseIngest` checks the shape of the upload and the size of each file.
Everything else is yours: whether the project key exists, whether the
request's `Origin` is allowed, where the files go.

## Install

Inside this monorepo the package is consumed from source (`workspace:*`).
Outside the monorepo, `pnpm build` emits `dist/` (JS plus `.d.ts`) and
`pnpm pack` produces a tarball whose `exports` point at it (`publishConfig`),
so another app can `npm install` the `.tgz` files. Every `@ganeshdole/brainbox-*`
dependency of a package needs its own tarball installed alongside.

## The wire format

This is what `brainboxTransport()` in `@ganeshdole/brainbox-core` sends and what
`parseIngest()` reads. A backend in any language can implement it.

`POST <endpoint>` with a `multipart/form-data` body.

| Part | Type | Required | Notes |
|---|---|---|---|
| `json` | text | yes | A JSON string, shape below |
| `screenshot` | file, `image/*` | one of these three (bug); optional (feature request) | PNG, the viewport with the user's marks baked in |
| `session` | file, `application/gzip` or `application/json` | | rrweb event log `{ v: 1, events, audioOffsetMs? }`, gzipped when the browser can |
| `video` | file, `video/*` | | a screen recording (older clients) |
| `audio` | file, `audio/*` | no; a feature request needs this or `text` | voice note, or the mic track of a recording |

A report is a bug unless the `json` part says `"kind": "feature"`. A bug is
shown, so it needs a capture: a screenshot, a session or a video. A feature
request is told, so it needs words: non-blank `text`, or `audio`. Its
screenshot is optional.

The `json` part:

```jsonc
{
  "projectKey": "pk_...",            // required, must start with "pk_"
  "kind": "feature",                 // optional, "bug" or "feature"; absent means "bug"
  "importance": "important",         // optional, "nice", "important" or "critical";
                                     // only kept on a feature request
  "text": "the button does nothing", // optional, up to 10000 chars
  "region": {                        // optional, only when marks were drawn: on the
                                     // screenshot, or in view when a recording stopped
    "x": 100, "y": 150, "width": 200, "height": 100,
    "selector": "main > form > button"   // optional, CSS path under the marks
  },
  "metadata": {                      // required
    "url": "https://app.example/orders",
    "title": "Orders",
    "viewport": { "width": 1280, "height": 800 },
    "devicePixelRatio": 2,
    "userAgent": "...",
    "language": "en-US",
    "timezone": "Asia/Kolkata",
    "selector": "main > form > button",  // optional, mirrors region.selector
    "consoleErrors": ["TypeError: ..."], // last 20, oldest first
    "identity": {                       // optional, every field optional
      "id": "u_1", "email": "a@b.c",
      "name": "Ana Lima",               // up to 200 chars
      "phone": "+1 555 0100"            // up to 50 chars
    },
    "fields": [                         // optional, the host app's own details
      { "label": "Plan", "value": "Pro", "highlight": true },
      { "label": "Account ID", "value": "acc_9", "type": "id" }
    ]
  }
}
```

`fields` is whatever the host app wants on every report, in its own words:
up to 30 entries, `label` 1-60 chars, `value` up to 500. `type` is optional,
one of `text`, `email`, `phone`, `url` or `id`, and only changes how the
dashboard shows the value. `highlight: true` also shows the value under the
reporter's name. Brainbox stores them as sent.

Types live in `@ganeshdole/brainbox-shared` (`FeedbackPayload`, `IssueKind`,
`Importance`, `CapturedMetadata`, `Region`). The zod schemas in `schema.ts` validate against them and fail to
compile if the two drift.

### Responses

| Status | Body | When |
|---|---|---|
| `201` | `{ "id": "<issue id>" }` | stored |
| `400` | `{ "error": "Missing json part" }` | no `json` part |
| `400` | `{ "error": "Invalid json" }` | `json` is not JSON |
| `400` | `{ "error": "Invalid payload", "issues": [...] }` | `json` fails the schema; `issues` are zod issues |
| `400` | `{ "error": "<part> must be an image" }` etc. | wrong file type |
| `400` | `{ "error": "Missing screenshot, video or session" }` | a bug with no capture |
| `400` | `{ "error": "Missing text or audio" }` | a feature request with nothing said |
| `413` | `{ "error": "<part> too large" }` | over the limit |

The Brainbox backend adds `401 { "error": "Unknown project key" }` and
`403 { "error": "Origin not allowed" }` after parsing.

### Limits

`DEFAULT_INGEST_LIMITS` is 5 MB screenshot, 50 MB video, 15 MB session,
10 MB audio. Pass your own `IngestLimits` to change them.

## CORS

The widget posts cross-origin from the host page with no cookies. Answer the
preflight with `Access-Control-Allow-Origin` for the origins you serve.
