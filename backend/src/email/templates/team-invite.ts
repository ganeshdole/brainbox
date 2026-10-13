// The invite sent when a Team's admin adds someone by email. Same shape as the
// other templates: a subject + html + text triple for the active emailer.
// Inline styles only (email clients strip <style>/external CSS).
//
// The Team's name and the inviter's name are typed by people, so they are
// escaped before they go into the html.

import type { InviteRole } from "@ganeshdole/brainbox-shared";

import type { RenderedEmail } from "./early-access.ts";

export interface TeamInviteEmailInput {
  teamName: string;
  /** Who sent it; null reads as "You've been invited". */
  inviter: string | null;
  role: InviteRole;
  /** The dashboard page that accepts it. */
  url: string;
  /** The address it was sent to, which is the only one that can accept it. */
  email: string;
  expiresDays: number;
}

export function teamInviteEmail(input: TeamInviteEmailInput): RenderedEmail {
  const { teamName, inviter, role, url, email, expiresDays } = input;
  const asRole = role === "admin" ? "an admin" : "a member";
  const subject = inviter
    ? `${inviter} invited you to ${teamName} on Brainbox`
    : `You're invited to ${teamName} on Brainbox`;
  const lead = `${inviter ?? "Someone"} invited you to join ${teamName} on Brainbox as ${asRole}.`;

  const text = [
    lead,
    "",
    "Open this link to join. You'll see the team's projects and the reports",
    "their users send:",
    url,
    "",
    `Sign in as ${email}, the address this invite was sent to. The invite`,
    `expires in ${expiresDays} days.`,
    "",
    "If you weren't expecting this, you can ignore it.",
  ].join("\n");

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
                  Join ${escapeHtml(teamName)} on Brainbox
                </h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a3a3a3;">
                  ${escapeHtml(lead)} You'll see the team's projects and the reports their users send.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:#fafafa;">
                      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#0a0a0a;text-decoration:none;border-radius:10px;">
                        Join the team
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  Sign in as ${escapeHtml(email)}, the address this invite was sent to.
                  The invite expires in ${expiresDays} days.
                </p>
                <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  If you weren't expecting this, you can ignore it.
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
