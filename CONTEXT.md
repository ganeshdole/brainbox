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
- **Feature** - one thing the customer's users want built, as the customer
  tracks it: a title, a description and a status (under review, planned, in
  progress, shipped, declined). It collects **requests**, the feature-request
  Issues end-users file through the widget; the number of requests is its
  demand. A new request waits unsorted until the customer attaches it to a
  Feature, starts a new one from it, or merges duplicates. The Feature's own
  words are the customer's and are meant to be shown publicly one day; its
  requests carry who asked and their app's details, and never are.
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
- **Team** - the people who share a set of projects: one company, or one
  person working alone. A Team owns projects and connections; nobody owns
  them personally, so a project outlives whoever created it. A person can be
  in several Teams. An Account's first project creates a Team for it.
- **Member** - a person (an Account) in a Team, with one **role**:
  - **Owner** - everything, including making and removing other Owners. A
    Team always keeps at least one. An Owner's plan pays for the Team.
  - **Admin** - projects, domains, integrations and people, but not Owners.
  - **Member** - reads every project's reports and resends them.
- **Invite** - an offer to join a Team with a role, sent to one email
  address and accepted only by an Account signed in as that address. Valid
  for 7 days, single-use; inviting the address again replaces it.
- **Connection** - a Team's link to an external tool: for GitHub, one
  installation of the Brainbox GitHub App on an org or user. Shared by all of
  the Team's projects.
- **Destination** - where one project's issues go: a Connection plus settings
  (for GitHub, the repo and labels). Can be paused.
- **Delivery** - one issue sent to one destination: pending, sent (with the
  GitHub issue number and link) or failed (with the reason, and a retry).

## Data hierarchy

```
Account >──< Team ──< Project ──< Issue ──< Delivery
  (Member,     │          │                    │
   role)       └──< Connection ──< Destination ──┘

Project ──< Feature ──< Issue   (feature requests only; a new one has no Feature yet)
```

- **Account** - one person's login (Google, or an emailed link or code). In
  any number of Teams, as a Member with a role in each. Holds the
  subscription, which covers every Team the Account owns.
- **Team** - owns many projects and connections. Its members see all of its
  projects.
- **Project** - one per SaaS the customer owns. Has a unique project key used in
  the widget snippet. Owns many issues.
- **Issue** - one feedback submission, a bug report or a feature request (its
  kind): screenshot, audio, text, region coords (the area the end-user's marks
  cover), and auto-captured metadata. Filed under the project named by the
  project key on the widget's POST.

## Issue lifecycle (triage)

The Customer's side of an Issue: what they decided about it, not what the
End-user sent.

- **Status** - where the Issue is in triage, one of a fixed set:
  - `new` - arrived, nobody has triaged it. Every Issue starts here; the
    **Inbox** is the Issues in `new`.
  - `open` - accepted, still to do.
  - `in_progress` - someone is on it.
  - `resolved` - fixed. Can be reopened.
  - `closed` - won't be acted on, with a **Close reason**: `wont_fix`,
    `duplicate`, `not_reproducible` or `spam`. Only a closed Issue has one.

  Issues that existed before triage count as `open`, not `new`.
- **Priority** - how urgent the Customer judges the Issue: `urgent`, `high`,
  `medium`, `low` or `none` (the default). The same scale as Linear and GitHub
  Projects. It is the Customer's call; how much a request matters to the
  End-user who sent it is a separate thing.
- **Triage** - changing an Issue's status, priority or close reason. Every
  Member of the project's Team can triage, whatever their role, one Issue or
  many at once.
- **Activity** - the Issue's append-only log of triage changes: who changed
  which field from what to what, and when. Written together with the change
  itself, and removed with the Issue.
