import type { NewSubscription, SubscriptionChange, SubscriptionRecord } from "./types.ts";

/** How a store applies one subscription change, decided the same way by every
 *  store so the ordering and creation rules cannot drift between databases. */
export type SubscriptionWrite =
  | { kind: "skip" }
  | { kind: "update"; values: Pick<SubscriptionRecord, "status" | "currentPeriodEnd" | "lastEventAt"> }
  | { kind: "create"; values: NewSubscription & SubscriptionWriteState };

type SubscriptionWriteState = Pick<
  SubscriptionRecord,
  "dodoSubscriptionId" | "status" | "currentPeriodEnd" | "lastEventAt"
>;

/**
 * `existing` is the row with the change's `dodoSubscriptionId`, if any.
 * Throws when the change cannot be applied; the store's transaction then drops
 * the event record too, so the sender's retry is processed.
 */
export function planSubscriptionWrite(
  existing: Pick<SubscriptionRecord, "lastEventAt"> | null,
  change: SubscriptionChange,
): SubscriptionWrite {
  const state = {
    status: change.status,
    currentPeriodEnd: change.currentPeriodEnd,
    lastEventAt: change.sentAt,
  };

  if (existing) {
    // Delivery order is not guaranteed and retries can arrive minutes late, so
    // a stale `cancelled` must not clobber a newer `active`. Compare when the
    // events were SENT, not when they arrived.
    if (existing.lastEventAt && existing.lastEventAt > change.sentAt) {
      console.warn(
        `[webhooks] ignoring event sent ${change.sentAt.toISOString()}, older than the ` +
          `state from ${existing.lastEventAt.toISOString()}`,
      );
      return { kind: "skip" };
    }
    return { kind: "update", values: state };
  }

  // First sight of this subscription: the checkout we started.
  if ("error" in change.create) throw new Error(change.create.error);
  return {
    kind: "create",
    values: { ...change.create, dodoSubscriptionId: change.dodoSubscriptionId, ...state },
  };
}
