import { api, isAuthRedirect } from "./api";
import { LAST_PROJECT_KEY } from "./useProject";

/** Where the dashboard goes after joining a Team: its newest project, or the
 *  Team's own page when it has none yet.
 *
 *  It runs after the invite is accepted, so it never fails the join: if the
 *  projects can't be listed, the Team's page is still a place they belong
 *  now. Showing an error instead left the used invite on screen, with a Join
 *  button that could only fail. A sign-in or paywall redirect still throws -
 *  the browser is leaving either way. */
export async function landingFor(teamId: string): Promise<string> {
  let projects;
  try {
    projects = await api.listProjects();
  } catch (e) {
    if (isAuthRedirect(e)) throw e;
    return `/teams/${teamId}`;
  }
  const project = projects.find((p) => p.team.id === teamId);
  if (!project) return `/teams/${teamId}`;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, project.id);
  } catch {
    // storage disabled: only the next visit's starting project is lost
  }
  return `/projects/${project.id}`;
}
