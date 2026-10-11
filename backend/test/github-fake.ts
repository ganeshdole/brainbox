import { vi } from "vitest";

export interface GithubCall {
  method: string;
  path: string;
  body: unknown;
}

type Reply = { status: number; body?: unknown };

/** Stubs global fetch with a minimal GitHub API. Returns the recorded calls. */
export function fakeGithub(
  opts: { createIssue?: () => Reply; userInstallationIds?: number[] } = {},
) {
  const calls: GithubCall[] = [];
  let issueNumber = 0;
  const createIssue =
    opts.createIssue ??
    (() => {
      issueNumber += 1;
      return {
        status: 201,
        body: { number: issueNumber, html_url: `https://github.com/acme/web/issues/${issueNumber}` },
      };
    });

  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });

    let reply: Reply = { status: 404, body: { message: "Not Found" } };
    if (url.host === "github.com" && url.pathname === "/login/oauth/access_token") {
      reply =
        (body as { code?: string } | undefined)?.code === "good-code"
          ? { status: 200, body: { access_token: "ghu_test" } }
          : { status: 200, body: { error: "bad_verification_code", error_description: "bad code" } };
    } else if (url.pathname === "/user/installations") {
      const ids = opts.userInstallationIds ?? [4242];
      reply = {
        status: 200,
        body: {
          total_count: ids.length,
          installations: ids.map((id) => ({ id, account: { login: "acme", type: "Organization" } })),
        },
      };
    } else if (/^\/app\/installations\/\d+\/access_tokens$/.test(url.pathname)) {
      reply = {
        status: 201,
        body: { token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() },
      };
    } else if (method === "POST" && /^\/repos\/[^/]+\/[^/]+\/issues$/.test(url.pathname)) {
      reply = createIssue();
    } else if (/^\/app\/installations\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      reply = { status: 200, body: { id, account: { login: "acme", type: "Organization" } } };
    } else if (url.pathname === "/installation/repositories") {
      reply = {
        status: 200,
        body: {
          total_count: 1,
          repositories: [{ id: 1, name: "web", full_name: "acme/web", private: true, owner: { login: "acme" } }],
        },
      };
    }
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });

  return {
    calls,
    issueCalls: () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/issues")),
  };
}
