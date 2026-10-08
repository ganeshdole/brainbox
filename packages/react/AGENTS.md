# react - AGENTS.md

React bindings for the engine (`@brainbox/react`). The `react-redux` to
`@brainbox/core`'s `redux`: a provider that owns one instance, and hooks that
read it. Root rules in `/AGENTS.md` apply; ADR 0005 explains the layering.

## What this package is

- `<BrainboxProvider>` creates a `Brainbox` in an effect and destroys it in the
  cleanup. That is what makes it safe under StrictMode's double mount and on a
  server render, where it renders only its children.
- `useBrainbox()` is the instance, or `null` before the effect has run.
- `useDraft(draft)` subscribes a component to a draft's state.

Nothing here draws anything. The widget's UI lives in `widget/`; a host app
with its own UI uses these hooks the same way the widget does.

## Rules that are specific here

- `react` is a peer dependency, never a dependency. A host must end up with
  one copy of React.
- No DOM, no CSS, no components other than the provider.

## Tests

Vitest under jsdom. Render with `react-dom/client` inside React's `act()`;
`test-setup.ts` flags the act environment. Run: `pnpm -F @brainbox/react test`.
