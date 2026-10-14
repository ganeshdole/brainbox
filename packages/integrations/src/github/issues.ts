import {
  errorMessage,
  resolveToken,
  type Destination,
  type FetchLike,
  type TokenSource,
} from "../destination.ts";
import { renderTicket, type Ticket } from "../ticket.ts";
import { githubErrorMessage, githubRequest, isRecord } from "./client.ts";

export interface GithubIssuesOptions {
  owner: string;
  repo: string;
  token: TokenSource;
  labels?: string[];
  /** Labels for feature requests, in place of `labels`. Default: `labels`. */
  featureLabels?: string[];
  fetch?: FetchLike;
  apiUrl?: string;
}

export function githubIssues(options: GithubIssuesOptions): Destination {
  const path =
    `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}/issues`;

  return {
    kind: "github",
    async deliver(ticket: Ticket) {
      const { title, body } = renderTicket(ticket);
      const labels =
        ticket.kind === "feature" ? (options.featureLabels ?? options.labels) : options.labels;

      let token: string;
      try {
        token = await resolveToken(options.token);
      } catch (err) {
        return { ok: false, error: `token: ${errorMessage(err)}` };
      }

      let res;
      try {
        res = await githubRequest({
          method: "POST",
          path,
          token,
          body: {
            title,
            body,
            ...(labels && labels.length > 0 ? { labels } : {}),
          },
          apiUrl: options.apiUrl,
          fetch: options.fetch,
        });
      } catch (err) {
        return { ok: false, error: errorMessage(err) };
      }

      if (res.status !== 201) {
        return { ok: false, status: res.status, error: githubErrorMessage(res.status, res.body) };
      }
      const issue = res.body;
      if (!isRecord(issue) || typeof issue.number !== "number" || typeof issue.html_url !== "string") {
        return { ok: false, status: res.status, error: "GitHub returned an unexpected issue body" };
      }
      return { ok: true, externalId: String(issue.number), url: issue.html_url };
    },
  };
}
