import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createBrainbox,
  type Brainbox,
  type BeforeSend,
  type BrainboxOptions,
  type CaptureLoader,
  type Identity,
  type PrivacyOptions,
  type RecordingOptions,
  type ReportField,
  type ScreenshotOptions,
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
   *  is created; a change takes effect with the next `transport`. So are the
   *  four below. */
  privacy?: PrivacyOptions;
  /** Collect console errors for bug reports. Default true. */
  consoleErrors?: boolean;
  /** Record narration with sessions (default yes), and extra rrweb options. */
  recording?: RecordingOptions;
  /** Screenshot pixel density, asset timeout and size budget. */
  screenshot?: ScreenshotOptions;
  /** How rrweb and modern-screenshot are loaded. Default `import()`. */
  loader?: CaptureLoader;
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
  consoleErrors?: never;
  recording?: never;
  screenshot?: never;
  loader?: never;
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
  consoleErrors,
  recording,
  screenshot,
  loader,
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
  // What the instance is created with; read only when `transport` changes.
  const setupRef = useRef({ privacy, consoleErrors, recording, screenshot, loader });
  useEffect(() => {
    setupRef.current = { privacy, consoleErrors, recording, screenshot, loader };
  }, [privacy, consoleErrors, recording, screenshot, loader]);
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
      ...setupRef.current,
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
