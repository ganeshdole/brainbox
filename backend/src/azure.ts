import { app as functions, type HttpRequest, type HttpResponseInit } from "@azure/functions";

import { app } from "./app.ts";
import { toResponseInit, toWebRequest } from "./runtime/azure-http.ts";

// Azure Functions entry. One HTTP function takes every path (host.json clears
// the default /api prefix) and hands it to the same Hono app the Node server
// runs (src/index.ts). Uploads stream through rather than being buffered.

functions.setup({ enableHttpStream: true });

functions.http("brainbox", {
  route: "{*path}",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  authLevel: "anonymous",
  handler: handle,
});

async function handle(req: HttpRequest): Promise<HttpResponseInit> {
  const background: Promise<unknown>[] = [];
  const res = await app.fetch(toWebRequest(req), undefined, {
    waitUntil: (task) => {
      background.push(task);
    },
    passThroughOnException: () => {},
    props: undefined,
  });
  // Azure may freeze the instance as soon as this returns, stranding
  // transcription and delivery halfway. Finish them first: the response waits
  // a little, but the work is never lost.
  await Promise.allSettled(background);
  return toResponseInit(res);
}
