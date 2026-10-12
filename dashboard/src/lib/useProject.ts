import { useOutletContext } from "react-router-dom";
import type { Project } from "@brainbox-sh/shared";

/** localStorage key remembering the project `/` forwards to. */
export const LAST_PROJECT_KEY = "brainbox:lastProject";

/** Sentinel :projectId for the combined view of every project. Safe because
 *  real project ids are UUIDs. */
export const ALL_PROJECTS = "all";

/** Context provided by ProjectLayout to every project-scoped page.
 *  `project` is null in the all-projects view. */
export interface ProjectOutletContext {
  project: Project | null;
  projects: Project[];
  /** Patch the project in the layout's cache after a mutation. */
  setProject: (next: Project) => void;
  /** Drop a project from the layout's cache after deleting it. */
  removeProject: (id: string) => void;
}

export function useProject(): ProjectOutletContext {
  return useOutletContext<ProjectOutletContext>();
}

/** Where `/` forwards: the remembered all-view (only meaningful with several
 *  projects), else the remembered project, else the first. Null when there are
 *  no projects (onboarding stays on screen). */
export function homeTarget(projects: Project[], last: string | null): string | null {
  if (last === ALL_PROJECTS && projects.length > 1) return `/projects/${ALL_PROJECTS}`;
  const target = projects.find((p) => p.id === last) ?? projects[0];
  return target ? `/projects/${target.id}` : null;
}
