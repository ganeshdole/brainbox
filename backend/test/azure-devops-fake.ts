import { vi } from "vitest";

export interface AzureDevopsCall {
  method: string;
  path: string;
  /** Parsed JSON, or the byte count of an upload. */
  body: unknown;
}

type Reply = { status: number; body?: unknown };

/** A rule the fake's process enforces on create, like a custom required field. */
type Rule = (type: string, fields: Record<string, unknown>) => Reply | null;

const PAT = "fake-pat";

/**
 * Stubs global fetch with the slice of Azure DevOps the backend calls, for
 * org `acme`, project `Web` (id p-1) and team `Web Team` (id t-1). Only the
 * token "fake-pat" is accepted. Requests to any other host go to the real
 * fetch. Returns the recorded calls.
 */
export function fakeAzureDevops(opts: { rule?: Rule; rejectAll?: boolean } = {}) {
  const calls: AzureDevopsCall[] = [];
  let nextId = 100;

  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host !== "dev.azure.com") return realFetch(input, init);
    const method = init?.method ?? "GET";
    const raw = init?.body;
    const body =
      raw instanceof Uint8Array ? raw.byteLength : typeof raw === "string" ? (JSON.parse(raw) as unknown) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });

    const reply = route(method, url, body, init?.headers);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });

  function route(method: string, url: URL, body: unknown, headers: HeadersInit | undefined): Reply {
    const auth = new Headers(headers).get("authorization") ?? "";
    if (opts.rejectAll || auth !== `Basic ${btoa(`:${PAT}`)}`) {
      return { status: 401, body: { message: "TF400813: The user is not authorized to access this resource." } };
    }
    const seg = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (seg[0] !== "acme") return { status: 404, body: { message: `TF400813: Organization ${seg[0]} not found` } };
    const p = seg.slice(1).join("/");

    if (p === "_apis/projects") return list([{ id: "p-1", name: "Web" }]);
    if (p === "_apis/projects/p-1/teams") return list([{ id: "t-1", name: "Web Team" }]);
    if (p === "p-1/t-1/_apis/work/teamsettings/teamfieldvalues") {
      return { status: 200, body: { defaultValue: "Web\\Checkout", values: [{ value: "Web\\Checkout" }] } };
    }
    if (p === "p-1/t-1/_apis/work/teamsettings") {
      return { status: 200, body: { bugsBehavior: "asTasks", backlogIteration: { path: "" } } };
    }
    if (p === "p-1/t-1/_apis/work/teamsettings/iterations") {
      return list([{ name: "Sprint 12", path: "Web\\Sprint 12", attributes: { timeFrame: "current" } }]);
    }
    if (p === "p-1/_apis/wit/workitemtypes") return list([{ name: "Bug" }, { name: "Issue" }, { name: "User Story" }]);
    if (p === "p-1/_apis/wit/workitemtypecategories") return list([]);
    const fields = /^p-1\/_apis\/wit\/workitemtypes\/([^/]+)\/fields$/.exec(p);
    if (fields) {
      const type = fields[1] ?? "";
      if (!["Bug", "Issue", "User Story"].includes(type)) {
        return { status: 404, body: { message: `TF201036: Work item type ${type} does not exist` } };
      }
      return list([
        { referenceName: "System.Title", name: "Title", alwaysRequired: true },
        ...(type === "Issue" ? [] : [{ referenceName: "Microsoft.VSTS.Common.Priority", name: "Priority" }]),
        ...(type === "Bug"
          ? [
              { referenceName: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps" },
              { referenceName: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info" },
            ]
          : [{ referenceName: "System.Description", name: "Description" }]),
      ]);
    }
    if (method === "POST" && p === "p-1/_apis/wit/attachments") {
      const id = `att-${calls.length}`;
      return { status: 201, body: { id, url: `https://dev.azure.com/acme/p-1/_apis/wit/attachments/${id}` } };
    }
    const create = /^p-1\/_apis\/wit\/workitems\/\$(.+)$/.exec(p);
    if (method === "POST" && create) {
      const type = create[1] ?? "";
      const values: Record<string, unknown> = {};
      for (const op of body as Array<{ path: string; value: unknown }>) {
        if (op.path.startsWith("/fields/")) values[op.path.slice("/fields/".length)] = op.value;
      }
      const broken = opts.rule?.(type, values);
      if (broken) return broken;
      if (url.searchParams.get("validateOnly") === "true") return { status: 200, body: { id: -1 } };
      const id = nextId++;
      return {
        status: 200,
        body: { id, _links: { html: { href: `https://dev.azure.com/acme/Web/_workitems/edit/${id}` } } },
      };
    }
    return { status: 404, body: { message: `No route for ${url.pathname}` } };
  }

  return {
    calls,
    /** The JSON Patch ops of each work item actually created (not validate-only). */
    created: () =>
      calls
        .filter((c) => c.method === "POST" && c.path.includes("/_apis/wit/workitems/") && !c.path.includes("validateOnly"))
        .map((c) => ({ type: decodeURIComponent(c.path.split("$")[1]?.split("?")[0] ?? ""), ops: c.body as PatchOp[] })),
    uploads: () => calls.filter((c) => c.method === "POST" && c.path.includes("/_apis/wit/attachments")),
  };
}

export type PatchOp = { op: string; path: string; value: unknown };

/** One field's value in a create's JSON Patch. */
export function fieldOf(ops: PatchOp[], name: string): unknown {
  return ops.find((o) => o.path === `/fields/${name}`)?.value;
}

function list(value: unknown[]): Reply {
  return { status: 200, body: { count: value.length, value } };
}
