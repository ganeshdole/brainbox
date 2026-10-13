import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@hono/auth-js/react";
import type { CreatedInvite, InviteRole, TeamInvite, TeamMember, TeamRole } from "@ganeshdole/brainbox-shared";

import { CopyButton } from "../components/CopyButton";
import { Eyebrow } from "../components/Eyebrow";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { api, isAuthRedirect } from "../lib/api";
import { assignableRoles, canAdmin, inviteExpired, mayManage, ROLE_HINTS, ROLE_LABELS } from "../lib/team";
import { LAST_PROJECT_KEY, useProject } from "../lib/useProject";
import { timeAgo, userInitial } from "../lib/utils";

const selectClass =
  "h-8 rounded-md border border-interactive bg-interactive px-2 text-xs text-emphasis outline-none transition focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-50";

function Section({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <Eyebrow className="block">{label}</Eyebrow>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Avatar({ member }: { member: TeamMember }) {
  if (member.image) {
    return <img src={member.image} alt="" referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-lg object-cover" />;
  }
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-interactive text-sm font-medium text-emphasis">
      {userInitial(member.name, member.email)}
    </span>
  );
}

function TeamName({ teamId, name, editable, onRenamed }: {
  teamId: string;
  name: string;
  editable: boolean;
  onRenamed: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return (
      <div className="rounded-xl border border-default bg-elevated px-4 py-3 text-sm text-emphasis">{name}</div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || value.trim() === name) return;
    setBusy(true);
    setError(null);
    try {
      onRenamed((await api.renameTeam(teamId, value.trim())).name);
    } catch (err) {
      if (!isAuthRedirect(err)) setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={100} disabled={busy} />
      <Button type="submit" variant="secondary" disabled={busy || !value.trim() || value.trim() === name}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {error && <p className="text-xs text-error">{error}</p>}
    </form>
  );
}

function InviteForm({ teamId, onInvited }: { teamId: string; onInvited: (created: CreatedInvite) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<CreatedInvite | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setSent(null);
    try {
      const created = await api.createInvite(teamId, email.trim(), role);
      setSent(created);
      setEmail("");
      onInvited(created);
    } catch (err) {
      if (!isAuthRedirect(err)) setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-default bg-elevated px-4 py-3.5">
      <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          disabled={busy}
          aria-label="Email address"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "member")}
          disabled={busy}
          aria-label="Role"
          className="h-10 rounded-lg border border-interactive bg-interactive px-3 text-sm text-emphasis outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? "Inviting…" : "Invite"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">
        {ROLE_LABELS[role]}: {ROLE_HINTS[role].toLowerCase()}.
      </p>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
      {sent &&
        (sent.emailed ? (
          <p className="mt-3 text-sm text-default">Invite emailed to {sent.invite.email}.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-default">
              This deployment doesn't send email. Send {sent.invite.email} this link. Only that address can use it.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-default bg-subtle px-3 py-2">
              <code className="truncate font-mono text-xs text-default">{sent.invite.url}</code>
              <CopyButton text={sent.invite.url} label="Copy link" />
            </div>
          </div>
        ))}
    </div>
  );
}

export function Team() {
  const { project, setTeamName } = useProject();
  const { data: session } = useSession();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const team = project?.team;
  const currentTeamId = team?.id;
  const admin = team ? canAdmin(team.role) : false;

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    Promise.all([
      api.listMembers(currentTeamId),
      admin ? api.listInvites(currentTeamId) : Promise.resolve([]),
    ])
      .then(([nextMembers, nextInvites]) => {
        if (cancelled) return;
        setMembers(nextMembers);
        setInvites(nextInvites);
      })
      .catch((e: Error) => {
        if (!cancelled && !isAuthRedirect(e)) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, admin, reload]);

  // The Team is per-project; the all view has none to show.
  if (!project || !team) return <Navigate to="/projects/all" replace />;
  const teamId = team.id;
  const actor = team.role;
  const myEmail = session?.user?.email?.toLowerCase();

  async function run(key: string, action: () => Promise<unknown>, after?: () => void) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      if (after) after();
      else setReload((n) => n + 1);
    } catch (err) {
      if (!isAuthRedirect(err)) setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function leave(userId: string) {
    if (!window.confirm(`Leave ${team?.name}? You'll lose access to its projects.`)) return;
    void run(`remove:${userId}`, () => api.removeMember(teamId, userId), () => {
      localStorage.removeItem(LAST_PROJECT_KEY);
      // A full load, so the project list is fetched again without this Team.
      window.location.assign("/");
    });
  }

  return (
    <div className="min-h-0 flex-1 lg:overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-lg font-semibold tracking-tight text-emphasis">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone here sees every project in {team.name} and the reports they receive.
        </p>

        <div className="mt-8">
          <Section label="Name" hint="Shown to everyone in the team.">
            <TeamName key={team.name} teamId={teamId} name={team.name} editable={admin} onRenamed={(name) => setTeamName(teamId, name)} />
          </Section>

          {admin && (
            <Section label="Invite" hint="They join when they sign in with the address you invite.">
              <InviteForm teamId={teamId} onInvited={() => setReload((n) => n + 1)} />
            </Section>
          )}

          <Section label="Members" hint={admin ? "Change what people can do, or remove them." : "Who's in this team."}>
            <div className="rounded-xl border border-default bg-elevated">
              {error ? (
                <p className="px-4 py-3 text-xs text-error">{error}</p>
              ) : !members ? (
                <div className="p-4">
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <ul className="divide-y">
                  {members.map((m) => {
                    const self = m.email.toLowerCase() === myEmail;
                    // The API refuses to leave a Team without an Owner, so the
                    // last one is not offered the button.
                    const lastOwner = m.role === "owner" && members.filter((o) => o.role === "owner").length === 1;
                    const roles = self ? [] : assignableRoles(actor, m.role);
                    return (
                      <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                        <Avatar member={m} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-emphasis">
                            {m.name?.trim() || m.email}
                            {self && <span className="ml-1.5 text-xs text-muted">(you)</span>}
                          </span>
                          {m.name?.trim() && <span className="block truncate text-xs text-muted">{m.email}</span>}
                        </span>
                        {roles.length > 0 ? (
                          <select
                            value={m.role}
                            disabled={busy !== null}
                            aria-label={`Role for ${m.email}`}
                            onChange={(e) => {
                              const next = roles.find((r) => r === e.target.value);
                              if (next) void run(`role:${m.userId}`, () => api.setMemberRole(teamId, m.userId, next));
                            }}
                            className={selectClass}
                          >
                            {roles.map((r: TeamRole) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge>{ROLE_LABELS[m.role]}</Badge>
                        )}
                        {self ? (
                          !lastOwner && (
                            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => leave(m.userId)}>
                              Leave
                            </Button>
                          )
                        ) : (
                          mayManage(actor, m.role) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy !== null}
                              className="text-error hover:text-error"
                              onClick={() => {
                                if (window.confirm(`Remove ${m.email} from ${team.name}?`)) {
                                  void run(`remove:${m.userId}`, () => api.removeMember(teamId, m.userId));
                                }
                              }}
                            >
                              Remove
                            </Button>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {actionError && <p className="mt-2 text-xs text-error">{actionError}</p>}
          </Section>

          {admin && invites.length > 0 && (
            <Section label="Pending invites" hint="Waiting for these addresses to sign in and accept.">
              <ul className="divide-y rounded-xl border border-default bg-elevated">
                {invites.map((invite) => {
                  const expired = inviteExpired(invite.expiresAt);
                  return (
                    <li key={invite.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-emphasis">{invite.email}</span>
                        <span className="block text-xs text-muted">
                          {ROLE_LABELS[invite.role]} · invited {timeAgo(invite.createdAt)}
                        </span>
                      </span>
                      {expired ? <Badge variant="error">Expired</Badge> : <CopyButton text={invite.url} label="Copy link" />}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => void run(`resend:${invite.id}`, () => api.createInvite(teamId, invite.email, invite.role))}
                      >
                        {expired ? "Renew" : "Resend"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy !== null}
                        className="text-error hover:text-error"
                        onClick={() => void run(`revoke:${invite.id}`, () => api.revokeInvite(teamId, invite.id))}
                      >
                        Revoke
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
