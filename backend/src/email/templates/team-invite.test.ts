import { describe, expect, it } from "vitest";

import { teamInviteEmail } from "./team-invite.ts";

const base = {
  teamName: "Acme",
  inviter: "Dana",
  role: "member" as const,
  url: "https://app.example/invite/abc",
  email: "sam@acme.com",
  expiresDays: 7,
};

describe("teamInviteEmail", () => {
  it("names the team, the inviter, the link and the address that can accept", () => {
    const email = teamInviteEmail(base);
    expect(email.subject).toBe("Dana invited you to Acme on Brainbox");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("https://app.example/invite/abc");
      expect(body).toContain("sam@acme.com");
      expect(body).toContain("a member");
    }
  });

  it("reads without an inviter", () => {
    expect(teamInviteEmail({ ...base, inviter: null }).subject).toBe("You're invited to Acme on Brainbox");
  });

  it("escapes names people typed", () => {
    const email = teamInviteEmail({ ...base, teamName: "<b>Acme</b>", inviter: `"Dana" & co` });
    expect(email.html).not.toContain("<b>Acme</b>");
    expect(email.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
    expect(email.html).toContain("&quot;Dana&quot; &amp; co");
  });

  it("uses no em dashes (house style)", () => {
    const email = teamInviteEmail(base);
    for (const body of [email.text, email.html]) {
      expect(body).not.toContain("—");
      expect(body).not.toContain("&mdash;");
    }
  });
});
