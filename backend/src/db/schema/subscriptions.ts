import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { BillingPeriod, PlanId, SubscriptionStatus } from "@brainbox-sh/shared";

import { users } from "./auth-schema.ts";

// One subscription per Account (`users`), not per project - a plan covers every
// project the Account owns, which is what lets the pricing page promise
// unlimited projects. The unique index on user_id enforces that.
//
// This table is a local mirror of Dodo's state, written only by the webhook
// handler. Dodo remains the source of truth; if the two ever disagree, refetch
// from Dodo rather than "fixing" a row here.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Dodo identifiers. `dodo_customer_id` is kept so a returning customer
    // reuses their Dodo customer rather than accumulating duplicates.
    dodoSubscriptionId: text("dodo_subscription_id").notNull().unique(),
    dodoCustomerId: text("dodo_customer_id").notNull(),
    // Which of the four products they bought. Product ids differ between test
    // and live mode, so this is only meaningful alongside the environment.
    dodoProductId: text("dodo_product_id").notNull(),

    plan: text("plan").$type<PlanId>().notNull(),
    period: text("period").$type<BillingPeriod>().notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull(),

    // End of the paid period. Null until Dodo reports one on the first renewal
    // event, so never treat null as "expired".
    currentPeriodEnd: timestamp("current_period_end", {
      mode: "date",
      withTimezone: true,
    }),

    // When the event that produced this row was SENT (Dodo's webhook-timestamp),
    // as distinct from when we wrote it. Webhook delivery order is not
    // guaranteed - a retried `cancelled` can arrive after a fresh `active` - so
    // this is compared before applying an update and older events are dropped.
    lastEventAt: timestamp("last_event_at", { mode: "date", withTimezone: true }),

    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_user_id_key").on(t.userId)],
);

// Webhook de-duplication. Dodo retries any delivery that does not return 2xx,
// so the same event can arrive more than once; the id is the `webhook-id`
// header. Inserting before processing turns a duplicate into a primary-key
// conflict we can skip, which is what makes the handler idempotent.
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});
