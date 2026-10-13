/**
 * What a person may do in a Team. Owners also manage billing and other
 * Owners; Admins manage projects, integrations and members; Members read
 * reports and resend them.
 */
export type TeamRole = "owner" | "admin" | "member";

/** The roles an invite can grant. Owners are made by promoting a member. */
export type InviteRole = Exclude<TeamRole, "owner">;

/** A Team as one of its members sees it. */
export interface Team {
  id: string;
  name: string;
  /** The caller's role in it. */
  role: TeamRole;
  createdAt: string; // ISO 8601
}

/** The Team a project belongs to, with the caller's role in it. */
export interface ProjectTeam {
  id: string;
  name: string;
  role: TeamRole;
}

export interface TeamMember {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  role: TeamRole;
  joinedAt: string; // ISO 8601
}

/** An invite not yet accepted, as the Team's admins see it. */
export interface TeamInvite {
  id: string;
  email: string;
  role: InviteRole;
  /** The page that accepts it. Only the invited address can. */
  url: string;
  expiresAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

/** The answer to sending an invite. `emailed` is false when this deployment
 *  sends no email or the send failed: the link has to be passed on by hand. */
export interface CreatedInvite {
  invite: TeamInvite;
  emailed: boolean;
}

/** An invite as the invited person sees it. */
export interface ReceivedInvite {
  id: string;
  teamId: string;
  teamName: string;
  /** Who sent it, when they are still around. */
  invitedBy: string | null;
  email: string;
  role: InviteRole;
  expiresAt: string; // ISO 8601
}
