# @ganeshdole/brainbox-react

React bindings for `@ganeshdole/brainbox-core`: a provider that owns one instance, and
hooks that read it. The `react-redux` to core's `redux`. No UI lives here;
for Brainbox's own widget see `@ganeshdole/brainbox-widget`.

## Install

Inside this monorepo the package is consumed from source. `react` (19+) is a
peer dependency, so a host ends up with one copy.

```json
{ "dependencies": { "@ganeshdole/brainbox-react": "workspace:*" } }
```

Outside it, from npm:

```sh
npm install @ganeshdole/brainbox-react @ganeshdole/brainbox-core
```

`pnpm build` emits `dist/` (JS plus `.d.ts`); the published package's
`exports` point at it (`publishConfig`).

## Use

```tsx
import { BrainboxProvider, useBrainbox, useDraft } from "@ganeshdole/brainbox-react";
import { brainboxTransport } from "@ganeshdole/brainbox-core";

// Keep the transport stable: a new one means a new instance.
const transport = brainboxTransport({ endpoint, projectKey });

export function Root() {
  return (
    <BrainboxProvider
      transport={transport}
      identity={{ id: user.id, email: user.email, name: user.name, phone: user.phone }}
      fields={[
        { label: "Plan", value: account.plan },
        { label: "Account ID", value: account.id, type: "id" },
      ]}
    >
      <App />
    </BrainboxProvider>
  );
}
```

`identity` is who is reporting, and `fields` are your app's own details,
whatever you want next to every report. The dashboard shows both in the
report's "Reported by" card: the person's name, email and phone, then your
fields with your labels, in your order. Adding one needs no change in
Brainbox. `type` is optional: `email`,
`phone` and `url` become links, `id` shows in monospace, anything else is
text. Up to 30 fields, labels up to 60 characters, values up to 500.

Your own UI on top of the engine:

```tsx
function FeedbackPanel() {
  const brainbox = useBrainbox();           // null on the server and the first render
  const panel = useRef<HTMLDivElement>(null);
  const draft = useMemo(() => brainbox?.draft({ exclude: panel.current ?? undefined }), [brainbox]);
  if (!draft) return null;
  return <Panel ref={panel} draft={draft} />;
}

function Panel({ draft }: { draft: Draft }) {
  const state = useDraft(draft);            // re-renders on every change
  return state.screenshotPending ? <Spinner /> : <img src={state.screenshotUrl ?? ""} />;
}
```

## How the provider behaves

- The instance is created in an effect and destroyed in the cleanup. That
  keeps a server render side-effect free and leaves exactly one instance
  under StrictMode's mount-unmount-mount. The cost is one render in which
  `useBrainbox()` is `null`.
- `identity` changes call `identify()`, and `fields` changes call
  `setFields()`, on the live instance. The `fields` prop owns the instance's
  fields: dropping it clears them. `onSubmitted`
  may change freely. Only a new `transport` rebuilds the instance.
- `<BrainboxProvider brainbox={instance}>` provides an instance you created
  and own. Shells outside React (the script-tag bundle) use this.
