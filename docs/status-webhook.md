# Status webhook: version 1

When the work item a report became changes in Azure DevOps (state, or a new
comment), Brainbox POSTs one JSON event to `STATUS_WEBHOOK_URL`. It's how a
host app's own notification service learns that someone's report is being
worked on, resolved or closed, so it can tell them. Brainbox doesn't decide
what to tell people; the receiver does.

This page is the contract. The type is `ReportStatusEvent` in
`@ganeshdole/brainbox-shared`.

## When an event is sent

- Once for every work item update Brainbox records, in Azure DevOps' order.
  That's an update that changed the state, added a comment (`System.History`),
  or both.
- Not for other edits (title, area, assignee...), and not for work items
  Brainbox didn't create.
- At most once per work item revision. Azure DevOps retrying its service
  hook doesn't produce a second event.
- Not at all when `STATUS_WEBHOOK_URL` is unset.

## The request

```
POST {STATUS_WEBHOOK_URL}
content-type: application/json
webhook-id: 3f0c...              the event's id
webhook-timestamp: 1791962273    seconds since the epoch, when it was sent
webhook-signature: v1,K5oZ...    see "Checking the signature"
```

Answer any 2xx within 10 seconds to accept it. Anything else, or no answer,
is recorded on the report as a failed notification. Someone can send it again
from the report in the dashboard. Brainbox doesn't retry on its own yet. A
resend has the same `id`, so drop an event whose `id` you've already handled.

## Checking the signature

The signature follows [Standard Webhooks](https://www.standardwebhooks.com),
the same scheme Brainbox's payment provider uses. The secret is
`STATUS_WEBHOOK_SECRET`: `whsec_` followed by base64.

- Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`.
- Key: the secret's base64 part, decoded.
- Signature: HMAC-SHA256, base64, prefixed `v1,`. The header can hold
  several, space-separated; accept if any one matches.

Check the raw body before parsing it, and reject timestamps more than a few
minutes old. The Standard Webhooks libraries do both:

```ts
import { Webhook } from "standardwebhooks"; // npm; libraries exist for most languages

const event = new Webhook(process.env.STATUS_WEBHOOK_SECRET).verify(rawBody, {
  "webhook-id": req.headers["webhook-id"],
  "webhook-timestamp": req.headers["webhook-timestamp"],
  "webhook-signature": req.headers["webhook-signature"],
}); // throws when the signature or timestamp is wrong
```

Without a library (Node):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
const ok = signatureHeader
  .split(" ")
  .map((s) => Buffer.from(s.replace(/^v1,/, ""), "base64"))
  .some((given) => given.length === expected.length && timingSafeEqual(given, expected));
```

## The event

```json
{
  "id": "fe7fa2a8-95a4-4c51-b5df-47497f6ed774",
  "type": "report.work_item.updated",
  "version": 1,
  "createdAt": "2026-10-14T06:17:53.773Z",
  "project": {
    "id": "86cf0672-c36d-4859-b0cc-bb90a60f2780",
    "key": "pk_bWeuCg1YfSBx52e3ubRucaVB",
    "name": "HapiVet app"
  },
  "report": {
    "id": "e7c2d6ac-951c-40a7-ba3e-41b4a2cf1afb",
    "kind": "bug",
    "title": "Invoice total doesn't include the vaccine line",
    "url": "https://brainbox.example.com/projects/86cf0672-c36d-4859-b0cc-bb90a60f2780/issues/e7c2d6ac-951c-40a7-ba3e-41b4a2cf1afb",
    "status": "resolved",
    "createdAt": "2026-10-14T06:17:51.988Z"
  },
  "reporter": {
    "id": "hv-user-9",
    "name": "Dr. Ana Lima",
    "email": "ana@happypaws.example"
  },
  "fields": [
    { "label": "Organization", "value": "Happy Paws" },
    { "label": "Location", "value": "Downtown" },
    { "label": "Tenant ID", "value": "ten-1" },
    { "label": "Location ID", "value": "loc-3" }
  ],
  "workItem": {
    "provider": "azure-devops",
    "id": 15360,
    "url": "https://dev.azure.com/hapivetAI/36df3a82-1c18-46f5-b817-96c3f5d0ec7c/_workitems/edit/15360",
    "type": "Bug",
    "revision": 4
  },
  "change": {
    "previous": { "state": "Active", "reason": "Approved", "category": "InProgress" },
    "current": { "state": "Resolved", "reason": "Fixed", "category": "Resolved" },
    "stateChanged": true,
    "changedBy": { "name": "Jamal Hartnett", "email": "jamal@hapivet.ai" },
    "changedAt": "2026-10-14T06:17:53.742Z",
    "comment": {
      "html": "<div>Fixed in 2.3: the vaccine line counts now.</div>",
      "text": "Fixed in 2.3: the vaccine line counts now."
    }
  }
}
```

| Field | Always there | What it is |
|---|---|---|
| `id` | yes | Unique per update, and the same on a resend. Use it to drop repeats. |
| `type`, `version` | yes | `report.work_item.updated`, `1`. Fields are only ever added within a version; anything that breaks a receiver gets a new version. |
| `createdAt` | yes | When Brainbox built the event (ISO 8601). |
| `project` | yes | The Brainbox project: `id`, `key` (the `pk_...` the app sends with every report) and `name`. |
| `report.id`, `report.url` | yes | The report in Brainbox, and its page in the dashboard. |
| `report.kind` | yes | `bug` or `feature` (a feature request). |
| `report.title` | yes | The first line of what the person wrote, as the work item's title. |
| `report.status` | yes | Its Brainbox triage status after this change: `new`, `open`, `in_progress`, `resolved` or `closed`. |
| `report.createdAt` | yes | When the person sent the report. |
| `reporter` | no | Who sent it, as the app identified them when they did: `id` (the app's own user id), `email`, `name`, `phone`, each only when the app gave it. Absent for anonymous reports. |
| `fields` | yes | The app's own details, as it labelled them (`label`, `value`, sometimes `type`). Empty when it sent none. |
| `workItem.id`, `workItem.url` | yes | The Azure DevOps work item and its web page. |
| `workItem.type` | no | Bug, User Story, ... |
| `workItem.revision` | yes | Azure DevOps' revision number after this change; it only goes up. |
| `change.current`, `change.previous` | yes | The state after and before, each with `reason` and `category` when known. Equal when only a comment was added. |
| `change.stateChanged` | yes | `false` when the update only added a comment. |
| `change.changedBy` | no | Who made the change in Azure DevOps (`name`, `email`). |
| `change.changedAt` | yes | When they made it. |
| `change.comment` | no | The comment added with this change, as Azure DevOps' HTML and as plain text. |

### States and categories

A state's name depends on the work item's process (Agile, Scrum, Basic, or a
custom one). `category` is what it means, so key notifications on it:

| `category` | Typical states | The report goes to |
|---|---|---|
| `Proposed` | New, To Do, Approved | `open` |
| `InProgress` | Active, Committed, In Progress, Doing | `in_progress` |
| `Resolved` | Resolved | `resolved` |
| `Completed` | Closed, Done | `resolved` |
| `Removed` | Removed | `closed` (won't fix) |

"Won't fix" is often a reason, not a state: a Bug resolved or closed with
reason "Won't Fix" has `category` `Resolved` or `Completed`. Check
`current.reason` before telling someone their problem was fixed. A custom
state with no category has no `category`, and leaves the Brainbox status
alone.

## Trying it locally

`pnpm -F @ganeshdole/brainbox-backend status-receiver` runs a receiver that
checks each event's signature and prints it. `docs/self-hosting.md` ("Azure
DevOps updates") has the whole local loop with the fake Azure DevOps.
