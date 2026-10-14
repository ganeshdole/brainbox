import { describe, expect, it } from "vitest";

import { fakeFetch } from "../test/fake-fetch.ts";
import type { Ticket } from "../ticket.ts";
import { githubIssues } from "./issues.ts";

const ticket: Ticket = {
  id: "iss_1",
  createdAt: "2026-10-11T09:30:00.000Z",
  text: "Save does nothing",
  metadata: {
    url: "https://app.example.com/",
    title: "Example",
    viewport: { width: 800, height: 600 },
    devicePixelRatio: 1,
    userAgent: "UA",
    language: "en",
    timezone: "UTC",
    consoleErrors: [],
  },
  links: { dashboard: "https://app.brainbox.sh/i/1" },
};

const created = { status: 201, body: { number: 42, html_url: "https://github.com/o/r/issues/42" } };

describe("githubIssues", () => {
  it("posts a rendered issue with the token and returns the number and URL", async () => {
    const fetch = fakeFetch(created);
    const dest = githubIssues({ owner: "o", repo: "r", token: "tok", labels: ["bug"], fetch });

    const result = await dest.deliver(ticket);

    expect(dest.kind).toBe("github");
    expect(result).toEqual({ ok: true, externalId: "42", url: "https://github.com/o/r/issues/42" });
    const call = fetch.calls[0]!;
    expect(call.url).toBe("https://api.github.com/repos/o/r/issues");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe("Bearer tok");
    expect(call.headers.accept).toBe("application/vnd.github+json");
    expect(call.headers["x-github-api-version"]).toBe("2022-11-28");
    expect(call.body).toMatchObject({ title: "Save does nothing", labels: ["bug"] });
    expect((call.body as { body: string }).body).toContain("[Open in Brainbox]");
  });

  it("labels a feature request with featureLabels, falling back to labels", async () => {
    const feature: Ticket = { ...ticket, kind: "feature" };
    const fetch = fakeFetch(created, created, created, created);
    const both = githubIssues({
      owner: "o",
      repo: "r",
      token: "tok",
      labels: ["bug"],
      featureLabels: ["enhancement"],
      fetch,
    });
    await both.deliver(feature);
    await both.deliver(ticket);
    expect(fetch.calls[0]!.body).toMatchObject({ labels: ["enhancement"] });
    expect(fetch.calls[1]!.body).toMatchObject({ labels: ["bug"] });

    const bugOnly = githubIssues({ owner: "o", repo: "r", token: "tok", labels: ["bug"], fetch });
    await bugOnly.deliver(feature);
    expect(fetch.calls[2]!.body).toMatchObject({ labels: ["bug"] });

    const none = githubIssues({ owner: "o", repo: "r", token: "tok", labels: ["bug"], featureLabels: [], fetch });
    await none.deliver(feature);
    expect(fetch.calls[3]!.body).not.toHaveProperty("labels");
  });

  it("resolves a token function at send time and omits labels when none are set", async () => {
    const fetch = fakeFetch(created);
    let minted = 0;
    const dest = githubIssues({
      owner: "o",
      repo: "r",
      token: async () => `tok-${++minted}`,
      fetch,
    });

    await dest.deliver(ticket);

    expect(fetch.calls[0]!.headers.authorization).toBe("Bearer tok-1");
    expect(fetch.calls[0]!.body).not.toHaveProperty("labels");
  });

  it("uses a custom API root and URL-encodes the owner and repo", async () => {
    const fetch = fakeFetch(created);
    const dest = githubIssues({
      owner: "my org",
      repo: "r",
      token: "t",
      apiUrl: "https://ghe.example.com/api/v3",
      fetch,
    });
    await dest.deliver(ticket);
    expect(fetch.calls[0]!.url).toBe("https://ghe.example.com/api/v3/repos/my%20org/r/issues");
  });

  it("returns GitHub's message and status on a non-201 response", async () => {
    const fetch = fakeFetch({
      status: 422,
      body: {
        message: "Validation Failed",
        errors: [{ resource: "Issue", field: "title", code: "missing_field" }],
      },
    });
    const dest = githubIssues({ owner: "o", repo: "r", token: "t", fetch });

    expect(await dest.deliver(ticket)).toEqual({
      ok: false,
      status: 422,
      error: "Validation Failed: title missing_field",
    });
  });

  it("reports a network failure without a status", async () => {
    const fetch = fakeFetch(new Error("ECONNRESET"));
    const dest = githubIssues({ owner: "o", repo: "r", token: "t", fetch });
    expect(await dest.deliver(ticket)).toEqual({ ok: false, error: "ECONNRESET" });
  });

  it("reports a token that could not be produced", async () => {
    const fetch = fakeFetch();
    const dest = githubIssues({
      owner: "o",
      repo: "r",
      token: () => Promise.reject(new Error("installation gone")),
      fetch,
    });
    expect(await dest.deliver(ticket)).toEqual({ ok: false, error: "token: installation gone" });
    expect(fetch.calls).toHaveLength(0);
  });

  it("rejects a 201 whose body is not an issue", async () => {
    const fetch = fakeFetch({ status: 201, body: { nope: true } });
    const dest = githubIssues({ owner: "o", repo: "r", token: "t", fetch });
    const result = await dest.deliver(ticket);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 201 });
  });
});
