// A stand-in for the host app's notification service: receives the events
// Brainbox POSTs to STATUS_WEBHOOK_URL, checks their signature, and prints
// what it would tell the reporter. For trying the status webhook locally.
//
//   STATUS_WEBHOOK_SECRET=whsec_... pnpm -F @ganeshdole/brainbox-backend status-receiver
//
// Then run the backend with STATUS_WEBHOOK_URL=http://localhost:8791/brainbox
// and the same secret. STATUS_RECEIVER_FAIL=1 answers 500 to every event, to
// try failures and retries. docs/status-webhook.md is the event contract.

import { createServer } from "node:http";

import type { ReportStatusEvent } from "@ganeshdole/brainbox-shared";
import { Webhook } from "standardwebhooks";

const PORT = Number(process.env.STATUS_RECEIVER_PORT ?? 8791);
const SECRET = process.env.STATUS_WEBHOOK_SECRET ?? "";
const FAIL = process.env.STATUS_RECEIVER_FAIL === "1";
if (!SECRET) throw new Error("Set STATUS_WEBHOOK_SECRET to the backend's");
const webhook = new Webhook(SECRET);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString("utf8");
  const headers = {
    "webhook-id": String(req.headers["webhook-id"] ?? ""),
    "webhook-timestamp": String(req.headers["webhook-timestamp"] ?? ""),
    "webhook-signature": String(req.headers["webhook-signature"] ?? ""),
  };
  let event: ReportStatusEvent;
  try {
    event = webhook.verify(body, headers) as ReportStatusEvent;
  } catch (err) {
    console.log(`[status-receiver] REJECTED ${headers["webhook-id"]}: ${String(err)}`);
    res.writeHead(401).end("bad signature");
    return;
  }
  const { change, report, reporter, workItem } = event;
  const who = reporter?.name ?? reporter?.email ?? reporter?.id ?? "the reporter";
  const what = change.stateChanged
    ? `${change.previous.state} -> ${change.current.state}${change.current.reason ? ` (${change.current.reason})` : ""} [${change.current.category ?? "?"}]`
    : `comment on ${change.current.state}`;
  console.log(
    `[status-receiver] ${event.id} verified: tell ${who} (${reporter?.id ?? "no id"}) that "${report.title}" is ${what}` +
      ` by ${change.changedBy?.name ?? "someone"}; ${workItem.provider} #${workItem.id}` +
      (change.comment ? `; comment: ${change.comment.text}` : ""),
  );
  console.log(JSON.stringify(event, null, 2));
  if (FAIL) res.writeHead(500).end("receiver told to fail");
  else res.writeHead(200).end("ok");
}).listen(PORT, () => {
  console.log(`[status-receiver] listening on http://localhost:${PORT}${FAIL ? " (failing every event)" : ""}`);
});
