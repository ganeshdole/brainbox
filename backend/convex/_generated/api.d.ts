/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as features from "../features.js";
import type * as files from "../files.js";
import type * as integrations from "../integrations.js";
import type * as issues from "../issues.js";
import type * as lib_server from "../lib/server.js";
import type * as projects from "../projects.js";
import type * as signIn from "../signIn.js";
import type * as testing from "../testing.js";
import type * as validators from "../validators.js";
import type * as waitlist from "../waitlist.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  billing: typeof billing;
  features: typeof features;
  files: typeof files;
  integrations: typeof integrations;
  issues: typeof issues;
  "lib/server": typeof lib_server;
  projects: typeof projects;
  signIn: typeof signIn;
  testing: typeof testing;
  validators: typeof validators;
  waitlist: typeof waitlist;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
