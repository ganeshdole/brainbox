import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createBrainbox,
  type Brainbox,
  type BrainboxOptions,
  type Identity,
  type SubmitResult,
  type Transport,
} from "@brainbox/core";

const BrainboxContext = createContext<Brainbox | null>(null);

interface OwnedProps {
  /** Where finished reports go. Keep it stable (module-level or `useMemo`):
   *  a new transport means a new instance. */
  transport: Transport;
  /** Who is filing. Changing it calls `identify()` on the live instance. */
  identity?: Identity;
  /** Called after every successful submit. May change between renders. */
  onSubmitted?: (result: SubmitResult) => void;
  brainbox?: never;
}

interface GivenProps {
  /** An instance the caller created and will `destroy()` itself. For shells
   *  outside React, like the script-tag bundle, that need the instance before
   *  anything renders. */
  brainbox: Brainbox;
  transport?: never;
  identity?: never;
  onSubmitted?: never;
}

export type BrainboxProviderProps = (OwnedProps | GivenProps) & { children?: ReactNode };

/**
 * Makes one `Brainbox` available to the tree below it.
 *
 * Given `transport`, it owns the instance: created in an effect, not during
 * render, because creating it patches `console.error`, which must not happen
 * on the server and must happen exactly once under StrictMode's
 * mount-unmount-mount. The cost is one render where `useBrainbox()` is still
 * `null`. Given `brainbox`, it only provides it.
 */
export function BrainboxProvider(props: BrainboxProviderProps) {
  if (props.brainbox) {
    return (
      <BrainboxContext.Provider value={props.brainbox}>{props.children}</BrainboxContext.Provider>
    );
  }
  return <OwnedProvider {...props} />;
}

function OwnedProvider({
  transport,
  identity,
  onSubmitted,
  children,
}: OwnedProps & { children?: ReactNode }) {
  const [brainbox, setBrainbox] = useState<Brainbox | null>(null);

  // Read through refs so a new callback or identity does not rebuild the instance.
  const onSubmittedRef = useRef(onSubmitted);
  useEffect(() => {
    onSubmittedRef.current = onSubmitted;
  }, [onSubmitted]);
  const identityRef = useRef(identity);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    const options: BrainboxOptions = {
      transport,
      identity: identityRef.current,
      onSubmitted: (result) => onSubmittedRef.current?.(result),
    };
    const instance = createBrainbox(options);
    setBrainbox(instance);
    return () => {
      instance.destroy();
      setBrainbox(null);
    };
  }, [transport]);

  useEffect(() => {
    if (brainbox && identity) brainbox.identify(identity);
  }, [brainbox, identity]);

  return <BrainboxContext.Provider value={brainbox}>{children}</BrainboxContext.Provider>;
}

/** The nearest provider's instance. `null` during the first render and on the
 *  server, before the provider's effect has created it. */
export function useBrainbox(): Brainbox | null {
  return useContext(BrainboxContext);
}
