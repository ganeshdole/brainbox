import type { SubscriptionStatus } from "@ganeshdole/brainbox-shared";

import type { NewSubscription, SubscriptionChange, SubscriptionRecord } from "./types.ts";

/** How a store applies one subscription change, decided the same way by every
 *  store so the ordering and creation rules cannot drift between databases.
 *  `create` inserts the Account's row, or replaces the one it has (an Account
 *  has one subscription row, whichever subscription is its current one). */
export type SubscriptionWrite =
  | { kind: "skip" }
  | {
      kind: "update";
      values: Pick<SubscriptionRecord, "status" | "currentPeriodEnd" | "lastEventAt"> &
        Partial<Pick<SubscriptionRecord, "dodoProductId" | "plan" | "period">>;
    }
  | { kind: "create"; values: NewSubscription & SubscriptionWriteState };

type SubscriptionWriteState = Pick<
  SubscriptionRecord,
  "dodoSubscriptionId" | "status" | "currentPeriodEnd" | "lastEventAt"
>;

/** What the rule reads of the row it is given. */
export type CurrentSubscription = Pick<
  SubscriptionRecord,
  "dodoSubscriptionId" | "status" | "currentPeriodEnd" | "lastEventAt"
>;

/** Statuses that end a subscription: news only about the subscription itself. */
const ENDED: ReadonlySet<SubscriptionStatus> = new Set(["cancelled", "expired"]);

/**
 * `existing` is the row the change concerns: the one with the change's
 * `dodoSubscriptionId`, else the row of the Account named by `change.create`
 * (which then holds another subscription, or an earlier one of the same
 * Account), else null. Store lookups in that order.
 *
 * Throws when the change cannot be applied; the store's transaction then drops
 * the event record too, so the sender's retry is processed.
 */
export function planSubscriptionWrite(
  existing: CurrentSubscription | null,
  change: SubscriptionChange,
): SubscriptionWrite {
  // Delivery order is not guaranteed and retries can arrive minutes late, so
  // a stale `cancelled` must not clobber a newer `active`. Compare when the
  // events were SENT, not when they arrived. The Account's row is ordered as a
  // whole, whichever subscription the event is about: after a re-subscribe, a
  // late event for the old subscription is older than the new one's state.
  if (existing?.lastEventAt && existing.lastEventAt > change.sentAt) {
    return skip(
      `event sent ${change.sentAt.toISOString()} is older than the state from ${existing.lastEventAt.toISOString()}`,
    );
  }

  if (existing && existing.dodoSubscriptionId === change.dodoSubscriptionId) {
    return {
      kind: "update",
      values: {
        status: change.status,
        // An event without a billing date says nothing about it.
        currentPeriodEnd: change.currentPeriodEnd ?? existing.currentPeriodEnd,
        lastEventAt: change.sentAt,
        // A plan change: the event names the product it is now on.
        ...change.product,
      },
    };
  }

  // A subscription the store has no row for: the checkout we started, or the
  // Account's earlier one, ending after it was replaced.
  if ("error" in change.create) throw new Error(change.create.error);
  if (existing) {
    // It is not the Account's current subscription, so its ending changes
    // nothing about the Account; nor may it take a paying Account's place
    // until it pays itself.
    if (ENDED.has(change.status)) {
      return skip(`${change.status} for ${change.dodoSubscriptionId}, which is not the current subscription`);
    }
    if (existing.status === "active" && change.status !== "active") {
      return skip(
        `${change.status} for ${change.dodoSubscriptionId} would replace the active ${existing.dodoSubscriptionId}`,
      );
    }
  }
  return {
    kind: "create",
    values: {
      ...change.create,
      dodoSubscriptionId: change.dodoSubscriptionId,
      status: change.status,
      currentPeriodEnd: change.currentPeriodEnd,
      lastEventAt: change.sentAt,
    },
  };
}

function skip(why: string): SubscriptionWrite {
  console.warn(`[webhooks] ignoring subscription event: ${why}`);
  return { kind: "skip" };
}
