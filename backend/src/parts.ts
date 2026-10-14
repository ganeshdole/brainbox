// @ganeshdole/brainbox-backend as a library: everything a backend built from
// parts imports (docs/self-hosting.md, "Build your own backend from parts").
// Nothing here reads the environment; `fromEnv()` is the one way in that does.

export { createApp } from "./create-app.ts";
export type { AppDeps, AppOptions, AuthOptions, BillingOptions } from "./deps.ts";
export type { AppEnv } from "./types.ts";

// Data: the Store interface, its modules, the two stores this repo ships, and
// an in-memory one of only the core. describeStoreConformance() is in
// "@ganeshdole/brainbox-backend/testing".
export type * from "./store/types.ts";
export { hasModules, modulesOf, requireModule, STORE_MODULES } from "./store/modules.ts";
export { createPostgresStore } from "./store/postgres.ts";
export { connectPostgres, type DB } from "./db/connect.ts";
export { createConvexStore } from "./store/convex.ts";
export { createConvexCaller, type ConvexCaller } from "./convex-caller.ts";
export { createMemoryStore } from "./store/memory.ts";

// Files.
export { readStored, type Storage } from "./storage/types.ts";
export { LocalStorage, type LocalStorageOptions } from "./storage/local.ts";
export { S3Storage, type S3Options } from "./storage/s3.ts";
export { ConvexStorage } from "./storage/convex.ts";

// Email.
export type { Emailer, EmailMessage } from "./email/types.ts";
export { ConsoleEmailer } from "./email/console.ts";
export { ResendEmailer, type ResendOptions } from "./email/resend.ts";

// Transcription.
export {
  aiSdkTranscriber,
  groqTranscriber,
  openaiTranscriber,
  type ProviderOptions,
  type Transcriber,
} from "./transcription/index.ts";

// Trackers.
export type { GithubAppSettings, IntegrationsOptions } from "./integrations/registry.ts";
export type { AzureDevopsSettings } from "./integrations/azure-devops.ts";
export type { DodoSettings } from "./lib/dodo.ts";

// Running it.
export { runInBackground } from "./runtime/background.ts";
