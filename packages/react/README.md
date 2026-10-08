# @brainbox/react

React bindings for `@brainbox/core`: a provider that owns one instance, and
hooks that read it. The `react-redux` to core's `redux`. No UI lives here;
for Brainbox's own widget see `@brainbox/widget`.

## Install

Inside this monorepo the package is consumed from source. `react` (19+) is a
peer dependency, so a host ends up with one copy.

```json
{ "dependencies": { "@brainbox/react": "workspace:*" } }
```

Outside the monorepo, `pnpm build` emits `dist/` (JS plus `.d.ts`) and
`pnpm pack` produces a tarball whose `exports` point at it (`publishConfig`),
so another app can `npm install` the `.tgz` files. Every `@brainbox/*`
dependency of a package needs its own tarball installed alongside.

## Use

```tsx
import { BrainboxProvider, useBrainbox, useDraft } from "@brainbox/react";
import { brainboxTransport } from "@brainbox/core";

// Keep the transport stable: a new one means a new instance.
const transport = brainboxTransport({ endpoint, projectKey });

export function Root() {
  return (
    <BrainboxProvider transport={transport} identity={{ id: user.id, email: user.email }}>
      <App />
    </BrainboxProvider>
  );
}
```

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
- `identity` changes call `identify()` on the live instance. `onSubmitted`
  may change freely. Only a new `transport` rebuilds the instance.
- `<BrainboxProvider brainbox={instance}>` provides an instance you created
  and own. Shells outside React (the script-tag bundle) use this.
