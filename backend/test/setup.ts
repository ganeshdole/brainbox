import { beforeEach } from "vitest";

import { resetStore } from "./harness.ts";

// Clean slate before every test (single shared store, fileParallelism: false).
beforeEach(async () => {
  await resetStore();
});
