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
  DOM. It is a UI over the **engine**, `@brainbox/core`, which owns what gets
  captured and sent and has no UI of its own (ADR 0005).
- **Dashboard** - the SaaS we sell: where the customer signs up, gets their
  snippet, and reads incoming tickets. (Out of scope for the widget build.)
- **Backend** - receives feedback from every customer's widget, stores it
  per-account, feeds the dashboard, routes to integrations. (Built later.)
- **Capture flow** - the end-user's sequence: open → mark up the frozen page →
  compose (talk/type) → submit. Marking up is optional; the screenshot
  rasterises in the background from the moment that step opens and the marks are
  baked onto it on the way to the composer.
- **Mark** - one thing the end-user drew on the page: a box, an arrow, a
  freehand stroke or a text note. Held as a vector until it is baked into the
  screenshot, so it stays undoable to the last moment.
- **Trigger** - whatever opens the widget. Two modes:
  - **Floating trigger** - the bottom-right button the widget renders itself
    (default).
  - **Manual trigger** - the customer's own element. Script tag:
    `data-mode="mount"` with `data-mount="<selector>"`, or
    `window.Brainbox.open()`. React: `useBrainboxWidget().open()`.
- **Project key** - a project's public identifier passed to the widget
  (`data-project`), scoping captured feedback to that project.

## Data hierarchy

```
Account ──< Project ──< Issue
```

- **Account** - a customer's login (email/password). Owns many projects.
- **Project** - one per SaaS the customer owns. Has a unique project key used in
  the widget snippet. Owns many issues.
- **Issue** - one feedback submission: screenshot, audio, text, region coords
  (the area the end-user's marks cover), and auto-captured metadata. Filed under
  the project named by the project key on the widget's POST.
