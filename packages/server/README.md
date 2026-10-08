# @brainbox/server

The receiving end of a Brainbox report. `parseIngest()` reads the widget's
upload from a web-standard `Request` and hands back typed data or a ready
error, so any server that has `Request` (Node 18+, Bun, Deno, Workers) can
accept reports without the Brainbox database. The Brainbox backend uses it.

## Use

```ts
import { parseIngest, DEFAULT_INGEST_LIMITS } from "@brainbox/server";

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

## The wire format

This is what `brainboxTransport()` in `@brainbox/core` sends and what
`parseIngest()` reads. A backend in any language can implement it.

`POST <endpoint>` with a `multipart/form-data` body.

| Part | Type | Required | Notes |
|---|---|---|---|
| `json` | text | yes | A JSON string, shape below |
| `screenshot` | file, `image/*` | one of these three | PNG, the viewport with the user's marks baked in |
| `session` | file, `application/gzip` or `application/json` | | rrweb event log `{ v: 1, events, audioOffsetMs? }`, gzipped when the browser can |
| `video` | file, `video/*` | | a screen recording (older clients) |
| `audio` | file, `audio/*` | no | voice note, or the mic track of a recording |

The `json` part:

```jsonc
{
  "projectKey": "pk_...",            // required, must start with "pk_"
  "text": "the button does nothing", // optional, up to 10000 chars
  "region": {                        // optional, screenshot reports only
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
    "identity": { "id": "u_1", "email": "a@b.c" }   // optional, both fields optional
  }
}
```

Types live in `@brainbox/shared` (`FeedbackPayload`, `CapturedMetadata`,
`Region`). The zod schemas in `schema.ts` validate against them and fail to
compile if the two drift.

### Responses

| Status | Body | When |
|---|---|---|
| `201` | `{ "id": "<issue id>" }` | stored |
| `400` | `{ "error": "Missing json part" }` | no `json` part |
| `400` | `{ "error": "Invalid json" }` | `json` is not JSON |
| `400` | `{ "error": "Invalid payload", "issues": [...] }` | `json` fails the schema; `issues` are zod issues |
| `400` | `{ "error": "<part> must be an image" }` etc. | wrong file type |
| `400` | `{ "error": "Missing screenshot, video or session" }` | nothing to store |
| `413` | `{ "error": "<part> too large" }` | over the limit |

The Brainbox backend adds `401 { "error": "Unknown project key" }` and
`403 { "error": "Origin not allowed" }` after parsing.

### Limits

`DEFAULT_INGEST_LIMITS` is 5 MB screenshot, 50 MB video, 15 MB session,
10 MB audio. Pass your own `IngestLimits` to change them.

## CORS

The widget posts cross-origin from the host page with no cookies. Answer the
preflight with `Access-Control-Allow-Origin` for the origins you serve.
