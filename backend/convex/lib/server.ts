import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";

import { mutation, query } from "../_generated/server";
import type { DatabaseWriter } from "../_generated/server";

// Every Brainbox function is called only by the Brainbox backend, never by a
// browser. Convex functions are public to anyone with the deployment URL, so
// each one demands the shared secret the backend holds
// (BRAINBOX_SERVER_SECRET, set on both sides). Unset means every call fails.

function assertServer(secret: string): void {
  const expected = process.env.BRAINBOX_SERVER_SECRET ?? "";
  if (!expected || !sameString(secret, expected)) throw new Error("Unauthorized");
}

/** Compares without stopping at the first difference, so timing reveals nothing. */
function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

const serverArgs = {
  args: { secret: v.string() },
  input: async (_ctx: unknown, { secret }: { secret: string }) => {
    assertServer(secret);
    return { ctx: {}, args: {} };
  },
};

/** A query only the Brainbox backend may call. */
export const serverQuery = customQuery(query, serverArgs);

/** A mutation only the Brainbox backend may call. */
export const serverMutation = customMutation(mutation, serverArgs);

/** A document without Convex's own fields: the record the backend sees. */
export function strip<T extends { _id: unknown; _creationTime: number }>(
  doc: T,
): Omit<T, "_id" | "_creationTime"> {
  const { _id, _creationTime, ...record } = doc;
  void _id;
  void _creationTime;
  return record;
}

/** Newest first by `createdAt`, the order the Postgres store returns. */
export function newestFirst<T extends { createdAt: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Removes a destination the way Postgres's foreign keys do: the destination
 * goes, and its deliveries stay with `destinationId` cleared so the link to
 * the sent ticket survives.
 */
export async function removeDestination(db: DatabaseWriter, destinationId: string): Promise<void> {
  const destination = await db
    .query("destinations")
    .withIndex("with_id", (q) => q.eq("id", destinationId))
    .unique();
  if (!destination) return;
  const sent = await db
    .query("deliveries")
    .withIndex("by_destination", (q) => q.eq("destinationId", destinationId))
    .collect();
  for (const delivery of sent) await db.patch(delivery._id, { destinationId: null });
  await db.delete(destination._id);
}

/** Removes a connection and, like the Postgres cascade, its destinations. */
export async function removeConnection(db: DatabaseWriter, connectionId: string): Promise<void> {
  const connection = await db
    .query("connections")
    .withIndex("with_id", (q) => q.eq("id", connectionId))
    .unique();
  if (!connection) return;
  const destinations = await db
    .query("destinations")
    .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
    .collect();
  for (const destination of destinations) await removeDestination(db, destination.id);
  await db.delete(connection._id);
}
