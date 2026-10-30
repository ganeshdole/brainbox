// The confirmation sent when someone reserves early access from the marketing
// site. Returns a subject + html + text triple; the route hands it to the
// active emailer. Inline styles only (email clients strip <style>/external CSS).

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function earlyAccessReservedEmail(): RenderedEmail {
  const subject = "Your Brainbox early access is reserved";

  const text = [
    "You're on the list.",
    "",
    "Thanks for reserving early access to Brainbox, the tiny in-app widget that",
    "turns a user's tap-and-talk into a ready-to-work ticket in Linear, GitHub,",
    "or Slack.",
    "",
    "We're onboarding people in small batches. You'll hear from us the moment",
    "your spot opens up. No further action needed for now.",
    "",
    "Ganesh",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111111;border:1px solid #262626;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:36px 36px 8px 36px;">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1a1;">Brainbox</p>
                <h1 style="margin:16px 0 0 0;font-size:24px;line-height:1.25;color:#fafafa;font-weight:600;">You&rsquo;re on the list.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px 8px 36px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#c4c4c4;">
                  Thanks for reserving early access to Brainbox, the tiny in-app widget that turns a user&rsquo;s tap-and-talk into a ready-to-work ticket in Linear, GitHub, or Slack.
                </p>
                <p style="margin:16px 0 0 0;font-size:15px;line-height:1.6;color:#c4c4c4;">
                  We&rsquo;re onboarding people in small batches. You&rsquo;ll hear from us the moment your spot opens up. No further action needed for now.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 36px 36px 36px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#8f8f8f;">Ganesh</p>
              </td>
            </tr>
          </table>
          <p style="max-width:480px;margin:20px auto 0 auto;font-size:12px;line-height:1.5;color:#6b6b6b;">
            You received this because you reserved early access at brainbox.ganeshdole.com. If that wasn&rsquo;t you, you can ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
