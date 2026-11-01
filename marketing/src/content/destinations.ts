// Where reports go next: one page per destination at /integrations/<slug>.
// What each says it does is what packages/integrations and the backend do;
// GITHUB_SAMPLE is checked against renderTicket() in content.test.ts.

import type { Article } from "./types"

const parent = { label: "Integrations", href: "/integrations" }

/** The report the GitHub page shows filed, and the issue renderTicket() makes of it. */
export const GITHUB_SAMPLE = {
  ticket: {
    id: "iss_7Kq2",
    createdAt: "2026-10-30T19:54:56.000Z",
    text: "I tap Pay and nothing happens. Tried twice, the button doesn't even show a spinner.",
    region: { x: 980, y: 612, width: 220, height: 56, selector: "button#pay" },
    metadata: {
      url: "https://shop.acme.example/checkout",
      title: "Checkout · Acme Store",
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15",
      language: "en-GB",
      timezone: "Asia/Calcutta",
      identity: { email: "maya@example.com", name: "Maya Patel" },
      consoleErrors: [
        "TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')\n    at HTMLButtonElement.<anonymous> (https://shop.acme.example/checkout:50:84)",
      ],
    },
    links: {
      dashboard: "https://app.brainbox.sh/projects/acme/issues/iss_7Kq2",
      crop: "https://app.brainbox.sh/f/iss_7Kq2/crop.png",
      screenshot: "https://app.brainbox.sh/f/iss_7Kq2/screenshot.png",
    },
  },
  title: "I tap Pay and nothing happens. Tried twice, the button doesn't even sho…",
  body: `![Highlighted region](https://app.brainbox.sh/f/iss_7Kq2/crop.png)

I tap Pay and nothing happens. Tried twice, the button doesn't even show a spinner.

| | |
|---|---|
| Page | [Checkout · Acme Store](https://shop.acme.example/checkout) |
| Viewport | 1440 × 900 @2x |
| Browser | Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15 |
| Locale | en-GB, Asia/Calcutta |
| User | Maya Patel <maya@example.com> |
| Element | \`button#pay\` |
| Reported | 2026-10-30T19:54:56.000Z |

<details>
<summary>1 console error</summary>

\`\`\`
TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')
    at HTMLButtonElement.<anonymous> (https://shop.acme.example/checkout:50:84)
\`\`\`

</details>

[Open in Brainbox](https://app.brainbox.sh/projects/acme/issues/iss_7Kq2) · [Full screenshot](https://app.brainbox.sh/f/iss_7Kq2/screenshot.png)`,
}

const github: Article = {
  path: "/integrations/github-issues",
  name: "GitHub Issues",
  parent,
  title: "Turn user bug reports into GitHub issues",
  description:
    "Brainbox files every bug report from your users as a GitHub issue: the marked-up screenshot, their words, the browser and the console errors, automatically.",
  heading: "User bug reports, filed as GitHub issues",
  intro: [
    "Install the Brainbox GitHub App, pick a repo, and every report your users send through the widget becomes an issue there, automatically. Nobody copies a screenshot out of an email or asks which browser it was.",
  ],
  sections: [
    {
      title: "What gets filed",
      blocks: [
        {
          p: "The issue's title is the first line of what the user said. The body is the part of the screenshot they marked, their words (and the transcript, if they spoke), a table of where it happened, the console errors in a collapsed section, and links back to the full report. This is the issue for a real report, exactly as Brainbox writes it:",
        },
        { code: GITHUB_SAMPLE.body, lang: "md", file: GITHUB_SAMPLE.title },
        {
          p: "The full screenshot, the screen recording or session replay, and the voice note stay in Brainbox, one click away from the issue.",
        },
      ],
    },
    {
      title: "Setting it up",
      blocks: [
        {
          list: [
            "In the dashboard, open a project's integrations and connect GitHub. That installs the Brainbox GitHub App on your account or organization; GitHub asks which repositories it may use.",
            "Pick the repository for this project's reports.",
            "Choose labels for bug reports, and separate labels for feature requests if you want them told apart.",
            "Save. Every new report from then on is filed as it arrives.",
          ],
        },
        {
          p: "The app asks for the access it needs to open issues on the repositories you choose, and nothing to do with your code. One installation serves every project in your team.",
        },
      ],
    },
    {
      title: "When something goes wrong",
      blocks: [
        {
          p: "Each report records its delivery: sent, with the issue number and a link, or failed, with GitHub's reason and a retry button. You can pause a project's GitHub filing at any time; reports keep arriving in your Brainbox inbox meanwhile. If the app is uninstalled from GitHub, Brainbox notices and stops sending.",
        },
      ],
    },
    {
      title: "One way, on purpose",
      blocks: [
        {
          p: "Brainbox files the issue and links back to the report. What happens to the issue after that is GitHub's business: closing it there doesn't change the report in Brainbox, which keeps its own triage status. Teams that live in GitHub triage there; the inbox is still there for reports you chose not to file.",
        },
      ],
    },
    {
      title: "Running it yourself",
      blocks: [
        {
          p: "The code that writes the issue is the source-available `@ganeshdole/brainbox-integrations` package. With your own backend, give it a fine-grained token with Issues read and write on the repo (or your own GitHub App) and deliver each report. Set `apiUrl` for GitHub Enterprise Server.",
        },
        {
          lang: "ts",
          code: `import { githubIssues } from "@ganeshdole/brainbox-integrations"

const github = githubIssues({
  owner: "acme",
  repo: "web",
  token: process.env.GITHUB_TOKEN,
  labels: ["feedback"],
})

const result = await github.deliver(ticket)
if (result.ok) console.log(result.url) // https://github.com/acme/web/issues/42`,
        },
      ],
    },
  ],
}

const azure: Article = {
  path: "/integrations/azure-devops",
  name: "Azure DevOps",
  parent,
  title: "User bug reports as Azure DevOps work items",
  description:
    "Brainbox files every user bug report as an Azure DevOps work item, on the board and sprint you choose, with the screenshot and recording attached.",
  heading: "User bug reports, filed as Azure DevOps work items",
  intro: [
    "Connect your Azure DevOps organization, choose the project, board and sprint, and every report your users send becomes a work item there: a Bug for bug reports and whatever type you like for feature requests, with the screenshot, the recording and the voice note attached.",
  ],
  sections: [
    {
      title: "Connecting",
      blocks: [
        {
          p: "Paste your organization's URL and a personal access token with Work Items (Read & write) and Project and Team (Read). Work items are created as the token's owner, so a service account's token keeps working when people leave. The token is stored sealed and never shown again. One connection serves every project in your team.",
        },
      ],
    },
    {
      title: "Choosing where reports land",
      blocks: [
        {
          list: [
            "The project, and the team and area, which decide whose board shows it.",
            "The iteration: the team's backlog, whatever sprint is current when the report arrives, or a fixed one.",
            "A work item type for bug reports, and one for feature requests: Bug and User Story, say, or Issue and Epic on the Basic process.",
            "Tags and a priority for each. A feature request's importance (blocking, important, nice to have) becomes priority 1, 2 or 3 when its type has one.",
          ],
        },
        {
          p: "Brainbox reads your project's process, so the choices match it: Agile, Scrum, CMMI, Basic or your own. When you save, it checks the setup against Azure DevOps without creating anything, so a required field you missed or an area that was renamed shows up then, not on your users' first report.",
        },
      ],
    },
    {
      title: "What the work item holds",
      blocks: [
        {
          list: [
            "The title from the first line of what the user said.",
            "The report in the field the type reads it from: Repro Steps on a Bug, Description elsewhere.",
            "The page, browser, viewport and locale in System Info, where the type has it.",
            "The marked-up screenshot inline, and the screenshot, screen recording and voice note uploaded as attachments.",
            "A link back to the report in Brainbox.",
          ],
        },
        {
          p: "The work item is made in one call, fields, attachments and link together, so it is never left half-filled. If a sprint lookup fails because the team no longer exists, the delivery fails and says so rather than quietly dropping the item in the backlog.",
        },
      ],
    },
    {
      title: "When something goes wrong",
      blocks: [
        {
          p: "Every delivery is recorded: sent, with the work item's id and link, or failed, with the reason and a retry. If Azure DevOps rejects the token (it expired, or was revoked), the connection is marked as needing a new one, and nothing is sent through it until someone reconnects.",
        },
      ],
    },
    {
      title: "Running it yourself",
      blocks: [
        {
          p: "The destination is `azureDevopsWorkItems()` in the source-available `@ganeshdole/brainbox-integrations` package, for a backend of your own. Set `baseUrl` for Azure DevOps Server.",
        },
        {
          lang: "ts",
          code: `import { azureDevopsWorkItems } from "@ganeshdole/brainbox-integrations"

const ado = azureDevopsWorkItems({
  organization: "acme",
  project: "Web",
  workItemType: "Bug",
  auth: { pat: process.env.ADO_PAT },
  areaPath: "Web\\\\Checkout",
  iteration: { currentFor: "Web Team" },
  tags: ["brainbox"],
  bodyField: "Microsoft.VSTS.TCM.ReproSteps",
  systemInfoField: "Microsoft.VSTS.TCM.SystemInfo",
  feature: { workItemType: "User Story", tags: ["feature-request"] },
})`,
        },
      ],
    },
  ],
}

export const DESTINATIONS: readonly Article[] = [github, azure]
