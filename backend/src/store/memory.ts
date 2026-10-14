import type { IssueRecord, ProjectRecord, Store } from "./types.ts";

/**
 * A store of only the core, kept in memory: the reference for what the core
 * means, and a backend with no database at all (reports are gone on restart).
 * Passes the core of `describeStoreConformance()`. Records go in and out as
 * copies, so a caller changing one changes nothing stored.
 */
export function createMemoryStore(): Store {
  // Newest first, as the lists return them.
  const projects: ProjectRecord[] = [];
  const issues: IssueRecord[] = [];

  return {
    projects: {
      async listForTeams(teamIds) {
        return projects
          .filter((p) => teamIds.includes(p.teamId))
          .map((p) => {
            const own = issues.filter((i) => i.projectId === p.id);
            return {
              ...copyProject(p),
              issueCount: own.length,
              featureRequestCount: own.filter((i) => i.kind === "feature").length,
            };
          });
      },
      async create(input) {
        const row: ProjectRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date() };
        projects.unshift(row);
        return copyProject(row);
      },
      async get(id) {
        return maybe(projects.find((p) => p.id === id), copyProject);
      },
      async getByKey(key) {
        return maybe(
          projects.find((p) => p.key === key),
          copyProject,
        );
      },
      async update(id, patch) {
        const row = projects.find((p) => p.id === id);
        if (!row) return null;
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.allowedOrigins !== undefined) row.allowedOrigins = [...patch.allowedOrigins];
        return copyProject(row);
      },
      async delete(id) {
        remove(projects, (p) => p.id === id);
        remove(issues, (i) => i.projectId === id);
      },
    },

    issues: {
      async listForProject(projectId) {
        return issues.filter((i) => i.projectId === projectId).map(copyIssue);
      },
      async get(id) {
        return maybe(
          issues.find((i) => i.id === id),
          copyIssue,
        );
      },
      async create({ createdAt, ...input }) {
        if (issues.some((i) => i.id === input.id)) throw new Error(`issue ${input.id} already exists`);
        const row: IssueRecord = {
          ...structuredClone(input),
          createdAt: createdAt ?? new Date(),
          status: "new",
          priority: "none",
          closeReason: null,
          statusChangedAt: null,
          featureId: null,
          audioTranscript: null,
          videoTranscript: null,
        };
        // Kept newest first, wherever an imported createdAt puts it.
        const at = issues.findIndex((i) => i.createdAt <= row.createdAt);
        issues.splice(at === -1 ? issues.length : at, 0, row);
      },
      async setTranscript(id, kind, outcome) {
        const row = issues.find((i) => i.id === id);
        if (!row) return;
        const text = outcome.status === "done" ? outcome.text : undefined;
        if (kind === "audio") {
          row.audioTranscriptStatus = outcome.status;
          if (text !== undefined) row.audioTranscript = text;
        } else {
          row.videoTranscriptStatus = outcome.status;
          if (text !== undefined) row.videoTranscript = text;
        }
      },
    },
  };
}

function maybe<T>(row: T | undefined, copy: (row: T) => T): T | null {
  return row === undefined ? null : copy(row);
}

function copyProject(row: ProjectRecord): ProjectRecord {
  return { ...row, allowedOrigins: [...row.allowedOrigins] };
}

function copyIssue(row: IssueRecord): IssueRecord {
  return structuredClone(row);
}

function remove<T>(rows: T[], match: (row: T) => boolean): void {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row !== undefined && match(row)) rows.splice(i, 1);
  }
}
