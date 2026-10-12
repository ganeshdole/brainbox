/** What a sign-in email carries, as the backend's AUTH_EMAIL_MODE sets it:
 *  a one-time link, a 6-digit code typed on the login page, or both. */
export type EmailSignInMode = "link" | "code" | "both";

/** GET /api/sign-in-options: how this deployment signs people in. */
export interface SignInOptions {
  email: EmailSignInMode;
}
