import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createBrainbox,
  type Brainbox,
  type Identity,
  type SubmitResult,
  type Transport,
} from "@brainbox/core";

const BrainboxContext = createContext<Brainbox | null>(null);

export interface BrainboxProviderProps {
  /** Where finished reports go. Keep it stable (module-level or `useMemo`):
   *  a new transport means a new instance. */
  transport: Transport;
  /** Who is filing. Changing it calls `identify()` on the live instance. */
  identity?: Identity;
  /** Called after every successful submit. May change between renders. */
  onSubmitted?: (result: SubmitResult) => void;
  children?: ReactNode;
}

/**
 * Owns one `Brainbox` for the tree below it.
 *
 * The instance is created in an effect, not during render: creating it patches
 * `console.error`, which must not happen on the server and must happen exactly
 * once under StrictMode's mount-unmount-mount. The cost is one render where
 * `useBrainbox()` is still `null`.
 */
export function BrainboxProvider({
  transport,
  identity,
  onSubmitted,
  children,
}: BrainboxProviderProps) {
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
    const instance = createBrainbox({
      transport,
      identity: identityRef.current,
      onSubmitted: (result) => onSubmittedRef.current?.(result),
    });
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
