/** What a sign-in email carries, as the backend's AUTH_EMAIL_MODE sets it:
 *  a one-time link, a 6-digit code typed on the login page, or both. "off"
 *  turns email sign-in off, leaving Google as the only way in. */
export type EmailSignInMode = "link" | "code" | "both" | "off";

/** GET /api/sign-in-options: how this deployment signs people in. */
export interface SignInOptions {
  email: EmailSignInMode;
  /** Whether "Continue with Google" works here. A backend from before this
   *  field always offered it. */
  google?: boolean;
}
