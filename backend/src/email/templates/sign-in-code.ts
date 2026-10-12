// The sign-in code sent when AUTH_EMAIL_MODE is "code" or "both". Same shape
// as the other templates: a subject + html + text triple the caller hands to
// the active emailer. Inline styles only (email clients strip <style>).

import type { RenderedEmail } from "./early-access.ts";

/**
 * @param code  The 6-digit code. Never log it - it signs someone in for the
 *              duration of `expiresMinutes`.
 * @param url   The one-time sign-in link too ("both"), or null for code only.
 */
export function signInCodeEmail(code: string, url: string | null, expiresMinutes: number): RenderedEmail {
  const subject = "Your Brainbox sign-in code";

  const text = [
    "Sign in to Brainbox.",
    "",
    `Your code: ${code}`,
    "",
    "Type it on the sign-in page.",
    ...(url ? ["", "Or open this link instead:", url] : []),
    "",
    `It works once and expires in ${expiresMinutes} minutes.`,
    "",
    "If you didn't ask to sign in, you can ignore this email. Nobody can get",
    "into your account without this code.",
  ].join("\n");

  const link = url
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#a3a3a3;">
                  Or <a href="${url}" style="color:#fafafa;">sign in with a link</a> instead.
                </p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111111;border:1px solid #262626;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#fafafa;letter-spacing:-0.02em;">
                  Sign in to Brainbox
                </h1>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a3a3a3;">
                  Type this code on the sign-in page:
                </p>
                <p style="margin:0;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:0.3em;color:#fafafa;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
                  ${code}
                </p>
                ${link}
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  It works once and expires in ${expiresMinutes} minutes.
                </p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  If you didn't ask to sign in, you can ignore this email. Nobody
                  can get into your account without this code.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
