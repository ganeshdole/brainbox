import type { DeliveryRecord } from "./types.ts";

// Rules every store applies to a delivery's claim, inside the same atomic step
// as the claim itself, so two retries at once cannot both send.

/**
 * How long a `pending` delivery belongs to the attempt that claimed it. Until
 * then a retry is refused: the send may still be in flight, and sending again
 * would file a second ticket. After it, the attempt is presumed dead (the
 * process crashed, or the host froze it) and a retry may claim the delivery.
 *
 * Longer than any send can take: an Azure DevOps ticket uploads each
 * attachment with a 2-minute timeout, plus a few 15-second calls.
 */
export const DELIVERY_LEASE_MS = 15 * 60_000;

/** Whether a retry at `now` may claim this delivery: one that failed, or one
 *  whose pending attempt has outlived its lease. Never one that was sent. */
export function mayReclaimDelivery(row: Pick<DeliveryRecord, "status" | "updatedAt">, now: Date): boolean {
  if (row.status === "failed") return true;
  return row.status === "pending" && row.updatedAt.getTime() <= leaseCutoff(now).getTime();
}

/** A pending delivery last claimed at or before this has lost its lease. */
export function leaseCutoff(now: Date): Date {
  return new Date(now.getTime() - DELIVERY_LEASE_MS);
}
