# Brainbox - Context & Glossary

Brainbox is an embeddable in-app feedback widget. A customer's end-user reports a
broken UI area by marking it up and talking; Brainbox turns that into a
structured ticket routed to the customer's tools.

The product has three distinct surfaces - keep them separate:
**the widget**, **the dashboard**, **the backend**.

## Glossary

- **Customer** - the SaaS founder who buys Brainbox and embeds the widget in
  their own app. Our ICP. (Not the person filing feedback.)
- **End-user** - a user of the *customer's* app, the person who actually files
  feedback through the widget.
- **Host app** - the customer's web app that the widget is embedded into. The
  widget runs inside the host's document.
- **Widget** - the embeddable surface the end-user interacts with. Ships as a
  script-tag IIFE bundle (`widget.js`) and as a library (`<BrainboxWidget />`
  for React hosts, `mount()` for the rest). Isolated from the host via Shadow
  DOM. It is a UI over the **engine**, `@ganeshdole/brainbox-core`, which owns what gets
  captured and sent and has no UI of its own (ADR 0005).
- **Dashboard** - the SaaS we sell: where the customer signs up, gets their
  snippet, and reads incoming tickets. (Out of scope for the widget build.)
- **Backend** - receives feedback from every customer's widget, stores it
  per-account, feeds the dashboard, and delivers each issue to the project's
  destinations.
- **Capture flow** - the end-user's sequence: open → mark up the frozen page →
  compose (talk/type) → submit. Marking up is optional; the screenshot
  rasterises in the background from the moment that step opens and the marks are
  baked onto it on the way to the composer.
- **Mark** - one thing the end-user drew on the page: a box, an arrow, a
  freehand stroke or a text note. Held as a vector until it is baked into the
  screenshot, so it stays undoable to the last moment.
- **Issue kind** - what a report is about. A **bug report** shows something
  broken and carries a capture (screenshot or recording). A **feature
  request** tells what the end-user wishes the app did: text or a voice note,
  an optional screenshot, and how much it matters to them (importance: nice
  to have, important, or blocking them). A report with no kind is a bug.
- **Trigger** - whatever opens the widget. Two modes:
  - **Floating trigger** - the bottom-right button the widget renders itself
    (default).
  - **Manual trigger** - the customer's own element. Script tag:
    `data-mode="mount"` with `data-mount="<selector>"`, or
    `window.Brainbox.open()`. React: `useBrainboxWidget().open()`.
  Either mode can open straight into one flow with `start(mode)`: `screenshot`,
  `record` or `feature`. A script-tag host can also mark any element with
  `data-brainbox="feature"` (or `screenshot`, `record`, `open`).
- **Project key** - a project's public identifier passed to the widget
  (`data-project`), scoping captured feedback to that project.
- **Connection** - an Account's link to an external tool: for GitHub, one
  installation of the Brainbox GitHub App on an org or user. Shared by all of
  the Account's projects.
- **Destination** - where one project's issues go: a Connection plus settings
  (for GitHub, the repo and labels). Can be paused.
- **Delivery** - one issue sent to one destination: pending, sent (with the
  GitHub issue number and link) or failed (with the reason, and a retry).

## Data hierarchy

```
Account ──< Project ──< Issue ──< Delivery
   │            │                    │
   └──< Connection ──< Destination ──┘
```

- **Account** - a customer's login (email/password). Owns many projects.
- **Project** - one per SaaS the customer owns. Has a unique project key used in
  the widget snippet. Owns many issues.
- **Issue** - one feedback submission, a bug report or a feature request (its
  kind): screenshot, audio, text, region coords (the area the end-user's marks
  cover), and auto-captured metadata. Filed under the project named by the
  project key on the widget's POST.
