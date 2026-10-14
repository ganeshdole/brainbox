import type {
  AzureDevopsField,
  AzureDevopsIterationInfo,
  AzureDevopsProject,
  AzureDevopsTeam,
  AzureDevopsTeamSettings,
  AzureDevopsWorkItemType,
  AzureDevopsWorkItemTypeInfo,
} from "@ganeshdole/brainbox-shared";

import type { FetchLike } from "../destination.ts";
import { isRecord } from "../github/client.ts";
import {
  AZURE_DEVOPS_PROFILE_URL,
  AZURE_DEVOPS_URL,
  adoGet,
  adoUrl,
  authorizationHeader,
  listOf,
  str,
  type AzureDevopsAuth,
} from "./client.ts";
import { DESCRIPTION_FIELD } from "./workitems.ts";

export interface AzureDevopsCatalogOptions {
  auth: AzureDevopsAuth;
  baseUrl?: string;
  profileUrl?: string;
  fetch?: FetchLike;
}

/** Lookups for setting a destination up. These throw `AzureDevopsApiError`. */
export interface AzureDevopsCatalog {
  /** Organizations the signed-in user belongs to. Entra tokens only; a PAT is scoped to one. */
  organizations(): Promise<string[]>;
  projects(organization: string): Promise<AzureDevopsProject[]>;
  teams(organization: string, project: string): Promise<AzureDevopsTeam[]>;
  teamSettings(organization: string, project: AzureDevopsProject, team: string): Promise<AzureDevopsTeamSettings>;
  /** Types a person can create: disabled and hidden ones (Test Case, Code Review...) are left out. */
  workItemTypes(organization: string, project: string): Promise<AzureDevopsWorkItemType[]>;
  workItemType(organization: string, project: string, type: string): Promise<AzureDevopsWorkItemTypeInfo>;
}

const REPRO_STEPS = "Microsoft.VSTS.TCM.ReproSteps";
const SYSTEM_INFO = "Microsoft.VSTS.TCM.SystemInfo";
const PRIORITY = "Microsoft.VSTS.Common.Priority";
const FILLED = new Set([PRIORITY, REPRO_STEPS, SYSTEM_INFO]);
const PAGE_SIZE = 500;
/** A guard against a server that never stops paging: 10,000 rows is past any picker. */
const MAX_PAGES = 20;

export function azureDevops(options: AzureDevopsCatalogOptions): AzureDevopsCatalog {
  const base = options.baseUrl ?? AZURE_DEVOPS_URL;
  const profile = options.profileUrl ?? AZURE_DEVOPS_PROFILE_URL;
  const page = async (url: string) => adoGet(url, await authorizationHeader(options.auth), options.fetch);
  const get = async (url: string) => (await page(url)).body;

  return {
    async organizations() {
      const me = await get(adoUrl(profile, ["_apis/profile/profiles/me"]));
      const memberId = isRecord(me) ? str(me.id) : undefined;
      if (!memberId) return [];
      const accounts = await get(adoUrl(profile, ["_apis/accounts"], { memberId }));
      return listOf(accounts)
        .map((a) => str(a.accountName))
        .filter((n): n is string => !!n)
        .sort(byName);
    },

    // Projects page with a continuation token in a response header.
    async projects(organization) {
      const rows: Record<string, unknown>[] = [];
      let continuationToken: string | undefined;
      for (let i = 0; i < MAX_PAGES; i++) {
        const res = await page(
          adoUrl(base, [organization, "_apis/projects"], { $top: String(PAGE_SIZE), continuationToken }),
        );
        rows.push(...listOf(res.body));
        continuationToken = res.headers.get("x-ms-continuationtoken") ?? undefined;
        if (!continuationToken) break;
      }
      return named(rows).sort((a, b) => byName(a.name, b.name));
    },

    // Teams page with $skip until a short page.
    async teams(organization, project) {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < MAX_PAGES; i++) {
        const batch = listOf(
          await get(
            adoUrl(base, [organization, "_apis/projects", project, "teams"], {
              $top: String(PAGE_SIZE),
              $skip: String(i * PAGE_SIZE),
            }),
          ),
        );
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return named(rows).sort((a, b) => byName(a.name, b.name));
    },

    async teamSettings(organization, project, team) {
      const at = (path: string) => adoUrl(base, [organization, project.id, team, path]);
      const [fields, settings, iterations] = await Promise.all([
        get(at("_apis/work/teamsettings/teamfieldvalues")),
        get(at("_apis/work/teamsettings")),
        get(at("_apis/work/teamsettings/iterations")),
      ]);
      const areaPaths = isRecord(fields) ? listOf({ value: fields.values }).map((v) => str(v.value) ?? "") : [];
      const defaultAreaPath = (isRecord(fields) ? str(fields.defaultValue) : undefined) ?? areaPaths[0] ?? project.name;
      const s = isRecord(settings) ? settings : {};
      const bugs = str(s.bugsBehavior);
      return {
        defaultAreaPath,
        areaPaths: areaPaths.filter(Boolean),
        bugsBehavior: bugs === "asRequirements" || bugs === "asTasks" ? bugs : "off",
        backlogIteration: iterationPathOf(s.backlogIteration, project.name),
        iterations: listOf(iterations).flatMap((i): AzureDevopsIterationInfo[] => {
          const name = str(i.name);
          const path = str(i.path);
          if (!name || !path) return [];
          const tf = isRecord(i.attributes) ? str(i.attributes.timeFrame) : undefined;
          return [{ name, path, ...(tf === "past" || tf === "current" || tf === "future" ? { timeFrame: tf } : {}) }];
        }),
      };
    },

    async workItemTypes(organization, project) {
      const [types, categories] = await Promise.all([
        get(adoUrl(base, [organization, project, "_apis/wit/workitemtypes"])),
        get(adoUrl(base, [organization, project, "_apis/wit/workitemtypecategories"])),
      ]);
      const hidden = new Set(
        listOf(categories)
          .filter((c) => c.referenceName === "Microsoft.HiddenCategory")
          .flatMap((c) => listOf({ value: c.workItemTypes }).map((t) => str(t.name))),
      );
      return listOf(types)
        .filter((t) => t.isDisabled !== true)
        .flatMap((t): AzureDevopsWorkItemType[] => {
          const name = str(t.name);
          if (!name || hidden.has(name)) return [];
          const color = str(t.color);
          return [{ name, ...(color ? { color } : {}) }];
        })
        .sort((a, b) => byName(a.name, b.name));
    },

    async workItemType(organization, project, type) {
      const body = await get(
        adoUrl(base, [organization, project, "_apis/wit/workitemtypes", type, "fields"], { $expand: "allowedValues" }),
      );
      const fields = listOf(body);
      const has = (ref: string) => fields.some((f) => f.referenceName === ref);
      return {
        bodyField: has(REPRO_STEPS) ? REPRO_STEPS : DESCRIPTION_FIELD,
        ...(has(SYSTEM_INFO) ? { systemInfoField: SYSTEM_INFO } : {}),
        hasPriority: has(PRIORITY),
        required: fields.flatMap((f): AzureDevopsField[] => {
          const ref = str(f.referenceName);
          if (!ref || f.alwaysRequired !== true || ref.startsWith("System.") || FILLED.has(ref)) return [];
          if (f.defaultValue !== null && f.defaultValue !== undefined && f.defaultValue !== "") return [];
          const allowed = Array.isArray(f.allowedValues) ? f.allowedValues.map(String) : [];
          return [{ referenceName: ref, name: str(f.name) ?? ref, allowedValues: allowed }];
        }),
      };
    },
  };
}

/**
 * The backlog iteration as a `System.IterationPath` value. Azure DevOps gives
 * the root as an empty path, and other iterations sometimes without the
 * project in front.
 */
function iterationPathOf(iteration: unknown, projectName: string): string {
  const path = isRecord(iteration) ? str(iteration.path)?.replace(/^\\+/, "") : undefined;
  if (!path) return projectName;
  if (path === projectName || path.startsWith(`${projectName}\\`)) return path;
  return `${projectName}\\${path}`;
}

function named(rows: Record<string, unknown>[]): Array<{ id: string; name: string }> {
  return rows.flatMap((r) => {
    const id = str(r.id);
    const name = str(r.name);
    return id && name ? [{ id, name }] : [];
  });
}

function byName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
