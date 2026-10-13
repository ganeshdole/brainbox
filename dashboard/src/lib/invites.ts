import { api } from "./api";
import { LAST_PROJECT_KEY } from "./useProject";

/** Where the dashboard goes after joining a Team: its newest project, or the
 *  Team's own page when it has none yet. */
export async function landingFor(teamId: string): Promise<string> {
  const project = (await api.listProjects()).find((p) => p.team.id === teamId);
  if (!project) return `/teams/${teamId}`;
  localStorage.setItem(LAST_PROJECT_KEY, project.id);
  return `/projects/${project.id}`;
}
