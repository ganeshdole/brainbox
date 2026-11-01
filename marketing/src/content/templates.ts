// Free templates at /templates/<slug>: things a team can copy into its repo
// today, Brainbox or not. The fields mirror what a Brainbox report fills in
// (renderTicket in packages/integrations), so the last section of each can say
// honestly which ones the widget writes for you.

import type { Article } from "./types"

const parent = { label: "Templates", href: "/templates" }

const BUG_MARKDOWN = `## What happened
<!-- One or two sentences, in the words of whoever hit it. -->

## What I expected

## Steps to reproduce
1.
2.
3.

## Where
- Page / URL:
- Browser and version:
- OS and device:
- Screen size:
- Signed in as:

## Screenshot or recording
<!-- Mark the part that's wrong. -->

## Console errors
\`\`\`
<!-- Paste anything red from the browser console. -->
\`\`\`

## How often
<!-- Every time, sometimes, once? -->`

const BUG_FORM = `name: Bug report
description: Something in the app is broken or doesn't work as expected.
title: "[Bug]: "
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: Thanks for taking the time. The more of this you fill in, the sooner we can fix it.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: And what did you expect to happen instead?
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to ...
        2. Click ...
        3. See ...
    validations:
      required: true
  - type: input
    id: url
    attributes:
      label: Page or URL
      placeholder: https://app.example.com/checkout
  - type: dropdown
    id: browser
    attributes:
      label: Browser
      multiple: true
      options:
        - Chrome
        - Safari
        - Firefox
        - Edge
        - Other
  - type: input
    id: environment
    attributes:
      label: OS, device and screen size
      placeholder: macOS 15, MacBook Air, 1440 × 900
  - type: textarea
    id: console
    attributes:
      label: Console errors
      description: Anything red in the browser's developer console. Formatted as code automatically.
      render: shell
  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots or recording
      description: Drag images or a video in here.
  - type: dropdown
    id: frequency
    attributes:
      label: How often does it happen?
      options:
        - Every time
        - Sometimes
        - Only once
    validations:
      required: true`

const FEATURE_FORM = `name: Feature request
description: Suggest something the app should do.
title: "[Feature]: "
labels: ["feature-request"]
body:
  - type: textarea
    id: goal
    attributes:
      label: What are you trying to do?
      description: The job you're trying to get done, not the solution. "Send the invoice from my phone", not "add a button".
    validations:
      required: true
  - type: textarea
    id: today
    attributes:
      label: How do you do it today?
      description: The workaround, if there is one.
  - type: dropdown
    id: importance
    attributes:
      label: How much does it matter?
      options:
        - Nice to have
        - Important
        - Blocking me
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: Anything else
      description: Screenshots, examples from other apps, who else needs it.`

const CHOOSER = `blank_issues_enabled: false
contact_links:
  - name: Ask a question
    url: https://github.com/acme/web/discussions
    about: For questions rather than bugs.`

const bugReport: Article = {
  path: "/templates/bug-report",
  name: "Bug report",
  parent,
  title: "Bug report template, with good and bad examples",
  description:
    "A free bug report template to copy: what happened, steps to reproduce, environment, screenshot and console errors, with a good and a bad example of each.",
  heading: "A bug report template that gets bugs fixed",
  intro: [
    "A bug gets fixed when the person fixing it can see it for themselves. Every field below exists to get them there: what happened, how to make it happen again, and where it happened. Copy the template into your tracker, your wiki or your support macros.",
  ],
  sections: [
    {
      title: "The template",
      blocks: [{ code: BUG_MARKDOWN, lang: "md", file: "bug-report.md" }],
    },
    {
      title: "What each part is for",
      blocks: [
        {
          table: {
            head: ["Part", "Why it's there", "Good", "Not enough"],
            rows: [
              ["What happened", "The symptom, so the reader knows what to look for", "Tapping Pay does nothing: no spinner, no error, the button stays blue", "Checkout is broken"],
              ["What I expected", "Separates a bug from a misunderstanding", "To go to the confirmation page", "To work"],
              ["Steps to reproduce", "The fastest way to see it is to do it", "Add any item, go to checkout, pick card, tap Pay", "Just try to pay"],
              ["Where", "Many bugs only happen in one browser or at one size", "Safari 18, macOS, 1440 × 900", "On my laptop"],
              ["Screenshot or recording", "Shows what words miss, like the wrong button", "The Pay button circled", "A screenshot of the whole desktop"],
              ["Console errors", "Often names the cause outright", "`TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')`", "Nothing in the console (when there was)"],
              ["How often", "Tells an intermittent bug from a constant one", "Every time, on two cards", "Randomly"],
            ],
          },
        },
      ],
    },
    {
      title: "A good report and a bad one",
      blocks: [
        { p: "The bad one is what most teams get from users:" },
        { code: "Subject: checkout broken!!\n\nCan't pay. Please fix asap.", lang: "md" },
        { p: "The good one, for the same bug:" },
        {
          code: `## What happened
Tapping Pay does nothing. No spinner, no error; the button stays as it was.

## What I expected
To land on the order confirmation page.

## Steps to reproduce
1. Add any item to the cart
2. Go to checkout and choose "Card"
3. Tap Pay

## Where
- Page / URL: https://shop.acme.example/checkout
- Browser and version: Safari 18.1
- OS and device: macOS, MacBook Air
- Screen size: 1440 × 900
- Signed in as: maya@example.com

## Console errors
TypeError: Cannot read properties of undefined (reading 'confirmCardPayment')

## How often
Every time, tried twice with two different cards.`,
          lang: "md",
        },
      ],
    },
    {
      title: "Getting reports like that from users",
      blocks: [
        {
          p: "Your team will fill in a template. Your users mostly won't: they don't know what a console is, and they shouldn't have to. That is what Brainbox is for. Users click a button in your app, mark what's wrong and say what happened, and the widget fills in the rest of this template itself: the page, browser, screen size, who they are, the element they marked and the console errors. It then [files it as a GitHub issue](/integrations/github-issues) or [an Azure DevOps work item](/integrations/azure-devops).",
        },
        {
          p: "For GitHub, there is also [an issue form version](/templates/github-bug-report) of this template, with required fields and dropdowns.",
        },
      ],
    },
  ],
}

const githubBugReport: Article = {
  path: "/templates/github-bug-report",
  name: "GitHub issue forms",
  parent,
  title: "GitHub bug report template (issue form YAML)",
  description:
    "Copy-paste GitHub issue form templates for bug reports and feature requests: required fields, browser dropdowns and console logs formatted as code.",
  heading: "GitHub issue templates for bug reports",
  intro: [
    "GitHub issue forms turn a blank issue into a form with required fields, dropdowns and checkboxes. They live in `.github/ISSUE_TEMPLATE/` as YAML files, and GitHub offers them to anyone opening an issue on the repo.",
  ],
  sections: [
    {
      title: "Bug report",
      blocks: [
        { code: BUG_FORM, lang: "yaml", file: ".github/ISSUE_TEMPLATE/bug_report.yml" },
        {
          p: "`render: shell` formats whatever is pasted into the console field as a code block, so stack traces stay readable. `validations: required: true` won't let the issue be created without that field.",
        },
      ],
    },
    {
      title: "Feature request",
      blocks: [
        { code: FEATURE_FORM, lang: "yaml", file: ".github/ISSUE_TEMPLATE/feature_request.yml" },
        { p: "Asking for the goal rather than the solution is the most useful thing a feature request form can do: the button someone asks for is often not the best answer to what they need." },
      ],
    },
    {
      title: "The chooser",
      blocks: [
        {
          p: "`config.yml` in the same folder controls the page GitHub shows before the form. This one turns off blank issues and points questions somewhere else:",
        },
        { code: CHOOSER, lang: "yaml", file: ".github/ISSUE_TEMPLATE/config.yml" },
      ],
    },
    {
      title: "Issues from people who'll never open GitHub",
      blocks: [
        {
          p: "Issue forms work for people who use GitHub. Your app's users don't, so their bugs reach you as emails and support tickets. [Brainbox's GitHub integration](/integrations/github-issues) files their reports straight into the repo instead, with the screenshot they marked up, their words, the browser and the console errors already in the issue, labelled the way you choose.",
        },
      ],
    },
  ],
}

const featureRequest: Article = {
  path: "/templates/feature-request",
  name: "Feature request",
  parent,
  title: "Feature request template for product teams",
  description:
    "A free feature request template that asks for the problem, not the solution: the goal, today's workaround and how much it matters, with an example.",
  heading: "A feature request template that asks the right question",
  intro: [
    "Most feature requests arrive as a solution: \"add an export button\". The useful part is the problem behind it, because that's what you can weigh against everything else and solve the best way. This template asks for the problem first.",
  ],
  sections: [
    {
      title: "The template",
      blocks: [
        {
          code: `## What are you trying to do?
<!-- The job, not the feature: "send my accountant last quarter's invoices". -->

## How do you do it today?
<!-- The workaround, if there is one. -->

## How much does it matter?
<!-- Nice to have / Important / Blocking me -->

## Anything else
<!-- Screenshots, an app that does it well, who else needs it. -->`,
          lang: "md",
          file: "feature-request.md",
        },
      ],
    },
    {
      title: "An example",
      blocks: [
        {
          code: `## What are you trying to do?
Send my accountant every invoice from last quarter in one go.

## How do you do it today?
I open each invoice and download it as a PDF, about 40 of them.

## How much does it matter?
Important. I do it every quarter and it takes most of an afternoon.

## Anything else
A zip of PDFs, or a CSV, would both work for her.`,
          lang: "md",
        },
        {
          p: "\"Add bulk export\" would have been the solution-first version. This one tells you how often, how painful, and that a CSV would do, which may be a day's work instead of a week's.",
        },
      ],
    },
    {
      title: "Counting requests, not just reading them",
      blocks: [
        {
          p: "One request is an anecdote; forty for the same thing is a roadmap item. Brainbox's widget takes feature requests beside bug reports: users say what they're trying to do, typed or as a voice note, and how much it matters, with a screenshot if they like. In the dashboard you group requests into features, so you see which ones the most people are asking for, and who.",
        },
        { p: "The same fields as a GitHub issue form are on the [GitHub templates page](/templates/github-bug-report)." },
      ],
    },
  ],
}

export const TEMPLATES: readonly Article[] = [bugReport, githubBugReport, featureRequest]
