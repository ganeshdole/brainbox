/** The optional parts of a Brainbox backend. One built from parts may leave
 *  any of them out, and the dashboard then hides what needs it. */
export type BackendModule = "teams" | "triage" | "features" | "integrations" | "billing";

/** GET /api/me: the signed-in Account (Auth.js's session fields, not typed
 *  here) and what this backend offers. A backend from before `modules` has
 *  every one of them. */
export interface Me {
  modules: BackendModule[];
}
