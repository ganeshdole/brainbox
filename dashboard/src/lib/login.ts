import type { EmailSignInMode } from "@ganeshdole/brainbox-shared";

/**
 * The login page as one state, so the combinations that used to be reachable
 * from separate flags - a stuck "check your inbox" with no way back, a banner
 * that outlived the retry it described, a send in a mode not yet known - are
 * not representable.
 */
export interface LoginState {
  /** What a sign-in email carries. Null until the backend has said (a retry
   *  starts at "code"), and the email form waits for it: sending before then
   *  would guess "link". */
  mode: EmailSignInMode | null;
  google: boolean;
  /** Back from a wrong code: the code step, whatever the options say. */
  retrying: boolean;
  step:
    | { kind: "form" }
    | { kind: "sending" }
    | { kind: "sent" }
    /** `refusal` is the Auth.js code the API answered with; null when the send
     *  itself failed. */
    | { kind: "error"; refusal: string | null };
  /** Auth.js landed us on /login?type=email after sending a link from
   *  elsewhere. Shown until they choose to use a different address. */
  sentElsewhere: boolean;
  /** The banner for ?error= (or the wrong code). It describes the last
   *  attempt, so the next one clears it. */
  banner: boolean;
  googleBusy: boolean;
}

export type LoginAction =
  | { type: "options"; email: EmailSignInMode; google: boolean }
  | { type: "send" }
  | { type: "sent" }
  | { type: "sendFailed"; refusal: string | null }
  | { type: "changeEmail" }
  | { type: "google" }
  | { type: "googleFailed" };

export function initialLogin(opts: {
  retrying: boolean;
  sentElsewhere: boolean;
  error: boolean;
}): LoginState {
  return {
    // a retry is a code step already; the options can only confirm it
    mode: opts.retrying ? "code" : null,
    google: true,
    retrying: opts.retrying,
    step: opts.retrying ? { kind: "sent" } : { kind: "form" },
    sentElsewhere: opts.sentElsewhere,
    banner: opts.error || opts.retrying,
    googleBusy: false,
  };
}

/** A retry came from a code, so it stays a code step even if the options
 *  call failed and fell back to links. */
export function emailModeFor(fetched: EmailSignInMode, retrying: boolean): EmailSignInMode {
  if (!retrying) return fetched;
  return fetched === "both" ? "both" : "code";
}

export function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case "options":
      return { ...state, mode: emailModeFor(action.email, state.retrying), google: action.google };
    case "send":
      if (state.step.kind === "sending" || state.mode === null) return state;
      return { ...state, step: { kind: "sending" }, banner: false };
    case "sent":
      return { ...state, step: { kind: "sent" } };
    case "sendFailed":
      return { ...state, step: { kind: "error", refusal: action.refusal } };
    case "changeEmail":
      return { ...state, step: { kind: "form" }, sentElsewhere: false };
    case "google":
      if (state.googleBusy) return state;
      return { ...state, googleBusy: true, banner: false };
    case "googleFailed":
      return { ...state, googleBusy: false };
  }
}
