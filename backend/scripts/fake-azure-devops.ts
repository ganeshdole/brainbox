// A stand-in for Azure DevOps Services, for running the Azure DevOps
// destination end to end without a real organization: the REST calls the
// integration makes, plus a board and a work item page to look at.
//
//   pnpm -F @ganeshdole/brainbox-backend fake:ado     # http://localhost:8790
//
// Point the backend at it with AZURE_DEVOPS_URL=http://localhost:8790. Any
// PAT equal to FAKE_ADO_PAT (default "fake-pat") is accepted, as is any
// Bearer token. Everything is in memory and gone on restart. Dev only.
//
// Changing a work item's state or commenting on its page (or POSTing JSON
// `{ state?, comment? }` to /_fake/workitems/{id}) fires a "Work item updated"
// service hook at FAKE_ADO_HOOK_URL (e.g. http://localhost:8787/webhooks/azure-devops),
// with FAKE_ADO_HOOK_SECRET as its basic auth password, the way a real
// subscription would.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.FAKE_ADO_PORT ?? 8790);
const PAT = process.env.FAKE_ADO_PAT ?? "fake-pat";
const HOOK_URL = process.env.FAKE_ADO_HOOK_URL ?? "";
const HOOK_SECRET = process.env.FAKE_ADO_HOOK_SECRET ?? "";
const ORG = "acme";
const ORIGIN = `http://localhost:${PORT}`;

interface Team {
  id: string;
  name: string;
  area: string;
  bugsBehavior: "asRequirements" | "asTasks" | "off";
}

interface Field {
  referenceName: string;
  name: string;
  alwaysRequired?: boolean;
  defaultValue?: string;
  allowedValues?: string[];
}

interface WorkItem {
  id: number;
  rev: number;
  type: string;
  fields: Record<string, unknown>;
  relations: Array<{ rel: string; url: string; attributes?: { comment?: string } }>;
  createdAt: Date;
}

/** The states every type here has, and what each means (Azure DevOps' categories). */
const STATES: Array<{ name: string; category: string; reason: string }> = [
  { name: "New", category: "Proposed", reason: "New" },
  { name: "Active", category: "InProgress", reason: "Approved" },
  { name: "Resolved", category: "Resolved", reason: "Fixed" },
  { name: "Closed", category: "Completed", reason: "Verified" },
  { name: "Removed", category: "Removed", reason: "Removed from the backlog" },
];

const project = { id: "5b0c1c6e-0000-4000-8000-00000000a11d", name: "Web Shop" };
const checkout: Team = { id: "t-checkout", name: "Checkout Team", area: "Web Shop\\Checkout", bugsBehavior: "asRequirements" };
const teams: Team[] = [
  checkout,
  { id: "t-growth", name: "Growth Team", area: "Web Shop\\Growth", bugsBehavior: "off" },
];
const sprints = [
  { name: "Sprint 41", timeFrame: "past" },
  { name: "Sprint 42", timeFrame: "current" },
  { name: "Sprint 43", timeFrame: "future" },
].map((s) => ({ ...s, path: `${project.name}\\${s.name}` }));

const common: Field[] = [
  { referenceName: "System.Title", name: "Title", alwaysRequired: true },
  { referenceName: "System.State", name: "State", alwaysRequired: true, defaultValue: "New" },
  { referenceName: "System.AreaPath", name: "Area Path" },
  { referenceName: "System.IterationPath", name: "Iteration Path" },
  { referenceName: "System.Tags", name: "Tags" },
  { referenceName: "System.AssignedTo", name: "Assigned To" },
  { referenceName: "Microsoft.VSTS.Common.Priority", name: "Priority", defaultValue: "2" },
];
const types: Record<string, Field[]> = {
  Bug: [
    ...common,
    { referenceName: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps" },
    { referenceName: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info" },
    { referenceName: "Microsoft.VSTS.Common.Severity", name: "Severity", alwaysRequired: true, defaultValue: "3 - Medium" },
  ],
  "User Story": [...common, { referenceName: "System.Description", name: "Description" }],
  Task: [...common, { referenceName: "System.Description", name: "Description" }],
  Feature: [...common, { referenceName: "System.Description", name: "Description" }],
  "Test Case": [...common],
};
const hiddenTypes = ["Test Case"];

const attachments = new Map<string, { name: string; bytes: Buffer }>();
const workItems: WorkItem[] = [];
let nextId = 1001;

const server = createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    console.error("[fake-ado]", err);
    send(res, 500, { message: String(err) });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", ORIGIN);
  const seg = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = req.method ?? "GET";
  console.log(`[fake-ado] ${method} ${url.pathname}${url.search}`);

  // Pages, for people: no auth, like a signed-in browser.
  if (method === "GET" && seg.length === 0) return redirect(res, boardUrl(checkout));
  if (method === "GET" && seg[2] === "_boards") return page(res, board(teamOf(seg[4]) ?? checkout));
  if (method === "GET" && seg[2] === "_workitems" && seg[3] === "edit") {
    const item = workItems.find((w) => w.id === Number(seg[4]));
    return item ? page(res, workItemPage(item)) : send(res, 404, { message: "No such work item" });
  }
  if (method === "POST" && seg[0] === "_fake" && seg[1] === "workitems") {
    const item = workItems.find((w) => w.id === Number(seg[2]));
    if (!item) return send(res, 404, { message: "No such work item" });
    const raw = (await body(req)).toString("utf8");
    const form = (req.headers["content-type"] ?? "").includes("json")
      ? (JSON.parse(raw || "{}") as { state?: string; comment?: string })
      : Object.fromEntries(new URLSearchParams(raw));
    await update(item, form.state || undefined, form.comment?.trim() || undefined);
    return (req.headers["content-type"] ?? "").includes("json")
      ? send(res, 200, { id: item.id, rev: item.rev, fields: item.fields })
      : redirect(res, `/${ORG}/${encodeURIComponent(project.name)}/_workitems/edit/${item.id}`);
  }
  if (method === "GET" && seg[2] === "_apis" && seg[4] === "attachments" && seg[5]) {
    const file = attachments.get(seg[5]);
    if (!file) return send(res, 404, { message: "No such attachment" });
    res.writeHead(200, { "content-type": file.name.endsWith(".png") ? "image/png" : "application/octet-stream" });
    return res.end(file.bytes);
  }

  if (!authorized(req.headers.authorization)) {
    return send(res, 401, { message: "TF400813: The user is not authorized to access this resource." });
  }

  // Profile host.
  if (path(seg, "_apis/profile/profiles/me")) return send(res, 200, { id: "member-1", displayName: "Demo User" });
  if (path(seg, "_apis/accounts")) return send(res, 200, list([{ accountId: "a-1", accountName: ORG }]));

  if (seg[0] !== ORG) return send(res, 404, { message: `TF400813: Organization ${seg[0]} not found` });
  if (path(seg.slice(1), "_apis/projects")) return send(res, 200, list([project]));
  if (seg[1] === "_apis" && seg[2] === "projects" && seg[4] === "teams") {
    return isProject(seg[3]) ? send(res, 200, list(teams.map(({ id, name }) => ({ id, name })))) : notFoundProject(res, seg[3]);
  }
  if (!isProject(seg[1])) return notFoundProject(res, seg[1]);

  const team = teamOf(seg[2]);
  if (team && seg[3] === "_apis" && seg[4] === "work" && seg[5] === "teamsettings") {
    if (seg[6] === "teamfieldvalues") {
      return send(res, 200, { field: { referenceName: "System.AreaPath" }, defaultValue: team.area, values: [{ value: team.area, includeChildren: true }] });
    }
    if (seg[6] === "iterations") {
      const tf = url.searchParams.get("$timeframe");
      const rows = sprints.filter((s) => !tf || s.timeFrame === tf);
      return send(res, 200, list(rows.map((s) => ({ id: s.name, name: s.name, path: s.path, attributes: { timeFrame: s.timeFrame } }))));
    }
    return send(res, 200, { bugsBehavior: team.bugsBehavior, backlogIteration: { id: "root", name: project.name, path: "" } });
  }

  const wit = seg[2] === "_apis" && seg[3] === "wit" ? seg.slice(4) : null;
  if (!wit) return send(res, 404, { message: `No route for ${url.pathname}` });

  if (method === "GET" && wit[0] === "workitemtypes" && wit.length === 1) {
    return send(res, 200, list(Object.keys(types).map((name) => ({ name, referenceName: `Microsoft.VSTS.WorkItemTypes.${name}`, color: name === "Bug" ? "CC293D" : "009CCC" }))));
  }
  if (method === "GET" && wit[0] === "workitemtypes" && wit[2] === "states") {
    return send(res, 200, list(STATES.map(({ name, category }) => ({ name, category }))));
  }
  if (method === "GET" && wit[0] === "workitemtypecategories") {
    return send(res, 200, list([{ referenceName: "Microsoft.HiddenCategory", workItemTypes: hiddenTypes.map((name) => ({ name })) }]));
  }
  if (method === "GET" && wit[0] === "workitemtypes" && wit[2] === "fields") {
    const fields = types[wit[1] ?? ""];
    return fields ? send(res, 200, list(fields)) : send(res, 404, { message: `TF201036: Work item type ${wit[1]} does not exist` });
  }
  if (method === "POST" && wit[0] === "attachments") {
    const id = crypto.randomUUID();
    const name = url.searchParams.get("fileName") ?? "file";
    attachments.set(id, { name, bytes: await body(req) });
    return send(res, 201, { id, url: `${ORIGIN}/${ORG}/${project.id}/_apis/wit/attachments/${id}?fileName=${encodeURIComponent(name)}` });
  }
  if (method === "POST" && wit[0] === "workitems" && wit[1]?.startsWith("$")) {
    return createWorkItem(res, wit[1].slice(1), JSON.parse((await body(req)).toString("utf8")) as PatchOp[], url.searchParams.get("validateOnly") === "true");
  }
  return send(res, 404, { message: `No route for ${url.pathname}` });
}

type PatchOp = { op: string; path: string; value: unknown };

function createWorkItem(res: ServerResponse, type: string, ops: PatchOp[], validateOnly: boolean) {
  const fields = types[type];
  if (!fields) return send(res, 404, { message: `TF201036: Work item type ${type} does not exist` });
  const values: Record<string, unknown> = {};
  const relations: WorkItem["relations"] = [];
  for (const op of ops) {
    if (op.path === "/relations/-") relations.push(op.value as WorkItem["relations"][number]);
    else if (op.path.startsWith("/fields/")) values[op.path.slice(8)] = op.value;
  }
  for (const ref of Object.keys(values)) {
    if (!fields.some((f) => f.referenceName === ref)) {
      return send(res, 400, { message: `TF51535: Cannot find field ${ref}.`, typeKey: "WorkItemTrackingFieldDefinitionNotFoundException" });
    }
  }
  const area = String(values["System.AreaPath"] ?? project.name);
  if (area !== project.name && !teams.some((t) => t.area === area)) {
    return send(res, 400, { message: `TF401347: Invalid tree name given for work item -1, field 'System.AreaPath'.` });
  }
  const iteration = String(values["System.IterationPath"] ?? project.name);
  if (iteration !== project.name && !sprints.some((s) => s.path === iteration)) {
    return send(res, 400, { message: `TF401347: Invalid tree name given for work item -1, field 'System.IterationPath'.` });
  }
  const missing = fields.find((f) => f.alwaysRequired && !f.defaultValue && values[f.referenceName] === undefined);
  if (missing) {
    return send(res, 400, { message: `TF401320: Rule Error for field ${missing.name}. Error code: Required, HasValues, LimitedToValues, AllowsOldValue, InvalidEmpty.`, typeKey: "RuleValidationException" });
  }
  for (const f of fields) if (values[f.referenceName] === undefined && f.defaultValue) values[f.referenceName] = f.defaultValue;
  values["System.AreaPath"] = area;
  values["System.IterationPath"] = iteration;
  if (validateOnly) return send(res, 200, { id: -1, fields: values });

  values["System.Reason"] ??= "New";
  const item: WorkItem = { id: nextId++, rev: 1, type, fields: values, relations, createdAt: new Date() };
  workItems.unshift(item);
  const href = `${ORIGIN}/${ORG}/${encodeURIComponent(project.name)}/_workitems/edit/${item.id}`;
  return send(res, 200, { id: item.id, rev: 1, fields: values, relations, _links: { html: { href } } });
}

// Pages

function boardUrl(team: Team | undefined): string {
  return `/${ORG}/${encodeURIComponent(project.name)}/_boards/board/${encodeURIComponent(team?.name ?? "")}`;
}

function board(team: Team): string {
  const items = workItems.filter((w) => w.fields["System.AreaPath"] === team.area && (w.type !== "Bug" || team.bugsBehavior !== "off"));
  const columns = ["New", "Active", "Resolved", "Closed"].map((state) => {
    const cards = items
      .filter((w) => (w.fields["System.State"] ?? "New") === state)
      .map((w) => `<a class="card ${w.type === "Bug" ? "bug" : "story"}" href="/${ORG}/${encodeURIComponent(project.name)}/_workitems/edit/${w.id}">
          <div class="meta"><span class="type">${esc(w.type)}</span> ${w.id}</div>
          <div class="title">${esc(String(w.fields["System.Title"] ?? ""))}</div>
          <div class="tags">${String(w.fields["System.Tags"] ?? "").split("; ").filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
          <div class="meta">${esc(String(w.fields["System.IterationPath"] ?? "").split("\\").pop() ?? "")}${w.relations.some((r) => r.rel === "AttachedFile") ? " · 📎" : ""}</div>
        </a>`)
      .join("");
    return `<section><h3>${state} <small>${items.filter((w) => (w.fields["System.State"] ?? "New") === state).length}</small></h3>${cards}</section>`;
  });
  const tabs = teams.map((t) => `<a class="${t.id === team.id ? "on" : ""}" href="${boardUrl(t)}">${esc(t.name)}</a>`).join("");
  return shell(`${team.name} board`, `
    <div class="crumbs">${ORG} / ${esc(project.name)} / Boards / <b>${esc(team.name)}</b></div>
    <nav class="tabs">${tabs}</nav>
    <div class="board">${columns.join("")}</div>
    <script>setTimeout(() => location.reload(), 4000)</script>`);
}

function workItemPage(w: WorkItem): string {
  const f = w.fields;
  const body = String(f["Microsoft.VSTS.TCM.ReproSteps"] ?? f["System.Description"] ?? "");
  const files = w.relations.filter((r) => r.rel === "AttachedFile");
  const links = w.relations.filter((r) => r.rel === "Hyperlink");
  const side = [
    ["State", f["System.State"]],
    ["Area", f["System.AreaPath"]],
    ["Iteration", f["System.IterationPath"]],
    ["Priority", f["Microsoft.VSTS.Common.Priority"]],
    ["Severity", f["Microsoft.VSTS.Common.Severity"]],
    ["Assigned to", f["System.AssignedTo"] ?? "Unassigned"],
    ["Tags", f["System.Tags"]],
  ].filter(([, v]) => v !== undefined).map(([k, v]) => `<dt>${esc(String(k))}</dt><dd>${esc(String(v))}</dd>`).join("");
  return shell(`${w.type} ${w.id}`, `
    <div class="crumbs"><a href="${boardUrl(teams.find((t) => t.area === f["System.AreaPath"]))}">← Board</a></div>
    <div class="wi-head ${w.type === "Bug" ? "bug" : "story"}"><span class="type">${esc(w.type.toUpperCase())} ${w.id}</span><h1>${esc(String(f["System.Title"] ?? ""))}</h1></div>
    <div class="wi">
      <main>
        <h2>${f["Microsoft.VSTS.TCM.ReproSteps"] !== undefined ? "Repro Steps" : "Description"}</h2>
        <div class="rich">${body}</div>
        ${f["Microsoft.VSTS.TCM.SystemInfo"] ? `<h2>System Info</h2><div class="rich">${String(f["Microsoft.VSTS.TCM.SystemInfo"])}</div>` : ""}
      </main>
      <aside>
        <dl>${side}</dl>
        <h2>Change it</h2>
        <form method="post" action="/_fake/workitems/${w.id}" class="change">
          <select name="state">${STATES.map((s) => `<option${s.name === f["System.State"] ? " selected" : ""}>${s.name}</option>`).join("")}</select>
          <textarea name="comment" placeholder="Add a comment"></textarea>
          <button>Save${HOOK_URL ? " (fires the service hook)" : ""}</button>
        </form>
        ${String(f["System.History"] ?? "") ? `<h2>Latest comment</h2><div class="rich">${String(f["System.History"])}</div>` : ""}
        <h2>Attachments (${files.length})</h2>${files.map((r) => `<a href="${esc(r.url)}">📎 ${esc(r.attributes?.comment ?? "file")}</a>`).join("<br>")}
        <h2>Links</h2>${links.map((r) => `<a href="${esc(r.url)}">🔗 ${esc(r.attributes?.comment ?? r.url)}</a>`).join("<br>")}
      </aside>
    </div>`);
}

function shell(title: string, content: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} - Azure DevOps (local fake)</title><style>
    body{margin:0;font:14px "Segoe UI",system-ui,sans-serif;color:#201f1e;background:#f8f8f8}
    header{background:#0078d4;color:#fff;padding:10px 20px;font-weight:600;display:flex;gap:10px;align-items:center}
    header small{font-weight:400;opacity:.8}
    .wrap{padding:16px 24px}.crumbs{color:#605e5c;margin-bottom:12px}.crumbs a{color:#0078d4;text-decoration:none}
    .tabs{display:flex;gap:4px;margin-bottom:16px}.tabs a{padding:6px 12px;border-radius:4px;color:#201f1e;text-decoration:none;background:#eee}.tabs a.on{background:#0078d4;color:#fff}
    .board{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    section{background:#f3f2f1;border-radius:6px;padding:8px;min-height:300px}section h3{margin:4px 6px 10px;font-size:13px;color:#605e5c;font-weight:600}
    .card{display:block;background:#fff;border-radius:4px;padding:8px 10px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.15);text-decoration:none;color:inherit;border-left:4px solid #009ccc}
    .card.bug{border-left-color:#cc293d}.card .title{font-weight:600;margin:4px 0}.meta{font-size:12px;color:#605e5c}.type{font-weight:600}
    .tags span{display:inline-block;background:#e1dfdd;border-radius:3px;padding:0 6px;margin:2px 4px 2px 0;font-size:11px}
    .wi-head{background:#fff;border-left:6px solid #009ccc;padding:12px 16px;margin-bottom:12px}.wi-head.bug{border-left-color:#cc293d}.wi-head h1{margin:4px 0 0;font-size:20px}
    .wi{display:grid;grid-template-columns:1fr 300px;gap:16px}main,aside{background:#fff;padding:12px 16px}
    h2{font-size:13px;text-transform:uppercase;color:#605e5c;border-bottom:1px solid #edebe9;padding-bottom:4px}
    .rich table{border-collapse:collapse}.rich th,.rich td{border:1px solid #edebe9;padding:4px 8px;text-align:left;vertical-align:top}
    .rich img{max-width:100%;border:1px solid #edebe9}dl{display:grid;grid-template-columns:100px 1fr;gap:6px}dt{color:#605e5c}dd{margin:0}aside a{color:#0078d4}
    .change{display:grid;gap:6px}.change textarea{min-height:50px;font:inherit}.change button{background:#0078d4;color:#fff;border:0;border-radius:3px;padding:6px}
  </style></head><body><header>Azure DevOps <small>local fake for Brainbox development</small></header><div class="wrap">${content}</div></body></html>`;
}

/** Applies a state change and/or comment as a new revision, then fires the service hook. */
async function update(item: WorkItem, state: string | undefined, comment: string | undefined) {
  const changed: Record<string, { oldValue?: unknown; newValue: unknown }> = {};
  const next = state && state !== item.fields["System.State"] ? STATES.find((s) => s.name === state) : undefined;
  if (next) {
    changed["System.State"] = { oldValue: item.fields["System.State"], newValue: next.name };
    changed["System.Reason"] = { oldValue: item.fields["System.Reason"], newValue: next.reason };
    item.fields["System.State"] = next.name;
    item.fields["System.Reason"] = next.reason;
  }
  if (comment) {
    changed["System.History"] = { newValue: `<div>${esc(comment)}</div>` };
    item.fields["System.History"] = `<div>${esc(comment)}</div>`;
  }
  if (Object.keys(changed).length === 0) return;
  item.rev += 1;
  changed["System.Rev"] = { oldValue: item.rev - 1, newValue: item.rev };
  if (!HOOK_URL) return;
  const payload = {
    id: crypto.randomUUID(),
    eventType: "workitem.updated",
    publisherId: "tfs",
    resource: {
      id: item.rev,
      workItemId: item.id,
      rev: item.rev,
      revisedBy: { displayName: "Demo User", uniqueName: "demo.user@acme.example" },
      revisedDate: new Date().toISOString(),
      fields: changed,
      revision: {
        id: item.id,
        rev: item.rev,
        fields: { ...item.fields, "System.WorkItemType": item.type },
        url: `${ORIGIN}/${ORG}/${project.id}/_apis/wit/workItems/${item.id}/revisions/${item.rev}`,
      },
      url: `${ORIGIN}/${ORG}/${project.id}/_apis/wit/workItems/${item.id}/updates/${item.rev}`,
    },
    resourceVersion: "1.0",
    createdDate: new Date().toISOString(),
  };
  try {
    const res = await fetch(HOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Basic ${btoa(`azure-devops:${HOOK_SECRET}`)}` },
      body: JSON.stringify(payload),
    });
    console.log(`[fake-ado] service hook for ${item.type} ${item.id} rev ${item.rev}: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`[fake-ado] service hook for ${item.type} ${item.id} failed:`, err);
  }
}

// Helpers

function authorized(header: string | undefined): boolean {
  if (header?.startsWith("Bearer ")) return header.length > 7;
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  return decoded.slice(decoded.indexOf(":") + 1) === PAT;
}

function isProject(s: string | undefined): boolean {
  return s === project.id || s === project.name;
}

function teamOf(s: string | undefined): Team | undefined {
  return teams.find((t) => t.id === s || t.name === s);
}

function path(seg: string[], p: string): boolean {
  return seg.join("/") === p;
}

function list<T>(value: T[]) {
  return { count: value.length, value };
}

function notFoundProject(res: ServerResponse, name: string | undefined) {
  send(res, 404, { message: `TF200016: The following project does not exist: ${name}.` });
}

function send(res: ServerResponse, status: number, json: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(json));
}

function page(res: ServerResponse, html: string) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, to: string) {
  res.writeHead(302, { location: to });
  res.end();
}

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

server.listen(PORT, () => {
  console.log(`[fake-ado] Azure DevOps stand-in on ${ORIGIN} (org "${ORG}", project "${project.name}", PAT "${PAT}")`);
});
