import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";

import { db } from "../src/db/client.ts";

// Clean slate before every test (single shared DB, fileParallelism: false).
beforeEach(async () => {
  await db.execute(
    sql.raw(
      `truncate table waitlist_signups, deliveries, project_destinations, integration_connections, issues, projects, accounts, sessions, "verificationTokens", users restart identity cascade`,
    ),
  );
});
