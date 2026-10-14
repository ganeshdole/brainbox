import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createBrainbox,
  type Brainbox,
  type BeforeSend,
  type BrainboxOptions,
  type Identity,
  type PrivacyOptions,
  type ReportField,
  type SubmitResult,
  type Transport,
} from "@ganeshdole/brainbox-core";

const BrainboxContext = createContext<Brainbox | null>(null);

interface OwnedProps {
  /** Where finished reports go. Keep it stable (module-level or `useMemo`):
   *  a new transport means a new instance. */
  transport: Transport;
  /** Who is filing. Changing it calls `identify()` on the live instance. */
  identity?: Identity;
  /** Your app's own details for every report (clinic, plan, ...). Changing it
   *  calls `setFields()` on the live instance. */
  fields?: ReportField[];
  /** Mask text in recordings, cover it in screenshots. Read when the instance
   *  is created; a change takes effect with the next `transport`. */
  privacy?: PrivacyOptions;
  /** Scrub or drop each report before it is sent. May change between renders. */
  beforeSend?: BeforeSend;
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
  fields?: never;
  privacy?: never;
  beforeSend?: never;
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
  fields,
  privacy,
  beforeSend,
  onSubmitted,
  children,
}: OwnedProps & { children?: ReactNode }) {
  const [brainbox, setBrainbox] = useState<Brainbox | null>(null);

  // Read through refs so a new callback or identity does not rebuild the instance.
  const onSubmittedRef = useRef(onSubmitted);
  useEffect(() => {
    onSubmittedRef.current = onSubmitted;
  }, [onSubmitted]);
  const beforeSendRef = useRef(beforeSend);
  useEffect(() => {
    beforeSendRef.current = beforeSend;
  }, [beforeSend]);
  const privacyRef = useRef(privacy);
  useEffect(() => {
    privacyRef.current = privacy;
  }, [privacy]);
  const identityRef = useRef(identity);
  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    const options: BrainboxOptions = {
      transport,
      identity: identityRef.current,
      fields: fieldsRef.current,
      privacy: privacyRef.current,
      // Always installed, so a callback that arrives on a later render (a
      // privacy policy loaded async) still runs on this instance.
      beforeSend: (report) => (beforeSendRef.current ? beforeSendRef.current(report) : report),
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

  // The prop owns the instance's fields: dropping it clears them, so a
  // signed-out user's reports never carry the previous account's details.
  useEffect(() => {
    brainbox?.setFields(fields ?? []);
  }, [brainbox, fields]);

  return <BrainboxContext.Provider value={brainbox}>{children}</BrainboxContext.Provider>;
}

/** The nearest provider's instance. `null` during the first render and on the
 *  server, before the provider's effect has created it. */
export function useBrainbox(): Brainbox | null {
  return useContext(BrainboxContext);
}
