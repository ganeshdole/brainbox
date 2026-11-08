import { describe, expect, it } from "vitest";

import { emailModeFor, initialLogin, loginReducer, type LoginState } from "./login";

const fresh = (over: Partial<Parameters<typeof initialLogin>[0]> = {}): LoginState =>
  initialLogin({ retrying: false, sentElsewhere: false, error: false, ...over });

describe("emailModeFor", () => {
  it("takes the backend's mode on a fresh visit", () => {
    expect(emailModeFor("link", false)).toBe("link");
    expect(emailModeFor("off", false)).toBe("off");
  });

  it("keeps a retry on the code step when the options fell back to links", () => {
    expect(emailModeFor("link", true)).toBe("code");
    expect(emailModeFor("both", true)).toBe("both");
  });
});

describe("loginReducer", () => {
  it("will not send before the options are known", () => {
    const state = fresh();
    expect(state.mode).toBeNull();
    expect(loginReducer(state, { type: "send" })).toBe(state);
  });

  it("keeps a retry in code mode after a failed options call", () => {
    // shown as the code step before the options answer
    expect(fresh({ retrying: true }).mode).toBe("code");
    const state = loginReducer(fresh({ retrying: true }), { type: "options", email: "link", google: true });
    expect(state.mode).toBe("code");
    expect(state.step.kind).toBe("sent");
  });

  it("clears the error banner once they try again", () => {
    let state = loginReducer(fresh({ error: true }), { type: "options", email: "code", google: true });
    expect(state.banner).toBe(true);
    state = loginReducer(state, { type: "send" });
    expect(state.banner).toBe(false);
    expect(loginReducer(state, { type: "sent" }).banner).toBe(false);
  });

  it("clears the wrong-code banner on a resend", () => {
    let state = loginReducer(fresh({ retrying: true }), { type: "options", email: "code", google: true });
    expect(state.banner).toBe(true);
    state = loginReducer(loginReducer(state, { type: "send" }), { type: "sent" });
    expect(state.banner).toBe(false);
  });

  it("lets a link sent elsewhere be swapped for a different address", () => {
    let state = loginReducer(fresh({ sentElsewhere: true }), { type: "options", email: "link", google: true });
    expect(state.sentElsewhere).toBe(true);
    state = loginReducer(state, { type: "changeEmail" });
    expect(state.sentElsewhere).toBe(false);
    expect(state.step.kind).toBe("form");
  });

  it("ignores a second send or Google click while one is out", () => {
    const ready = loginReducer(fresh(), { type: "options", email: "link", google: true });
    const sending = loginReducer(ready, { type: "send" });
    expect(loginReducer(sending, { type: "send" })).toBe(sending);
    const google = loginReducer(ready, { type: "google" });
    expect(google.googleBusy).toBe(true);
    expect(loginReducer(google, { type: "google" })).toBe(google);
    expect(loginReducer(google, { type: "googleFailed" }).googleBusy).toBe(false);
    // Back from Google's page, restored from the back/forward cache
    expect(loginReducer(google, { type: "restored" }).googleBusy).toBe(false);
  });
});
